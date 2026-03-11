import { NextResponse } from "next/server";
import OpenAI from "openai";

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
      .filter((id) => id.startsWith("gpt-") || id.startsWith("o") || id.startsWith("chatgpt-"))
      .filter((id) => !id.includes("instruct") && !id.includes("realtime") && !id.includes("audio") && !id.includes("transcribe") && !id.includes("tts") && !id.includes("dall-e") && !id.includes("whisper") && !id.includes("embedding"))
      .sort();

    cachedModels = { models, timestamp: Date.now() };
    return NextResponse.json(models);
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"], { status: 200 });
  }
}
