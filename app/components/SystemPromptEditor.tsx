"use client";

import { useState } from "react";
import { useChatContext } from "@/lib/context";

export default function SystemPromptEditor() {
  const { state, updateSystemPrompt } = useChatContext();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(state.activeChat?.systemPrompt || "");

  if (!state.activeChat) return null;

  const handleSave = () => {
    updateSystemPrompt(value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setValue(state.activeChat?.systemPrompt || "");
          setOpen(!open);
        }}
        className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
        title="System prompt"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-[#2a2a2a] border border-gray-600 rounded-lg p-3 shadow-xl z-50">
          <label className="text-sm text-gray-300 mb-1 block">System Prompt</label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="w-full bg-[#1a1a1a] text-gray-200 rounded-lg p-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="You are a helpful assistant..."
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={() => setOpen(false)}
              className="text-sm text-gray-400 hover:text-white px-3 py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
