"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { KitDetail, Requirement } from "@/lib/types";

const KIND_LABELS: Record<Requirement["kind"], string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  domain: "Domain",
};

export function RequirementsPanel({ detail }: { detail: KitDetail }) {
  const kit = detail.kit;
  if (!kit) return null;

  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);
  const questionsFor = (requirementId: string) =>
    kit.questions.filter((question) => question.requirement_ids.includes(requirementId));

  if (kit.role.requirements.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-7" />}
        title="No requirements could be extracted"
        description="The posting did not state anything concrete enough to treat as a requirement. Inventing some would be worse than reporting none, so the kit says so instead."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title="What the posting asks for"
          description="Each line is traced back to wording in the description you pasted."
          actions={
            <div className="flex gap-1.5">
              <Badge tone="accent">
                {kit.role.requirements.filter((item) => item.priority === "must").length} must
              </Badge>
              <Badge>
                {kit.role.requirements.filter((item) => item.priority === "nice").length} nice
              </Badge>
            </div>
          }
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-[var(--border)]">
            {kit.role.requirements.map((requirement) => {
              const covering = questionsFor(requirement.id);
              return (
                <li key={requirement.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={requirement.priority === "must" ? "accent" : "neutral"}>
                      {requirement.id}
                    </Badge>
                    <Badge tone={requirement.priority === "must" ? "accent" : "neutral"}>
                      {requirement.priority === "must" ? "Must have" : "Nice to have"}
                    </Badge>
                    <Badge>{KIND_LABELS[requirement.kind]}</Badge>
                    {uncovered.has(requirement.id) ? (
                      <Badge tone={requirement.priority === "must" ? "danger" : "warning"}>
                        no question
                      </Badge>
                    ) : (
                      <Badge tone="success">
                        {covering.length} question{covering.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-[14px] leading-snug text-ink">{requirement.text}</p>
                  {requirement.evidence && requirement.evidence !== requirement.text ? (
                    <p className="mt-1 border-l-2 border-line pl-2 text-xs leading-relaxed text-ink-faint italic">
                      {requirement.evidence}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="The role as read" />
          <CardBody className="space-y-3 text-[13px]">
            <div>
              <p className="text-xs text-ink-faint">Title</p>
              <p className="text-ink">{kit.role.title || "Not stated"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Seniority</p>
              <p className="text-ink">{kit.role.seniority || "Not stated"}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Location</p>
              <p className="text-ink">{kit.source.location || "Not stated"}</p>
            </div>
          </CardBody>
        </Card>

        {kit.role.responsibilities.length > 0 ? (
          <Card>
            <CardHeader title="Responsibilities" />
            <CardBody>
              <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-muted">
                {kit.role.responsibilities.map((responsibility) => (
                  <li key={responsibility} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
                    {responsibility}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
