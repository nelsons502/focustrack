import type { Session } from "../contract";

export type ReflectionPrompts = {
  prompts: string[];
  contrast: { first: string; second: string } | null;
};

const TERM = String.raw`[A-Z][\w.+-]*(?: [A-Z][\w.+-]*)?`;
const VERSUS = new RegExp(`(${TERM})\\s+(?:vs\\.?|versus)\\s+(${TERM})`);
const VERSUS_LOWER = /(?:^|\s)([A-Za-z][\w.+-]*)\s+(?:vs\.?|versus)\s+([A-Za-z][\w.+-]*)/;
// Plain "or" is far noisier than "vs", so only a single capitalised word on each side counts.
const OR_PAIR = /\b([A-Z][\w.+-]*) or ([A-Z][\w.+-]*)\b/;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function findContrast(
  description: string,
): { first: string; second: string } | null {
  const text = clean(description);
  const match = VERSUS.exec(text) ?? VERSUS_LOWER.exec(text) ?? OR_PAIR.exec(text);
  if (!match) return null;
  const first = match[1].trim();
  const second = match[2].trim();
  if (first.toLowerCase() === second.toLowerCase()) return null;
  return { first, second };
}

export function buildReflectionPrompts(
  session: Pick<Session, "title" | "description">,
): ReflectionPrompts {
  const title = clean(session.title);
  const prompts = [
    `In one sentence, what was the main idea of '${title}'?`,
    "What's one thing you could try at work after this talk?",
    "What was unclear or worth asking the speaker?",
  ];
  const contrast = findContrast(session.description) ?? findContrast(title);
  if (contrast) {
    prompts.push(
      `The talk compared ${contrast.first} and ${contrast.second}. Which fits your team, and why?`,
    );
  }
  return { prompts, contrast };
}
