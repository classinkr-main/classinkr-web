import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

// Meta 리드애즈 단일 수신 마이그레이션 계약(2026-09-15, 아직 미적용).
//
// 이 파일은 DB 에 붙지 않는다. SQL 텍스트를 읽어 ① 20260902 하드닝 규칙(search_path·PUBLIC 회수)
// ② RLS deny-all ③ 교차 스키마 쓰기 0건·public.leads DDL 0건 ④ crm 가드 ⑤ 뷰 PII 최소
// ⑥ schema-contract 프로브 등재를 고정한다. 식 자체의 동작(모드 전이·원장·폴백·건강 지표)은 일회용
// 로컬 PG 시나리오(tests/fixtures/meta-leadgen-single-receiver/run-local.sh)가 확인한다 — 이 저장소에는
// PG 드라이버가 없어 vitest 에서 돌리지 않는다.
const MIGRATION = "supabase/migrations/20260915_meta_leadgen_single_receiver.sql"
const FIXTURES = "tests/fixtures/meta-leadgen-single-receiver"
const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8")
const code = sql
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")

const TABLES = [
  "meta_leadgen_cutover",
  "meta_leadgen_cutover_history",
  "meta_lead_mirror_state",
  "meta_lead_mirror_ledger",
  "meta_leadgen_receipts",
]
const VIEWS = [
  "compass_meta_submissions_v",
  "compass_meta_leadgen_failures_v",
  "home_meta_leadgen_receipts_v",
  "home_meta_receiver_health_v",
]
/** 함수 이름 → pg_proc 식별 인자(oidvectortypes 형식, 로컬 PG 17 에서 확인). */
const FUNCTIONS: Record<string, string> = {
  meta_leadgen_set_mode: "text, text, text, timestamp with time zone",
  meta_leadgen_set_options: "jsonb, text, text",
  meta_lead_mirror_eligible: "meta_leadgen_cutover, timestamp with time zone",
  meta_leadgen_record_receipts: "jsonb, text",
  meta_lead_mirror_adopt: "timestamp with time zone",
  meta_lead_mirror_apply: "jsonb",
  meta_lead_fallback_claim: "integer",
  meta_lead_fallback_finish: "text, text, uuid, text",
  meta_lead_mirror_mark_side_effects: "text[]",
  meta_lead_mirror_health: "",
}
/** security definer 가 아닌 함수 — 표를 쓰지 않는 순수 판정(definer 함수 안에서만 불린다). */
const INVOKER_FUNCTIONS = new Set(["meta_lead_mirror_eligible"])

const SQL_TYPE_ALIASES: Record<string, string> = {
  timestamptz: "timestamp with time zone",
  "public.meta_leadgen_cutover": "meta_leadgen_cutover",
}
/** revoke/grant 목록의 `public.f(timestamptz, text[])` → oidvectortypes 형식. */
function normalizeArgs(args: string): string {
  return args
    .split(",")
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => SQL_TYPE_ALIASES[arg] ?? arg)
    .join(", ")
}

/** `create or replace function public.x(...) returns ... as $$` 머리(본문 전) — 함수별. */
function functionHeaders(): Map<string, string> {
  const headers = new Map<string, string>()
  const pattern = /create or replace function public\.(\w+)\(([\s\S]*?)\bas \$\$/g
  for (const match of code.matchAll(pattern)) headers.set(match[1], match[0])
  return headers
}

/** `<verb> ... on function a(...), b(...) <from|to> <roles>;` 문 하나의 서명 목록. */
function functionAclStatement(verb: "revoke all" | "grant execute"): { signatures: Map<string, string>; roles: string } {
  const pattern = new RegExp(`${verb} on function ([\\s\\S]*?)\\s(from|to) ([\\w, ]+);`)
  const match = code.match(pattern)
  if (!match) throw new Error(`${verb} on function 문을 찾지 못했다`)
  const signatures = new Map<string, string>()
  for (const sig of match[1].matchAll(/public\.(\w+)\(([^)]*)\)/g)) signatures.set(sig[1], normalizeArgs(sig[2]))
  return { signatures, roles: match[3].trim() }
}

