import type { Requirement } from "../../kit.ts";
import { topicLabel } from "../schedule.ts";
import type { GeneratedQuestion } from "./generate-questions.ts";

export function synthesizeQuestion(requirement: Requirement): GeneratedQuestion {
  const topic = topicLabel(requirement.text) || requirement.text;

  if (requirement.kind === "behavioural") {
    return {
      requirement_ids: [requirement.id],
      category: "behavioural",
      prompt: `Tell me about a specific situation that shows how you handle ${lowerFirst(topic)}. What did you do, and how did it land?`,
      answer_outline: outline(requirement, [
        "Name one concrete situation with a date, a team and a stake.",
        "Say what you personally decided, not what the team decided.",
        "Close with the measurable outcome and what you changed afterwards.",
      ]),
      difficulty: 2,
    };
  }

  if (requirement.kind === "domain") {
    return {
      requirement_ids: [requirement.id],
      category: "company-fit",
      prompt: `This role expects ${lowerFirst(requirement.text)}. Where does your understanding of that come from, and what would you need to learn here?`,
      answer_outline: outline(requirement, [
        "Point at the specific exposure you already have, and be honest about its limits.",
        "Name one thing about this company's version of the problem that differs from what you have seen.",
        "Say what you would read or who you would talk to in week one.",
      ]),
      difficulty: 2,
    };
  }

  return {
    requirement_ids: [requirement.id],
    category: "technical",
    prompt: `Walk me through the most demanding thing you have built with ${topic}. What broke, and what would you design differently now?`,
    answer_outline: outline(requirement, [
      "Set the scene in two sentences: the system, the constraint, your role.",
      "Describe one decision and the alternative you rejected, with the reason.",
      "Name the failure you hit and how you found it.",
      "Finish with the change you would make today and why.",
    ]),
    difficulty: 2,
  };
}

function outline(requirement: Requirement, bullets: string[]): string {
  return [`Covers: ${requirement.text}`, ...bullets].join("\n");
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
