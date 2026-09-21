export type EnvSource = Record<string, string | undefined>;

export function readEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function currentEnv(): EnvSource {
  return process.env as EnvSource;
}
