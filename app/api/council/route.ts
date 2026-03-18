import { getClientForModel } from "@/lib/providers";

export const runtime = "nodejs";

const MODEL_TIMEOUT = 60_000;
const COUNCIL_TIMEOUT = 120_000;

interface CouncilRequest {
  models: string[];
  messages: { role: string; content: string }[];
  councilStyle: "synthesis" | "roundtable";
  councilRounds: number;
}

async function queryModel(
  model: string,
  messages: { role: string; content: string }[],
  signal: AbortSignal
): Promise<{ model: string; content: string; error?: boolean }> {
  try {
    const client = getClientForModel(model);
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT);
    // If parent signal aborts, also abort
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    try {
      const response = await client.chat.completions.create(
        { model, messages: messages as any, stream: false },
        { signal: controller.signal }
      );
      return { model, content: response.choices[0]?.message?.content || "" };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  } catch (err: any) {
    if (err.name === "AbortError") throw err;
    console.error(`Model ${model} failed:`, err.message);
    return { model, content: "", error: true };
  }
}

function buildSynthesisPrompt(
  responses: { model: string; content: string; error?: boolean }[]
): string {
  const valid = responses.filter((r) => !r.error && r.content);
  if (valid.length === 0) return "All models failed to respond. Please try again.";

  let prompt = "You are synthesizing responses from multiple AI models into a single consensus answer. Here are the individual responses:\n\n";
  for (const r of valid) {
    prompt += `--- ${r.model} ---\n${r.content}\n\n`;
  }
  prompt += "Provide a unified, well-reasoned answer that combines the best insights from all responses. Do not mention that you are synthesizing or refer to individual models.";
  return prompt;
}

export async function POST(req: Request) {
  const councilAbort = new AbortController();
  const councilTimeout = setTimeout(() => councilAbort.abort(), COUNCIL_TIMEOUT);

  // Abort on client disconnect
  req.signal.addEventListener("abort", () => councilAbort.abort());

  try {
    const { models, messages, councilStyle, councilRounds }: CouncilRequest = await req.json();

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
          let finalResponses: { model: string; content: string; error?: boolean }[];
          const allRounds: { round: number; responses: { model: string; content: string; error?: boolean }[] }[] = [];

          if (councilStyle === "roundtable") {
            const rounds = Math.min(Math.max(councilRounds || 2, 2), 3);
            let previousRoundAnswers: { model: string; content: string; error?: boolean }[] = [];

            for (let round = 1; round <= rounds; round++) {
              if (councilAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");

              sendStatus(`Round ${round} of ${rounds}: Querying ${models.length} models...`);

              const roundMessages = [...messages];
              if (previousRoundAnswers.length > 0) {
                let ctx = "Here are the responses from the previous round of discussion. Consider these perspectives and refine your answer:\n\n";
                for (const r of previousRoundAnswers.filter((r) => !r.error && r.content)) {
                  ctx += `--- ${r.model} ---\n${r.content}\n\n`;
                }
                ctx += "Now provide your refined response:";
                roundMessages.push({ role: "user", content: ctx });
              }

              const results = await Promise.allSettled(
                models.map((m) => queryModel(m, roundMessages, councilAbort.signal))
              );

              previousRoundAnswers = results.map((r) =>
                r.status === "fulfilled"
                  ? r.value
                  : { model: "unknown", content: "", error: true }
              );

              allRounds.push({ round, responses: previousRoundAnswers });
            }

            finalResponses = previousRoundAnswers;
          } else {
            // Synthesis mode: parallel query
            sendStatus(`Querying ${models.length} models...`);

            const results = await Promise.allSettled(
              models.map((m) => queryModel(m, messages, councilAbort.signal))
            );

            finalResponses = results.map((r) =>
              r.status === "fulfilled"
                ? r.value
                : { model: "unknown", content: "", error: true }
            );

            allRounds.push({ round: 1, responses: finalResponses });
          }

          if (councilAbort.signal.aborted) throw new DOMException("Aborted", "AbortError");

          // Stream synthesis
          sendStatus("Synthesizing consensus...");

          const moderator = models[0];
          const client = getClientForModel(moderator);
          const synthesisPrompt = buildSynthesisPrompt(finalResponses);

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
              rounds: allRounds.map((rd) => ({
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
