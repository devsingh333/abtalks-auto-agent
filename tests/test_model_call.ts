import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });

  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash-001',
    'models/gemini-2.5-flash',
    'models/gemini-2.0-flash',
  ];

  for (const m of candidateModels) {
    try {
      console.log(`Testing model: "${m}"...`);
      const res = await ai.models.generateContent({
        model: m,
        contents: 'Say hello in JSON: {"hello": "world"}',
      });
      console.log(`SUCCESS with "${m}":`, res.text?.trim());
      break;
    } catch (err) {
      console.log(`FAILED with "${m}":`, (err as Error).message);
    }
  }
}

testModels();