describe("20260915 meta_leadgen_single_receiver — 적용 순서·동작 불변", () => {
  it("머리 주석에 적용 순서(Compass 배포 → 이 파일, 먼저 했으면 재실행)와 미적용 표시가 있다", () => {
    const header = sql.slice(0, sql.indexOf("-- ─── A)"))
    expect(header).toContain("아직 어느 DB 에도 적용하지 않았다")
    expect(header).toMatch(/Compass\(classinkr-main\/crm\) 배포[\s\S]*이 파일 실행/)
    expect(header).toContain("먼저 적용했다면 배포 뒤 이 파일을 한 번 더 실행한다(멱등)")
    expect(header).toContain("20260914_compass_integration_bridge.sql")
  })

  it("모드 기본값은 admin, 폴백 기한 기본 120분, 부수효과 토글은 전부 켠다(= 지금 웹훅)", () => {
    expect(code).toContain("mode                   text not null default 'admin'")
    expect(code).toContain("fallback_after_minutes integer not null default 120 check (fallback_after_minutes between 30 and 1440)")
    expect(code).toContain(
      `'{"leadCreatedNotification": true, "subscriberUpsert": true, "automationOnSubmit": true, "externalForwards": true}'::jsonb`
    )
    expect(code).toContain("insert into public.meta_leadgen_cutover (id) values ('default') on conflict (id) do nothing;")
  })

  it("멱등이다 — 표·인덱스는 if not exists, 함수·뷰는 create or replace", () => {
    expect(code).not.toMatch(/create table (?!if not exists)/i)
    expect(code).not.toMatch(/create index (?!if not exists)/i)
    expect(code).not.toMatch(/create (function|view) /i)
    expect(code).not.toMatch(/\bdrop\s/i)
  })
})

describe("20260915 meta_leadgen_single_receiver — 교차 스키마·hot 테이블", () => {
  it("crm 스키마에 쓰지 않는다(crm DDL·DML 없음 — crm 은 뷰로만 읽는다)", () => {
    expect(code).not.toMatch(/(insert\s+into|update|delete\s+from|alter\s+table|create\s+table(\s+if\s+not\s+exists)?|create\s+index[^;]*\son)\s+crm\./i)
    expect(code).not.toMatch(/truncate\s+crm\./i)
  })

  it("public.leads 의 컬럼·인덱스·제약·트리거·FK 를 바꾸지 않는다(insert 는 미러 적용 RPC 한 곳)", () => {
    expect(code).not.toMatch(/alter\s+table\s+public\.leads\b/i)
    expect(code).not.toMatch(/\son\s+public\.leads\b/i)
    expect(code).not.toMatch(/references\s+public\.leads\b/i)
    expect(code.match(/insert into public\.leads\b/g)).toHaveLength(1)
    expect(code).not.toMatch(/(update|delete\s+from)\s+public\.leads\b/i)
  })

  it("원장에 FK 가 없다(hot 테이블 RI 트리거·잠금 회피)", () => {
    expect(code).not.toMatch(/\breferences\b/i)
  })

  it("crm 을 읽는 뷰 둘은 to_regclass 가드 안에서만 만들고, 없으면 NOTICE 로 건너뛴다", () => {
    for (const [view, source] of [
      ["compass_meta_submissions_v", "crm.meta_leadgen_submissions"],
      ["compass_meta_leadgen_failures_v", "crm.meta_leadgen_failures"],
    ]) {
      const guard = new RegExp(
        `if to_regclass\\('${source.replace(".", "\\.")}'\\) is not null then[\\s\\S]*?create or replace view public\\.${view} as[\\s\\S]*?raise notice '${view}: created';\\s*else\\s*raise notice '${view}: ${source.replace(".", "\\.")} missing`
      )
      expect(code, view).toMatch(guard)
    }
  })

  it("home_* 역브리지 뷰는 public 객체만 읽는다", () => {
    const receipts = code.match(/create or replace view public\.home_meta_leadgen_receipts_v as[\s\S]*?;/)?.[0] ?? ""
    const health = code.match(/create or replace view public\.home_meta_receiver_health_v as[\s\S]*?;/)?.[0] ?? ""
    expect(receipts).toContain("from public.meta_leadgen_receipts")
    expect(health).toContain("public.meta_lead_mirror_health()")
    expect(receipts + health).not.toContain("crm.")
  })
})

