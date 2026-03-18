import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { Chat, ChatSummary, Message } from "./types";

const DB_PATH = path.join(process.cwd(), "data", "chatgpt.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Chat',
        model TEXT NOT NULL,
        system_prompt TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS message_images (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL
      );
    `);

    // Migration: add council columns to chats
    const alterStatements = [
      "ALTER TABLE chats ADD COLUMN mode TEXT DEFAULT 'single'",
      "ALTER TABLE chats ADD COLUMN council_models TEXT",
      "ALTER TABLE chats ADD COLUMN council_style TEXT",
      "ALTER TABLE chats ADD COLUMN council_rounds INTEGER DEFAULT 2",
      "ALTER TABLE messages ADD COLUMN model TEXT",
      "ALTER TABLE messages ADD COLUMN council_responses TEXT",
    ];
    for (const stmt of alterStatements) {
      try {
        db.exec(stmt);
      } catch {
        // column already exists
      }
    }
  }
  return db;
}

export function listChats(): ChatSummary[] {
  const rows = getDb()
    .prepare("SELECT id, title, model, mode, updated_at FROM chats ORDER BY updated_at DESC")
    .all() as { id: string; title: string; model: string; mode: string; updated_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    model: r.model,
    mode: (r.mode || "single") as "single" | "council",
    updatedAt: r.updated_at,
  }));
}

export function getChat(id: string): Chat | null {
  const row = getDb()
    .prepare("SELECT * FROM chats WHERE id = ?")
    .get(id) as {
      id: string; title: string; model: string; system_prompt: string;
      mode: string; council_models: string | null; council_style: string | null; council_rounds: number | null;
      created_at: string; updated_at: string;
    } | undefined;
  if (!row) return null;

  const msgs = getDb()
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(id) as { id: string; role: string; content: string; model: string | null; council_responses: string | null; created_at: string }[];

  const messages: Message[] = msgs.map((m) => {
    const images = getDb()
      .prepare("SELECT file_path FROM message_images WHERE message_id = ?")
      .all(m.id) as { file_path: string }[];
    const msg: Message = {
      id: m.id,
      role: m.role as Message["role"],
      content: m.content,
      images: images.length > 0 ? images.map((i) => i.file_path) : undefined,
      createdAt: m.created_at,
    };
    if (m.model) msg.model = m.model;
    if (m.council_responses) {
      try { msg.councilResponses = JSON.parse(m.council_responses); } catch { /* ignore */ }
    }
    return msg;
  });

  return {
    id: row.id,
    title: row.title,
    model: row.model,
    systemPrompt: row.system_prompt,
    mode: (row.mode || "single") as "single" | "council",
    councilModels: row.council_models ? JSON.parse(row.council_models) : undefined,
    councilStyle: row.council_style as "synthesis" | "roundtable" | undefined,
    councilRounds: row.council_rounds ?? undefined,
    messages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface CreateChatOptions {
  model: string;
  systemPrompt?: string;
  mode?: "single" | "council";
  councilModels?: string[];
  councilStyle?: "synthesis" | "roundtable";
  councilRounds?: number;
}

export function createChat(modelOrOptions: string | CreateChatOptions, systemPrompt: string = ""): Chat {
  const opts: CreateChatOptions = typeof modelOrOptions === "string"
    ? { model: modelOrOptions, systemPrompt }
    : modelOrOptions;

  const id = uuidv4();
  const now = new Date().toISOString();
  const mode = opts.mode || "single";
  getDb()
    .prepare("INSERT INTO chats (id, title, model, system_prompt, mode, council_models, council_style, council_rounds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, "New Chat", opts.model, opts.systemPrompt || "", mode,
      opts.councilModels ? JSON.stringify(opts.councilModels) : null,
      opts.councilStyle || null,
      opts.councilRounds ?? (mode === "council" ? 2 : null),
      now, now);
  return {
    id, title: "New Chat", model: opts.model,
    systemPrompt: opts.systemPrompt || "",
    mode,
    councilModels: opts.councilModels,
    councilStyle: opts.councilStyle,
    councilRounds: opts.councilRounds ?? (mode === "council" ? 2 : undefined),
    messages: [], createdAt: now, updatedAt: now,
  };
}

export function updateChat(id: string, updates: {
  title?: string; model?: string; systemPrompt?: string;
  mode?: "single" | "council"; councilModels?: string[];
  councilStyle?: "synthesis" | "roundtable"; councilRounds?: number;
}): void {
  const now = new Date().toISOString();
  const chat = getChat(id);
  if (!chat) return;
  getDb()
    .prepare("UPDATE chats SET title = ?, model = ?, system_prompt = ?, mode = ?, council_models = ?, council_style = ?, council_rounds = ?, updated_at = ? WHERE id = ?")
    .run(
      updates.title ?? chat.title,
      updates.model ?? chat.model,
      updates.systemPrompt ?? chat.systemPrompt,
      updates.mode ?? chat.mode,
      updates.councilModels ? JSON.stringify(updates.councilModels) : (chat.councilModels ? JSON.stringify(chat.councilModels) : null),
      updates.councilStyle ?? chat.councilStyle ?? null,
      updates.councilRounds ?? chat.councilRounds ?? null,
      now, id
    );
}

export function deleteChat(id: string): void {
  getDb().prepare("DELETE FROM chats WHERE id = ?").run(id);
}

export function addMessage(chatId: string, role: string, content: string, images?: string[], model?: string, councilResponses?: { round: number; responses: { model: string; content: string; error?: boolean }[] }[]): Message {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO messages (id, chat_id, role, content, model, council_responses, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, chatId, role, content, model || null, councilResponses ? JSON.stringify(councilResponses) : null, now);
  if (images && images.length > 0) {
    const stmt = getDb().prepare("INSERT INTO message_images (id, message_id, file_path) VALUES (?, ?, ?)");
    for (const img of images) {
      stmt.run(uuidv4(), id, img);
    }
  }
  getDb().prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, chatId);
  const msg: Message = { id, role: role as Message["role"], content, images, createdAt: now };
  if (model) msg.model = model;
  if (councilResponses) msg.councilResponses = councilResponses;
  return msg;
}

export function getChatMessages(chatId: string): Message[] {
  const chat = getChat(chatId);
  return chat?.messages ?? [];
}
