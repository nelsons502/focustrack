import { describe, expect, it } from 'vitest';
import { checkSummary, passesGuardrail } from './summary-guardrail.ts';

const source = {
  title: 'Scaling Argo CD Across 40 Kubernetes Clusters',
  description: 'Our platform team runs GitOps for 40 clusters. We share how we sharded the controller and cut sync time by 60%. Slides: https://example.com/argo',
};

describe('summary guardrail', () => {
  it('accepts a short plain summary whose names and numbers all come from the source', () => {
    expect(checkSummary('This talk shows how a platform team runs Argo CD across 40 Kubernetes clusters. It explains how they split the work to cut sync time by 60%.', source))
      .toEqual({ ok: true });
  });

  it('rejects more than two sentences', () => {
    expect(checkSummary('This talk covers Argo CD. It is about clusters. It is about sync time.', source))
      .toEqual({ ok: false, reason: 'more than 2 sentences' });
  });

  it('rejects summaries longer than 320 characters', () => {
    const long = `This talk covers ${'clusters and '.repeat(30)}sync time.`;
    expect(long.length).toBeGreaterThan(320);
    expect(checkSummary(long, source)).toEqual({ ok: false, reason: 'longer than 320 characters' });
  });

  it('rejects a number that is not in the source', () => {
    expect(checkSummary('This talk shows Argo CD running across 400 clusters.', source))
      .toEqual({ ok: false, reason: 'unsupported number: 400' });
  });

  it('rejects a proper noun that is not in the source, even at the start of a sentence', () => {
    expect(checkSummary('This talk compares Argo CD with Flux.', source))
      .toEqual({ ok: false, reason: 'unsupported name: Flux' });
    expect(checkSummary('Spotify engineers explain how they run Argo CD.', source))
      .toEqual({ ok: false, reason: 'unsupported name: Spotify' });
  });

  it('rejects an acronym that is not in the source', () => {
    expect(checkSummary('This talk explains how the team runs GitOps with eBPF.', source))
      .toEqual({ ok: false, reason: 'unsupported name: eBPF' });
  });

  it('rejects a URL that is not in the source and accepts one that is', () => {
    expect(checkSummary('This talk covers Argo CD; see https://evil.example.net for slides.', source).ok).toBe(false);
    expect(checkSummary('This talk covers Argo CD, with slides at https://example.com/argo for later.', source).ok).toBe(true);
  });

  it('rejects empty or missing summaries', () => {
    expect(passesGuardrail(undefined, source)).toBe(false);
    expect(passesGuardrail('   ', source)).toBe(false);
  });

  it('allows ordinary sentence-opening words that are not names', () => {
    expect(passesGuardrail('Learn how a platform team splits the work across clusters. You will see how sync time drops.', source)).toBe(true);
  });

  it('compares whole numbers, so split digits cannot form an invented decimal', () => {
    const numbers = { title: 'Clusters', description: 'We run 3 clusters across 14 regions.' };
    expect(checkSummary('This talk covers 3.14 clusters.', numbers)).toEqual({ ok: false, reason: 'unsupported number: 3.14' });
    expect(passesGuardrail('This talk covers 3 clusters across 14 regions.', numbers)).toBe(true);
  });

  it('matches acronyms and names case-sensitively', () => {
    const plain = { title: 'Clusters', description: 'It covers clusters.' };
    expect(checkSummary('This talk covers IT clusters.', plain)).toEqual({ ok: false, reason: 'unsupported name: IT' });
    expect(checkSummary('IT teams learn about clusters.', plain)).toEqual({ ok: false, reason: 'unsupported name: IT' });
    expect(passesGuardrail('Clusters are covered.', plain)).toBe(true);
  });

  it('requires an exact source URL, not a prefix of one', () => {
    const tricky = { title: 'Clusters', description: 'Deck: https://example.com.evil.net/deck' };
    expect(checkSummary('This talk covers clusters, see https://example.com for more.', tricky).ok).toBe(false);
  });

  it('counts sentences that end inside quotation marks', () => {
    const plain = { title: 'Clusters', description: 'This talk covers clusters.' };
    expect(checkSummary('This talk helps." This talk covers clusters." This talk covers clusters.', plain))
      .toEqual({ ok: false, reason: 'more than 2 sentences' });
  });

  it('keeps fractions and signs as part of a number', () => {
    const numbers = { title: 'Clusters', description: 'We run 3 clusters across 14 regions at 40 percent, in a 10-20 node range.' };
    expect(checkSummary('This talk covers 3/14 clusters.', numbers)).toEqual({ ok: false, reason: 'unsupported number: 3/14' });
    expect(checkSummary('This talk covers -40 clusters.', numbers)).toEqual({ ok: false, reason: 'unsupported number: -40' });
    expect(passesGuardrail('This talk covers a 10-20 node range.', numbers)).toBe(true);
  });
});

describe('accessibility claims', () => {
  it.each(['This talk offers live captions for everyone.', 'This talk runs in a quiet room.'])('rejects %s when the source never mentions it', summary => {
    expect(checkSummary(summary, source).ok).toBe(false);
  });

  it('allows the term when the source mentions it', () => {
    const withTerms = { title: source.title, description: `${source.description} Live captions and a quiet room are provided.` };
    expect(checkSummary('This talk offers live captions in a quiet room.', withTerms)).toEqual({ ok: true });
  });
});
