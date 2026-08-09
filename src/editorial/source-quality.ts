/**
 * Blocklist of low-credibility, spam, or off-target aggregator domains.
 */
const JUNK_DOMAIN_BLOCKLIST = [
  'softonic',
  'ixbt.games',
  'sacnilk',
  'aol.com',
  'apkpure',
  'ezinearticles',
  'clickbait',
  'spamblog',
  'dailyexpress',
];

/**
 * Checks if a candidate URL or source belongs to a known junk/spam aggregator domain.
 */
export function isJunkSourceDomain(url: string, title: string = ''): boolean {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();

  for (const junk of JUNK_DOMAIN_BLOCKLIST) {
    if (urlLower.includes(junk) || titleLower.includes(junk)) {
      return true;
    }
  }
  return false;
}

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
