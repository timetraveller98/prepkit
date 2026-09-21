import { EventEmitter } from "node:events";
import {
  createLlmClient,
  type EnvSource,
  generateKit,
  initialKitState,
  KitGenerationError,
  type LlmClient,
  MissingCredentialsError,
  type PipelineEvent,
} from "@prepkit/core";
import { KitModel } from "../db/models/kit.ts";

const MAX_STORED_EVENTS = 80;

export interface QueueOptions {
  concurrency: number;
  llm?: LlmClient;
  env?: EnvSource;
}

export interface KitStreamMessage {
  type: "progress" | "status";
  kitId: string;
  event?: PipelineEvent;
  status?: string;
  error?: { code: string; message: string } | null;
}

export class GenerationQueue {
  private readonly bus = new EventEmitter();
  private readonly pending: string[] = [];
  private readonly running = new Map<string, AbortController>();
  private readonly options: QueueOptions;
  private llm: LlmClient | null = null;

  constructor(options: QueueOptions) {
    this.options = options;
    this.bus.setMaxListeners(0);
    if (options.llm) this.llm = options.llm;
  }

  get activeCount(): number {
    return this.running.size;
  }

  isActive(kitId: string): boolean {
    return this.running.has(kitId) || this.pending.includes(kitId);
  }

  enqueue(kitId: string): void {
    if (this.isActive(kitId)) return;
    this.pending.push(kitId);
    queueMicrotask(() => this.drain());
  }

  cancel(kitId: string): boolean {
    const controller = this.running.get(kitId);
    if (controller) {
      controller.abort(new Error("cancelled by the owner"));
      return true;
    }
    const index = this.pending.indexOf(kitId);
    if (index >= 0) {
      this.pending.splice(index, 1);
      return true;
    }
    return false;
  }

  subscribe(kitId: string, listener: (message: KitStreamMessage) => void): () => void {
    this.bus.on(kitId, listener);
    return () => this.bus.off(kitId, listener);
  }

  async shutdown(): Promise<void> {
    this.pending.length = 0;
    for (const controller of this.running.values()) {
      controller.abort(new Error("server shutting down"));
    }
  }

  private drain(): void {
    while (this.running.size < this.options.concurrency && this.pending.length > 0) {
      const kitId = this.pending.shift();
      if (!kitId) break;
      void this.run(kitId);
    }
  }

  private async run(kitId: string): Promise<void> {
    const controller = new AbortController();
    this.running.set(kitId, controller);

    try {
      const document = await KitModel.findById(kitId);
      if (!document) return;

      document.status = "running";
      document.startedAt = new Date();
      document.error = null;
      document.events = [];
      await document.save();
      this.publish(kitId, { type: "status", kitId, status: "running" });

      const buffered: PipelineEvent[] = [];
      let lastFlush = 0;

      const result = await generateKit({
        jobDescription: document.jobDescription,
        companyUrl: document.companyUrl,
        daysAvailable: document.daysAvailable,
        llm: this.client(),
        signal: controller.signal,
        onProgress: (event) => {
          buffered.push(event);
          this.publish(kitId, { type: "progress", kitId, event });
          const now = Date.now();
          if (now - lastFlush < 1200) return;
          lastFlush = now;
          void KitModel.updateOne(
            { _id: kitId },
            {
              $set: { progress: event },
              $push: { events: { $each: buffered.splice(0), $slice: -MAX_STORED_EVENTS } },
            },
          ).catch(() => undefined);
        },
      });

      await KitModel.updateOne(
        { _id: kitId },
        {
          $set: {
            status: "ready",
            kit: result.kit,
            itemState: initialKitState(result.kit),
            research: result.research,
            usage: result.usage,
            progress: result.events.at(-1) ?? null,
            error: null,
            completedAt: new Date(),
            title: kitTitle(result.kit.role.title, result.kit.source.company),
          },
          $push: { events: { $each: buffered, $slice: -MAX_STORED_EVENTS } },
        },
      );

      this.publish(kitId, { type: "status", kitId, status: "ready", error: null });
    } catch (error) {
      const failure = toFailure(error);
      await KitModel.updateOne(
        { _id: kitId },
        { $set: { status: "failed", error: failure, completedAt: new Date() } },
      ).catch(() => undefined);
      this.publish(kitId, { type: "status", kitId, status: "failed", error: failure });
    } finally {
      this.running.delete(kitId);
      this.drain();
    }
  }

  private client(): LlmClient {
    if (!this.llm) this.llm = createLlmClient(this.options.env ?? (process.env as EnvSource));
    return this.llm;
  }

  private publish(kitId: string, message: KitStreamMessage): void {
    this.bus.emit(kitId, message);
  }
}

export function kitTitle(roleTitle: string, company: string): string {
  const role = roleTitle.trim() || "Untitled role";
  const employer = company.trim();
  return employer ? `${role} at ${employer}` : role;
}

function toFailure(error: unknown): { code: string; message: string } {
  if (error instanceof MissingCredentialsError) {
    return { code: "LLM_NOT_CONFIGURED", message: error.message };
  }
  if (error instanceof KitGenerationError) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|cancel/i.test(message)) return { code: "CANCELLED", message };
  return { code: "GENERATION_FAILED", message };
}

export async function releaseInterruptedKits(): Promise<number> {
  const result = await KitModel.updateMany(
    { status: { $in: ["queued", "running"] } },
    {
      $set: {
        status: "failed",
        error: {
          code: "INTERRUPTED",
          message: "the server restarted while this kit was generating, start it again",
        },
      },
    },
  );
  return result.modifiedCount;
}
