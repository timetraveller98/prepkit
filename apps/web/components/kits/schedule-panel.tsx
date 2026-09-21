"use client";

import { CalendarRange, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useRegenerate } from "@/lib/queries";
import type { KitDetail } from "@/lib/types";

export function SchedulePanel({ detail }: { detail: KitDetail }) {
  const kit = detail.kit;
  const regenerate = useRegenerate(detail.id);
  const [days, setDays] = useState(detail.daysAvailable);

  if (!kit) return null;

  const questionById = new Map(kit.questions.map((question) => [question.id, question]));
  const totalMinutes = kit.schedule.days.reduce((sum, day) => sum + day.minutes, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Study plan"
          description="Allocated by the application, not the model: harder and must-have material lands first."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge>
                <Clock className="size-3" />
                {Math.round(totalMinutes / 60)}h {totalMinutes % 60}m total
              </Badge>
              <label className="sr-only" htmlFor="days-available">
                Days until the interview
              </label>
              <Input
                id="days-available"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(event) => setDays(Number(event.target.value) || 1)}
                className="w-20"
              />
              <Button
                size="sm"
                loading={regenerate.isPending}
                disabled={days === kit.schedule.days_available}
                onClick={() =>
                  regenerate.mutate(
                    { section: "schedule", daysAvailable: days },
                    {
                      onSuccess: () => toast.success(`Re-planned across ${days} days`),
                      onError: (error) => toast.error(error.message),
                    },
                  )
                }
              >
                <CalendarRange className="size-3.5" />
                Re-plan
              </Button>
            </div>
          }
        />
        <CardBody className="p-0">
          <ol className="divide-y divide-line">
            {kit.schedule.days.map((day) => (
              <li
                key={day.day}
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-sunken/60 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-5"
              >
                <div className="flex items-center gap-2 sm:block">
                  <span className="numeric text-micro tracking-[0.06em] text-ink-faint uppercase">
                    Day {day.day}
                  </span>
                  <span aria-hidden className="h-3 w-px bg-line sm:hidden" />
                  <span className="numeric text-small font-medium text-ink sm:mt-0.5 sm:block">
                    {day.minutes} min
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">{day.focus}</p>
                  {day.question_ids.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {day.question_ids.map((id) => {
                        const question = questionById.get(id);
                        return (
                          <li key={id} className="flex gap-2 text-small text-ink-muted">
                            <Badge tone="outline" className="mt-px shrink-0">
                              {id}
                            </Badge>
                            <span className="min-w-0 leading-snug">
                              {question?.prompt ?? "Missing question"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1 text-small text-ink-faint">
                      Nothing allocated: this kit has no questions to study.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
