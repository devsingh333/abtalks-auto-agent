import axios from 'axios';

export async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 7000,
      maxRedirects: 5,
    });

    const html = response.data;
    if (typeof html !== 'string') return null;

    // Remove script, style, and svg tags
    const cleanedHtml = html
      .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<svg\b[^<]*>([\s\S]*?)<\/svg>/gi, '');

    // Extract text inside paragraph tags <p>...</p>
    const pMatches = cleanedHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const textParagraphs = pMatches
      .map((p: string) => p.replace(/<[^>]+>/g, '').trim())
      .filter((text: string) => text.length > 40 && !text.toLowerCase().includes('cookie') && !text.toLowerCase().includes('privacy policy'));

    if (textParagraphs.length > 0) {
      const fullText = textParagraphs.join('\n\n');
      return fullText.substring(0, 2500);
    }

    // Fallback: strip all HTML tags
    const textFallback = cleanedHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return textFallback.length > 100 ? textFallback.substring(0, 2000) : null;
  } catch (err: any) {
    return null;
  }
}

// Quick Test
async function test() {
  const testUrl = 'https://feeds.bbci.co.uk/news/world/rss.xml';
  console.log('Testing Article Scraper on:', testUrl);
  const result = await fetchArticleContent('https://techcrunch.com');
  console.log('Result sample:', result ? result.substring(0, 300) : 'null');
}

if (require.main === module) {
  test();
}
