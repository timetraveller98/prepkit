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
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlays";
import {
  useCreateQuestion,
  useDeleteQuestion,
  usePinQuestion,
  useReorderQuestions,
  useUpdateQuestion,
} from "@/lib/queries";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DIFFICULTY_LABELS,
  type KitDetail,
  type Question,
  type QuestionCategory,
} from "@/lib/types";
import { InlineEditable } from "./inline-editable";
import { ItemStateBadges, isProtectedMeta } from "./item-state-badge";
import { RegenerateButton } from "./regenerate-button";
import { SortableRow } from "./sortable-row";

export function QuestionsPanel({ detail }: { detail: KitDetail }) {
  const kit = detail.kit;
  const [adding, setAdding] = useState<QuestionCategory | null>(null);

  if (!kit) return null;

  if (kit.questions.length === 0) {
    return (
      <EmptyState
        title="No questions in this kit"
        description="The posting did not contain enough to build a question bank from. Add your own, or regenerate once you have pasted more of the description."
        action={
          <Button variant="primary" onClick={() => setAdding("technical")}>
            <Plus className="size-4" />
            Write one yourself
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      {CATEGORY_ORDER.map((category) => (
        <CategoryGroup
          key={category}
          detail={detail}
          category={category}
          onAdd={() => setAdding(category)}
        />
      ))}

      <AddQuestionDialog detail={detail} category={adding} onClose={() => setAdding(null)} />
    </div>
  );
}

function CategoryGroup({
  detail,
  category,
  onAdd,
}: {
  detail: KitDetail;
  category: QuestionCategory;
  onAdd: () => void;
}) {
  const kit = detail.kit;
  const reorder = useReorderQuestions(detail.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!kit) return null;

  const questions = kit.questions.filter((question) => question.category === category);
  const protectedCount = questions.filter((question) =>
    isProtectedMeta(detail.itemState?.questions[question.id]),
  ).length;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = questions.map((question) => question.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    const reordered = arrayMove(ids, from, to);
    let cursor = 0;
    const globalOrder = kit.questions.map((question) =>
      question.category === category ? (reordered[cursor++] as string) : question.id,
    );

    reorder.mutate(globalOrder, { onError: (error) => toast.error(error.message) });
  };

  return (
    <section aria-labelledby={`questions-${category}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3
            id={`questions-${category}`}
            className="text-sm font-semibold tracking-tight text-ink"
          >
            {CATEGORY_LABELS[category]}
          </h3>
          <Badge>{questions.length}</Badge>
          {protectedCount > 0 ? <Badge tone="accent">{protectedCount} protected</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add
          </Button>
          <RegenerateButton
            kitId={detail.id}
            section="questions"
            category={category}
            protectedCount={protectedCount}
          />
        </div>
      </div>

      {questions.length === 0 ? (
        <p className="surface-panel px-4 py-6 text-center text-[13px] text-ink-muted">
          Nothing in this category yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={questions.map((question) => question.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="relative space-y-2">
              {questions.map((question) => (
                <QuestionRow key={question.id} detail={detail} question={question} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function QuestionRow({ detail, question }: { detail: KitDetail; question: Question }) {
  const update = useUpdateQuestion(detail.id);
  const remove = useDeleteQuestion(detail.id);
  const pin = usePinQuestion(detail.id);
  const meta = detail.itemState?.questions[question.id];
  const requirements = detail.kit?.role.requirements ?? [];

  const linked = requirements.filter((requirement) =>
    question.requirement_ids.includes(requirement.id),
  );

  return (
    <SortableRow id={question.id} label={question.prompt.slice(0, 60)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={question.difficulty === 3 ? "warning" : "neutral"}>
            {DIFFICULTY_LABELS[question.difficulty]}
          </Badge>
          {linked.map((requirement) => (
            <Badge
              key={requirement.id}
              tone={requirement.priority === "must" ? "accent" : "neutral"}
              title={requirement.text}
            >
              {requirement.id}
            </Badge>
          ))}
          {linked.length === 0 ? <Badge tone="warning">No requirement linked</Badge> : null}
          <ItemStateBadges meta={meta} />
        </div>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Question actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onSelect={() => pin.mutate({ questionId: question.id, pinned: !meta?.pinned })}
            >
              {meta?.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {meta?.pinned ? "Unpin" : "Pin so regeneration keeps it"}
            </MenuItem>
            <MenuSeparator />
            {CATEGORY_ORDER.filter((value) => value !== question.category).map((category) => (
              <MenuItem
                key={category}
                onSelect={() => update.mutate({ questionId: question.id, patch: { category } })}
              >
                Move to {CATEGORY_LABELS[category].toLowerCase()}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={() =>
                remove.mutate(question.id, {
                  onSuccess: (result) => {
                    if (result.newGaps.length > 0) {
                      toast.warning(
                        `Deleted. ${result.newGaps.join(", ")} now has no question against it.`,
                      );
                    } else {
                      toast.success("Question deleted");
                    }
                  },
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
        label="Question"
        value={question.prompt}
        multiline
        className="mt-1 text-[15px] leading-snug font-medium"
        onSave={(prompt) => update.mutate({ questionId: question.id, patch: { prompt } })}
      />

      <details className="group mt-1">
        <summary className="cursor-pointer list-none px-2 text-xs text-ink-faint transition-colors hover:text-ink-muted">
          <span className="group-open:hidden">Show answer outline</span>
          <span className="hidden group-open:inline">Hide answer outline</span>
        </summary>
        <InlineEditable
          label="Answer outline"
          value={question.answer_outline}
          multiline
          placeholder="What a strong answer covers…"
          className="mt-1 text-[13px] text-ink-muted"
          onSave={(answer_outline) =>
            update.mutate({ questionId: question.id, patch: { answer_outline } })
          }
        />
        <div className="mt-2 flex items-center gap-2 px-2">
          <label className="text-xs text-ink-faint" htmlFor={`difficulty-${question.id}`}>
            Difficulty
          </label>
          <Select
            id={`difficulty-${question.id}`}
            className="h-8 w-36 text-xs"
            value={String(question.difficulty)}
            onChange={(event) =>
              update.mutate({
                questionId: question.id,
                patch: { difficulty: Number(event.target.value) },
              })
            }
          >
            {[1, 2, 3].map((level) => (
              <option key={level} value={level}>
                {DIFFICULTY_LABELS[level]}
              </option>
            ))}
          </Select>
        </div>
      </details>
    </SortableRow>
  );
}

function AddQuestionDialog({
  detail,
  category,
  onClose,
}: {
  detail: KitDetail;
  category: QuestionCategory | null;
  onClose: () => void;
}) {
  const create = useCreateQuestion(detail.id);
  const [prompt, setPrompt] = useState("");
  const [requirementId, setRequirementId] = useState("");

  const requirements = detail.kit?.role.requirements ?? [];

  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Add a question"
        description="Anything you write by hand is kept when a category is regenerated."
      >
        <div className="space-y-4">
          <Field label="Question">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="What would you ask?"
              />
            )}
          </Field>

          <Field
            label="Requirement it tests"
            hint="Linking it keeps the coverage check meaningful."
          >
            {(props) => (
              <Select
                {...props}
                value={requirementId}
                onChange={(event) => setRequirementId(event.target.value)}
              >
                <option value="">Not linked</option>
                {requirements.map((requirement) => (
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
              loading={create.isPending}
              disabled={prompt.trim().length === 0}
              onClick={() =>
                category &&
                create.mutate(
                  {
                    prompt: prompt.trim(),
                    category,
                    requirement_ids: requirementId ? [requirementId] : [],
                  },
                  {
                    onSuccess: () => {
                      toast.success("Question added");
                      setPrompt("");
                      setRequirementId("");
                      onClose();
                    },
                    onError: (error) => toast.error(error.message),
                  },
                )
              }
            >
              Add question
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
