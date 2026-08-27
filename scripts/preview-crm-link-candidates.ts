/**
 * CRM source-link 후보 생성 read-only preview.
 *
 * 실행:
 *   npm run preview:crm-matching
 *   npm run preview:crm-matching -- --source=lead
 *
 * 실제 generate 함수와 같은 조회·점수·자동확정 정책을 사용하지만 INSERT/UPDATE/alias 학습은
 * 건너뛴다. 출력 수치는 실행 시점의 DB 스냅샷 기준 예상치이며 동시 변경/쓰기 오류는 반영하지 않는다.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

type PreviewSource = "all" | "branch_rev_sheet" | "lead" | "xiaoshouyi"

function parseSource(argv: string[]): PreviewSource {
  const value = argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length) ?? "all"
  if (value === "all" || value === "branch_rev_sheet" || value === "lead" || value === "xiaoshouyi") {
    return value
  }
  throw new Error(`지원하지 않는 source입니다: ${value}`)
}

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

async function main() {
  loadEnvLocal()
  const {
    previewAllCrmLinkCandidates,
    previewBranchRevLinkCandidates,
    previewExternalCrmLinkCandidates,
    previewLeadLinkCandidates,
  } = await import("../lib/repositories/crm-source-links")
  const source = parseSource(process.argv.slice(2))
  const result = source === "all"
    ? await previewAllCrmLinkCandidates()
    : source === "branch_rev_sheet"
      ? await previewBranchRevLinkCandidates()
      : source === "lead"
        ? await previewLeadLinkCandidates()
        : await previewExternalCrmLinkCandidates()

  console.log("[crm-matching:dry-run] read-only preview — DB 쓰기 없음")
  console.log(JSON.stringify({ source, generatedAt: new Date().toISOString(), result }, null, 2))
}

main().catch((error) => {
  console.error("[crm-matching:dry-run]", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
