import { GoogleGenAI } from "@google/genai";
import { geminiApiKey } from "@/lib/ai-recipe/schema-version";

let client: GoogleGenAI | null = null;

export function getGeminiClient() {
  const apiKey = geminiApiKey();
  if (!apiKey) return null;
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export function resetGeminiClientForTests() {
  client = null;
}
