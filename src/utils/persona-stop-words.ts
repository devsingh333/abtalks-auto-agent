import { PersonaConfig } from '../database/repositories/agent-repository';

const GENERIC_PUBLISHING_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may',
  'might', 'must', 'can', 'could', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from',
  'by', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out',
  'against', 'during', 'without', 'before', 'under', 'around', 'among', 'this', 'that',
  'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'which',
  'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'news', 'update', 'official', 'reportedly',
  'confirmed', 'revealed', 'teaser', 'trailer', 'announcement', 'first', 'look', 'best',
  'top', 'latest', 'today', '2026', '2025', '2024', 'business', 'upturn', 'report'
]);

/**
 * Dynamically builds a domain stop-word set from an agent's persona configuration.
 * Automatically extracts domain name, agent name, role, and interests so sub-topic duplicate checking
 * works 100% dynamically for any persona domain without any hardcoded lists.
 */
export function buildDynamicDomainStopWords(persona?: PersonaConfig): Set<string> {
  const stopWords = new Set<string>(GENERIC_PUBLISHING_STOP_WORDS);

  if (!persona) return stopWords;

  const tokenizeField = (field: string) => {
    if (!field) return;
    field
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .forEach((w) => stopWords.add(w));
  };

  tokenizeField(persona.domain || '');
  tokenizeField(persona.name || '');
  tokenizeField(persona.role || '');
  if (Array.isArray(persona.interests)) {
    persona.interests.forEach((interest) => tokenizeField(interest));
  }

  return stopWords;
}
