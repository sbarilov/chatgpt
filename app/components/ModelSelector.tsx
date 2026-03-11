"use client";

import { useModels } from "@/hooks/useModels";
import { useChatContext } from "@/lib/context";

export default function ModelSelector() {
  const { models, loading } = useModels();
  const { state, updateModel } = useChatContext();
  const currentModel = state.activeChat?.model || "gpt-4o";

  return (
    <select
      value={currentModel}
      onChange={(e) => updateModel(e.target.value)}
      disabled={loading || !state.activeChat}
      className="bg-[#2a2a2a] text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
    >
      {loading ? (
        <option>Loading models...</option>
      ) : (
        models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))
      )}
    </select>
  );
}
