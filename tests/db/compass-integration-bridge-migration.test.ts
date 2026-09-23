import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

// Compass 연동 브리지 2차 마이그레이션 계약(2026-09-14, 아직 미적용).
//
// 이 파일은 DB 에 붙지 않는다. SQL 텍스트를 읽어 ① 전화 키 함수가 Compass normPhone 과 같은
// 결과를 내는지(픽스처 + JS 에뮬레이션) ② crm 객체 부재 시 실패하지 않는지(to_regclass 가드)
// ③ 모든 뷰가 service_role 전용인지 ④ 역브리지 뷰가 PII 원문을 내보내지 않는지 ⑤ 참조 컬럼이
// 서울 실 카탈로그에 있는지를 고정한다.
const MIGRATION = "supabase/migrations/20260914_compass_integration_bridge.sql"
const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8")
const code = sql
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")

// ─── 참조 사본 ──────────────────────────────────────────────────────────────

/** Compass lib/format.ts normPhone(전화 저장 정본, integrate/2026-09-14) 사본 — 비교 기준. */
function compassNormPhone(p: string | null | undefined): string | null {
  let d = (p ?? "").replace(/\D/g, "")
  if (!d) return null
  if (d.startsWith("0082")) d = d.slice(4)
  else if (d.startsWith("82")) d = d.slice(2)
  else if (d.startsWith("10") && d.length >= 10) return `0${d}`
  else return d
  return d.startsWith("0") ? d : `0${d}`
}

/** 마이그레이션의 norm_phone_key SQL 식을 줄 단위로 옮긴 JS 에뮬레이션(substr 는 1-based). */
function sqlNormPhoneKey(p: string | null): string | null {
  const d = (p ?? "").replace(/[^0-9]/g, "")
  const substr = (from: number) => d.slice(from - 1)
  if (d === "") return null
  if (d.startsWith("0082")) return substr(5).startsWith("0") ? substr(5) : `0${substr(5)}`
  if (d.startsWith("82")) return substr(3).startsWith("0") ? substr(3) : `0${substr(3)}`
  if (d.startsWith("10") && d.length >= 10) return `0${d}`
  return d
}

/** 서울 실 카탈로그(2026-09-14T08:59Z public_borrow_candidate_columns) + Compass schema.sql 계약(§4-3). */
const SOURCE_COLUMNS: Record<string, string[]> = {
  "public.admin_profiles": [
    "user_id", "display_name", "role", "status", "invited_by", "last_login_at", "created_at", "updated_at",
    "branch_name", "crm_team_role", "crm_assignable", "crm_owner_key", "crm_owner_aliases", "neo_owner_id",
    "crm_sort_order", "capabilities", "nav_preset", "nav_overrides",
  ],
  "public.crm_neo_customer_snapshots": [
    "source_system", "account_id", "account_name", "owner_id", "owner_name", "phone", "uid", "region_label",
    "balance", "expire_at", "last_class_at", "order_amount", "order_count", "has_eeo", "risk_level",
    "risk_reasons", "expire_in_days", "risk_confidence", "freshness_label", "account_synced_at",
    "shroff_synced_at", "opportunity_synced_at", "source_synced_at", "source_run_ids", "source_refs",
    "is_partial", "partial_reason", "is_stale", "stale_at", "calculated_at", "created_at", "updated_at",
    "billing_mode", "daily_burn", "depletion_in_days", "burn_event_count", "burn_confidence",
  ],
  "public.leads": [
    "id", "source", "name", "org", "role", "size", "email", "phone", "message", "branch", "status", "notes",
    "utm_source", "utm_medium", "utm_campaign", "created_at", "updated_at", "follow_up_at", "assigned_to",
    "score", "source_detail", "lead_magnet", "utm_term", "utm_content", "gclid", "fbclid", "msclkid", "ttclid",
    "landing_page", "current_page", "referrer", "user_id", "confirmed_at", "anonymous_id", "last_inflow_at",
  ],
  "public.channel_conversations": [
    "id", "name", "email", "phone", "state", "tags", "first_question", "matched_lead_id", "matched_org",
    "last_message_at", "transcript", "synced_at", "created_at", "updated_at", "message_count", "last_message_text",
  ],
  "crm.lead_refs": ["id", "lead_id", "system", "external_id", "matched_by", "created_by", "created_at"],
  "crm.lead_contact_facts_v": [
    "lead_id", "latest_inflow_at", "first_attempt_at", "last_attempt_at", "first_connected_at",
    "last_connected_at", "missed_since_inflow", "sms_since_inflow", "bd_contact_at",
  ],
}

