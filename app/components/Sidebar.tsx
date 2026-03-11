"use client";

import { useChatContext } from "@/lib/context";
import { useModels } from "@/hooks/useModels";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export default function Sidebar() {
  const { state, dispatch, loadChat, createNewChat, deleteChat } = useChatContext();
  const { models } = useModels();
  const [defaultModel] = useState("gpt-4o");

  const handleNewChat = async () => {
    const model = models.length > 0 ? (models.includes("gpt-4o") ? "gpt-4o" : models[0]) : defaultModel;
    await createNewChat(model);
    dispatch({ type: "SET_SIDEBAR", open: false });
  };

  const handleSelect = async (id: string) => {
    await loadChat(id);
    dispatch({ type: "SET_SIDEBAR", open: false });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteChat(id);
  };

  return (
    <>
      {/* Mobile overlay */}
      {state.sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => dispatch({ type: "SET_SIDEBAR", open: false })}
        />
      )}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-[#171717] border-r border-gray-800 flex flex-col transform transition-transform duration-200 ${
          state.sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-4 py-3 bg-[#2a2a2a] hover:bg-[#333] rounded-xl text-white text-sm font-medium transition-colors border border-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {state.chats.length === 0 && (
            <p className="text-gray-500 text-sm text-center mt-8">No chats yet</p>
          )}
          {state.chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => handleSelect(chat.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 mx-1 my-0.5 rounded-lg cursor-pointer transition-colors ${
                state.activeChatId === chat.id
                  ? "bg-[#2a2a2a] text-white"
                  : "text-gray-300 hover:bg-[#222]"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{chat.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true })}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(e, chat.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all"
                title="Delete chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
