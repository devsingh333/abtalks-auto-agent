export interface AiLogEntry {
  id: string;
  timestamp: string;
  model: string;
  provider: 'NVIDIA Build' | 'Google Gemini' | 'Heuristic Fallback';
  purpose: string;
  promptTokensEst: number;
  completionTokensEst: number;
  latencyMs: number;
  status: 'success' | 'fallback' | 'error';
  agentId?: string;
  agentName?: string;
  promptSnippet: string;
  responseSnippet: string;
  fullPrompt: string;
  fullResponse: string;
  error?: string;
}

export interface AiUsageStats {
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  avgLatencyMs: number;
  totalTokensEst: number;
  providerBreakdown: Record<string, number>;
}

class AITelemetryService {
  private logs: AiLogEntry[] = [];
  private maxLogs = 50; // Cap log ring buffer size to 50 entries
  private maxCharLimit = 4000; // Cap prompt/response memory footprint to 4,000 chars per entry

  recordLog(entry: Omit<AiLogEntry, 'id' | 'timestamp'>): AiLogEntry {
    const boundedFullPrompt =
      entry.fullPrompt.length > this.maxCharLimit
        ? `${entry.fullPrompt.substring(0, this.maxCharLimit)}\n... [Truncated for memory protection (${entry.fullPrompt.length} total chars)]`
        : entry.fullPrompt;

    const boundedFullResponse =
      entry.fullResponse.length > this.maxCharLimit
        ? `${entry.fullResponse.substring(0, this.maxCharLimit)}\n... [Truncated for memory protection (${entry.fullResponse.length} total chars)]`
        : entry.fullResponse;

    const log: AiLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...entry,
      fullPrompt: boundedFullPrompt,
      fullResponse: boundedFullResponse,
    };

    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    return log;
  }

  getLogs(limit = 50): AiLogEntry[] {
    return this.logs.slice(0, limit);
  }

  getStats(): AiUsageStats {
    const totalCalls = this.logs.length;
    if (totalCalls === 0) {
      return {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        avgLatencyMs: 0,
        totalTokensEst: 0,
        providerBreakdown: {},
      };
    }

    let successCalls = 0;
    let failedCalls = 0;
    let totalLatency = 0;
    let totalTokens = 0;
    const providerBreakdown: Record<string, number> = {};

    for (const log of this.logs) {
      if (log.status === 'success') successCalls++;
      else failedCalls++;

      totalLatency += log.latencyMs;
      totalTokens += log.promptTokensEst + log.completionTokensEst;

      providerBreakdown[log.provider] = (providerBreakdown[log.provider] || 0) + 1;
    }

    return {
      totalCalls,
      successCalls,
      failedCalls,
      avgLatencyMs: Math.round(totalLatency / totalCalls),
      totalTokensEst: totalTokens,
      providerBreakdown,
    };
  }
}

export const aiTelemetry = new AITelemetryService();
