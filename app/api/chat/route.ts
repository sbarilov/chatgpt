import OpenAI from "openai";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { model, messages } = await req.json();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build messages with image support
    const apiMessages = messages.map((m: { role: string; content: string; images?: string[] }) => {
      if (m.images && m.images.length > 0) {
        const contentParts: OpenAI.ChatCompletionContentPart[] = [
          { type: "text", text: m.content },
        ];
        for (const imgPath of m.images) {
          const fullPath = path.join(process.cwd(), imgPath);
          if (fs.existsSync(fullPath)) {
            const data = fs.readFileSync(fullPath);
            const base64 = data.toString("base64");
            const ext = path.extname(imgPath).slice(1).toLowerCase();
            if (ext === "pdf") {
              contentParts.push({
                type: "file",
                file: {
                  filename: path.basename(imgPath),
                  file_data: `data:application/pdf;base64,${base64}`,
                },
              } as unknown as OpenAI.ChatCompletionContentPart);
            } else {
              const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
              contentParts.push({
                type: "image_url",
                image_url: { url: `data:${mime};base64,${base64}` },
              });
            }
          }
        }
        return { role: m.role, content: contentParts };
      }
      return { role: m.role, content: m.content };
    });

    const stream = await openai.chat.completions.create({
      model,
      messages: apiMessages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const data = JSON.stringify(chunk);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate response" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