// ─── 뷰 파서(이 마이그레이션 형식 전용) ─────────────────────────────────────

interface ParsedView {
  name: string
  source: string
  alias: string | null
  items: string[]
  columns: string[]
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const ch of list) {
    if (ch === "(") depth += 1
    if (ch === ")") depth -= 1
    if (ch === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function outputName(item: string): string {
  const aliased = item.match(/\s+as\s+(\w+)$/i)
  if (aliased) return aliased[1]
  const dotted = item.match(/(?:\w+\.)?(\w+)$/)
  return dotted ? dotted[1] : item
}

function parseViews(text: string): ParsedView[] {
  const pattern = /create or replace view public\.(\w+) as\s+select\s+([\s\S]*?)\n\s*from\s+([\w.]+)(?:\s+(\w+))?/g
  const views: ParsedView[] = []
  for (const match of text.matchAll(pattern)) {
    const items = splitTopLevel(match[2])
    views.push({
      name: match[1],
      source: match[3],
      alias: match[4] && !/^(where|group)$/i.test(match[4]) ? match[4] : null,
      items,
      columns: items.map(outputName),
    })
  }
  return views
}

const views = parseViews(code)
const view = (name: string) => {
  const found = views.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`view ${name} not found in ${MIGRATION}`)
  return found
}

/** 뷰가 원천에서 읽는 컬럼 — 별칭 접두(s.phone) 또는 접두 없는 식별자(crm 뷰). */
function referencedColumns(parsed: ParsedView): string[] {
  const refs = new Set<string>()
  for (const item of parsed.items) {
    const body = item.replace(/\s+as\s+\w+$/i, "")
    if (parsed.alias) {
      for (const m of body.matchAll(new RegExp(`\\b${parsed.alias}\\.(\\w+)`, "g"))) refs.add(m[1])
    } else {
      refs.add(body.trim())
    }
  }
  return [...refs]
}

const FIXTURES: Array<[string | null, string | null]> = (() => {
  const block = sql.slice(sql.indexOf("select * from (values"), sql.indexOf(") as t(input, expected)"))
  const literal = (token: string) => (token === "null" ? null : token.slice(1, -1))
  return [...block.matchAll(/\(\s*(null|'[^']*')\s*,\s*(null|'[^']*')\s*\)/g)].map(
    (m) => [literal(m[1]), literal(m[2])] as [string | null, string | null]
  )
})()

/** 어드민 동기화(lib/compass/lead-contact-sync.ts)의 매칭 최소 키 길이 — 소스에서 읽어 경계를 맞춘다(export 되지 않은 상수). */
const MIN_PHONE_KEY_LENGTH = (() => {
  const source = readFileSync(join(process.cwd(), "lib/compass/lead-contact-sync.ts"), "utf8")
  const match = source.match(/const MIN_PHONE_KEY_LENGTH = (\d+)/)
  if (!match) throw new Error("MIN_PHONE_KEY_LENGTH not found in lib/compass/lead-contact-sync.ts")
  return Number(match[1])
})()

/** 뷰·인덱스의 조인 가능 키 가드를 옮긴 JS 에뮬레이션 — 9자리 미만 키는 null(어느 phone_key 와도 같지 않다). */
function sqlJoinablePhoneKey(p: string | null): string | null {
  const key = sqlNormPhoneKey(p)
  return key !== null && key.length >= 9 ? key : null
}

// ─── 테스트 ────────────────────────────────────────────────────────────────

describe("20260914 Compass 연동 브리지 — 적용 순서·안전장치", () => {
  it("머리 주석에 미적용 상태와 적용 순서(Compass 배포 → 서울 프로젝트)를 적는다", () => {
    const header = sql.slice(0, sql.indexOf("create or replace function"))
    expect(header).toContain("아직 어느 DB 에도 적용하지 않았다")
    expect(header).toContain("pxbrsbovoobowpfarxmn")
    expect(header.indexOf("Compass(classinkr-main/crm) 배포")).toBeLessThan(header.indexOf("pxbrsbovoobowpfarxmn"))
  })

  it("crm 객체는 to_regclass 가드가 있는 DO 블록 안에서만 참조한다", () => {
    expect(code).toContain("if to_regclass('crm.lead_refs') is not null then")
    expect(code).toContain("if to_regclass('crm.lead_contact_facts_v') is not null then")
    // comment on … is '…' 설명 문자열은 식별자 참조가 아니라 뺀다.
    const outsideDoBlocks = code
      .replace(/do \$\$[\s\S]*?end \$\$;/g, "")
      .replace(/comment on [\s\S]*?';/g, "")
    expect(outsideDoBlocks).not.toMatch(/\bcrm\./)
  })

  it("crm DDL·데이터 변경·삭제를 하지 않는다(추가만)", () => {
    expect(code).not.toMatch(/\b(?:create|alter|drop)\s+(?:table|view|index|function)[^;]*\bcrm\./i)
    expect(code).not.toMatch(/\binsert\s+into\b|\bupdate\s+\w+\.\w+\s+set\b|\bdelete\s+from\b/i)
    expect(code).not.toMatch(/\bdrop\s+/i)
    expect(code).not.toMatch(/\btruncate\b/i)
  })

  it("SCHEMA_CONTRACT_MIGRATIONS 에 등재하고 새 뷰마다 warning 프로브를 둔다", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(MIGRATION)
    for (const parsed of views) {
      const probe = SCHEMA_PROBES.find((p) => p.kind === "table" && p.table === parsed.name)
      expect(probe, parsed.name).toBeDefined()
      if (probe?.kind !== "table") continue
      expect(probe.migration).toBe(MIGRATION)
      expect(probe.severity).toBe("warning")
      for (const column of probe.columns) expect(parsed.columns, `${parsed.name}.${column}`).toContain(column)
    }
  })
})

describe("public.norm_phone_key — Compass normPhone 등가", () => {
  it("immutable parallel safe SQL 함수이고 search_path 를 고정한다", () => {
    expect(code).toMatch(
      /create or replace function public\.norm_phone_key\(p text\) returns text\s+language sql immutable parallel safe\s+set search_path = ''/
    )
  })

  it("본문은 R6 B-3 식 그대로다", () => {
    for (const line of [
      "when d = '' then null",
      "when d like '0082%' then case when substr(d,5) like '0%' then substr(d,5) else '0'||substr(d,5) end",
      "when d like '82%'   then case when substr(d,3) like '0%' then substr(d,3) else '0'||substr(d,3) end",
      "when d like '10%' and length(d) >= 10 then '0'||d",
      "else d end",
      "from (select regexp_replace(coalesce(p,''), '[^0-9]', '', 'g') as d) s",
    ]) {
      expect(code).toContain(line)
    }
  })

  it("적용 시 자기검증 블록이 진리표 22개 이상을 PG 에서 확인한다", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(22)
    expect(code).toContain("if actual is distinct from r.expected then")
    expect(code).toContain("raise exception 'norm_phone_key parity failed")
    // 조인 누락을 내던 세 형태(원문에 K식을 쓰면 갈라지는 것)가 반드시 들어 있어야 한다.
    const inputs = FIXTURES.map(([input]) => input)
    expect(inputs).toEqual(expect.arrayContaining(["+82 010-1234-5678", "0082-010-1234-5678", "1012345678"]))
    expect(inputs).toContain(null)
  })

  it.each(FIXTURES)("%j → %j 가 Compass normPhone·SQL 에뮬레이션과 모두 같다", (input, expected) => {
    expect(compassNormPhone(input)).toBe(expected)
    expect(sqlNormPhoneKey(input)).toBe(expected)
    // 저장값(normPhone 결과)에 다시 걸어도 같은 키 — crm.leads.phone_key 와 조인 가능.
    expect(sqlNormPhoneKey(expected)).toBe(expected)
  })

  it("세 테이블에 같은 함수로 표현식 인덱스를 둔다 — 뷰의 조건·식과 글자가 같아야 플래너가 쓴다", () => {
    expect(code).toMatch(
      /create index if not exists leads_norm_phone_key_idx\s+on public\.leads \(public\.norm_phone_key\(phone\)\)\s+where phone is not null and length\(public\.norm_phone_key\(phone\)\) >= 9;/
    )
    expect(code).toMatch(
      /create index if not exists channel_conversations_norm_phone_key_idx\s+on public\.channel_conversations \(public\.norm_phone_key\(phone\)\)\s+where phone is not null and length\(public\.norm_phone_key\(phone\)\) >= 9;/
    )
    // NEO 스냅샷은 행을 거르지 않고 phone_key 만 null 로 두므로, 뷰의 case 식 그대로를 인덱스 식으로 둔다.
    expect(code).toMatch(
      /create index if not exists crm_neo_customer_snapshots_norm_phone_key_idx\s+on public\.crm_neo_customer_snapshots\s+\(\(case when length\(public\.norm_phone_key\(phone\)\) >= 9 then public\.norm_phone_key\(phone\) end\)\);/
    )
  })

  it("휴대폰 픽스처는 합성 번호다 — 가입자 번호로 쓰지 않는 국번(0000–1999)만 쓴다", () => {
    const mobiles = FIXTURES.flatMap(([, expected]) => (expected && /^010\d{8}$/.test(expected) ? [expected] : []))
    expect(mobiles.length).toBeGreaterThan(0)
    for (const mobile of mobiles) expect(Number(mobile.slice(3, 7)), mobile).toBeLessThan(2000)
  })

  it("EXECUTE 를 회수하지 않는다 — 인덱스 식이 쓰기 역할 권한으로 평가된다", () => {
    expect(code).not.toMatch(/revoke[^;]*function public\.norm_phone_key/i)
  })
})

