import { getClientForModel } from "@/lib/providers";
import { runCouncil, buildSynthesisPrompt } from "@/lib/council-engine";

export const runtime = "nodejs";

const COUNCIL_TIMEOUT = 120_000;

interface CouncilRequest {
  models: string[];
  messages: { role: string; content: string }[];
  councilStyle: "synthesis" | "roundtable" | "sequential";
  councilRounds: number;
  councilRoles?: Record<string, string>;
}

export async function POST(req: Request) {
  const councilAbort = new AbortController();
  const councilTimeout = setTimeout(() => councilAbort.abort(), COUNCIL_TIMEOUT);

  req.signal.addEventListener("abort", () => councilAbort.abort());

  try {
    const { models, messages, councilStyle, councilRounds, councilRoles }: CouncilRequest = await req.json();

    if (!models || models.length < 2) {
      return new Response(JSON.stringify({ error: "At least 2 models required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: string) => {
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        };
        const sendStatus = (message: string) => {
          send(JSON.stringify({ type: "status", message }));
        };

        try {
          const result = await runCouncil({
            models,
            messages,
            style: councilStyle,
            rounds: councilRounds,
            roles: councilRoles,
            onStatus: sendStatus,
            signal: councilAbort.signal,
          });

          if (councilAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");

          // Stream synthesis
          sendStatus("Synthesizing consensus...");

          const moderator = models[0];
          const client = getClientForModel(moderator);
          const synthesisPrompt = buildSynthesisPrompt(result.finalResponses, councilRoles);

          const stream = await client.chat.completions.create(
            {
              model: moderator,
              messages: [
                ...messages,
                { role: "user", content: synthesisPrompt },
              ] as any,
              stream: true,
            },
            { signal: councilAbort.signal }
          );

          for await (const chunk of stream) {
            if (councilAbort.signal.aborted) break;
            const data = JSON.stringify(chunk);
            send(data);
          }

          // Send individual responses (all rounds) before DONE
          send(
            JSON.stringify({
              type: "council_responses",
              rounds: result.rounds.map((rd) => ({
                round: rd.round,
                responses: rd.responses.map((r) => ({
                  model: r.model,
                  content: r.error ? "" : r.content,
                  error: r.error || false,
                })),
              })),
            })
          );

          send("[DONE]");
          controller.close();
        } catch (err: any) {
          if (err.name === "AbortError") {
            send(JSON.stringify({ type: "status", message: "Cancelled" }));
            send("[DONE]");
            controller.close();
          } else {
            console.error("Council error:", err);
            send(JSON.stringify({ type: "status", message: "Error: " + err.message }));
            send("[DONE]");
            controller.close();
          }
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
    console.error("Council API error:", error);
    return new Response(JSON.stringify({ error: "Failed to run council" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(councilTimeout);
  }
}
