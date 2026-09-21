import type { Question, QuestionCategory, Requirement, Schedule, ScheduleDay } from "../kit.ts";

const STUDY_MINUTES_BY_DIFFICULTY: Record<number, number> = { 1: 10, 2: 15, 3: 25 };
const REVIEW_MINUTES_BY_DIFFICULTY: Record<number, number> = { 1: 5, 2: 8, 3: 12 };
const CATEGORY_ORDER: Record<QuestionCategory, number> = {
  technical: 0,
  "system-design": 1,
  behavioural: 2,
  "company-fit": 3,
};
const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: "Core technical",
  "system-design": "System design",
  behavioural: "Behavioural stories",
  "company-fit": "Company fit",
};
const LEARNING_SHARE = 0.75;
const FRONT_LOAD_TAPER = 0.18;
const MAX_FOCUS_LENGTH = 90;
const EMPTY_DAY_MINUTES = 30;

export interface ScheduleInput {
  daysAvailable: number;
  requirements: Requirement[];
  questions: Question[];
}

export function buildSchedule({ daysAvailable, requirements, questions }: ScheduleInput): Schedule {
  const days = Math.max(1, Math.floor(daysAvailable));
  const requirementById = new Map(requirements.map((r) => [r.id, r]));
  const ordered = orderByStudyPriority(questions, requirementById);

  if (ordered.length === 0) {
    return {
      days_available: days,
      days: Array.from({ length: days }, (_, index) => ({
        day: index + 1,
        focus:
          index === 0
            ? "Re-read the posting and write down what it does not tell you"
            : "Open practice: rehearse your own questions for the interviewer",
        question_ids: [],
        minutes: EMPTY_DAY_MINUTES,
      })),
    };
  }

  const learningDays = Math.min(ordered.length, Math.max(1, Math.ceil(days * LEARNING_SHARE)));
  const reviewDays = days - learningDays;

  const learning = allocateLearningDays(ordered, learningDays, requirementById);
  const review = allocateReviewDays(ordered, reviewDays, learningDays, requirementById);

  return { days_available: days, days: [...learning, ...review] };
}

function orderByStudyPriority(
  questions: Question[],
  requirementById: Map<string, Requirement>,
): Question[] {
  return [...questions].sort((a, b) => {
    const priority = priorityRank(b, requirementById) - priorityRank(a, requirementById);
    if (priority !== 0) return priority;
    if (b.difficulty !== a.difficulty) return b.difficulty - a.difficulty;
    const category = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (category !== 0) return category;
    return a.id.localeCompare(b.id, "en");
  });
}

function priorityRank(question: Question, requirementById: Map<string, Requirement>): number {
  return question.requirement_ids.some((id) => requirementById.get(id)?.priority === "must")
    ? 1
    : 0;
}

function allocateLearningDays(
  ordered: Question[],
  learningDays: number,
  requirementById: Map<string, Requirement>,
): ScheduleDay[] {
  const totalMinutes = ordered.reduce((sum, question) => sum + studyMinutes(question), 0);
  const targets = frontLoadedTargets(totalMinutes, learningDays);

  const buckets: Question[][] = Array.from({ length: learningDays }, () => []);
  let dayIndex = 0;
  let dayMinutes = 0;

  ordered.forEach((question, position) => {
    const remainingQuestions = ordered.length - position;
    const remainingDays = learningDays - dayIndex;
    const mustLeaveOneEach = remainingQuestions <= remainingDays - 1;
    const overTarget = dayMinutes >= (targets[dayIndex] ?? 0);
    const dayHasContent = (buckets[dayIndex]?.length ?? 0) > 0;

    if (dayIndex < learningDays - 1 && (mustLeaveOneEach || (overTarget && dayHasContent))) {
      dayIndex += 1;
      dayMinutes = 0;
    }

    buckets[dayIndex]?.push(question);
    dayMinutes += studyMinutes(question);
  });

  return buckets.map((bucket, index) => ({
    day: index + 1,
    focus: describeFocus(bucket, requirementById, false),
    question_ids: bucket.map((question) => question.id),
    minutes: bucket.reduce((sum, question) => sum + studyMinutes(question), 0),
  }));
}

function allocateReviewDays(
  ordered: Question[],
  reviewDays: number,
  learningDays: number,
  requirementById: Map<string, Requirement>,
): ScheduleDay[] {
  if (reviewDays <= 0) return [];

  const perDay = Math.max(1, Math.ceil(ordered.length / Math.max(1, reviewDays)));
  const days: ScheduleDay[] = [];

  for (let index = 0; index < reviewDays; index += 1) {
    const isFinalDay = index === reviewDays - 1;
    const selection = isFinalDay
      ? ordered.filter((question) => priorityRank(question, requirementById) === 1).slice(0, perDay)
      : rotateSlice(ordered, index * perDay, perDay);
    const chosen = selection.length > 0 ? selection : rotateSlice(ordered, index, 1);

    days.push({
      day: learningDays + index + 1,
      focus: isFinalDay
        ? "Final pass: must-have answers out loud, no notes"
        : describeFocus(chosen, requirementById, true),
      question_ids: chosen.map((question) => question.id),
      minutes: chosen.reduce((sum, question) => sum + reviewMinutes(question), 0),
    });
  }

  return days;
}

