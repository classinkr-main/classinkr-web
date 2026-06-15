import fs from "fs"
import path from "path"

import { NextRequest } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import { mineFaqSuggestions } from "@/lib/channel-talk-mining"
import { getConversations } from "@/lib/repositories/channel-conversations"

function loadGoldenQuestions(): string[] {
  try {
    const file = path.join(process.cwd(), "data", "chatbot-golden-set.json")
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
      cases?: { question?: string }[]
    }
    return (parsed.cases ?? [])
      .map((entry) => entry.question)
      .filter((question): question is string => typeof question === "string")
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const suggestions = mineFaqSuggestions(getConversations(), loadGoldenQuestions())
  return adminCachedJson({ suggestions })
}
