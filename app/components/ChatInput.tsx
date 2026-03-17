"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChatContext } from "@/lib/context";
import ImagePreview from "./ImagePreview";

export default function ChatInput() {
  const { state, sendMessage } = useChatContext();
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed && images.length === 0) return;
    if (sending) return;
    if (!state.activeChat) return;

    setSending(true);
    setInput("");
    const imgsCopy = [...images];
    setImages([]);
    try {
      await sendMessage(trimmed, imgsCopy.length > 0 ? imgsCopy : undefined);
    } finally {
      setSending(false);
    }
  }, [input, images, sending, state.activeChat, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.path) {
        setImages((prev) => [...prev, data.path]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const disabled = !state.activeChat;

  return (
    <div className="border-t border-gray-700 p-4">
      {images.length > 0 && (
        <div className="mb-3">
          <ImagePreview images={images} onRemove={removeImage} />
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          title="Upload image or PDF"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder={disabled ? "Select or create a chat to start..." : "Type a message..."}
          rows={1}
          className="flex-1 bg-[#2a2a2a] text-gray-100 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600 placeholder-gray-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || sending || (!input.trim() && images.length === 0)}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-xl transition-colors disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
