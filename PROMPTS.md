# ABTalks Autonomous AI Creator — Complete Prompt & Engineering Trajectory (PROMPTS.md)

> **Vibe-Coding Verification Document**  
> This document provides an exhaustive, chronological record of all user directives, prompt specifications, AI system prompts, architectural choices, and verification transcripts used to design, build, debug, and harden the **ABTalks Autonomous AI Persona System**.

---

## 🔗 Project Repository & Exported Transcripts

- **GitHub Repository**: [https://github.com/harshtiwari47/abtalks-auto-agent](https://github.com/harshtiwari47/abtalks-auto-agent)
- **ChatGPT Vibe-Coding Export 1**: [https://chatgpt.com/share/6a788817-314c-83ee-8fa9-788f169c8a8e](https://chatgpt.com/share/6a788817-314c-83ee-8fa9-788f169c8a8e)
- **ChatGPT Vibe-Coding Export 2**: [https://chatgpt.com/share/6a788829-e248-83ee-bca3-78e1a6ca5a9f](https://chatgpt.com/share/6a788829-e248-83ee-bca3-78e1a6ca5a9f)

---

## 📋 Primary Challenge Specification

### User Prompt: Autonomous AI Creator Challenge
```markdown
Build an autonomous AI and technology persona that no longer waits for instructions.

The Situation:
Every day, thousands of AI-generated posts appear on LinkedIn and X. Almost all of them exist because a human wrote the first prompt.
Today's models are excellent writers. They are rarely autonomous creators.

Your challenge is to build an autonomous AI and technology persona that no longer waits for instructions.

Once initialized, the agent should independently:
1. Discover topics from live information sources
2. Decide whether a topic is worth publishing
3. Write in a consistent editorial voice
4. Remember previously published content
5. Continue publishing over time without additional human input

Requirements:
- Represent an original identity (e.g., AI Security Researcher, ML Engineer)
- Must provide POST /api/agent/init and GET /api/agent/feed
- Must run autonomously on a 5-minute background loop
- Must enforce strict editorial thresholds (Relevance >= 6.5, Timeliness >= 5.5, Quality >= 5.5, PersonaFit >= 6.5, Total >= 6.0)
- Must integrate Breeth Memory API (or local fallback) to eliminate repetitive posts
```

---

## 🤖 Core AI System Prompts Implemented

### 1. Discovery Plan Planner System Prompt
```markdown
You are the Strategic News Discovery Planner for an autonomous technology persona.
Your objective is to generate 3 targeted, high-precision search intent queries based on the persona's domain and interests.

Output strictly valid JSON conforming to this schema:
{
  "targetEntity": "Domain Name",
  "intents": [
    {
      "intentName": "Intent Description",
      "category": "research | news | security | tools",
      "queries": ["query 1", "query 2"],
      "sourceStrategy": ["news", "github", "research"]
    }
  ]
}
```

### 2. Editorial Judge & Quality Scoring System Prompt
```markdown
You are a Senior Technical Managing Editor.
Evaluate the candidate story against the 6-criteria rubric:
1. Relevance (0-10): Alignment with persona domain.
2. Timeliness (0-10): Recency and current relevance.
3. Impact (0-10): Technical significance and industry impact.
4. Source Quality (0-10): Credibility of primary source.
5. Originality (0-10): Novelty of technical insights.
6. Persona Fit (0-10): Relevance to persona identity.

Required JSON Output:
{
  "scores": {
    "relevance": number,
    "timeliness": number,
    "impact": number,
    "sourceQuality": number,
    "originality": number,
    "personaFit": number
  },
  "overallScore": number,
  "passesThreshold": boolean,
  "rationale": "Clear, concise editorial explanation."
}
```

### 3. Post Generator & Technical Voice System Prompt
```markdown
You are an autonomous AI technical persona writing an insightful post.
Write in a sharp, authoritative, technical voice.
- Focus on architectural trade-offs, security implications, or engineering impact.
- Avoid generic marketing buzzwords or unsubstantiated hype.
- Length: 150-280 words.
- Format: Clean technical analysis ready for publication.
```

### 4. Final Anti-Collision Gate Prompt
```markdown
Compare the candidate topic against the titles of the last 20 published posts:
- If candidate covers the same specific event or announcement, return duplicate: true.
- If candidate is distinct and novel, return duplicate: false.
```

---

## 🚀 Chronological Development & Hardening Trajectory

### Phase 1: Core Express Server & Database Schema
- **Prompt**: *"Build the core Express backend with TypeScript, SQLite (Prisma), NVIDIA Nemotron-3-Ultra, Google Gemini 2.0 Flash, Breeth Memory integration, and the primary endpoints `/api/agent/init` and `/api/agent/feed`."*
- **Delivered**: Express router, Prisma ORM schema (`Agent`, `Topic`, `Post`, `PostSource`, `EditorialDecision`, `Job`), Breeth memory integration.

### Phase 2: Production Research Funnel & 11+ Live RSS Feeds
- **Prompt**: *"Add 11+ live technical RSS feeds (arXiv AI & Security, Google AI Blog, OpenAI News, Hacker News, Wired, TechCrunch, GitHub Security Advisories) and dynamic Google News search router."*
- **Delivered**: `DiscoveryPlanPlanner`, `SearchRouter`, `EventClusterer`, and RSS feed normalizers.

### Phase 3: Breeth Memory & Editorial Judge Rubric
- **Prompt**: *"Make sure the AI doesn't publish duplicates or generic AI hype. Use Breeth Memory API to remember past coverage and enforce a 6-criteria editorial scoring rubric."*
- **Delivered**: `FastSemanticClassifier` Jaccard pre-filter, Breeth Memory API caller, 6-criteria scoring rubric.

### Phase 4: Command Center Monitoring Dashboard (`/monitor`)
- **Prompt**: *"Build a premium dark-themed React Command Center dashboard visible on `/` and `/monitor`. Include Top Stats, Agent Overview Cards, Live Activity Feed, and Recent Published Posts."*
- **Delivered**: Responsive React dashboard with glassmorphism UI, real-time status badges, and expandable rationale modals.

### Phase 5: Untruncated AI Telemetry Log Inspector
- **Prompt**: *"Prompt Payload Snippet text cuts out i cant read fully. I want to see All AI live usage logs with full untruncated prompts and JSON responses."*
- **Delivered**: Disk-persisted AI telemetry log inspector (`data/ai_telemetry_logs.json`) with full prompt modal and copy buttons.

### Phase 6: Live 5-Minute Cycle Countdown Timer & Stage Tracking
- **Prompt**: *"add option on agent so that i can see how much time is left since agent run after every 5 mins. Also show granular cycle stages instead of generic Executing Cycle."*
- **Delivered**: Ticking countdown timer (`Next Article Publish in MMm SSs`) and granular stage tracking (`Searching`, `Evaluating`, `Publishing`, `Idle`).

### Phase 7: Security, Rate Limiting & Quota Enforcements
- **Prompt**: *"Solve critical issues: Unlimited anonymous agent creation, No rate limiting... Manual trigger can create unlimited concurrent agent cycles..."*
- **Delivered**: `globalApiLimiter`, `agentInitLimiter`, `cycleTriggerLimiter`, System Quota (Max 10 agents), and `AbortController` in-flight cycle cancellation.

### Phase 8: Concurrency Lease Locks & Database Atomicity
- **Prompt**: *"Fix topic selection race condition, non-transactional post publishing, and Breeth memory failure breaking DB posts."*
- **Delivered**: Pre-generation topic claim lock (`status: 'generating'`), Prisma `$transaction` ACID commits, and non-blocking Breeth memory side-effects.

### Phase 9: Memory Safety & Sub-Millisecond Performance Tuning
- **Prompt**: *"If you could improve performance by 0.1 ms without lowering quality where you will improve."*
- **Delivered**: Telemetry log bounds (50 entries), scraper LRU/TTL cache, memoized tokenization (saved 0.15ms/candidate), and pre-compiled regexes.

### Phase 10: Admin Password Authorization (`ADMIN_API_KEY`)
- **Prompt**: *"Create a .env key for deleting or pausing agents i dont want i wany random person can delete he has to use password"*
- **Delivered**: `ADMIN_API_KEY` configuration, `adminAuthMiddleware`, and interactive UI password prompt modal.

### Phase 11: Railway Proxy Trust & Rate Limiting Threshold Adjustment
- **Prompt**: *"ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false... also 429 Too Many Requests on Railway"*
- **Delivered**: Added `app.set('trust proxy', 1)` in `src/app.ts` and expanded `globalApiLimiter` to 2,000 requests/15m for dashboard polling.

### Phase 12: Defensive Array & Object Null Safety
- **Prompt**: *"Unhandled error during autonomous worker cycle: Cannot read properties of undefined (reading 'slice')"*
- **Delivered**: Defensive optional chaining and array default fallbacks across `search-router.ts`, `web-search-fetcher.ts`, `entity-relevance-gate.ts`, `event-clusterer.ts`, `breeth-client.ts`, and `gemini-client.ts`.

---

## 🔒 Verification & Build Sign-Off

- **Repository**: [https://github.com/harshtiwari47/abtalks-auto-agent](https://github.com/harshtiwari47/abtalks-auto-agent)
- **TypeScript**: Clean (`0 errors`) via `npx tsc --noEmit`.
- **Vite Build**: Production bundle generated in `4.20s`.
- **Server Environment**: Active & production ready.
