"use client";

import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import { useChatContext } from "@/lib/context";

export default function Home() {
  const { createNewChat } = useChatContext();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        createNewChat("gpt-4.5-pro");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNewChat]);

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar />
      <ChatArea />
    </main>
  );
}
