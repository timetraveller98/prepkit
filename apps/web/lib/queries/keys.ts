export const queryKeys = {
  kits: ["kits"] as const,
  kit: (id: string) => ["kit", id] as const,
  practice: (id: string) => ["practice", id] as const,
  readiness: (id: string) => ["readiness", id] as const,
};