describe("조인 가능 키 가드 — 자리표시 번호는 전화 키로 붙지 않는다", () => {
  const guards = [...code.matchAll(/length\(public\.norm_phone_key\((?:\w\.)?phone\)\) >= (\d+)/g)]

  it("가드 경계는 어드민 동기화 MIN_PHONE_KEY_LENGTH 와 같다", () => {
    expect(MIN_PHONE_KEY_LENGTH).toBe(9)
    expect(guards.length).toBeGreaterThanOrEqual(6)
    for (const guard of guards) expect(Number(guard[1]), guard[0]).toBe(MIN_PHONE_KEY_LENGTH)
  })

  it("전화 키를 내보내는 역브리지 뷰는 모두 가드를 건다", () => {
    const keyed = views.filter((parsed) => parsed.columns.includes("phone_key"))
    expect(keyed.map((parsed) => parsed.name).sort()).toEqual(
      ["home_channel_contacts_v", "home_neo_accounts_v", "home_site_leads_v"].sort()
    )
    for (const parsed of keyed) {
      const start = code.indexOf(`create or replace view public.${parsed.name}`)
      const body = code.slice(start, code.indexOf(";", start))
      expect(body, parsed.name).toMatch(/length\(public\.norm_phone_key\(\w\.phone\)\) >= 9/)
    }
  })

  it("전화 키 표현식 인덱스는 모두 가드를 건다", () => {
    const indexes = [...code.matchAll(/create index if not exists (\w+_norm_phone_key_idx)([^;]*);/g)]
    expect(indexes.map((m) => m[1]).sort()).toEqual(
      ["channel_conversations_norm_phone_key_idx", "crm_neo_customer_snapshots_norm_phone_key_idx", "leads_norm_phone_key_idx"].sort()
    )
    for (const [, name, body] of indexes) expect(body, name).toContain("length(public.norm_phone_key(phone)) >= 9")
  })

  it.each([
    ["0", null],
    ["000-0000", null],
    ["-", null],
    ["1588-1234", null],
    ["82-0", null],
    ["02-795-6720", "027956720"],
    ["+82 10-1234-5678", "01012345678"],
  ] as Array<[string, string | null]>)("%j → 조인 키 %j", (input, expected) => {
    expect(sqlJoinablePhoneKey(input)).toBe(expected)
  })
})

