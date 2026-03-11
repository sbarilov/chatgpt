export interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
  createdAt: string;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
}
