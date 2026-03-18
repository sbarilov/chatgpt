"use client";

import { useState } from "react";
import type { Message } from "@/lib/types";
import MarkdownRenderer from "./MarkdownRenderer";
import ImagePreview from "./ImagePreview";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isCouncil = message.model === "council" || (message.councilResponses && message.councilResponses.length > 0);
  const [showResponses, setShowResponses] = useState(false);

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1 ${
          isCouncil ? "bg-green-600" : "bg-emerald-600"
        }`}>
          {isCouncil ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : "AI"}
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
          <>
            {isCouncil && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                  Council
                </span>
              </div>
            )}
            <div className="prose prose-invert max-w-none">
              <MarkdownRenderer content={message.content} />
              {message.content === "" && (
                <span className="inline-block w-2 h-5 bg-gray-400 animate-pulse" />
              )}
            </div>

            {/* Collapsible individual responses */}
            {message.councilResponses && message.councilResponses.length > 0 && (
              <div className="mt-3 border-t border-gray-600 pt-2">
                <button
                  onClick={() => setShowResponses(!showResponses)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-3.5 h-3.5 transition-transform ${showResponses ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  View individual responses ({message.councilResponses.length} {message.councilResponses.length === 1 ? "round" : "rounds"})
                </button>
                {showResponses && (
                  <div className="mt-2 space-y-3">
                    {message.councilResponses.map((rd) => (
                      <div key={rd.round}>
                        {message.councilResponses!.length > 1 && (
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            Round {rd.round}
                          </div>
                        )}
                        <div className="space-y-2">
                          {rd.responses.map((r, i) => (
                            <div key={i} className="bg-[#1a1a1a] rounded-lg p-3 border border-gray-700">
                              <div className="text-xs font-medium text-gray-400 mb-1.5">
                                {r.model}
                                {(r.error || !r.content) && (
                                  <span className="ml-2 text-red-400">Failed to respond</span>
                                )}
                              </div>
                              {r.content ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                  <MarkdownRenderer content={r.content} />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
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
