import "server-only"

import { redactPii } from "@/lib/chatbot/service"

/**
 * Internal CS content can contain customer identifiers from questions, history, OCR, or notes.
 * Keep one boundary helper so every value sent to an external generation model is redacted first.
 */
export function redactInternalCsText(value: string | null | undefined) {
  return redactPii(value ?? "")
}
