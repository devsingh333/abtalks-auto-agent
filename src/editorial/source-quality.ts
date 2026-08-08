/**
 * Assigns source quality ratings based on primary vs secondary source classifications.
 * 10 = primary technical research / official lab blog / security advisory
 * 8 = reputable specialist publication
 * 6 = secondary news coverage
 * 4 = low-information summary
 */
export function getSourceQualityScore(sourceName: string, sourceType: string): number {
  const nameLower = sourceName.toLowerCase();
  const typeLower = sourceType.toLowerCase();

  if (typeLower === 'official_blog' || nameLower.includes('openai') || nameLower.includes('anthropic') || nameLower.includes('google ai') || nameLower.includes('security advisory')) {
    return 10;
  }

  if (typeLower === 'research' || nameLower.includes('arxiv') || nameLower.includes('hugging face') || nameLower.includes('github releases')) {
    return 9;
  }

  if (nameLower.includes('hacker news') || nameLower.includes('techcrunch') || nameLower.includes('ars technica')) {
    return 7;
  }

  return 6;
}
