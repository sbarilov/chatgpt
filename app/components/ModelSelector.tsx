"use client";

import { useState, useRef, useEffect } from "react";
import { useModels } from "@/hooks/useModels";
import { useChatContext } from "@/lib/context";

export default function ModelSelector() {
  const { models, loading } = useModels();
  const { state, updateModel, createNewChat, loadChat, loadChats } = useChatContext();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Council creation state (only used when switching to council for a new chat)
  const [pendingMode, setPendingMode] = useState<"single" | "council">("single");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [councilStyle, setCouncilStyle] = useState<"synthesis" | "roundtable">("synthesis");
  const [councilRounds, setCouncilRounds] = useState<number>(2);

  const activeChat = state.activeChat;
  const isCouncil = activeChat?.mode === "council";
  const currentModel = activeChat?.model || "gpt-4.5-pro";

  // Sync pending state when panel opens
  useEffect(() => {
    if (open && activeChat) {
      setPendingMode(activeChat.mode);
      setSelectedModels(activeChat.councilModels || []);
      setCouncilStyle(activeChat.councilStyle || "synthesis");
      setCouncilRounds(activeChat.councilRounds || 2);
    }
  }, [open, activeChat]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const openaiModels = models.filter((m) => !m.startsWith("gemini"));
  const geminiModels = models.filter((m) => m.startsWith("gemini"));

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : prev.length < 4 ? [...prev, model] : prev
    );
  };

  const handleCreateCouncil = async () => {
    if (selectedModels.length < 2) return;
    await createNewChat({
      model: selectedModels[0],
      mode: "council",
      councilModels: selectedModels,
      councilStyle,
      councilRounds,
    });
    setOpen(false);
  };

  const headerLabel = isCouncil
    ? `Council (${activeChat?.councilModels?.length || 0} models)`
    : currentModel;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading || !activeChat}
        className="bg-[#2a2a2a] text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-600 hover:border-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 flex items-center gap-1.5"
      >
        {isCouncil && (
          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
        )}
        <span className="truncate max-w-[180px]">{loading ? "Loading..." : headerLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Mode toggle */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setPendingMode("single")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                pendingMode === "single" ? "bg-[#2a2a2a] text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setPendingMode("council")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                pendingMode === "council" ? "bg-[#2a2a2a] text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Council
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {pendingMode === "single" ? (
              /* Single mode: radio list */
              <div className="p-2">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      updateModel(m);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      m === currentModel && !isCouncil
                        ? "bg-blue-600/20 text-blue-300"
                        : "text-gray-300 hover:bg-[#2a2a2a]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ) : (
              /* Council mode: multi-select + config */
              <div className="p-3 space-y-3">
                <p className="text-xs text-gray-400">Select 2-4 models for the council:</p>

                {openaiModels.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">OpenAI</p>
                    {openaiModels.map((m) => (
                      <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2a2a2a] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedModels.includes(m)}
                          onChange={() => toggleModel(m)}
                          disabled={!selectedModels.includes(m) && selectedModels.length >= 4}
                          className="rounded border-gray-600 bg-[#333] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-300">{m}</span>
                      </label>
                    ))}
                  </div>
                )}

                {geminiModels.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Gemini</p>
                    {geminiModels.map((m) => (
                      <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2a2a2a] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedModels.includes(m)}
                          onChange={() => toggleModel(m)}
                          disabled={!selectedModels.includes(m) && selectedModels.length >= 4}
                          className="rounded border-gray-600 bg-[#333] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-gray-300">{m}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Style toggle */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Style</p>
                  <div className="flex rounded-lg overflow-hidden border border-gray-600">
                    <button
                      onClick={() => setCouncilStyle("synthesis")}
                      className={`flex-1 py-1.5 text-xs font-medium ${
                        councilStyle === "synthesis" ? "bg-blue-600 text-white" : "bg-[#2a2a2a] text-gray-400"
                      }`}
                    >
                      Synthesis
                    </button>
                    <button
                      onClick={() => setCouncilStyle("roundtable")}
                      className={`flex-1 py-1.5 text-xs font-medium ${
                        councilStyle === "roundtable" ? "bg-blue-600 text-white" : "bg-[#2a2a2a] text-gray-400"
                      }`}
                    >
                      Roundtable
                    </button>
                  </div>
                </div>

                {/* Rounds (only for roundtable) */}
                {councilStyle === "roundtable" && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Rounds</p>
                    <div className="flex rounded-lg overflow-hidden border border-gray-600">
                      {[2, 3].map((n) => (
                        <button
                          key={n}
                          onClick={() => setCouncilRounds(n)}
                          className={`flex-1 py-1.5 text-xs font-medium ${
                            councilRounds === n ? "bg-blue-600 text-white" : "bg-[#2a2a2a] text-gray-400"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Create button */}
                <button
                  onClick={handleCreateCouncil}
                  disabled={selectedModels.length < 2}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Create Council Chat ({selectedModels.length} models)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
