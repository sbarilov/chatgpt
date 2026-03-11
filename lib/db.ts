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
  }
  return db;
}

export function listChats(): ChatSummary[] {
  const rows = getDb()
    .prepare("SELECT id, title, model, updated_at FROM chats ORDER BY updated_at DESC")
    .all() as { id: string; title: string; model: string; updated_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    model: r.model,
    updatedAt: r.updated_at,
  }));
}

export function getChat(id: string): Chat | null {
  const row = getDb()
    .prepare("SELECT * FROM chats WHERE id = ?")
    .get(id) as { id: string; title: string; model: string; system_prompt: string; created_at: string; updated_at: string } | undefined;
  if (!row) return null;

  const msgs = getDb()
    .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(id) as { id: string; role: string; content: string; created_at: string }[];

  const messages: Message[] = msgs.map((m) => {
    const images = getDb()
      .prepare("SELECT file_path FROM message_images WHERE message_id = ?")
      .all(m.id) as { file_path: string }[];
    return {
      id: m.id,
      role: m.role as Message["role"],
      content: m.content,
      images: images.length > 0 ? images.map((i) => i.file_path) : undefined,
      createdAt: m.created_at,
    };
  });

  return {
    id: row.id,
    title: row.title,
    model: row.model,
    systemPrompt: row.system_prompt,
    messages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createChat(model: string, systemPrompt: string = ""): Chat {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO chats (id, title, model, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, "New Chat", model, systemPrompt, now, now);
  return { id, title: "New Chat", model, systemPrompt, messages: [], createdAt: now, updatedAt: now };
}

export function updateChat(id: string, updates: { title?: string; model?: string; systemPrompt?: string }): void {
  const now = new Date().toISOString();
  const chat = getChat(id);
  if (!chat) return;
  getDb()
    .prepare("UPDATE chats SET title = ?, model = ?, system_prompt = ?, updated_at = ? WHERE id = ?")
    .run(updates.title ?? chat.title, updates.model ?? chat.model, updates.systemPrompt ?? chat.systemPrompt, now, id);
}

export function deleteChat(id: string): void {
  getDb().prepare("DELETE FROM chats WHERE id = ?").run(id);
}

export function addMessage(chatId: string, role: string, content: string, images?: string[]): Message {
  const id = uuidv4();
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, chatId, role, content, now);
  if (images && images.length > 0) {
    const stmt = getDb().prepare("INSERT INTO message_images (id, message_id, file_path) VALUES (?, ?, ?)");
    for (const img of images) {
      stmt.run(uuidv4(), id, img);
    }
  }
  getDb().prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, chatId);
  return { id, role: role as Message["role"], content, images, createdAt: now };
}

export function getChatMessages(chatId: string): Message[] {
  const chat = getChat(chatId);
  return chat?.messages ?? [];
}
