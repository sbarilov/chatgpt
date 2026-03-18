export interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
  model?: string;
  councilResponses?: { round: number; responses: { model: string; content: string; error?: boolean }[] }[];
  createdAt: string;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  mode: "single" | "council";
  councilModels?: string[];
  councilStyle?: "synthesis" | "roundtable" | "sequential";
  councilRounds?: number;
  councilRoles?: Record<string, string>; // model -> role
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  model: string;
  mode: "single" | "council";
  updatedAt: string;
}
