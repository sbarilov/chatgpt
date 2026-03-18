import { NextResponse } from "next/server";
import { listChats, createChat } from "@/lib/db";

export async function GET() {
  const chats = listChats();
  return NextResponse.json(chats);
}

export async function POST(req: Request) {
  const { model, systemPrompt, mode, councilModels, councilStyle, councilRounds } = await req.json();
  const chat = createChat({
    model: model || "gpt-4.5-pro",
    systemPrompt: systemPrompt || "",
    mode: mode || "single",
    councilModels,
    councilStyle,
    councilRounds,
  });
  return NextResponse.json(chat);
}
