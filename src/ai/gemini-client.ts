import { env } from '../config/env';
import { logger } from '../utils/logger';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

function parseModelJsonResponse<T>(rawContent: string): T {
  const cleaned = rawContent.trim();

  // 1. Try direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Continue
  }

  // 2. Extract content inside markdown codeblock ```json ... ```
  const codeblockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeblockMatch && codeblockMatch[1]) {
    try {
      return JSON.parse(codeblockMatch[1].trim()) as T;
    } catch {
      // Continue
    }
  }

  // 3. Extract JSON object substring between first '{' and last '}'
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonSubstring) as T;
    } catch {
      // Continue
    }
  }

  throw new Error(`Failed to parse valid JSON from AI response: ${rawContent.slice(0, 100)}...`);
}

export class GeminiClient {
  private openaiClient: OpenAI | null = null;
  private geminiClient: GoogleGenAI | null = null;
  private nvidiaModel: string;
  private geminiModel: string;

  constructor() {
    this.nvidiaModel = env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
    this.geminiModel = env.GEMINI_MODEL || 'gemini-2.0-flash';

    // 1. Initialize OpenAI client for NVIDIA Build API if key provided
    if (env.NVIDIA_API_KEY && env.NVIDIA_API_KEY !== 'your_nvidia_api_key_here' && env.NVIDIA_API_KEY !== 'mock_key') {
      try {
        this.openaiClient = new OpenAI({
          apiKey: env.NVIDIA_API_KEY,
          baseURL: env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
        });
        logger.info('Initialized NVIDIA Build API client (OpenAI format)', { model: this.nvidiaModel, baseURL: env.NVIDIA_BASE_URL });
      } catch (err) {
        logger.warn('Failed to initialize OpenAI client for NVIDIA API', { err });
      }
    }

    // 2. Initialize Gemini Client as secondary/fallback
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'mock_key' && env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      } catch (err) {
        logger.warn('Failed to initialize GoogleGenAI client', { err });
      }
    }
  }

  async generateStructuredJson<T>(prompt: string, fallbackGenerator: () => T, agentId?: string): Promise<T> {
    // Priority A: NVIDIA Build API via OpenAI SDK
    if (this.openaiClient) {
      try {
        logger.info('Calling NVIDIA Build API for structured JSON', { agentId, model: this.nvidiaModel });
        const response = await this.openaiClient.chat.completions.create({
          model: this.nvidiaModel,
          messages: [
            {
              role: 'system',
              content: 'You are an autonomous technical AI persona. Always output strictly raw valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response content from NVIDIA API');
        }

        return parseModelJsonResponse<T>(content);
      } catch (err) {
        logger.error('NVIDIA Build API call failed, falling back to secondary provider/heuristic', { agentId }, err);
      }
    }

    // Priority B: Google Gemini API
    if (this.geminiClient) {
      try {
        logger.info('Calling Gemini API for structured JSON', { agentId, model: this.geminiModel });
        const response = await this.geminiClient.models.generateContent({
          model: this.geminiModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Empty response from Gemini API');
        }

        return parseModelJsonResponse<T>(text);
      } catch (err) {
        logger.error('Gemini API call failed, invoking heuristic fallback generator', { agentId }, err);
      }
    }

    // Priority C: Heuristic Fallback Generator
    logger.info('Using heuristic fallback generator for structured JSON', { agentId });
    return fallbackGenerator();
  }
}

export const geminiClient = new GeminiClient();
