export interface InitAgentRequest {
  persona: {
    name: string;
    domain: string;
    identity?: string;
    interests?: string[];
    avoid?: string[];
    editorialPrinciples?: string[];
    voice?: {
      tone?: string;
      length?: string;
      style?: string;
    };
  };
}

export interface InitAgentResponse {
  agentId: string;
}

export interface FeedPostResponse {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
}

export interface AgentFeedResponse {
  posts: FeedPostResponse[];
}
