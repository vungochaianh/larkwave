"use client";

import AssistantChat from "@/components/AssistantChat";

/**
 * "Trợ lý AI" — the top-level, ChatGPT/Claude-style chatbot (its own history sidebar + streaming
 * chat). The actual surface lives in the shared <AssistantChat/> so the /agents-chat workspace can reuse
 * the exact same runtime/hosted logic with its own conversation rail.
 */
export default function AssistantPage() {
  return <AssistantChat />;
}
