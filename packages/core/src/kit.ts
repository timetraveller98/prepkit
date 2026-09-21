import { z } from "zod";

export const REQUIREMENT_KINDS = ["technical", "behavioural", "domain"] as const;
export const REQUIREMENT_PRIORITIES = ["must", "nice"] as const;
export const QUESTION_CATEGORIES = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
] as const;

export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

const nonEmpty = z.string().trim().min(1);
const url = z.string().trim().url();

export const requirementSchema = z.object({
  id: nonEmpty,
  text: nonEmpty,
  kind: z.enum(REQUIREMENT_KINDS),
  priority: z.enum(REQUIREMENT_PRIORITIES),
  evidence: z.string().optional(),
});

export const questionSchema = z.object({
  id: nonEmpty,
  requirement_ids: z.array(nonEmpty),
  category: z.enum(QUESTION_CATEGORIES),
  prompt: nonEmpty,
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

export const flashcardSchema = z.object({
  id: nonEmpty,
  front: nonEmpty,
  back: z.string(),
  requirement_ids: z.array(nonEmpty),
});

export const scheduleDaySchema = z.object({
  day: z.number().int().min(1),
  focus: nonEmpty,
  question_ids: z.array(nonEmpty),
  minutes: z.number().int().min(0),
});

export const scheduleSchema = z.object({
  days_available: z.number().int().min(1),
  days: z.array(scheduleDaySchema),
});

export const sourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().min(0),
  researched_at: nonEmpty,
  pages_used: z.array(z.string()),
});

export const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const roleSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(requirementSchema),
});

export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(nonEmpty),
  passes: z.number().int().min(0),
});

export const researchSchema = z.object({
  hiring_process_found: z.boolean(),
  hiring_process_summary: z.string(),
  hiring_pages: z.array(z.string()),
  public_discussion_found: z.boolean(),
  public_discussion_sources: z.array(z.string()),
  pages_failed: z.array(z.object({ url: z.string(), reason: z.string() })),
  robots_blocked: z.array(z.string()),
  suspicious_content_flags: z.array(z.string()),
});

export const kitSchema = z
  .object({
    source: sourceSchema,
    company_brief: companyBriefSchema,
    role: roleSchema,
    questions: z.array(questionSchema),
    flashcards: z.array(flashcardSchema),
    schedule: scheduleSchema,
    coverage: coverageSchema,
    research: researchSchema,
    notes: z.array(z.string()),
  })
  .superRefine((kit, ctx) => {
    const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
    const questionIds = new Set(kit.questions.map((q) => q.id));

    reportDuplicates(
      ctx,
      kit.role.requirements.map((r) => r.id),
      ["role", "requirements"],
    );
    reportDuplicates(
      ctx,
      kit.questions.map((q) => q.id),
      ["questions"],
    );
    reportDuplicates(
      ctx,
      kit.flashcards.map((f) => f.id),
      ["flashcards"],
    );

    kit.questions.forEach((question, index) => {
      for (const id of question.requirement_ids) {
        if (!requirementIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["questions", index, "requirement_ids"],
            message: `question ${question.id} references unknown requirement ${id}`,
          });
        }
      }
    });

    kit.flashcards.forEach((flashcard, index) => {
      for (const id of flashcard.requirement_ids) {
        if (!requirementIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["flashcards", index, "requirement_ids"],
            message: `flashcard ${flashcard.id} references unknown requirement ${id}`,
          });
        }
      }
    });

    if (kit.schedule.days.length !== kit.schedule.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule", "days"],
        message: `schedule has ${kit.schedule.days.length} days but days_available is ${kit.schedule.days_available}`,
      });
    }

    kit.schedule.days.forEach((day, index) => {
      if (day.day !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schedule", "days", index, "day"],
          message: `expected day ${index + 1}, received ${day.day}`,
        });
      }
      for (const id of day.question_ids) {
        if (!questionIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["schedule", "days", index, "question_ids"],
            message: `day ${day.day} references unknown question ${id}`,
          });
        }
      }
    });

    for (const id of kit.coverage.uncovered_requirement_ids) {
      if (!requirementIds.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["coverage", "uncovered_requirement_ids"],
          message: `coverage references unknown requirement ${id}`,
        });
      }
    }
  });

function reportDuplicates(ctx: z.RefinementCtx, ids: string[], path: (string | number)[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `duplicate id ${id}`,
      });
    }
    seen.add(id);
  }
}

export type Requirement = z.infer<typeof requirementSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Flashcard = z.infer<typeof flashcardSchema>;
export type ScheduleDay = z.infer<typeof scheduleDaySchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type CompanyBrief = z.infer<typeof companyBriefSchema>;
export type RoleBreakdown = z.infer<typeof roleSchema>;
export type Coverage = z.infer<typeof coverageSchema>;
export type ResearchReport = z.infer<typeof researchSchema>;
export type Kit = z.infer<typeof kitSchema>;

export type KitValidation =
  | { valid: true; kit: Kit }
  | { valid: false; issues: { path: string; message: string }[] };

export function validateKit(candidate: unknown): KitValidation {
  const result = kitSchema.safeParse(candidate);
  if (result.success) return { valid: true, kit: result.data };
  return {
    valid: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

export function isAppendixAUrl(value: string): boolean {
  return url.safeParse(value).success;
}
