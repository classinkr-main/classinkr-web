import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// 샘플 유닛 '전시·사내 사용'(showroom) 마이그레이션 계약.
//
// 사무실·샘플 재고 풀은 유닛 기준이다(운영자 결정 2026-09-15). 쇼룸·KC인증처럼 사무실에 있지만 쓰는 중인
// 유닛을 가용에서 빼려면 status 에 showroom, event_type 에 showcase·store 가 필요하다.
// 20260727 은 컬럼 인라인 check 라 이름이 자동 생성됐고, 운영 카탈로그 실측 이름으로 교체해야 한다.
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260915_hardware_sample_showroom_status.sql"),
  "utf8"
)
// 주석을 뺀 실행 본문 — 머리 주석의 롤백 예시가 실행 계약 판정에 섞이지 않게 한다.
const statements = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")

function checkValues(constraintName: string, column: string): string[] {
  const pattern = new RegExp(`add constraint ${constraintName}\\s+check \\(${column} in \\(([^)]*)\\)\\)`)
  const match = pattern.exec(statements)
  if (!match) throw new Error(`${constraintName} check 를 찾지 못했습니다.`)
  return match[1].split(",").map((value) => value.trim().replace(/'/g, ""))
}

describe("hardware sample showroom 마이그레이션 — 제약 이름", () => {
  it("운영 카탈로그의 자동 생성 이름으로 drop 하고 같은 이름으로 다시 만든다", () => {
    expect(statements).toMatch(
      /alter table public\.hardware_sample_units\s+drop constraint if exists hardware_sample_units_status_check,\s+add constraint hardware_sample_units_status_check/
    )
    expect(statements).toMatch(
      /alter table public\.hardware_sample_events\s+drop constraint if exists hardware_sample_events_event_type_check,\s+add constraint hardware_sample_events_event_type_check/
    )
  })

  it("drop 과 add 를 한 ALTER TABLE 문에 넣어 제약 없는 틈을 만들지 않는다", () => {
    const alterStatements = statements.split(";").filter((statement) => /alter table/i.test(statement))
    expect(alterStatements).toHaveLength(2)
    for (const statement of alterStatements) {
      expect(statement).toMatch(/drop constraint if exists/)
      expect(statement).toMatch(/add constraint/)
    }
  })
})

describe("hardware sample showroom 마이그레이션 — 값 집합", () => {
  it("status 에 showroom 을 더하고 기존 5개 값을 모두 남긴다", () => {
    expect(checkValues("hardware_sample_units_status_check", "status").sort()).toEqual(
      ["converted", "loaned", "office", "repair", "retired", "showroom"]
    )
  })

  it("event_type 에 showcase·store 를 더하고 기존 8개 값을 모두 남긴다", () => {
    expect(checkValues("hardware_sample_events_event_type_check", "event_type").sort()).toEqual(
      ["adjust", "assign", "convert", "loan", "memo", "repair", "retire", "return", "showcase", "store"]
    )
  })
})

describe("hardware sample showroom 마이그레이션 — 데이터·롤백", () => {
  it("데이터를 바꾸지 않는다", () => {
    expect(statements).not.toMatch(/\b(update|delete|insert|truncate)\b/i)
    expect(statements).not.toMatch(/drop table/i)
  })

  it("롤백은 주석으로만 남기고, showroom 행을 office 로 되돌린 뒤 옛 제약을 건다", () => {
    const rollbackStart = sql.indexOf("── 롤백")
    expect(rollbackStart).toBeGreaterThan(-1)
    const rollback = sql.slice(rollbackStart)
    const dataFix = rollback.indexOf("update public.hardware_sample_units set status = 'office' where status = 'showroom';")
    const oldStatusCheck = rollback.indexOf("check (status in ('office', 'loaned', 'repair', 'converted', 'retired'))")
    const oldEventCheck = rollback.indexOf(
      "check (event_type in ('assign', 'loan', 'return', 'repair', 'convert', 'adjust', 'memo', 'retire'))"
    )
    expect(dataFix).toBeGreaterThan(-1)
    expect(oldStatusCheck).toBeGreaterThan(dataFix)
    expect(oldEventCheck).toBeGreaterThan(dataFix)
    // 이벤트 이력은 지우지 않고 adjust 로 보존한다.
    expect(rollback).toContain("where event_type in ('showcase', 'store');")
    expect(rollback).not.toMatch(/delete from public\.hardware_sample_events/i)
    // 롤백 문장은 실행 본문에 없다.
    expect(statements).not.toContain("where status = 'showroom'")
  })

  it("머리 주석에 이유·계약·실측 제약 이름을 적는다", () => {
    expect(sql).toContain("운영자 결정 2026-09-15")
    expect(sql).toContain("showcase = 사무실 보관(office) → 전시·사내 사용(showroom)")
    expect(sql).toContain("store    = 전시·사내 사용(showroom)·수리(repair) → 사무실 보관(office)")
    expect(sql).toContain("hardware_sample_units_status_check      CHECK")
    expect(sql).toContain("hardware_sample_events_event_type_check CHECK")
  })
})
