import { describe, it, expect } from 'vitest';
import { SourceNormalizer } from '../../src/discovery/source-normalizer';
import { canonicalizeUrl, computeHash } from '../../src/utils/hashing';

describe('SourceNormalizer & Hashing Utilities', () => {
  it('canonicalizes URLs by removing tracking parameters and trailing slashes', () => {
    const raw = 'HTTPS://Blog.Example.com/article/?utm_source=rss&utm_medium=feed&ref=123/';
    const canonical = canonicalizeUrl(raw);
    expect(canonical).toBe('https://blog.example.com/article');
  });

  it('computes consistent sha256 hashes for content', () => {
    const hash1 = computeHash('Zero-day vulnerability in AI agents');
    const hash2 = computeHash('zero-day vulnerability in ai agents ');
    expect(hash1).toBe(hash2);
  });

  it('normalizes raw feed items correctly', () => {
    const rawItem = {
      guid: 'item_123',
      link: 'https://example.com/post-1?utm_campaign=launch',
      title: ' New LLM Security Benchmark Released ',
      contentSnippet: 'A comprehensive benchmark evaluating LLM prompt injection risks.',
      pubDate: '2026-08-09T00:00:00Z',
    };

    const normalized = SourceNormalizer.normalizeItem(rawItem, 'AI Security Blog', 'official_blog');
    expect(normalized).not.toBeNull();
    expect(normalized?.canonicalUrl).toBe('https://example.com/post-1');
    expect(normalized?.title).toBe('New LLM Security Benchmark Released');
    expect(normalized?.sourceName).toBe('AI Security Blog');
    expect(normalized?.publishedAt).toBeInstanceOf(Date);
  });
});
