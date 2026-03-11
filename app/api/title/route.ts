import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Generate a short title (3-6 words) for a chat that starts with the following message. Return only the title, no quotes or punctuation.",
        },
        { role: "user", content: message },
      ],
      max_tokens: 20,
    });

    const title = res.choices[0]?.message?.content?.trim() || "New Chat";
    return NextResponse.json({ title });
  } catch (error) {
    console.error("Title generation error:", error);
    return NextResponse.json({ title: "New Chat" });
  }
}
