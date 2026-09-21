"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MoreHorizontal, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlays";
import {
  useCreateFlashcard,
  useDeleteFlashcard,
  usePinFlashcard,
  useReorderFlashcards,
  useUpdateFlashcard,
} from "@/lib/queries";
import type { Flashcard, KitDetail } from "@/lib/types";
import { InlineEditable } from "./inline-editable";
import { ItemStateBadges, isProtectedMeta } from "./item-state-badge";
import { RegenerateButton } from "./regenerate-button";
import { SortableRow } from "./sortable-row";

export function FlashcardsPanel({ detail }: { detail: KitDetail }) {
  const kit = detail.kit;
  const reorder = useReorderFlashcards(detail.id);
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!kit) return null;

  const protectedCount = kit.flashcards.filter((flashcard) =>
    isProtectedMeta(detail.itemState?.flashcards[flashcard.id]),
  ).length;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = kit.flashcards.map((flashcard) => flashcard.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorder.mutate(arrayMove(ids, from, to), { onError: (error) => toast.error(error.message) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{kit.flashcards.length} cards</Badge>
          {protectedCount > 0 ? <Badge tone="accent">{protectedCount} protected</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Add card
          </Button>
          <RegenerateButton
            kitId={detail.id}
            section="flashcards"
            protectedCount={protectedCount}
          />
          <Button asChild size="sm" variant="primary">
            <Link href={`/kits/${detail.id}/practice`}>Practise</Link>
          </Button>
        </div>
      </div>

      {kit.flashcards.length === 0 ? (
        <EmptyState
          title="No flashcards yet"
          description="Cards are built from the requirements the posting actually stated. A thin posting produces few of them."
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Write a card
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={kit.flashcards.map((flashcard) => flashcard.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="relative space-y-2">
              {kit.flashcards.map((flashcard) => (
                <FlashcardRow key={flashcard.id} detail={detail} flashcard={flashcard} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <AddFlashcardDialog detail={detail} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function FlashcardRow({ detail, flashcard }: { detail: KitDetail; flashcard: Flashcard }) {
  const update = useUpdateFlashcard(detail.id);
  const remove = useDeleteFlashcard(detail.id);
  const pin = usePinFlashcard(detail.id);
  const meta = detail.itemState?.flashcards[flashcard.id];

  return (
    <SortableRow id={flashcard.id} label={flashcard.front.slice(0, 60)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {flashcard.requirement_ids.map((id) => (
            <Badge key={id} tone="accent">
              {id}
            </Badge>
          ))}
          <ItemStateBadges meta={meta} />
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Card actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onSelect={() => pin.mutate({ flashcardId: flashcard.id, pinned: !meta?.pinned })}
            >
              {meta?.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {meta?.pinned ? "Unpin" : "Pin so regeneration keeps it"}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={() =>
                remove.mutate(flashcard.id, {
                  onSuccess: () => toast.success("Card deleted"),
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              <Trash2 className="size-3.5" />
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <InlineEditable
        label="Card front"
        value={flashcard.front}
        multiline
        className="text-[15px] leading-snug font-medium"
        onSave={(front) => update.mutate({ flashcardId: flashcard.id, patch: { front } })}
      />
      <InlineEditable
        label="Card back"
        value={flashcard.back}
        multiline
        placeholder="The answer, plus the detail that proves you know it…"
        className="text-[13px] text-ink-muted"
        onSave={(back) => update.mutate({ flashcardId: flashcard.id, patch: { back } })}
      />
    </SortableRow>
  );
}

function AddFlashcardDialog({
  detail,
  open,
  onClose,
}: {
  detail: KitDetail;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateFlashcard(detail.id);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [requirementId, setRequirementId] = useState("");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Add a flashcard" description="Kept through any regeneration.">
        <div className="space-y-4">
          <Field label="Front">
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={front}
                onChange={(event) => setFront(event.target.value)}
                placeholder="The cue"
              />
            )}
          </Field>
          <Field label="Back">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={back}
                onChange={(event) => setBack(event.target.value)}
                placeholder="The answer"
              />
            )}
          </Field>
          <Field label="Requirement">
            {(props) => (
              <Select
                {...props}
                value={requirementId}
                onChange={(event) => setRequirementId(event.target.value)}
              >
                <option value="">Not linked</option>
                {(detail.kit?.role.requirements ?? []).map((requirement) => (
                  <option key={requirement.id} value={requirement.id}>
                    {requirement.id} — {requirement.text.slice(0, 60)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              variant="primary"
              disabled={front.trim().length === 0}
              loading={create.isPending}
              onClick={() =>
                create.mutate(
                  {
                    front: front.trim(),
                    back: back.trim(),
                    requirement_ids: requirementId ? [requirementId] : [],
                  },
                  {
                    onSuccess: () => {
                      toast.success("Card added");
                      setFront("");
                      setBack("");
                      onClose();
                    },
                    onError: (error) => toast.error(error.message),
                  },
                )
              }
            >
              Add card
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
