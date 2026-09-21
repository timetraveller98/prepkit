export function createIdMinter(prefix: string, startAt = 1) {
  let next = startAt;
  return () => `${prefix}${next++}`;
}

export function nextFreeId(prefix: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let highest = 0;
  for (const id of existing) {
    const match = pattern.exec(id);
    if (match?.[1]) highest = Math.max(highest, Number.parseInt(match[1], 10));
  }
  return `${prefix}${highest + 1}`;
}
