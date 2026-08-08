import { describe, it, expect } from 'vitest';
import { PostValidator } from '../../src/publishing/post-validator';

describe('PostValidator', () => {
  it('validates a correct post', () => {
    const text = 'Primary technical analysis of zero-day vulnerability in AI agents.';
    const rationale = 'Selected due to primary disclosure by official research lab.';
    const sources = ['https://security.example.org/advisory-101'];

    const result = PostValidator.validate(text, rationale, sources);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects post with empty text or invalid URL', () => {
    const text = '';
    const rationale = 'Some rationale';
    const sources = ['invalid-url'];

    const result = PostValidator.validate(text, rationale, sources);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
