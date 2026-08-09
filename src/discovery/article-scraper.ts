import axios from 'axios';
import { logger } from '../utils/logger';

export class ArticleScraperService {
  private static cache = new Map<string, string>();

  static async fetchArticleContent(url: string): Promise<string | null> {
    if (!url || !url.startsWith('http')) return null;

    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 7000,
        maxRedirects: 5,
      });

      const html = response.data;
      if (typeof html !== 'string' || !html) return null;

      // Remove script, style, and svg tags
      const cleanedHtml = html
        .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
        .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
        .replace(/<svg\b[^<]*>([\s\S]*?)<\/svg>/gi, '');

      // Extract text inside paragraph tags <p>...</p>
      const pMatches = cleanedHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
      const textParagraphs = pMatches
        .map((p: string) => p.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(
          (text: string) =>
            text.length > 40 &&
            !text.toLowerCase().includes('cookie') &&
            !text.toLowerCase().includes('privacy policy') &&
            !text.toLowerCase().includes('all rights reserved') &&
            !text.toLowerCase().includes('subscribe')
        );

      let extractedText: string | null = null;

      if (textParagraphs.length > 0) {
        extractedText = textParagraphs.join('\n\n').substring(0, 2500);
      } else {
        // Fallback: strip all HTML tags
        const textFallback = cleanedHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (textFallback.length > 100) {
          extractedText = textFallback.substring(0, 2000);
        }
      }

      if (extractedText) {
        this.cache.set(url, extractedText);
        logger.info('Successfully scraped full article content from URL', { url, length: extractedText.length });
        return extractedText;
      }
      return null;
    } catch (err: any) {
      logger.warn('Failed to scrape article content from URL, using RSS summary fallback', { url, message: err.message });
      return null;
    }
  }
}
