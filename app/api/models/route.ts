import { NextResponse } from "next/server";
import OpenAI from "openai";

const GEMINI_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"];

let cachedModels: { models: string[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  try {
    if (cachedModels && Date.now() - cachedModels.timestamp < CACHE_TTL) {
      return NextResponse.json(cachedModels.models);
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const list = await openai.models.list();
    const models = list.data
      .map((m) => m.id)
      .filter((id) => id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4"))
      .filter((id) =>
        !id.includes("instruct") &&
        !id.includes("realtime") &&
        !id.includes("audio") &&
        !id.includes("transcribe") &&
        !id.includes("tts") &&
        !id.includes("dall-e") &&
        !id.includes("whisper") &&
        !id.includes("embedding") &&
        !id.includes("image") &&
        !id.includes("codex") &&
        !id.includes("moderation") &&
        !id.includes("deep-research") &&
        !id.includes("search") &&
        !id.includes("chat-latest") &&
        !id.match(/-\d{4}-\d{2}-\d{2}$/) &&
        !id.match(/-\d{4}$/) &&
        !id.includes("preview") &&
        !id.includes("3.5-turbo-16k") &&
        id !== "o3-pro"
      )
      .sort();

    // Append Gemini models if API key is configured
    if (process.env.GEMINI_API_KEY) {
      models.push(...GEMINI_MODELS);
    }

    cachedModels = { models, timestamp: Date.now() };
    return NextResponse.json(models);
  } catch (error) {
    console.error("Error fetching models:", error);
    const fallback = ["gpt-5.4", "gpt-5.4-mini", "gpt-4o", "gpt-4o-mini"];
    if (process.env.GEMINI_API_KEY) {
      fallback.push(...GEMINI_MODELS);
    }
    return NextResponse.json(fallback, { status: 200 });
  }
}
