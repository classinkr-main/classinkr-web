import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { vi } from "vitest"

/**
 * 끔 동등성(사양 §11 1): 평가셋 전 문항의 generateAnswer=false 답을 줄마다 해시로 묶는다.
 * 묶는 칸: answer · answerMode · needsHandoff · unresolved · handoffIntent · 출처 경로(urlPath 순서대로).
 * 글 자체는 저장하지 않는다(fixtures/legacy-equivalence.json 에는 질문 열쇠 → 해시만).
 *
 * 열쇠는 "<묶음>/<문항 id>"다(묶음끼리 id 가 겹칠 수 있다).
 */

export const LEGACY_EQUIVALENCE_FILE = join(__dirname, "fixtures", "legacy-equivalence.json")

export const LEGACY_EQUIVALENCE_SETS = ["first-contact", "fresh-open", "golden", "cs-symptom", "persona-eval"] as const

export interface EquivalenceCase {
  key: string
  question: string
}

export function legacyEquivalenceCases(): EquivalenceCase[] {
  const cases: EquivalenceCase[] = []
  for (const set of LEGACY_EQUIVALENCE_SETS) {
    const file = JSON.parse(readFileSync(join(process.cwd(), `data/chatbot-${set}-set.json`), "utf8")) as {
      cases: { id: string; question: string }[]
    }
    for (const item of file.cases) cases.push({ key: `${set}/${item.id}`, question: item.question })
  }
  return cases
}

export interface EquivalenceAnswer {
  answer: string
  answerMode: string
  needsHandoff: boolean
  unresolved: boolean
  handoffIntent?: string | null
  sources: { urlPath: string }[]
}

export function equivalenceHash(result: EquivalenceAnswer) {
  const payload = JSON.stringify([
    result.answer,
    result.answerMode,
    result.needsHandoff,
    result.unresolved,
    result.handoffIntent ?? null,
    result.sources.map((source) => source.urlPath),
  ])
  return createHash("sha256").update(payload).digest("hex").slice(0, 16)
}

export interface LegacyEquivalenceFile {
  _comment: string
  fields: string[]
  hashes: Record<string, string>
}

export function readLegacyEquivalence(): LegacyEquivalenceFile {
  return JSON.parse(readFileSync(LEGACY_EQUIVALENCE_FILE, "utf8")) as LegacyEquivalenceFile
}

/**
 * 시험 환경과 같은 조건: 문서 검색 DB·모델 키를 비워 외부 서비스를 부르지 않는다(다른 평가셋 시험과 같은 방식).
 * 답 라우터는 router 로 둔다(null 이면 지움 = 환경변수 없음).
 */
export function stubLegacyEquivalenceEnv(router: string | null) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.stubEnv("CHATBOT_ANSWER_ROUTER", router ?? undefined)
}
