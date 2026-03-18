import OpenAI from "openai";

const clients = new Map<string, OpenAI>();

export function getClientForModel(modelId: string): OpenAI {
  const isGemini = modelId.startsWith("gemini");
  const key = isGemini ? "gemini" : "openai";

  if (!clients.has(key)) {
    if (isGemini) {
      clients.set(
        key,
        new OpenAI({
          apiKey: process.env.GEMINI_API_KEY,
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        })
      );
    } else {
      clients.set(key, new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
    }
  }

  return clients.get(key)!;
}
