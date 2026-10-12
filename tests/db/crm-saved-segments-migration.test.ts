import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SEGMENT_AUTO_TAG_STATUSES, SEGMENT_QUALITY_FLAGS } from "@/lib/crm/saved-segments"
import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

// 저장 세그먼트 마이그레이션(세그먼트 허브, C안 ②, 2026-09-25) — SQL 텍스트 계약.
// 멱등 구문 · 두 표 모두 RLS deny-all(정책 없음 — service_role 만, 교차 리뷰 [10]) · 활성 자동 라벨 부분 유니크 ·
// CHECK 값이 앱 상수와 같음 · 실행 결과 갱신이 수정 시각을 올리지 않는 트리거 · 마커 조회 인덱스가 실제 쿼리
// (created_by = 마커 + id 정렬)에 쓰이는 모양(교차 리뷰 [36]) · schema-contract 프로브 등록.

const FILE = "supabase/migrations/20260925_crm_saved_segments.sql"
const sql = readFileSync(join(process.cwd(), FILE), "utf8")

function quotedList(values: readonly string[]) {
  return values.map((value) => `'${value}'`)
}

describe("20260925_crm_saved_segments.sql", () => {
  it("모든 생성 구문이 멱등이다", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.crm_saved_segments")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.crm_saved_segment_daily")
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/)
    expect(sql).toContain("DROP TRIGGER IF EXISTS crm_saved_segments_updated_at ON public.crm_saved_segments")
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins manage CRM saved segments" ON public.crm_saved_segments')
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.crm_saved_segments_touch_updated_at()")
  })

  it("두 표 모두 RLS deny-all — 정책이 없어 service_role 만 읽고 쓴다(예전 활성 관리자 정책은 DROP 으로 지운다)", () => {
    expect(sql).toContain("ALTER TABLE public.crm_saved_segments ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain("ALTER TABLE public.crm_saved_segment_daily ENABLE ROW LEVEL SECURITY")
    // 어떤 표에도 정책을 만들지 않는다 — is_active_admin() 은 역할을 보지 않아 '내 것'·자동 태그 관리자 전용을 우회한다.
    expect(sql).not.toMatch(/CREATE POLICY/i)
    expect(sql).not.toMatch(/USING \(is_active_admin\(\)\)/)
    // 이미 예전 정책이 만들어진 환경을 위해 DROP 은 남긴다(재실행 무해).
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins manage CRM saved segments" ON public.crm_saved_segments;')
    // 표에는 REVOKE 를 걸지 않는다(함수·뷰 전용 관례).
    expect(sql).not.toMatch(/REVOKE/i)
  })

  it("앱은 두 표를 service role 저장소로만 읽고 쓴다(브라우저·세션 클라이언트 경로 없음 — deny-all 전제)", () => {
    const repo = readFileSync(join(process.cwd(), "lib/repositories/crm-saved-segments.ts"), "utf8")
    expect(repo).toContain('import { createSupabaseAdminClient } from "@/lib/supabase/admin"')
    expect(repo).not.toMatch(/createSupabase(Browser|Server)Client|@\/lib\/supabase\/(browser|server)/)
  })

  it("활성 자동 라벨은 하나만 — lower(라벨) 부분 유니크, 켜기 제약(팀·라벨·보관 안 됨)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS crm_saved_segments_auto_tag_label_uidx\s+ON public\.crm_saved_segments \(lower\(auto_tag_label\)\)\s+WHERE auto_tag_enabled AND archived_at IS NULL/
    )
    expect(sql).toContain(
      "NOT auto_tag_enabled OR (auto_tag_label IS NOT NULL AND visibility = 'team' AND archived_at IS NULL)"
    )
    expect(sql).toContain("CHECK (visibility IN ('team', 'mine'))")
  })

  it("상태·플래그 CHECK 값이 앱 상수(lib/crm/saved-segments.ts)와 같다", () => {
    const statusLists = [...sql.matchAll(/IN \(\s*('off'[^)]*)\)/g)].map((match) =>
      match[1].split(",").map((value) => value.trim())
    )
    // 세그먼트 last_run_status · 일별 auto_tag_status 두 곳.
    expect(statusLists).toHaveLength(2)
    for (const list of statusLists) expect(list).toEqual(quotedList(SEGMENT_AUTO_TAG_STATUSES))
    const flags = /flags <@ ARRAY\[([^\]]*)\]/.exec(sql)?.[1].split(",").map((value) => value.trim())
    expect(flags).toEqual(quotedList(SEGMENT_QUALITY_FLAGS))
  })

  it("일별 표는 (segment_id, snapshot_date) PK · 원천별 합 = 총계 · 세그먼트 삭제 시 함께 삭제", () => {
    expect(sql).toContain("PRIMARY KEY (segment_id, snapshot_date)")
    expect(sql).toContain("total = lead_count + neo_account_count + customer_count")
    expect(sql).toContain("REFERENCES public.crm_saved_segments(id) ON DELETE CASCADE")
    expect(sql).toContain("CHECK (run_trigger IN ('cron', 'manual'))")
  })

  it("실행 결과(last_*) 갱신만으로는 수정 시각을 올리지 않는다", () => {
    const fn = /crm_saved_segments_touch_updated_at\(\)[\s\S]*?\$\$;/.exec(sql)?.[0] ?? ""
    expect(fn).toContain("IS DISTINCT FROM")
    expect(fn).not.toMatch(/last_count|last_evaluated_at|last_run_status|last_run_detail/)
    expect(fn).toMatch(/NEW\.spec, NEW\.spec_version, NEW\.spec_hash, NEW\.visibility/)
  })

  it("자동 태그 떼기용 마커 인덱스는 실제 조회(created_by = 마커 + id 정렬)를 덮는 일반 인덱스 — LIKE 부분 인덱스 금지", () => {
    // = 상수 조건이 LIKE 술어를 함의한다는 것을 플래너가 증명하지 못해 부분 인덱스는 쓰이지 않는다.
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS crm_customer_tags_created_by_idx\s+ON public\.crm_customer_tags \(created_by, id\);/)
    expect(sql).not.toMatch(/CREATE INDEX[^;]*crm_customer_tags[^;]*WHERE/)
    expect(sql).toContain("DROP INDEX IF EXISTS public.crm_customer_tags_auto_created_by_idx;")
    // Compass(crm 스키마)에는 아무것도 만들지 않는다.
    expect(sql).not.toMatch(/\bcrm\.\w+/)
    // 저장소의 마커 조회가 인덱스 열 순서 그대로(동등 → id 정렬)인지 고정한다.
    const tags = readFileSync(join(process.cwd(), "lib/repositories/crm-customer-tags.ts"), "utf8").replace(/\r\n/g, "\n")
    const loader = /async function loadMarkerTagRows[\s\S]*?\n}\n/.exec(tags)?.[0] ?? ""
    expect(loader).toContain('.eq("created_by", marker)')
    expect(loader).toContain('.order("id", { ascending: true })')
    expect(loader).not.toMatch(/\.like\(/)
  })

  it("schema-contract 에 등록 — 마이그레이션 목록 끝 + 표 프로브 2개(anon 프로브 없음)", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probes = SCHEMA_PROBES.filter((probe) => probe.migration === FILE)
    expect(probes.map((probe) => (probe.kind === "table" ? probe.table : probe.kind)).sort()).toEqual([
      "crm_saved_segment_daily",
      "crm_saved_segments",
    ])
    expect(probes.every((probe) => probe.kind === "table")).toBe(true)
  })
})
