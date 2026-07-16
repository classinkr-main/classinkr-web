import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 외부(고객) 챗봇 무변동 방어선.
 *
 * 내부 CS 코파일럿에만 허용되는 자료(ZIP 후보·내부 큐레이션 지식)가 공개 챗봇
 * 경로로 새는 회귀를 소스 레벨에서 고정한다. 2026-07-16 자체 평가 베이스라인:
 * 공개 답변 186건에서 ZIP 마커 0건 — 이 상태가 계약이다.
 */

const PUBLIC_SURFACES = ["lib/chatbot", "app/api/chatbot", "components/ui/FloatingChatbot.tsx"]

// classin-brand-dataset(2026-07-15 ZIP)에서만 나오는, 공개 답변에 금지된 문구.
const ZIP_MARKERS = ["시대는 끝났", "가장 교실다운", "MS10A", "30억", "8만+"]

function collectSourceFiles(entry: string): string[] {
  const stats = statSync(entry)
  if (stats.isFile()) return /\.(ts|tsx)$/.test(entry) ? [entry] : []
  return readdirSync(entry).flatMap((name) => collectSourceFiles(join(entry, name)))
}

const sources = PUBLIC_SURFACES.flatMap((surface) => collectSourceFiles(surface)).map((file) => ({
  file,
  text: readFileSync(file, "utf8"),
}))

describe("public chatbot isolation", () => {
  it("collects the public chatbot sources", () => {
    expect(sources.length).toBeGreaterThan(10)
  })

  it("never imports internal CS copilot modules", () => {
    const offenders = sources
      .filter(({ text }) => /from\s+["']@\/lib\/internal-cs-chat/.test(text))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it("contains no ZIP-only marker phrases", () => {
    const offenders = sources.flatMap(({ file, text }) =>
      ZIP_MARKERS.filter((marker) => text.includes(marker)).map((marker) => `${file}: ${marker}`)
    )
    expect(offenders).toEqual([])
  })

  it("keeps the shared answer style contract in the base prompt", () => {
    const llm = readFileSync("lib/chatbot/llm.ts", "utf8")
    expect(llm).toContain("'- '로 시작하는 불릿")
    expect(llm).toContain("이모지는 쓰지 않는다")
    expect(llm).toContain("'*' 불릿이나 '**' 굵게 강조는 쓰지 않는다")
  })
})
