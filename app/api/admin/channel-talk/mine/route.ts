import fs from "fs"
import path from "path"

import { NextRequest } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import { mineFaqSuggestions } from "@/lib/channel-talk-mining"
import { deriveChannelRootCauseCandidates } from "@/lib/channel-talk-root-causes"
import {
  getConversations,
  listDurableConversations,
} from "@/lib/repositories/channel-conversations"

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

  // 운영 동기화가 쓰는 Supabase 영속 저장소를 우선한다. 미설정/조회 실패일 때만
  // 로컬 JSON으로 폴백해 개발 환경의 기존 동작을 유지한다.
  const durable = await listDurableConversations()
  const conversations = durable ?? getConversations()
  const suggestions = mineFaqSuggestions(conversations, loadGoldenQuestions())
  const rootCauseCandidates = deriveChannelRootCauseCandidates(conversations)

  // 원인 후보는 검토용 파생 데이터일 뿐이다. 이 라우트는 DB 저장, 골든셋 변경,
  // 공개 챗봇 자동 승격을 수행하지 않는다.
  return adminCachedJson({
    suggestions,
    rootCauseCandidates,
    source: durable ? "supabase" : "local_json",
  })
}
