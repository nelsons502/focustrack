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
});