function rotateSlice<T>(items: T[], start: number, count: number): T[] {
  if (items.length === 0) return [];
  const result: T[] = [];
  for (let offset = 0; offset < Math.min(count, items.length); offset += 1) {
    const item = items[(start + offset) % items.length];
    if (item !== undefined) result.push(item);
  }
  return result;
}

function frontLoadedTargets(totalMinutes: number, days: number): number[] {
  if (days === 1) return [totalMinutes];
  const factors = Array.from({ length: days }, (_, index) => {
    const position = index / (days - 1);
    return 1 + FRONT_LOAD_TAPER - 2 * FRONT_LOAD_TAPER * position;
  });
  const sum = factors.reduce((total, factor) => total + factor, 0);
  return factors.map((factor) => (totalMinutes * factor) / sum);
}

function studyMinutes(question: Question): number {
  return STUDY_MINUTES_BY_DIFFICULTY[question.difficulty] ?? 15;
}

function reviewMinutes(question: Question): number {
  return REVIEW_MINUTES_BY_DIFFICULTY[question.difficulty] ?? 8;
}

function describeFocus(
  questions: Question[],
  requirementById: Map<string, Requirement>,
  isReview: boolean,
): string {
  if (questions.length === 0) return isReview ? "Review" : "Open practice";

  const categoryCounts = new Map<QuestionCategory, number>();
  for (const question of questions) {
    categoryCounts.set(question.category, (categoryCounts.get(question.category) ?? 0) + 1);
  }
  const dominant = [...categoryCounts.entries()].sort(
    (a, b) => b[1] - a[1] || CATEGORY_ORDER[a[0]] - CATEGORY_ORDER[b[0]],
  )[0]?.[0];

  const topics: string[] = [];
  for (const question of questions) {
    for (const id of question.requirement_ids) {
      const requirement = requirementById.get(id);
      if (!requirement) continue;
      const topic = topicLabel(requirement.text);
      if (topic && !topics.includes(topic)) topics.push(topic);
    }
    if (topics.length >= 3) break;
  }

  const prefix = isReview ? "Review" : dominant ? CATEGORY_LABEL[dominant] : "Practice";
  const headline = topics.length > 0 ? `${prefix}: ${topics.join(", ")}` : prefix;
  return headline.length > MAX_FOCUS_LENGTH
    ? `${headline.slice(0, MAX_FOCUS_LENGTH - 1).trimEnd()}…`
    : headline;
}

const TOPIC_NOISE =
  /^(?:\d+\+?\s*(?:-\s*\d+\s*)?years?(?:\s+of)?(?:\s+(?:hands[- ]on\s+)?experience)?(?:\s+(?:with|in|using|on|of))?|strong|proven|demonstrated|solid|deep|excellent|experience\s+(?:with|in|of)|ability\s+to|familiarity\s+with|working\s+knowledge\s+of|comfortable\s+with|expertise\s+in)\s+/i;

const QUALIFIER_WORDS = new Set([
  "in",
  "on",
  "at",
  "for",
  "with",
  "under",
  "from",
  "to",
  "of",
  "about",
  "across",
  "within",
  "including",
  "using",
  "through",
]);
const TRAILING_WORDS = new Set([...QUALIFIER_WORDS, "and", "or", "a", "an", "the"]);
const TOPIC_MAX_WORDS = 8;

export function topicLabel(text: string): string {
  let cleaned = text.trim();
  for (let pass = 0; pass < 3; pass += 1) {
    const next = cleaned.replace(TOPIC_NOISE, "");
    if (next === cleaned) break;
    cleaned = next;
  }

  const clause = cleaned.split(/[,;:(]/)[0] ?? cleaned;
  const words = clause
    .replace(/[.\s]+$/g, "")
    .split(/\s+/)
    .filter(Boolean);

  let kept = words;
  if (words.length > TOPIC_MAX_WORDS) {
    const breakpoints = words
      .map((word, index) => (QUALIFIER_WORDS.has(word.toLowerCase()) ? index : -1))
      .filter((index) => index > 1 && index <= TOPIC_MAX_WORDS);
    kept = words.slice(0, breakpoints.at(-1) ?? TOPIC_MAX_WORDS);
  }

  const trimmed = [...kept];
  while (trimmed.length > 1 && TRAILING_WORDS.has((trimmed.at(-1) ?? "").toLowerCase()))
    trimmed.pop();
  return trimmed.join(" ");
}

export function scheduleCoversRequirements(
  schedule: Schedule,
  questions: Question[],
  requirements: Requirement[],
): string[] {
  const scheduled = new Set(schedule.days.flatMap((day) => day.question_ids));
  const covered = new Set<string>();
  for (const question of questions) {
    if (!scheduled.has(question.id)) continue;
    for (const id of question.requirement_ids) covered.add(id);
  }
  return requirements
    .filter((requirement) => requirement.priority === "must" && !covered.has(requirement.id))
    .map((requirement) => requirement.id);
}
