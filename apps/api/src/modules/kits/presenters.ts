import { computeCoverage } from "@prepkit/core";
import type { KitRecord } from "./service.ts";

export function toKitSummary(document: KitRecord) {
  const kit = document.kit;
  const coverage = kit ? computeCoverage(kit.role.requirements, kit.questions) : null;

  return {
    id: document._id.toString(),
    title: document.title,
    company: kit?.source.company ?? "",
    companyUrl: document.companyUrl,
    role: kit?.role.title ?? "",
    daysAvailable: document.daysAvailable,
    status: document.status,
    regeneratingSection: document.regeneratingSection,
    progress: document.progress,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    counts: {
      requirements: kit?.role.requirements.length ?? 0,
      mustRequirements:
        kit?.role.requirements.filter((item) => item.priority === "must").length ?? 0,
      questions: kit?.questions.length ?? 0,
      flashcards: kit?.flashcards.length ?? 0,
      uncoveredMust: coverage?.uncoveredMust.length ?? 0,
    },
  };
}

export function toKitDetail(document: KitRecord) {
  return {
    ...toKitSummary(document),
    jobDescription: document.jobDescription,
    kit: document.kit,
    itemState: document.itemState,
    events: document.events,
    usage: document.usage,
    hiringProcess: document.research?.hiring ?? null,
    researchedPages:
      document.research?.pages.map((page) => ({
        url: page.url,
        title: page.title,
        intent: page.intent,
        looksLikeHiringProcess: page.looksLikeHiringProcess,
      })) ?? [],
  };
}
