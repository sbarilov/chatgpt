"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react";
import type { Chat, ChatSummary, Message } from "./types";

interface State {
  chats: ChatSummary[];
  activeChat: Chat | null;
  activeChatId: string | null;
  sidebarOpen: boolean;
}

type Action =
  | { type: "SET_CHATS"; chats: ChatSummary[] }
  | { type: "SET_ACTIVE_CHAT"; chat: Chat | null }
  | { type: "SET_ACTIVE_CHAT_ID"; id: string | null }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "UPDATE_STREAMING_MESSAGE"; content: string }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_SIDEBAR"; open: boolean }
  | { type: "UPDATE_CHAT_TITLE"; id: string; title: string }
  | { type: "UPDATE_CHAT_MODEL"; model: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_CHATS":
      return { ...state, chats: action.chats };
    case "SET_ACTIVE_CHAT":
      return { ...state, activeChat: action.chat, activeChatId: action.chat?.id ?? null };
    case "SET_ACTIVE_CHAT_ID":
      return { ...state, activeChatId: action.id };
    case "ADD_MESSAGE":
      if (!state.activeChat) return state;
      return {
        ...state,
        activeChat: {
          ...state.activeChat,
          messages: [...state.activeChat.messages, action.message],
        },
      };
    case "UPDATE_STREAMING_MESSAGE": {
      if (!state.activeChat) return state;
      const msgs = [...state.activeChat.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: action.content };
      }
      return { ...state, activeChat: { ...state.activeChat, messages: msgs } };
    }
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "SET_SIDEBAR":
      return { ...state, sidebarOpen: action.open };
    case "UPDATE_CHAT_TITLE": {
      const chats = state.chats.map((c) =>
        c.id === action.id ? { ...c, title: action.title } : c
      );
      const activeChat =
        state.activeChat?.id === action.id
          ? { ...state.activeChat, title: action.title }
          : state.activeChat;
      return { ...state, chats, activeChat };
    }
    case "UPDATE_CHAT_MODEL":
      if (!state.activeChat) return state;
      return { ...state, activeChat: { ...state.activeChat, model: action.model } };
    default:
      return state;
  }
}

const initialState: State = {
  chats: [],
  activeChat: null,
  activeChatId: null,
  sidebarOpen: true,
};

interface ChatContextType {
  state: State;
  dispatch: React.Dispatch<Action>;
  loadChats: () => Promise<void>;
  loadChat: (id: string) => Promise<void>;
  createNewChat: (model: string) => Promise<Chat>;
  deleteChat: (id: string) => Promise<void>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;
  updateModel: (model: string) => Promise<void>;
  updateSystemPrompt: (prompt: string) => Promise<void>;
  generateTitle: (chatId: string, firstMessage: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const loadChats = useCallback(async () => {
    const res = await fetch("/api/chats");
    const chats = await res.json();
    dispatch({ type: "SET_CHATS", chats });
  }, []);

  const loadChat = useCallback(async (id: string) => {
    const res = await fetch(`/api/chats/${id}`);
    if (res.ok) {
      const chat = await res.json();
      dispatch({ type: "SET_ACTIVE_CHAT", chat });
    }
  }, []);

  const createNewChat = useCallback(async (model: string): Promise<Chat> => {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const chat = await res.json();
    dispatch({ type: "SET_ACTIVE_CHAT", chat });
    await loadChats();
    return chat;
  }, [loadChats]);

  const deleteChat = useCallback(async (id: string) => {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (state.activeChatId === id) {
      dispatch({ type: "SET_ACTIVE_CHAT", chat: null });
    }
    await loadChats();
  }, [state.activeChatId, loadChats]);

  const sendMessage = useCallback(async (content: string, images?: string[]) => {
    if (!state.activeChat) return;
    const chatId = state.activeChat.id;
    const model = state.activeChat.model;
    const isFirstMessage = state.activeChat.messages.filter(m => m.role === "user").length === 0;

    // Save user message
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content, images }),
    });
    const userMsg = await res.json();
    dispatch({ type: "ADD_MESSAGE", message: userMsg });

    // Add placeholder assistant message
    const assistantMsg: Message = {
      id: "streaming",
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: "ADD_MESSAGE", message: assistantMsg });

    // Build messages for API
    const allMessages = [...state.activeChat.messages, userMsg];
    const apiMessages = [];
    if (state.activeChat.systemPrompt) {
      apiMessages.push({ role: "system", content: state.activeChat.systemPrompt });
    }
    for (const m of allMessages) {
      if (m.role === "system") continue;
      if (m.images && m.images.length > 0) {
        apiMessages.push({
          role: m.role,
          content: m.content,
          images: m.images,
        });
      } else {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    // Stream response
    let fullContent = "";
    try {
      const streamRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: apiMessages }),
      });

      const reader = streamRes.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  fullContent += token;
                  dispatch({ type: "UPDATE_STREAMING_MESSAGE", content: fullContent });
                }
              } catch {
                // skip parse errors
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
      if (!fullContent) {
        fullContent = "Sorry, there was an error generating a response.";
        dispatch({ type: "UPDATE_STREAMING_MESSAGE", content: fullContent });
      }
    }

    // Save assistant message
    await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "assistant", content: fullContent }),
    });

    // Generate title if first message
    if (isFirstMessage && content) {
      generateTitle(chatId, content);
    }

    // Reload to get proper message IDs
    await loadChat(chatId);
    await loadChats();
  }, [state.activeChat, loadChat, loadChats]);

  const generateTitle = useCallback(async (chatId: string, firstMessage: string) => {
    try {
      const res = await fetch("/api/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: firstMessage }),
      });
      const { title } = await res.json();
      if (title) {
        await fetch(`/api/chats/${chatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        dispatch({ type: "UPDATE_CHAT_TITLE", id: chatId, title });
        await loadChats();
      }
    } catch {
      // title generation is best-effort
    }
  }, [loadChats]);

  const updateModel = useCallback(async (model: string) => {
    if (!state.activeChat) return;
    await fetch(`/api/chats/${state.activeChat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    dispatch({ type: "UPDATE_CHAT_MODEL", model });
  }, [state.activeChat]);

  const updateSystemPrompt = useCallback(async (prompt: string) => {
    if (!state.activeChat) return;
    await fetch(`/api/chats/${state.activeChat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: prompt }),
    });
  }, [state.activeChat]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  return (
    <ChatContext.Provider
      value={{
        state,
        dispatch,
        loadChats,
        loadChat,
        createNewChat,
        deleteChat,
        sendMessage,
        updateModel,
        updateSystemPrompt,
        generateTitle,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
