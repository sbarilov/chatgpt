"use client";

import type { Message } from "@/lib/types";
import MarkdownRenderer from "./MarkdownRenderer";
import ImagePreview from "./ImagePreview";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-1">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-[#2a2a2a] text-gray-100"
        }`}
      >
        {message.images && message.images.length > 0 && (
          <div className="mb-2">
            <ImagePreview images={message.images} small />
          </div>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert max-w-none">
            <MarkdownRenderer content={message.content} />
            {message.content === "" && (
              <span className="inline-block w-2 h-5 bg-gray-400 animate-pulse" />
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-1">
          U
        </div>
      )}
    </div>
  );
}
