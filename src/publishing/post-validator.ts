export interface PostValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PostValidator {
  static validate(text: string, rationale: string, sources: string[]): PostValidationResult {
    const errors: string[] = [];

    if (!text || text.trim().length === 0) {
      errors.push('Post text cannot be empty');
    }

    if (text && text.trim().length > 2000) {
      errors.push('Post text exceeds maximum length of 2000 characters');
    }

    if (!rationale || rationale.trim().length === 0) {
      errors.push('Rationale cannot be empty');
    }

    if (!sources || sources.length === 0) {
      errors.push('Post must contain at least one source URL');
    }

    sources.forEach((url) => {
      try {
        new URL(url);
      } catch {
        errors.push(`Invalid source URL: ${url}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
