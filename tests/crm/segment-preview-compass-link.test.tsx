/**
 * 세그먼트 허브 결과 미리보기의 Compass 칸 — 통합 목록과 같은 공용 판정(2026-09-26 교차 리뷰 [25] 후속, R1-25).
 * 예전에는 `row.source === "lead" && row.compass` 이면 무조건 "Compass에서 열기"(응답 compass.url 그대로)를 붙였다.
 *  - NEO·전환 고객 행도 같은 전화의 Compass 리드가 있으면 보조 "Compass 기록".
 *  - 전환(converted)·NEO 계정 등록 확정 리드는 Compass 매칭이 있어도 Home 정본 → "Compass 기록"(360·리드 보드와 같은 쪽).
 *  - href 는 응답 문자열이 아니라 id 로 다시 만든다(compassLeadUrl 하나).
 *  - 표 위 캡션: compassRefs=down 이면 "Compass 연결 끊김 — Compass 링크를 표시하지 못함"("매칭 없음"과 구분).
 * DOM 환경이 없어 presentational 본문(SegmentPreviewResults)을 정적 마크업으로, 부모 배선은 소스 계약으로 고정한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { COMPASS_OPEN_LABEL } from "@/components/admin/compass/CompassOpenLink"
import {
  SEGMENT_PREVIEW_LIMIT,
} from "@/components/admin/crm/segments/segment-hub-api"
import { SegmentPreviewResults, segmentPreviewRows } from "@/components/admin/crm/segments/SegmentDetailPanel"
import {
  CAPTION_COMPASS_ACTIVITY_DOWN,
  CAPTION_COMPASS_BOTH_DOWN,
  CAPTION_COMPASS_REFS_DOWN,
} from "@/components/admin/crm/unified/ContactSourceCaption"
import { UNIFIED_COMPASS_RECORD_LABEL, unifiedRowNeedsNeoRegistration } from "@/components/admin/crm/unified/UnifiedCompassLink"
import type { CrmUnifiedCustomers, CrmUnifiedCustomersClientMeta } from "@/components/admin/crm/unified/shared"
import { compassLeadUrl } from "@/lib/compass/normalize"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"

/** 응답 url 을 일부러 다른 값으로 — 링크가 이 문자열이 아니라 id 로 다시 만들어지는지 본다. */
const STALE_URL = "https://stale.example/should-not-be-used"

function compassRef(leadId: number) {
  return { leadId, url: STALE_URL, stageLabel: "데모" }
}

function row(partial: Partial<CrmUnifiedCustomerRow> & Pick<CrmUnifiedCustomerRow, "key">): CrmUnifiedCustomerRow {
  return {
    source: "lead",
    sourceLabel: "문의",
    name: "가나학원",
    contact: null,
    ownerName: "박담당",
    ownerKeys: ["박담당"],
    lifecycle: "active_lead",
    statusLabel: "접촉 중",
    stage: null, stageLabel: null, subjectLabel: null, categoryLabel: null,
    tier: null, trust: null, moneyBand: null,
    nextActionLabel: "팔로업",
    priorityReason: "-",
    score: 10,
    bucket: null,
    moneyLabel: null,
    moneyState: "none",
    href: "#",
    updatedAt: null,
    expireAt: null,
    balance: null,
    tags: [],
    origin: "site",
    crmRegistered: false,
    provisional: false,
    slaTarget: false,
    firstResponseAt: null,
    createdAt: null,
    compass: null,
    ...partial,
  }
}

function preview(rows: CrmUnifiedCustomerRow[], meta?: CrmUnifiedCustomersClientMeta): CrmUnifiedCustomers {
  return {
    generatedAt: "2026-09-26T03:00:00.000Z",
    sources: { leadsOk: true, neoAccountsOk: true, warnings: [], statuses: [] },
    summary: { total: rows.length, leadCount: rows.length, accountCount: 0, highPriorityCount: 0, ownerCount: 1 },
    pagination: { limit: SEGMENT_PREVIEW_LIMIT, offset: 0, returned: rows.length, total: rows.length, hasMore: false, nextOffset: null },
    owners: [],
    rows,
    ...(meta ? { meta } : {}),
  }
}

const NOW_MS = Date.parse("2026-09-26T03:00:00.000Z")

function render(rows: CrmUnifiedCustomerRow[], options: { meta?: CrmUnifiedCustomersClientMeta; registered?: string[] } = {}) {
  return renderToStaticMarkup(
    <SegmentPreviewResults
      preview={preview(rows, options.meta)}
      nowMs={NOW_MS}
      neoRegisteredLeadIds={options.registered ? new Set(options.registered) : null}
    />
  )
}

