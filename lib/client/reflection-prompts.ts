import type { Session } from "../contract";

export type ReflectionPrompts = {
  prompts: string[];
  contrast: { first: string; second: string } | null;
};

const VERSUS_WORDS = new Set(["vs", "vs.", "versus"]);
const TERM_BOUNDARIES = new Set([
  "a", "an", "and", "at", "by", "choosing", "comparing", "for", "from",
  "in", "of", "on", "or", "the", "to", "use", "using", "with",
]);

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripPunctuation(word: string): string {
  return word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+#]+$/g, "");
}

function startsUpper(word: string): boolean {
  return /^[A-Z]/.test(word);
}

function hasUpper(word: string): boolean {
  return /[A-Z]/.test(word);
}

function joinTerm(words: string[], index: number, step: 1 | -1): string {
  const parts = [words[index]];
  let next = index + step;
  while (
    parts.length < 2 &&
    startsUpper(parts[0]) &&
    words[next] !== undefined &&
    startsUpper(words[next]) &&
    !TERM_BOUNDARIES.has(stripPunctuation(words[next]).toLowerCase()) &&
    !/[.,;:!?]$/.test(step === 1 ? parts[parts.length - 1] : words[next])
  ) {
    parts.push(words[next]);
    next += step;
  }
  if (step === -1) parts.reverse();
  return parts.map(stripPunctuation).join(" ");
}

export function findContrast(
  description: string,
): { first: string; second: string } | null {
  const words = clean(description).split(" ");
  for (let i = 1; i < words.length - 1; i += 1) {
    const marker = words[i].toLowerCase();
    const isVersus = VERSUS_WORDS.has(marker);
    if (!isVersus && marker !== "or") continue;
    const before = stripPunctuation(words[i - 1]);
    const after = stripPunctuation(words[i + 1]);
    if (!before || !after) continue;
    if (!isVersus && !(hasUpper(before) && hasUpper(after))) continue;
    const second = joinTerm(words, i + 1, 1);
    const firstFull = joinTerm(words, i - 1, -1);
    const first = second.includes(" ") ? firstFull : stripPunctuation(words[i - 1]);
    if (first.toLowerCase() === second.toLowerCase()) continue;
    return { first, second };
  }
  return null;
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
