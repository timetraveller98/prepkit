import type { Kit } from "./kit.ts";

export type ItemOrigin = "generated" | "user";

export interface ItemMeta {
  origin: ItemOrigin;
  edited: boolean;
  pinned: boolean;
  rev: number;
  updatedAt: string;
}

export interface KitItemState {
  requirements: Record<string, ItemMeta>;
  questions: Record<string, ItemMeta>;
  flashcards: Record<string, ItemMeta>;
  brief: { summary: ItemMeta; what_they_do: ItemMeta };
  schedule: ItemMeta;
}

export function newMeta(origin: ItemOrigin = "generated"): ItemMeta {
  return { origin, edited: false, pinned: false, rev: 1, updatedAt: new Date().toISOString() };
}

export function markEdited(meta: ItemMeta | undefined, origin: ItemOrigin = "generated"): ItemMeta {
  const base = meta ?? newMeta(origin);
  return { ...base, edited: true, rev: base.rev + 1, updatedAt: new Date().toISOString() };
}

export function setPinned(meta: ItemMeta | undefined, pinned: boolean): ItemMeta {
  const base = meta ?? newMeta();
  return { ...base, pinned, rev: base.rev + 1, updatedAt: new Date().toISOString() };
}

export function isProtected(meta: ItemMeta | undefined): boolean {
  if (!meta) return false;
  return meta.origin === "user" || meta.edited || meta.pinned;
}

export function initialKitState(kit: Kit): KitItemState {
  return {
    requirements: Object.fromEntries(kit.role.requirements.map((item) => [item.id, newMeta()])),
    questions: Object.fromEntries(kit.questions.map((item) => [item.id, newMeta()])),
    flashcards: Object.fromEntries(kit.flashcards.map((item) => [item.id, newMeta()])),
    brief: { summary: newMeta(), what_they_do: newMeta() },
    schedule: newMeta(),
  };
}

export function pruneKitState(kit: Kit, state: KitItemState): KitItemState {
  const keep = <T>(ids: string[], record: Record<string, T>) =>
    Object.fromEntries(
      ids.filter((id) => record[id] !== undefined).map((id) => [id, record[id] as T]),
    );

  return {
    ...state,
    requirements: keep(
      kit.role.requirements.map((item) => item.id),
      state.requirements,
    ),
    questions: keep(
      kit.questions.map((item) => item.id),
      state.questions,
    ),
    flashcards: keep(
      kit.flashcards.map((item) => item.id),
      state.flashcards,
    ),
  };
}
