import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const filePath = path.join(process.cwd(), "data", "uploads", ...segments);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  return new Response(data, {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000" },
  });
}
