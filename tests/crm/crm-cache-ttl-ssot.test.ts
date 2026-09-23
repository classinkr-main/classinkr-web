/**
 * CRM 클라이언트 캐시 TTL SSOT 계약(2026-09-17 우선순위 P2).
 *
 * 화면별 TTL 이 30/60/90초로 제각각이던 상태를 lib/crm/client-cache.ts 한 곳으로 모았다.
 * 통합 고객·리드 보드 소스에 TTL 숫자 리터럴이 다시 들어오면 여기서 잡는다. 시계 틱·단위 환산처럼
 * TTL 이 아닌 리터럴은 아래 예외 목록에 파일·줄 패턴으로 명시한다(조용히 넓히지 않는다).
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"

const ROOT = process.cwd()
const SCOPES = [
  "components/admin/crm/unified",
  "components/admin/crm/leads",
  "components/admin/crm/CrmUnifiedCustomersClient.tsx",
  "components/admin/crm/leads/LeadsBoardClient.tsx",
]
const TTL_LITERAL = /\b(30|60|90|120)_000\b/

// TTL 이 아닌 리터럴 — 파일과 줄 패턴이 둘 다 맞아야 예외다.
const ALLOWED: Array<{ file: string; line: RegExp; why: string }> = [
  { file: "components/admin/crm/unified/row-visuals.tsx", line: /^const MINUTE_TICK_MS = 60_000$/, why: "상대 시각 재계산 틱" },
  { file: "components/admin/crm/leads/board/shared.tsx", line: /Math\.floor\(diffMs \/ 60_000\)/, why: "ms→분 환산" },
]

function listSourceFiles(target: string): string[] {
  const abs = path.join(ROOT, target)
  if (statSync(abs).isFile()) return [target]
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    // 상대 경로는 "/" 로 잇는다 — path.join 은 Windows 에서 "\" 를 내서 ALLOWED 의 file("/" 표기)과
    // 문자열 비교가 어긋났고, 예외로 둔 두 줄이 위반으로 잡혔다. SCOPES·ALLOWED 도 "/" 표기다.
    const rel = path.posix.join(target, entry.name)
    if (entry.isDirectory()) return listSourceFiles(rel)
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : []
  })
}

function read(rel: string) {
  return readFileSync(path.join(ROOT, rel), "utf8")
}

describe("CRM 캐시 TTL SSOT", () => {
  it("lib/crm/client-cache.ts 값이 계약대로다(TTL 120초 · SWR 10분)", () => {
    expect(CRM_CACHE_TTL_MS).toBe(120_000)
    expect(CRM_CACHE_SWR_MS).toBe(600_000)
  })

  it("통합 고객·리드 보드 소스에 TTL 숫자 리터럴이 남아 있지 않다(예외 목록 제외)", () => {
    const files = Array.from(new Set(SCOPES.flatMap(listSourceFiles)))
    expect(files.length).toBeGreaterThan(5)
    const violations: string[] = []
    for (const file of files) {
      const lines = read(file).split("\n")
      lines.forEach((line, index) => {
        if (!TTL_LITERAL.test(line)) return
        const allowed = ALLOWED.some((rule) => rule.file === file && rule.line.test(line.trim()))
        if (!allowed) violations.push(`${file}:${index + 1}: ${line.trim()}`)
      })
    }
    expect(violations).toEqual([])
  })

  it("예외 목록의 줄은 실제로 존재한다 — 사라졌으면 목록도 지운다", () => {
    for (const rule of ALLOWED) {
      const present = read(rule.file).split("\n").some((line) => rule.line.test(line.trim()))
      expect(present, `${rule.file}: ${rule.why}`).toBe(true)
    }
  })

  it("두 화면 모두 SSOT 상수를 직접 import 하고 로컬 사본을 export 하지 않는다", () => {
    const unifiedClient = read("components/admin/crm/CrmUnifiedCustomersClient.tsx")
    expect(unifiedClient).toContain('import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"')
    expect(unifiedClient).toContain("ttlMs: CRM_CACHE_TTL_MS,")
    expect(unifiedClient).toContain("staleWhileRevalidateMs: CRM_CACHE_SWR_MS,")

    const leadsClient = read("components/admin/crm/leads/LeadsBoardClient.tsx")
    expect(leadsClient).toContain('import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"')
    expect(leadsClient).toContain("ttlMs: CRM_CACHE_TTL_MS,")
    expect(leadsClient).toContain("staleWhileRevalidateMs: CRM_CACHE_SWR_MS,")
    expect(leadsClient).not.toMatch(/ttlMs: \d/)

    expect(read("components/admin/crm/unified/shared.ts")).not.toMatch(/export const CACHE_TTL_MS/)
    const leadsShared = read("components/admin/crm/leads/board/shared.tsx")
    expect(leadsShared).not.toContain("LEADS_CACHE_TTL_MS =")
    expect(leadsShared).not.toContain("LEADS_CACHE_SWR_MS =")
  })
})
