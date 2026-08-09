export interface FeedSource {
  id: string;
  name: string;
  url: string;
  sourceType: 'official_blog' | 'research' | 'security' | 'tech_news' | 'world_news';
}

export const LIVE_TECH_SOURCES: FeedSource[] = [
  // Official & Research Sources
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

  // Premium Tech News RSS Feeds
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    sourceType: 'tech_news',
  },
  {
    id: 'the-verge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    sourceType: 'tech_news',
  },
  {
    id: 'wired',
    name: 'Wired',
    url: 'https://www.wired.com/feed/rss',
    sourceType: 'tech_news',
  },
  {
    id: 'mit-tech-review',
    name: 'MIT Technology Review',
    url: 'https://www.technologyreview.com/feed/',
    sourceType: 'tech_news',
  },

  // Major World News RSS Feeds
  {
    id: 'bbc-world-news',
    name: 'BBC World News',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    sourceType: 'world_news',
  },
  {
    id: 'nyt-world',
    name: 'New York Times World',
    url: 'https://www.nytimes.com/services/xml/rss/nyt/World.xml',
    sourceType: 'world_news',
  },
  {
    id: 'cnn-top-stories',
    name: 'CNN Top Stories',
    url: 'http://rss.cnn.com/rss/cnn_topstories.rss',
    sourceType: 'world_news',
  },
  {
    id: 'nbc-news-world',
    name: 'NBC News World',
    url: 'https://feeds.nbcnews.com/nbcnews/public/world',
    sourceType: 'world_news',
  },
  {
    id: 'the-new-yorker',
    name: 'The New Yorker News',
    url: 'https://www.newyorker.com/feed/news',
    sourceType: 'world_news',
  },
  {
    id: 'yahoo-news-world',
    name: 'Yahoo News World',
    url: 'https://news.yahoo.com/rss/world',
    sourceType: 'world_news',
  },
];