/** 행 이름으로 그 행의 Compass 링크 접근성 라벨을 찾는다(icon 변형은 문구를 aria-label·title 로만 싣는다). */
function linkLabel(html: string, name: string, label: string) {
  return html.includes(`aria-label="${name} ${label} (새 탭)"`)
}

function count(html: string, needle: string) {
  return html.split(needle).length - 1
}

const OK_META: CrmUnifiedCustomersClientMeta = { compass: "ok", homeContactDetail: "ok", compassRefs: "ok" }

describe("SegmentPreviewResults — Compass 칸은 공용 판정(UnifiedCompassLink)", () => {
  it("응대 중 매칭 리드만 'Compass에서 열기', href 는 id 로 다시 만든다(응답 url 무시)", () => {
    const html = render([row({ key: "lead:a", name: "응대학원", compass: compassRef(101) })], { meta: OK_META })
    expect(linkLabel(html, "응대학원", COMPASS_OPEN_LABEL)).toBe(true)
    expect(html).toContain(`href="${compassLeadUrl(101)}"`)
    expect(html).not.toContain(STALE_URL)
    expect(html).toContain('data-write-surface="compass"')
    expect(html).toContain('target="_blank"')
  })

  it("NEO 계정·전환 고객 행도 같은 전화의 Compass 리드가 있으면 보조 'Compass 기록'", () => {
    const html = render(
      [
        row({ key: "neo:acc-1", source: "neo_account", sourceLabel: "고객", name: "계정학원", statusLabel: "활성 고객", compass: compassRef(201) }),
        row({ key: "customer:c-1", source: "customer", sourceLabel: "전환 고객", name: "전환학원", statusLabel: "리드 전환 완료", compass: compassRef(202) }),
      ],
      { meta: OK_META }
    )
    expect(linkLabel(html, "계정학원", UNIFIED_COMPASS_RECORD_LABEL)).toBe(true)
    expect(linkLabel(html, "전환학원", UNIFIED_COMPASS_RECORD_LABEL)).toBe(true)
    expect(html).toContain(`href="${compassLeadUrl(201)}"`)
    expect(html).toContain(`href="${compassLeadUrl(202)}"`)
    expect(html).not.toContain(COMPASS_OPEN_LABEL)
    expect(count(html, 'data-write-surface="home"')).toBe(2)
  })

  it("전환 리드(원값·문구 폴백)·NEO 등록 확정 리드(행 값·원천 집합)는 'Compass 기록' — '열기'가 아니다", () => {
    const html = render(
      [
        row({ key: "lead:conv", name: "전환원값", leadStatus: "converted", statusLabel: "전환 완료", compass: compassRef(301) }),
        row({ key: "lead:conv-old", name: "전환폴백", statusLabel: "전환 완료", compass: compassRef(302) }),
        row({ key: "lead:reg", name: "등록행값", neoAccountConfirmed: true, compass: compassRef(303) }),
        row({ key: "lead:reg-src", name: "등록원천", compass: compassRef(304) }),
      ],
      { meta: OK_META, registered: ["reg-src"] }
    )
    for (const name of ["전환원값", "전환폴백", "등록행값", "등록원천"]) {
      expect(linkLabel(html, name, UNIFIED_COMPASS_RECORD_LABEL)).toBe(true)
      expect(linkLabel(html, name, COMPASS_OPEN_LABEL)).toBe(false)
    }
  })

  it("external_lead 배지(crmRegistered)만 있는 리드는 등록 확정이 아니다 — 360 과 같게 'Compass에서 열기'", () => {
    const html = render([row({ key: "lead:badge", name: "배지학원", crmRegistered: true, neoAccountConfirmed: false, compass: compassRef(401) })], {
      meta: OK_META,
    })
    expect(linkLabel(html, "배지학원", COMPASS_OPEN_LABEL)).toBe(true)
  })

  it("Compass 매칭이 없는 행은 링크 없음", () => {
    const html = render([row({ key: "lead:none", name: "무매칭" }), row({ key: "neo:x", source: "neo_account", name: "무매칭계정" })], {
      meta: OK_META,
    })
    expect(html).not.toContain("<a href=\"https://")
    expect(html).not.toContain('data-testid="unified-compass-ref"')
  })
})

