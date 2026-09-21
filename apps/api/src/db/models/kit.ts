import type {
  CrawledPage,
  HiringProcessResult,
  Kit,
  KitItemState,
  PipelineEvent,
} from "@prepkit/core";
import { model, Schema } from "mongoose";

export type KitStatus = "queued" | "running" | "ready" | "failed";

export interface ResearchSnapshot {
  pages: CrawledPage[];
  hiring: HiringProcessResult;
}

export interface KitDocument {
  _id: Schema.Types.ObjectId;
  userId: Schema.Types.ObjectId;
  title: string;
  companyUrl: string;
  jobDescription: string;
  daysAvailable: number;
  fingerprint: string;
  status: KitStatus;
  regeneratingSection: string | null;
  progress: PipelineEvent | null;
  events: PipelineEvent[];
  kit: Kit | null;
  itemState: KitItemState | null;
  research: ResearchSnapshot | null;
  error: { code: string; message: string } | null;
  usage: { calls: number; inputTokens: number; outputTokens: number } | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const pipelineEventSchema = new Schema<PipelineEvent>(
  {
    step: { type: String, required: true },
    status: { type: String, required: true },
    message: { type: String },
    at: { type: String, required: true },
    index: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const kitSchema = new Schema<KitDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    companyUrl: { type: String, required: true },
    jobDescription: { type: String, required: true },
    daysAvailable: { type: Number, required: true, min: 1, max: 365 },
    fingerprint: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["queued", "running", "ready", "failed"],
      default: "queued",
    },
    regeneratingSection: { type: String, default: null },
    progress: { type: pipelineEventSchema, default: null },
    events: { type: [pipelineEventSchema], default: [] },
    kit: { type: Schema.Types.Mixed, default: null },
    itemState: { type: Schema.Types.Mixed, default: null },
    research: { type: Schema.Types.Mixed, default: null },
    error: { type: Schema.Types.Mixed, default: null },
    usage: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

kitSchema.index({ userId: 1, fingerprint: 1 });
kitSchema.index({ userId: 1, createdAt: -1 });

export const KitModel = model<KitDocument>("Kit", kitSchema);
