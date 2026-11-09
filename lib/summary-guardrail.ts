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
const WORD_PATTERN = /(?<![\p{L}\p{N}])-?\p{N}+(?:[.,:/]\p{N}+)*%?|[\p{L}\p{N}]+/gu;
const SENTENCE_BREAK = /(?<=[.!?]["'”’)\]]*)\s+/;

function words(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

function urls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map(url => url.replace(/[.,;:!?]+$/, ''));
}

export function checkSummary(summary: string, source: SummarySource): GuardrailResult {
  const text = summary.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_SUMMARY_CHARACTERS) return { ok: false, reason: `longer than ${MAX_SUMMARY_CHARACTERS} characters` };
  const sourceText = `${source.title}\n${source.description}`;
  const sourceUrls = new Set(urls(sourceText));
  for (const url of urls(text)) {
    if (!sourceUrls.has(url)) return { ok: false, reason: `unsupported URL: ${url}` };
  }
  const withoutUrls = text.replace(URL_PATTERN, 'link');
  const sentences = withoutUrls.split(SENTENCE_BREAK).filter(sentence => sentence.trim());
  if (sentences.length > MAX_SUMMARY_SENTENCES) return { ok: false, reason: `more than ${MAX_SUMMARY_SENTENCES} sentences` };
  const known = new Set(words(sourceText.replace(URL_PATTERN, ' ')));
  for (const sentence of sentences) {
    for (const [index, word] of words(sentence).entries()) {
      if (/\p{N}/u.test(word)) {
        if (!known.has(word)) return { ok: false, reason: `unsupported number: ${word}` };
        continue;
      }
      if (!/\p{Lu}/u.test(word) || known.has(word)) continue;
      const lower = word.toLowerCase();
      // A sentence-initial word is capitalized by grammar; accept it only when it is
      // an ordinary lowercase word from the source or a common opener, never an acronym.
      const grammatical = index === 0 && word === capitalize(lower) && (SENTENCE_OPENERS.has(lower) || known.has(lower));
      if (!grammatical) return { ok: false, reason: `unsupported name: ${word}` };
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