describe("뷰 컬럼 계약(SPEC §4-4)", () => {
  const expected: Record<string, { source: string; columns: string[] }> = {
    compass_lead_refs_v: {
      source: "crm.lead_refs",
      columns: ["lead_id", "system", "external_id", "matched_by", "created_at"],
    },
    compass_lead_contact_v: {
      source: "crm.lead_contact_facts_v",
      columns: [
        "lead_id", "latest_inflow_at", "first_attempt_at", "last_attempt_at",
        "first_connected_at", "last_connected_at", "missed_since_inflow", "sms_since_inflow",
      ],
    },
    home_owner_directory_v: {
      source: "public.admin_profiles",
      columns: [
        "display_name", "crm_owner_key", "crm_owner_aliases", "neo_owner_id",
        "crm_assignable", "crm_team_role", "status", "crm_sort_order",
      ],
    },
    home_neo_accounts_v: {
      source: "public.crm_neo_customer_snapshots",
      columns: [
        "source_system", "account_id", "account_name", "owner_id", "owner_name", "phone_key", "region_label",
        "has_eeo", "billing_mode", "balance", "expire_at", "expire_in_days", "depletion_in_days", "risk_level",
        "risk_reasons", "is_stale", "source_synced_at",
      ],
    },
    home_site_leads_v: {
      source: "public.leads",
      columns: ["phone_key", "n", "last_at", "last_inflow_at", "last_source", "last_status"],
    },
    home_channel_contacts_v: {
      source: "public.channel_conversations",
      columns: ["phone_key", "conversations", "messages", "last_message_at", "matched_home_lead"],
    },
  }

  it("정확히 6개 뷰를 만든다", () => {
    expect(views.map((v) => v.name).sort()).toEqual(Object.keys(expected).sort())
  })

  it.each(Object.entries(expected))("%s 의 원천과 노출 컬럼(순서 포함)이 명세와 같다", (name, spec) => {
    const parsed = view(name)
    expect(parsed.source).toBe(spec.source)
    expect(parsed.columns).toEqual(spec.columns)
  })

  it.each(Object.keys(expected))("%s 가 읽는 원천 컬럼은 전부 실 카탈로그에 있다", (name) => {
    const parsed = view(name)
    const catalog = SOURCE_COLUMNS[parsed.source]
    expect(catalog, parsed.source).toBeDefined()
    for (const column of referencedColumns(parsed)) expect(catalog, `${name} → ${column}`).toContain(column)
  })

  it("집계 뷰는 phone_key 당 1행이고, 부분 인덱스를 쓸 수 있게 phone is not null 로 거른다", () => {
    const siteLeads = code.slice(code.indexOf("create or replace view public.home_site_leads_v"))
    expect(siteLeads).toMatch(
      /where l\.phone is not null\s+and length\(public\.norm_phone_key\(l\.phone\)\) >= 9\s+and l\.source is distinct from 'meta_lead_ads'\s+group by 1;/
    )
    expect(siteLeads).toContain("(array_agg(l.source order by l.created_at desc, l.id desc))[1] as last_source")
    expect(siteLeads).toContain("(array_agg(l.status order by l.created_at desc, l.id desc))[1] as last_status")
    const channel = code.slice(code.indexOf("create or replace view public.home_channel_contacts_v"))
    expect(channel).toMatch(/where c\.phone is not null\s+and length\(public\.norm_phone_key\(c\.phone\)\) >= 9\s+group by 1;/)
  })
})

