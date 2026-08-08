export interface FeedSource {
  id: string;
  name: string;
  url: string;
  sourceType: 'official_blog' | 'research' | 'security' | 'tech_news';
}

export const LIVE_TECH_SOURCES: FeedSource[] = [
  {
    id: 'openai-blog',
    name: 'OpenAI Research & News',
    url: 'https://openai.com/news/rss.xml',
    sourceType: 'official_blog',
  },
  {
    id: 'arxiv-security',
    name: 'arXiv AI & Security Research',
    url: 'https://arxiv.org/rss/cs.CR',
    sourceType: 'research',
  },
  {
    id: 'the-hacker-news',
    name: 'The Hacker News',
    url: 'https://thehackernews.com/feeds/posts/default',
    sourceType: 'security',
  },
  {
    id: 'github-security',
    name: 'GitHub Security Advisories',
    url: 'https://github.blog/category/security/feed/',
    sourceType: 'security',
  },
  {
    id: 'google-ai-blog',
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    sourceType: 'official_blog',
  },
  {
    id: 'hn-ai-feed',
    name: 'Hacker News Tech Feed',
    url: 'https://hnrss.org/frontpage?q=AI+OR+Security+OR+LLM',
    sourceType: 'tech_news',
  },
];
