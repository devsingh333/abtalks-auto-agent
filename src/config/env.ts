import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('file:./dev.db'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  NVIDIA_API_KEY: z.string().optional().default(''),
  NVIDIA_BASE_URL: z.string().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().default('nvidia/nemotron-3-ultra-550b-a55b'),
  BREETH_API_KEY: z.string().optional().default(''),
  BREETH_BASE_URL: z.string().default('https://api.breeth.ai'),
  AGENT_DISCOVERY_INTERVAL_MINUTES: z.coerce.number().default(5),
  AGENT_MIN_PUBLISH_INTERVAL_MINUTES: z.coerce.number().default(0),
  AGENT_MAX_POSTS_PER_DAY: z.coerce.number().default(100),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