describe("역브리지 PII 최소화", () => {
  const forbidden: Record<string, string[]> = {
    home_site_leads_v: [
      "name", "org", "email", "message", "notes", "anonymous_id", "user_id",
      "gclid", "fbclid", "msclkid", "ttclid", "referrer", "landing_page", "current_page",
    ],
    home_channel_contacts_v: ["name", "email", "transcript", "last_message_text", "first_question", "matched_org"],
    home_neo_accounts_v: ["uid", "source_refs", "source_run_ids"],
    home_owner_directory_v: ["user_id", "role", "capabilities", "nav_preset", "nav_overrides", "invited_by", "last_login_at"],
    compass_lead_refs_v: ["created_by"],
  }

  it.each(Object.entries(forbidden))("%s 는 금지 컬럼을 읽지 않는다", (name, columns) => {
    const refs = referencedColumns(view(name))
    for (const column of columns) expect(refs, `${name} → ${column}`).not.toContain(column)
  })

  it("원문 전화는 norm_phone_key 를 거쳐 phone_key 로만 나간다", () => {
    for (const parsed of views) {
      for (const item of parsed.items) {
        if (!/\bphone\b/.test(item.replace(/phone_key/g, ""))) continue
        expect(item, parsed.name).toMatch(
          /^(?:public\.norm_phone_key\((\w)\.phone\)|case when length\(public\.norm_phone_key\((\w)\.phone\)\) >= 9 then public\.norm_phone_key\(\2\.phone\) end) as phone_key$/
        )
      }
    }
  })
})

