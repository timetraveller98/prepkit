"use client";

import { ExternalLink, Info, ShieldAlert, Telescope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useUpdateBrief } from "@/lib/queries";
import type { KitDetail } from "@/lib/types";
import { InlineEditable } from "./inline-editable";
import { ItemStateBadges } from "./item-state-badge";
import { RegenerateButton } from "./regenerate-button";

const CONFIDENCE_TONE = {
  high: "success",
  medium: "accent",
  low: "warning",
  none: "neutral",
} as const;

export function OverviewPanel({ detail }: { detail: KitDetail }) {
  const kit = detail.kit;
  const updateBrief = useUpdateBrief(detail.id);

  if (!kit) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Company brief"
            description="Written only from pages fetched on their own site."
            actions={
              <div className="flex items-center gap-2">
                <ItemStateBadges meta={detail.itemState?.brief.summary} />
                <RegenerateButton kitId={detail.id} section="company_brief" />
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div>
              <h3 className="mb-1 px-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
                Summary
              </h3>
              <InlineEditable
                label="Company summary"
                value={kit.company_brief.summary}
                multiline
                placeholder="Nothing could be established about this company."
                className="text-[14px] leading-relaxed"
                onSave={(summary) => updateBrief.mutate({ summary })}
              />
            </div>
            <div>
              <h3 className="mb-1 px-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
                What they do
              </h3>
              <InlineEditable
                label="What they do"
                value={kit.company_brief.what_they_do}
                multiline
                placeholder="Unknown."
                className="text-[14px] leading-relaxed text-ink-muted"
                onSave={(what_they_do) => updateBrief.mutate({ what_they_do })}
              />
            </div>

            {kit.company_brief.sources.length > 0 ? (
              <div className="border-t border-line pt-3">
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-ink-faint uppercase">
                  Sources
                </h3>
                <ul className="space-y-1">
                  {kit.company_brief.sources.map((source) => (
                    <li key={source}>
                      <SourceLink href={source} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="How they hire"
            description="What the crawl and public discussion actually supported."
            actions={
              detail.hiringProcess ? (
                <Badge tone={CONFIDENCE_TONE[detail.hiringProcess.confidence]}>
                  {detail.hiringProcess.found
                    ? `${detail.hiringProcess.confidence} confidence`
                    : "not found"}
                </Badge>
              ) : null
            }
          />
          <CardBody>
            {detail.hiringProcess?.found ? (
              <div className="space-y-4">
                <p className="text-[14px] leading-relaxed text-ink">
                  {detail.hiringProcess.summary}
                </p>

                {detail.hiringProcess.stages.length > 0 ? (
                  <ol className="space-y-2">
                    {detail.hiringProcess.stages.map((stage, index) => (
                      <li key={stage.name} className="flex gap-3">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink">{stage.name}</p>
                          <p className="text-[13px] leading-relaxed text-ink-muted">
                            {stage.what_happens}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {detail.hiringProcess.signals.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
                    <span className="text-xs text-ink-faint">Prepare for:</span>
                    {detail.hiringProcess.signals.map((signal) => (
                      <Badge key={signal} tone="accent">
                        {signal}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                No hiring or interview-process page was found on their site, and public discussion
                turned up nothing usable. Rather than guess, this kit is built from the posting and
                the company brief alone.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="What the research reached" />
          <CardBody className="space-y-3">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <Stat label="Pages read" value={kit.source.pages_used.length} />
              <Stat label="Pages skipped" value={kit.research.pages_failed.length} />
              <Stat
                label="Public discussion"
                value={kit.research.public_discussion_found ? "found" : "none"}
              />
              <Stat label="Coverage passes" value={kit.coverage.passes} />
            </dl>

            {detail.researchedPages.length > 0 ? (
              <ul className="space-y-1 border-t border-line pt-3">
                {detail.researchedPages.map((page) => (
                  <li key={page.url} className="flex items-start gap-2">
                    {page.looksLikeHiringProcess ? (
                      <Telescope className="mt-0.5 size-3.5 shrink-0 text-accent" />
                    ) : null}
                    <SourceLink href={page.url} label={page.title || page.url} />
                  </li>
                ))}
              </ul>
            ) : null}

            {kit.research.pages_failed.length > 0 ? (
              <details className="border-t border-line pt-3">
                <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-muted">
                  {kit.research.pages_failed.length} source(s) could not be retrieved
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-ink-faint">
                  {kit.research.pages_failed.slice(0, 12).map((failure) => (
                    <li key={`${failure.url}-${failure.reason}`} className="break-all">
                      <span className="text-ink-muted">{failure.url}</span> — {failure.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardBody>
        </Card>

        {kit.notes.length > 0 ? (
          <Card>
            <CardHeader title="What this kit does not know" />
            <CardBody>
              <ul className="space-y-2 text-[13px] leading-relaxed text-ink-muted">
                {kit.notes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint"
                    />
                    {note}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        {kit.research.suspicious_content_flags.length > 0 ? (
          <Card className="border-warning/40">
            <CardHeader title="Content that tried to give instructions" />
            <CardBody>
              <p className="mb-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink-muted">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                These sources contained text shaped like instructions to the model. It was passed
                through as data and never followed.
              </p>
              <ul className="space-y-1 text-xs text-ink-faint">
                {kit.research.suspicious_content_flags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-bg-subtle px-3 py-2">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function SourceLink({ href, label }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-start gap-1 text-xs break-all text-ink-muted hover:text-accent hover:underline"
    >
      <span className="min-w-0">{label ?? href}</span>
      <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
    </a>
  );
}
