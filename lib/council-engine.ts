import { getClientForModel } from "@/lib/providers";

const MODEL_TIMEOUT = 60_000;

export interface ModelResponse {
  model: string;
  content: string;
  error?: boolean;
}

export interface RoundResult {
  round: number;
  responses: ModelResponse[];
}

export interface CouncilConfig {
  models: string[];
  messages: { role: string; content: string }[];
  style: "synthesis" | "roundtable" | "sequential";
  rounds: number;
  roles?: Record<string, string>;
  onStatus?: (message: string) => void;
  signal?: AbortSignal;
}

export interface CouncilResult {
  rounds: RoundResult[];
  finalResponses: ModelResponse[];
}

export function buildRoleSystemMessage(model: string, roles?: Record<string, string>): string | null {
  if (!roles || !roles[model]) return null;
  return `You are participating in a multi-model council discussion. Your assigned role: ${roles[model]}. Stay in character and bring this perspective to your responses.`;
}

export async function queryModel(
  model: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  roles?: Record<string, string>
): Promise<ModelResponse> {
  try {
    const client = getClientForModel(model);
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT);
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", onAbort);

    try {
      const roleMsg = buildRoleSystemMessage(model, roles);
      const finalMessages = roleMsg
        ? [{ role: "system", content: roleMsg }, ...messages]
        : messages;

      const response = await client.chat.completions.create(
        { model, messages: finalMessages as any, stream: false },
        { signal: controller.signal }
      );
      return { model, content: response.choices[0]?.message?.content || "" };
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  } catch (err: any) {
    if (err.name === "AbortError") throw err;
    console.error(`Model ${model} failed:`, err.message);
    return { model, content: "", error: true };
  }
}

export function buildSynthesisPrompt(
  responses: ModelResponse[],
  roles?: Record<string, string>
): string {
  const valid = responses.filter((r) => !r.error && r.content);
  if (valid.length === 0) return "All models failed to respond. Please try again.";

  let prompt = "You are synthesizing responses from multiple AI models into a single consensus answer. Here are the individual responses:\n\n";
  for (const r of valid) {
    const role = roles?.[r.model];
    const label = role ? `${r.model} (${role})` : r.model;
    prompt += `--- ${label} ---\n${r.content}\n\n`;
  }
  prompt += "Provide a unified, well-reasoned answer that combines the best insights from all responses. Do not mention that you are synthesizing or refer to individual models.";
  return prompt;
}

export async function runCouncil(config: CouncilConfig): Promise<CouncilResult> {
  const { models, messages, style, rounds: configRounds, roles, onStatus, signal } = config;

  const allRounds: RoundResult[] = [];
  let finalResponses: ModelResponse[];

  if (style === "sequential") {
    const conversationSoFar: ModelResponse[] = [];

    for (let i = 0; i < models.length; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const model = models[i];
      onStatus?.(`Turn ${i + 1} of ${models.length}: ${model} is responding...`);

      const turnMessages = [...messages];
      if (conversationSoFar.length > 0) {
        let ctx = "Here is the ongoing discussion between AI models. Read their responses carefully and build on, challenge, or refine their points:\n\n";
        for (const r of conversationSoFar.filter((r) => !r.error && r.content)) {
          const role = roles?.[r.model];
          const label = role ? `${r.model} (${role})` : r.model;
          ctx += `--- ${label} ---\n${r.content}\n\n`;
        }
        ctx += "Now provide your response, engaging directly with the points made above:";
        turnMessages.push({ role: "user", content: ctx });
      }

      const result = await queryModel(model, turnMessages, signal, roles);
      conversationSoFar.push(result);
      allRounds.push({ round: i + 1, responses: [result] });
    }

    finalResponses = conversationSoFar;

  } else if (style === "roundtable") {
    const rounds = Math.min(Math.max(configRounds || 2, 2), 3);
    let previousRoundAnswers: ModelResponse[] = [];

    for (let round = 1; round <= rounds; round++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      onStatus?.(`Round ${round} of ${rounds}: Querying ${models.length} models...`);

      const roundMessages = [...messages];
      if (previousRoundAnswers.length > 0) {
        let ctx = "Here are the responses from the previous round of discussion. Consider these perspectives and refine your answer:\n\n";
        for (const r of previousRoundAnswers.filter((r) => !r.error && r.content)) {
          const role = roles?.[r.model];
          const label = role ? `${r.model} (${role})` : r.model;
          ctx += `--- ${label} ---\n${r.content}\n\n`;
        }
        ctx += "Now provide your refined response:";
        roundMessages.push({ role: "user", content: ctx });
      }

      const results = await Promise.allSettled(
        models.map((m) => queryModel(m, roundMessages, signal, roles))
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
    onStatus?.(`Querying ${models.length} models...`);

    const results = await Promise.allSettled(
      models.map((m) => queryModel(m, messages, signal, roles))
    );

    finalResponses = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : { model: "unknown", content: "", error: true }
    );

    allRounds.push({ round: 1, responses: finalResponses });
  }

  return { rounds: allRounds, finalResponses };
}

export async function runCouncilWithSynthesis(
  config: CouncilConfig
): Promise<{ rounds: RoundResult[]; synthesis: string }> {
  const result = await runCouncil(config);

  if (config.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  config.onStatus?.("Synthesizing consensus...");

  const moderator = config.models[0];
  const client = getClientForModel(moderator);
  const synthesisPrompt = buildSynthesisPrompt(result.finalResponses, config.roles);

  const response = await client.chat.completions.create(
    {
      model: moderator,
      messages: [
        ...config.messages,
        { role: "user", content: synthesisPrompt },
      ] as any,
      stream: false,
    },
    { signal: config.signal }
  );

  const synthesis = response.choices[0]?.message?.content || "";

  return { rounds: result.rounds, synthesis };
}
