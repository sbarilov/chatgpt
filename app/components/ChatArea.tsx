"use client";

import { useRef, useEffect, useState } from "react";
import { useChatContext } from "@/lib/context";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import ModelSelector from "./ModelSelector";
import SystemPromptEditor from "./SystemPromptEditor";

export default function ChatArea() {
  const { state, dispatch, createNewChat, cancelCouncil } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevMessageCountRef = useRef(0);

  const isCouncil = state.activeChat?.mode === "council";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const messageCount = state.activeChat?.messages.length ?? 0;

  useEffect(() => {
    if (messageCount > prevMessageCountRef.current) {
      scrollToBottom();
    }
    prevMessageCountRef.current = messageCount;
  }, [messageCount]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
  };

  const councilDescription = isCouncil && state.activeChat
    ? `${state.activeChat.councilModels?.join(", ")} - ${state.activeChat.councilStyle || "synthesis"}`
    : null;

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
        {state.activeChat && (
          <>
            <SystemPromptEditor />
            <ModelSelector />
          </>
        )}
      </div>

      {/* Council status indicator */}
      {state.councilStatus && (
        <div className="flex items-center gap-3 px-4 py-2 bg-green-900/20 border-b border-green-800/30">
          <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-green-300 flex-1">{state.councilStatus}</span>
          <button
            onClick={cancelCouncil}
            className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-400/30 hover:border-red-400/60 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

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
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4 ${
              isCouncil ? "bg-green-600" : "bg-emerald-600"
            }`}>
              {isCouncil ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : "AI"}
            </div>
            <h2 className="text-xl text-white mb-2">
              {isCouncil ? "Council Mode" : "How can I help you today?"}
            </h2>
            <p className="text-gray-400 text-sm">
              {isCouncil && councilDescription ? councilDescription : `Using ${state.activeChat.model}`}
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
      {state.activeChat ? (
        <ChatInput />
      ) : (
        <div className="border-t border-gray-700 p-6 text-center text-gray-400">
          Click <button onClick={() => createNewChat("gpt-4.5-pro")} className="text-white font-medium hover:underline">New Chat</button> to start chatting
        </div>
      )}
    </div>
  );
}
