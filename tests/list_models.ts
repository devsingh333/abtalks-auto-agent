import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing key ending in:', apiKey ? apiKey.slice(-6) : 'none');
  const ai = new GoogleGenAI({ apiKey });
  try {
    const list = await ai.models.list();
    console.log('Available Models for Key:');
    for await (const m of list) {
      console.log(' -', m.name);
    }
  } catch (err) {
    console.error('List models error:', err);
  }
}

listModels();