describe("SegmentPreviewResults — 표 위 원천 캡션(ContactSourceCaption)", () => {
  it("참조 조회가 끊기면 'Compass 링크를 표시하지 못함' — 링크 없음이 '매칭 없음'이 아니라 조회 실패임을 알린다", () => {
    const html = render([row({ key: "lead:a" })], { meta: { compass: "ok", homeContactDetail: "ok", compassRefs: "down" } })
    expect(html).toContain(CAPTION_COMPASS_REFS_DOWN)
    expect(html).toContain('data-testid="unified-contact-source-caption"')
    expect(html).toContain('role="status"')
  })

  it("활동·참조 둘 다 끊기면 한 줄로, 활동만 끊기면 마지막 연락 안내만", () => {
    const both = render([row({ key: "lead:a" })], { meta: { compass: "down", homeContactDetail: "ok", compassRefs: "down" } })
    expect(both).toContain(CAPTION_COMPASS_BOTH_DOWN)
    const activity = render([row({ key: "lead:a" })], { meta: { compass: "down", homeContactDetail: "ok", compassRefs: "ok" } })
    expect(activity).toContain(CAPTION_COMPASS_ACTIVITY_DOWN)
    expect(activity).not.toContain(CAPTION_COMPASS_REFS_DOWN)
  })

  it("정상이거나 메타가 없으면(옛 응답) 캡션 없음 — 빈 결과에도 캡션 규칙은 같다", () => {
    expect(render([row({ key: "lead:a" })], { meta: OK_META })).not.toContain("unified-contact-source-caption")
    expect(render([row({ key: "lead:a" })])).not.toContain("unified-contact-source-caption")
    const empty = render([], { meta: { compass: "ok", homeContactDetail: "ok", compassRefs: "down" } })
    expect(empty).toContain("지금 이 조건에 맞는 고객이 없습니다.")
    expect(empty).toContain(CAPTION_COMPASS_REFS_DOWN)
  })

  it("미리보기는 앞 SEGMENT_PREVIEW_LIMIT 행만 — 원천 조회 여부도 그 행들로 정한다", () => {
    const rows = Array.from({ length: SEGMENT_PREVIEW_LIMIT + 3 }, (_, index) => row({ key: `lead:${index}`, name: `학원${index}` }))
    expect(segmentPreviewRows(preview(rows))).toHaveLength(SEGMENT_PREVIEW_LIMIT)
    expect(segmentPreviewRows(null)).toEqual([])
    // 링크 있는 전환 아닌 리드가 한도 밖에만 있으면 원천을 읽지 않는다.
    const tail = [...rows.slice(0, SEGMENT_PREVIEW_LIMIT), row({ key: "lead:tail", compass: compassRef(9) })]
    expect(segmentPreviewRows(preview(tail)).some(unifiedRowNeedsNeoRegistration)).toBe(false)
  })
})

describe("SegmentDetailPanel 배선 — 소스 계약", () => {
  const source = readFileSync(join(process.cwd(), "components/admin/crm/segments/SegmentDetailPanel.tsx"), "utf8").replace(
    /\r\n/g,
    "\n"
  )

  it("리드만 보고 '열기'를 붙이던 분기·응답 url 직접 사용이 없다", () => {
    expect(source).not.toContain('row.source === "lead" && row.compass')
    expect(source).not.toContain("row.compass.url")
    expect(source).not.toMatch(/import CompassOpenLink/)
    expect(source).toContain('<UnifiedCompassLink row={row} variant="icon" neoRegisteredLeadIds={neoRegisteredLeadIds} />')
  })

  it("등록 확정 원천은 미리보기 행 기준으로 읽고, 응답이 새로 오면 다시 읽는다 — 훅은 조기 반환보다 앞", () => {
    expect(source).toContain("useUnifiedNeoRegisteredLeadIds(\n    segmentPreviewRows(preview).some(unifiedRowNeedsNeoRegistration),\n    preview?.generatedAt ?? null\n  )")
    const hookAt = source.indexOf("useUnifiedNeoRegisteredLeadIds(\n")
    const earlyReturnAt = source.indexOf("if (!draft) {")
    expect(hookAt).toBeGreaterThan(0)
    expect(earlyReturnAt).toBeGreaterThan(hookAt)
    expect(source).toContain("neoRegisteredLeadIds={neoRegisteredLeadIds}")
  })

  it("캡션은 미리보기 응답의 meta 를 그대로 넘긴다", () => {
    expect(source).toContain('<ContactSourceCaption meta={preview.meta} className="mb-1.5" />')
  })
})
