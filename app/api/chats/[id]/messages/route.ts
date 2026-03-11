import { NextResponse } from "next/server";
import { addMessage } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, content, images } = await req.json();
  const message = addMessage(id, role, content, images);
  return NextResponse.json(message);
}
