export const MAX_SUMMARY_CHARACTERS = 320;
export const MAX_SUMMARY_SENTENCES = 2;

export type SummarySource = { title: string; description: string };
export type GuardrailResult = { ok: true } | { ok: false; reason: string };

// Sentence-initial words are capitalized by grammar, not because they are names,
// so only this small set of common openers is exempt from the source check.
const SENTENCE_OPENERS = new Set([
  'a', 'an', 'the', 'this', 'these', 'it', 'its', 'in', 'you', 'your', 'we', 'our', 'they', 'their',
  'learn', 'see', 'explore', 'discover', 'find', 'get', 'hear', 'join', 'come', 'attendees', 'speakers',
  'with', 'how', 'why', 'what', 'after', 'by', 'for', 'if', 'using', 'when', 'through', 'both', 'each', 'together',
]);

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;

function words(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

export function checkSummary(summary: string, source: SummarySource): GuardrailResult {
  const text = summary.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_SUMMARY_CHARACTERS) return { ok: false, reason: `longer than ${MAX_SUMMARY_CHARACTERS} characters` };
  const sourceText = `${source.title}\n${source.description}`;
  for (const url of text.match(URL_PATTERN) ?? []) {
    const trimmed = url.replace(/[.,;:!?]+$/, '');
    if (!sourceText.includes(trimmed)) return { ok: false, reason: `unsupported URL: ${trimmed}` };
  }
  const withoutUrls = text.replace(URL_PATTERN, 'link');
  const sentences = withoutUrls.split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim());
  if (sentences.length > MAX_SUMMARY_SENTENCES) return { ok: false, reason: `more than ${MAX_SUMMARY_SENTENCES} sentences` };
  const known = new Set(words(sourceText).map(word => word.toLowerCase()));
  for (const sentence of sentences) {
    for (const [index, word] of words(sentence).entries()) {
      const lower = word.toLowerCase();
      if (/\p{N}/u.test(word)) {
        if (!known.has(lower)) return { ok: false, reason: `unsupported number: ${word}` };
      } else if (/\p{Lu}/u.test(word) && !known.has(lower) && !(index === 0 && word === capitalize(lower) && SENTENCE_OPENERS.has(lower))) {
        return { ok: false, reason: `unsupported name: ${word}` };
      }
    }
  }
  return { ok: true };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function passesGuardrail(summary: string | undefined, source: SummarySource): summary is string {
  return typeof summary === 'string' && checkSummary(summary, source).ok;
}
