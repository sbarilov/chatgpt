"use client";

import { useState, useRef, useEffect } from "react";
import { useModels } from "@/hooks/useModels";
import { useChatContext } from "@/lib/context";

const PRESET_ROLES = [
  { id: "analytical", label: "Analytical Thinker", description: "Focuses on logic, evidence, and structured reasoning" },
  { id: "creative", label: "Creative Thinker", description: "Explores unconventional ideas and novel perspectives" },
  { id: "devils_advocate", label: "Devil's Advocate", description: "Challenges assumptions and argues the opposing view" },
  { id: "practical", label: "Practical Realist", description: "Prioritizes feasibility, trade-offs, and real-world constraints" },
  { id: "detail", label: "Detail Reviewer", description: "Catches edge cases, errors, and missing nuances" },
];

const STYLE_INFO: Record<string, { label: string; description: string }> = {
  synthesis: { label: "Synthesis", description: "All models answer in parallel, then a moderator synthesizes into one response. Fastest option." },
  roundtable: { label: "Roundtable", description: "Multiple rounds where models see and refine each other's answers before synthesis. Deeper consensus." },
  sequential: { label: "Sequential", description: "Models take turns one by one, each responding to all previous answers. Most like a real discussion." },
};

export default function ModelSelector() {
  const { models, loading } = useModels();
  const { state, updateModel, createNewChat } = useChatContext();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [pendingMode, setPendingMode] = useState<"single" | "council">("single");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [councilStyle, setCouncilStyle] = useState<"synthesis" | "roundtable" | "sequential">("synthesis");
  const [councilRounds, setCouncilRounds] = useState<number>(2);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [showRoles, setShowRoles] = useState(false);
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);

  const activeChat = state.activeChat;
  const isCouncil = activeChat?.mode === "council";
  const currentModel = activeChat?.model || "gpt-4.5-pro";

  useEffect(() => {
    if (open && activeChat) {
      setPendingMode(activeChat.mode);
      setSelectedModels(activeChat.councilModels || []);
      setCouncilStyle(activeChat.councilStyle || "synthesis");
      setCouncilRounds(activeChat.councilRounds || 2);
      setRoleAssignments(activeChat.councilRoles || {});
    }
  }, [open, activeChat]);

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

  // Clean up role assignments when models are deselected
  useEffect(() => {
    setRoleAssignments((prev) => {
      const cleaned: Record<string, string> = {};
      for (const m of selectedModels) {
        if (prev[m]) cleaned[m] = prev[m];
      }
      return cleaned;
    });
  }, [selectedModels]);

  const openaiModels = models.filter((m) => !m.startsWith("gemini"));
  const geminiModels = models.filter((m) => m.startsWith("gemini"));

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : prev.length < 4 ? [...prev, model] : prev
    );
  };

  const assignRole = (model: string, role: string) => {
    setRoleAssignments((prev) => {
      if (!role) {
        const next = { ...prev };
        delete next[model];
        return next;
      }
      return { ...prev, [model]: role };
    });
  };

  const addCustomRole = () => {
    const role = customRoleInput.trim();
    if (!role) return;
    // Assign to first model without a role
    const unassigned = selectedModels.find((m) => !roleAssignments[m]);
    if (unassigned) {
      assignRole(unassigned, role);
    }
    setCustomRoleInput("");
  };

  const handleCreateCouncil = async () => {
    if (selectedModels.length < 2) return;
    const roles = Object.keys(roleAssignments).length > 0 ? roleAssignments : undefined;
    await createNewChat({
      model: selectedModels[0],
      mode: "council",
      councilModels: selectedModels,
      councilStyle,
      councilRounds,
      councilRoles: roles,
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
        <div className="absolute right-0 top-full mt-1 w-96 bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
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

          <div className="max-h-[28rem] overflow-y-auto">
            {pendingMode === "single" ? (
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
              <div className="p-3 space-y-3">
                {/* Model selection */}
                <p className="text-xs text-gray-400">Select 2-4 models:</p>

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

                {/* Style selector with tooltips */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Style</p>
                  <div className="flex rounded-lg overflow-hidden border border-gray-600">
                    {(["synthesis", "roundtable", "sequential"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => setCouncilStyle(style)}
                        onMouseEnter={() => setHoveredStyle(style)}
                        onMouseLeave={() => setHoveredStyle(null)}
                        className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                          councilStyle === style ? "bg-blue-600 text-white" : "bg-[#2a2a2a] text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {STYLE_INFO[style].label}
                      </button>
                    ))}
                  </div>
                  {/* Style description */}
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    {STYLE_INFO[hoveredStyle || councilStyle].description}
                  </p>
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

                {/* Role assignment (collapsible) */}
                {selectedModels.length >= 2 && (
                  <div className="border border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowRoles(!showRoles)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`w-3.5 h-3.5 transition-transform ${showRoles ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="font-medium uppercase tracking-wider">Assign Roles</span>
                      {Object.keys(roleAssignments).length > 0 && (
                        <span className="text-blue-400">({Object.keys(roleAssignments).length} assigned)</span>
                      )}
                      <span className="ml-auto text-gray-600 font-normal normal-case tracking-normal">optional</span>
                    </button>

                    {showRoles && (
                      <div className="px-3 pb-3 space-y-3 border-t border-gray-700 pt-3">
                        <p className="text-xs text-gray-500">
                          Give each model a perspective to bring to the discussion.
                        </p>

                        {/* Per-model role assignment */}
                        {selectedModels.map((model) => (
                          <div key={model} className="space-y-1">
                            <p className="text-xs font-medium text-gray-300 truncate">{model}</p>
                            <div className="flex flex-wrap gap-1">
                              {PRESET_ROLES.map((role) => {
                                const isAssigned = roleAssignments[model] === role.label;
                                const isTakenByOther = !isAssigned && Object.values(roleAssignments).includes(role.label);
                                return (
                                  <button
                                    key={role.id}
                                    onClick={() => assignRole(model, isAssigned ? "" : role.label)}
                                    disabled={isTakenByOther}
                                    title={role.description}
                                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                      isAssigned
                                        ? "bg-blue-600/20 border-blue-500 text-blue-300"
                                        : isTakenByOther
                                        ? "border-gray-700 text-gray-600 cursor-not-allowed"
                                        : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                                    }`}
                                  >
                                    {role.label}
                                  </button>
                                );
                              })}
                              {/* Show custom role if assigned and not a preset */}
                              {roleAssignments[model] && !PRESET_ROLES.some((r) => r.label === roleAssignments[model]) && (
                                <span className="text-[10px] px-2 py-1 rounded-full border bg-purple-600/20 border-purple-500 text-purple-300 flex items-center gap-1">
                                  {roleAssignments[model]}
                                  <button onClick={() => assignRole(model, "")} className="hover:text-white">&times;</button>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Custom role input */}
                        <div className="flex gap-1.5 items-center">
                          <input
                            type="text"
                            value={customRoleInput}
                            onChange={(e) => setCustomRoleInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCustomRole()}
                            placeholder="Custom role..."
                            className="flex-1 text-xs bg-[#2a2a2a] text-gray-200 rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-blue-500 placeholder-gray-500"
                          />
                          <button
                            onClick={addCustomRole}
                            disabled={!customRoleInput.trim() || !selectedModels.some((m) => !roleAssignments[m])}
                            className="text-xs px-2 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded transition-colors"
                          >
                            Add
                          </button>
                        </div>
                        {selectedModels.some((m) => !roleAssignments[m]) && customRoleInput.trim() && (
                          <p className="text-[10px] text-gray-500">
                            Will be assigned to: {selectedModels.find((m) => !roleAssignments[m])}
                          </p>
                        )}
                      </div>
                    )}
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