describe("20260915 meta_leadgen_single_receiver — 뷰 PII 최소", () => {
  const submissionsView = code.match(/create or replace view public\.compass_meta_submissions_v as[\s\S]*?from crm\.meta_leadgen_submissions s/)?.[0] ?? ""
  const allowlist = [...(submissionsView.match(/any \(array\[([\s\S]*?)\]\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1])

  it("form_answers 허용 키에 신원(이름·전화·이메일)·주소가 없다", () => {
    expect(allowlist.length).toBeGreaterThan(20)
    for (const forbidden of [
      "full_name", "name", "first_name", "last_name", "이름", "성함",
      "phone", "phone_number", "연락처", "전화번호",
      "email", "work_email", "이메일",
      "address", "street_address", "주소",
    ]) {
      expect(allowlist, forbidden).not.toContain(forbidden)
    }
  })

  it("form_answers 는 45일 창 안에서만 연다", () => {
    expect(submissionsView).toContain("s.received_at >= now() - interval '45 days'")
  })

  it("실패 보관 뷰는 message·page·form 을 내보내지 않는다", () => {
    const failures = code.match(/create or replace view public\.compass_meta_leadgen_failures_v as\s+select ([^\n]+)/)?.[1]
    expect(failures?.trim()).toBe("leadgen_id, lead_specific, first_seen_at, last_seen_at, attempts")
  })
})

describe("20260915 meta_leadgen_single_receiver — 권한(20260902 하드닝 규칙)", () => {
  const headers = functionHeaders()

  it("함수 10개를 만든다", () => {
    expect([...headers.keys()].sort()).toEqual(Object.keys(FUNCTIONS).sort())
  })

  it("모든 함수가 search_path 를 빈 값으로 고정한다", () => {
    for (const [name, header] of headers) {
      expect(header, name).toContain("set search_path = ''")
    }
  })

  it("상태를 읽고 쓰는 함수는 security definer, 순수 판정 함수만 invoker 다", () => {
    for (const [name, header] of headers) {
      expect(/\bsecurity definer\b/.test(header), name).toBe(!INVOKER_FUNCTIONS.has(name))
    }
  })

  it("함수 10개 전부 PUBLIC·anon·authenticated 실행을 회수하고 service_role 에만 준다", () => {
    const revoke = functionAclStatement("revoke all")
    const grant = functionAclStatement("grant execute")
    expect(revoke.roles).toBe("public, anon, authenticated")
    expect(grant.roles).toBe("service_role")
    expect(Object.fromEntries(revoke.signatures)).toEqual(FUNCTIONS)
    expect(Object.fromEntries(grant.signatures)).toEqual(FUNCTIONS)
  })

  it("새 표 5개는 RLS deny-all 이고 정책을 만들지 않는다", () => {
    const created = [...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])
    expect(created.sort()).toEqual([...TABLES].sort())
    for (const table of TABLES) {
      expect(code, table).toContain(`alter table public.${table} enable row level security;`)
    }
    expect(code).not.toMatch(/create policy/i)
  })

  it("표·뷰는 anon·authenticated 전권 회수, service_role 은 select 만(심장박동 표만 update)", () => {
    expect(code).toMatch(
      /revoke all on public\.meta_leadgen_cutover, public\.meta_leadgen_cutover_history, public\.meta_lead_mirror_state,\s+public\.meta_lead_mirror_ledger, public\.meta_leadgen_receipts,\s+public\.home_meta_leadgen_receipts_v, public\.home_meta_receiver_health_v from anon, authenticated, service_role;/
    )
    expect(code).toContain("grant select, update on public.meta_lead_mirror_state to service_role;")
    expect(code).not.toMatch(/grant [^;]*\b(insert|delete|truncate|all)\b[^;]* to service_role/i)
    for (const view of ["compass_meta_submissions_v", "compass_meta_leadgen_failures_v"]) {
      expect(code, view).toContain(`execute 'revoke all on public.${view} from anon, authenticated';`)
      expect(code, view).toContain(`execute 'grant select on public.${view} to service_role';`)
    }
    expect(code).not.toMatch(/\bto (anon|authenticated|public)\b/i)
  })

  it("끝에서 PostgREST 스키마 캐시를 갱신한다", () => {
    expect(code.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
})

describe("20260915 meta_leadgen_single_receiver — schema-contract 등재", () => {
  const probes = SCHEMA_PROBES.filter((probe) => probe.migration === MIGRATION)

  it("계약 마이그레이션 목록에 있고, 이 파일의 프로브는 전부 warning 이다", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(MIGRATION)
    expect(probes.length).toBeGreaterThan(0)
    for (const probe of probes) expect(probe.severity, JSON.stringify(probe)).toBe("warning")
  })

  it("표 5개·뷰 4개를 테이블 프로브로 본다", () => {
    const tables = probes.flatMap((probe) => (probe.kind === "table" ? [probe.table] : []))
    expect(tables.sort()).toEqual([...TABLES, ...VIEWS].sort())
  })

  it("건강 뷰 프로브는 계약 컬럼 6개 전부를 요청한다(Compass hourly-sync 가 읽는 한 줄)", () => {
    const health = probes.find((probe) => probe.kind === "table" && probe.table === "home_meta_receiver_health_v")
    expect(health?.kind === "table" && health.columns).toEqual([
      "mode", "heartbeat_at", "stale_minutes", "at_risk", "admin_only_saved", "mirror_backlog_30m",
    ])
  })

  it("인자 있는 함수 9개는 실행하지 않고 카탈로그로 본다 — 식별 인자가 마이그레이션 서명과 같다", () => {
    const rpcs = probes.flatMap((probe) => (probe.kind === "rpc" ? [probe] : []))
    const expected = Object.entries(FUNCTIONS).filter(([, args]) => args !== "")
    expect(rpcs.map((probe) => [probe.functionName, probe.catalogIdentityTypes])).toEqual(expected)
    for (const probe of rpcs) {
      expect(probe.serviceRoleOnly, probe.functionName).toBe(true)
      expect(probe.args, probe.functionName).toBeUndefined()
      // scripts/check-db-schema.ts 의 식별 인자 허용 문자(점 없음)와 맞춘다.
      expect(probe.catalogIdentityTypes, probe.functionName).toMatch(/^[a-z0-9_[\], ]+$/i)
    }
  })
})

describe("20260915 meta_leadgen_single_receiver — 로컬 PG 시나리오 픽스처", () => {
  it("러너가 사본이 아니라 저장소 마이그레이션 파일을 적용한다", () => {
    const runner = readFileSync(join(process.cwd(), FIXTURES, "run-local.sh"), "utf8")
    expect(runner).toContain("supabase/migrations/20260915_meta_leadgen_single_receiver.sql")
    expect(existsSync(join(process.cwd(), FIXTURES, "20-admin-migration.sql"))).toBe(false)
  })

  it("러너는 새 initdb 클러스터를 127.0.0.1 에만 띄워 접속한다(운영·공유 DB env 를 읽지 않는다)", () => {
    const runner = readFileSync(join(process.cwd(), FIXTURES, "run-local.sh"), "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n")
    expect(runner).toContain('initdb -D "$WORK/data"')
    expect(runner).toContain("listen_addresses=127.0.0.1")
    expect(runner).toContain('psql -h 127.0.0.1 -p "$PORT"')
    expect(runner).not.toMatch(/DATABASE_URL|SUPABASE|\$PGHOST|\$\{PGHOST/)
  })

  it("시나리오 파일과 README 가 모두 있다", () => {
    for (const file of [
      "README.md", "00-stub.sql", "10-compass-schema.sql", "15-compass-statements.sql", "30-b-regression.sql",
      "31-concurrency.sh", "40-final-scenarios.sql", "50-runbook-checks.sql", "60-migration-conventions.sql",
    ]) {
      expect(existsSync(join(process.cwd(), FIXTURES, file)), file).toBe(true)
    }
  })
})