describe("권한 — service_role 전용", () => {
  const revokedFromPublicRoles = new Set<string>()
  const grantedToServiceRole = new Set<string>()
  for (const m of code.matchAll(/revoke all on ([^;']*?)\s+from anon, authenticated(?=[';])/g)) {
    for (const name of m[1].matchAll(/public\.(\w+)/g)) revokedFromPublicRoles.add(name[1])
  }
  for (const m of code.matchAll(/grant select on ([^;']*?)\s+to service_role(?=[';])/g)) {
    for (const name of m[1].matchAll(/public\.(\w+)/g)) grantedToServiceRole.add(name[1])
  }

  it("모든 뷰에서 anon·authenticated 를 회수하고 service_role 에만 SELECT 를 준다", () => {
    for (const parsed of views) {
      expect(revokedFromPublicRoles.has(parsed.name), `revoke ${parsed.name}`).toBe(true)
      expect(grantedToServiceRole.has(parsed.name), `grant ${parsed.name}`).toBe(true)
    }
    expect(code).not.toMatch(/grant[^;]*to (?:anon|authenticated|public)\b/i)
  })

  // GRANT SELECT 는 Supabase 기본권한이 service_role 에 준 쓰기 권한을 좁히지 않는다. 단순 뷰는 자동 갱신 뷰가 되고
  // 소유자(postgres) 권한으로 실행되므로, 회수하지 않으면 service_role 이 뷰를 통해 crm·admin 원본에 RLS 없이 쓴다
  // (2026-09-21 운영 실측: 20260828 뷰 7개 전부 INSERT·UPDATE·DELETE·TRUNCATE 보유).
  it("모든 새 뷰에서 service_role 권한을 먼저 전부 회수한 뒤 SELECT 만 다시 준다", () => {
    const revokedFromServiceRole = new Map<string, number>()
    for (const m of code.matchAll(/revoke all on ([^;']*?)\s+from service_role(?=[';])/g)) {
      for (const name of m[1].matchAll(/public\.(\w+)/g)) revokedFromServiceRole.set(name[1], m.index ?? -1)
    }
    const grantedAt = new Map<string, number>()
    for (const m of code.matchAll(/grant select on ([^;']*?)\s+to service_role(?=[';])/g)) {
      for (const name of m[1].matchAll(/public\.(\w+)/g)) grantedAt.set(name[1], m.index ?? -1)
    }
    for (const parsed of views) {
      const revokedAt = revokedFromServiceRole.get(parsed.name)
      expect(revokedAt, `revoke service_role ${parsed.name}`).toBeDefined()
      expect(revokedAt!, `revoke before grant ${parsed.name}`).toBeLessThan(grantedAt.get(parsed.name)!)
    }
  })

  it("20260828 기존 브리지 뷰 7개도 service_role 을 SELECT 로 좁힌다(없는 뷰는 건너뛴다)", () => {
    // code 는 주석을 걷어낸 본문이라 절 제목 대신 D) 블록의 배열 첫 원소로 찾는다.
    const start = code.indexOf("'compass_leads_v', 'compass_activities_v'")
    expect(start, "D) 블록").toBeGreaterThan(-1)
    const block = code.slice(start)
    for (const name of [
      "compass_leads_v", "compass_activities_v", "compass_ads_v", "compass_adsets_v",
      "compass_demos_v", "compass_cal_events_v", "compass_revenue_v",
    ]) {
      expect(block, name).toContain(`'${name}'`)
    }
    expect(block).toMatch(/to_regclass\('public\.' \|\| v\) is not null/)
    expect(block).toMatch(/revoke all on public\.%I from service_role/)
    expect(block).toMatch(/grant select on public\.%I to service_role/)
  })
})
