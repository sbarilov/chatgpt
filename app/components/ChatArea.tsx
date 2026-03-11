"use client";

import { useRef, useEffect, useState } from "react";
import { useChatContext } from "@/lib/context";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import ModelSelector from "./ModelSelector";
import SystemPromptEditor from "./SystemPromptEditor";

export default function ChatArea() {
  const { state, dispatch } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.activeChat?.messages]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#212121]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-[#1a1a1a]">
        <button
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
          className="md:hidden p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-white font-medium truncate flex-1">
          {state.activeChat?.title || "ChatGPT Clone"}
        </h1>
        <SystemPromptEditor />
        <ModelSelector />
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        {!state.activeChat ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-white text-2xl font-bold mb-4">
              AI
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">Welcome to ChatGPT Clone</h2>
            <p className="text-gray-400 max-w-md">
              Create a new chat or select an existing one from the sidebar to get started.
            </p>
          </div>
        ) : state.activeChat.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-white text-2xl font-bold mb-4">
              AI
            </div>
            <h2 className="text-xl text-white mb-2">How can I help you today?</h2>
            <p className="text-gray-400 text-sm">
              Using {state.activeChat.model}
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {state.activeChat.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full shadow-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput />
    </div>
  );
}
