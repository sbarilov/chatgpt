# ChatGPT Clone

A local ChatGPT-like web app that runs on your machine using your OpenAI API key. Built with Next.js, TypeScript, Tailwind CSS, and SQLite.

## Features

- **Streaming responses** - Real-time token-by-token display
- **Chat history** - All conversations persisted in a local SQLite database
- **Model selector** - Dynamically fetches all available models from your API key
- **Markdown rendering** - Code blocks with syntax highlighting and copy button
- **Image upload** - Attach images for vision-capable models (e.g. GPT-4o)
- **Auto-generated titles** - Chat titled from first message via GPT-4o-mini
- **System prompt** - Optional per-chat system prompt
- **Responsive** - Works on mobile with collapsible sidebar
- **Keyboard shortcuts** - Enter to send, Cmd/Ctrl+Shift+N for new chat

## Quick Setup

```bash
# Clone the repo
git clone https://github.com/sbarilov/chatgpt.git
cd chatgpt

# Run the setup script
chmod +x setup.sh
./setup.sh

# Start the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Manual Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create `.env.local`** in the project root:

   ```
   OPENAI_API_KEY=sk-your-key-here
   ```

3. **Create data directories**

   ```bash
   mkdir -p data/uploads
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

The SQLite database (`data/chatgpt.db`) is auto-created on first request. No manual DB setup needed.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS** (dark mode)
- **better-sqlite3** (local persistence)
- **openai** SDK (streaming + model listing)
- **react-markdown** + **react-syntax-highlighter** (rendering)

## Project Structure

```
app/
  api/          # API routes (models, chat, chats CRUD, upload)
  components/   # React components (Sidebar, ChatArea, MessageBubble, etc.)
lib/
  db.ts         # SQLite connection, schema, CRUD helpers
  context.tsx   # React Context + state management
  types.ts      # TypeScript interfaces
hooks/
  useModels.ts  # Fetch available models
data/           # Auto-created, gitignored
  chatgpt.db    # SQLite database
  uploads/      # Uploaded images
```
