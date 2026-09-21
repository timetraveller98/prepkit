import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import type { Kit } from "../src/kit.ts";
import { createLlmClient } from "../src/llm/index.ts";
import { generateKit, KitGenerationError } from "../src/pipeline/run.ts";

const caseSchema = z.object({
  id: z.string().min(1),
  jd: z.string().default(""),
  company_url: z.string().default(""),
  days: z.number().int().min(1).max(365).default(5),
});

const inputSchema = z.array(caseSchema);

type EvaluationCase = z.infer<typeof caseSchema>;

interface KitOutcome {
  id: string;
  status: "ok" | "failed";
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

async function main(): Promise<number> {
  loadEnvFile();

  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      concurrency: { type: "string", short: "c" },
      days: { type: "string", short: "d" },
    },
    allowPositionals: true,
  });

  if (!values.input || !values.output) {
    process.stderr.write(
      "usage: npm run evaluate -- --input <cases.json> --output <kits.json> [--concurrency 2]\n",
    );
    return 2;
  }

  const inputPath = resolve(process.cwd(), values.input);
  const outputPath = resolve(process.cwd(), values.output);

  let cases: EvaluationCase[];
  try {
    const parsed = inputSchema.safeParse(JSON.parse(await readFile(inputPath, "utf8")));
    if (!parsed.success) {
      process.stderr.write(
        `input file is not a valid case array: ${parsed.error.issues[0]?.message}\n`,
      );
      return 2;
    }
    cases = parsed.data;
  } catch (error) {
    process.stderr.write(`could not read ${inputPath}: ${describe(error)}\n`);
    return 2;
  }

  const concurrency = clampNumber(values.concurrency, 2, 1, 4);
  const daysOverride = values.days ? clampNumber(values.days, 5, 1, 365) : undefined;
  const llm = createLlmClient();
  const startedAt = Date.now();

  log(
    `running ${cases.length} case(s) with concurrency ${concurrency} using ${llm.provider.name}/${llm.provider.model}`,
  );

  const outcomes: KitOutcome[] = new Array(cases.length);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor++;
      const current = cases[index];
      if (!current) return;
      outcomes[index] = await runCase(current, llm, daysOverride);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

  const payload = {
    version: "1.0",
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    kits: outcomes,
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const ok = outcomes.filter((outcome) => outcome.status === "ok").length;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`wrote ${outputPath}: ${ok}/${outcomes.length} ok in ${elapsed}s`);
  log(
    `llm usage: ${llm.usage.calls} calls, ${llm.usage.inputTokens} in / ${llm.usage.outputTokens} out tokens`,
  );

  return 0;
}

async function runCase(
  evaluationCase: EvaluationCase,
  llm: ReturnType<typeof createLlmClient>,
  daysOverride: number | undefined,
): Promise<KitOutcome> {
  const startedAt = Date.now();
  log(`[${evaluationCase.id}] start`);

  try {
    const { kit } = await generateKit({
      jobDescription: evaluationCase.jd,
      companyUrl: evaluationCase.company_url,
      daysAvailable: daysOverride ?? evaluationCase.days,
      llm,
      onProgress: (event) => {
        if (event.status === "started") return;
        log(
          `[${evaluationCase.id}] ${event.step} ${event.status}${event.message ? ` — ${event.message}` : ""}`,
        );
      },
    });

    log(`[${evaluationCase.id}] ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return { id: evaluationCase.id, status: "ok", kit, error: null };
  } catch (error) {
    const code = error instanceof KitGenerationError ? error.code : "UNEXPECTED_ERROR";
    const message = describe(error);
    log(`[${evaluationCase.id}] failed: ${code} — ${message}`);
    return { id: evaluationCase.id, status: "failed", kit: null, error: { code, message } };
  }
}

function loadEnvFile(): void {
  for (const candidate of [".env", "../.env", "../../.env"]) {
    try {
      process.loadEnvFile(resolve(process.cwd(), candidate));
      return;
    } catch {}
  }
}

function clampNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function log(message: string): void {
  process.stderr.write(`${new Date().toISOString()} ${message}\n`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`fatal: ${describe(error)}\n`);
    process.exitCode = 1;
  });
