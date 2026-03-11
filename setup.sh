#!/bin/bash
set -e

echo "=== ChatGPT Clone Setup ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed. Install it from https://nodejs.org"
  exit 1
fi

echo "Node.js $(node -v) detected"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Create data directories
echo ""
echo "Creating data directories..."
mkdir -p data/uploads

# Set up .env.local
if [ ! -f .env.local ]; then
  echo ""
  read -p "Enter your OpenAI API key: " api_key
  echo "OPENAI_API_KEY=$api_key" > .env.local
  echo "Created .env.local"
else
  echo ""
  echo ".env.local already exists, skipping"
fi

# The SQLite database is auto-created on first request
echo ""
echo "=== Setup complete! ==="
echo ""
echo "Run 'npm run dev' to start the app (or 'startgpt' if you added the alias)"
echo "Then open http://localhost:3000"
