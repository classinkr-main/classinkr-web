import type { EventStatus } from "@/lib/types/public-events"

export const KRW = new Intl.NumberFormat("ko-KR")
const KRW_CURRENCY = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})
export const won = (n: number | null | undefined) => (n == null ? "—" : KRW_CURRENCY.format(Math.round(n)))
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`)
export const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

export function previewText(value: string | null | undefined, maxLength = 160) {
  const text = value?.replace(/\s+/g, " ").trim()
  if (!text) return null
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export function money(value: number | null | undefined, currency = "USD") {
  if (value == null) return "—"
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

// DESIGN.md 운영 상태 스케일 — 진행=Success, 예정=Warning(파랑 금지 §7-2), 마감=뉴트럴.
export function statusTone(status: EventStatus): string {
  switch (status) {
    case "진행 중":
      return "bg-[#ECFDF5] text-[#084734] border-[#BDEFD8]"
    case "예정":
      return "bg-[#FBF1E0] text-[#A8741A] border-[#ECD29C]"
    case "마감":
      return "bg-[#f0f0ec] text-[#1a1a1a]/40 border-[#e8e8e4]"
  }
}

export function formatRange(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt)
  const sLabel = `${s.getMonth() + 1}/${s.getDate()}`
  if (!endsAt) return sLabel
  const e = new Date(endsAt)
  const eLabel = `${e.getMonth() + 1}/${e.getDate()}`
  return `${sLabel} ~ ${eLabel}`
}

export function formatMetaDate(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

/**
 * 차트 축·타임라인 바처럼 "짧게 자른" 행사명 목록을 만들 때, 앞이 아니라 뒤를 살린다.
 *
 * 행사명이 대부분 "Classin Meets 부산"처럼 공통 접두어를 공유해서, 단순 slice(0,n)은
 * 모든 라벨을 "Classin Meets…"로 만들어 구분 정보를 전부 잘라버린다(실측: 요약 탭
 * 퍼널 비교 축 4개가 전부 동일 라벨). 목록 전체의 공통 접두어를 먼저 벗겨 구분되는
 * 꼬리를 남기고, 그 다음에 길이 제한을 적용한다.
 *
 * 규칙:
 *  - 항목이 1개뿐이거나 접두어가 짧으면(4자 미만) 벗기지 않는다 — 과잉 절단 방지.
 *  - 접두어는 공백 경계로 되돌려 자른다("Classin Meets Ju"가 아니라 "Classin Meets ").
 *  - 벗긴 결과가 빈 문자열이면(완전 동일 이름) 원문으로 폴백한다.
 */
export function distinguishingLabels(titles: string[], max = 14): string[] {
  const trimmed = titles.map((t) => t.trim())
  let prefixLen = 0
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    let common = first.length
    for (const title of trimmed.slice(1)) {
      let i = 0
      while (i < common && i < title.length && title[i] === first[i]) i += 1
      common = i
      if (common === 0) break
    }
    // 공백 경계로 후퇴 — 단어 중간을 접두어로 오인해 "부산"과 "북구"의 공통 "부"까지 벗기지 않는다.
    const boundary = first.slice(0, common).lastIndexOf(" ")
    prefixLen = boundary >= 3 ? boundary + 1 : common >= 4 && (common === first.length || first[common - 1] === " ") ? common : 0
  }
  return trimmed.map((title) => {
    const tail = title.slice(prefixLen).trim() || title
    return tail.length > max ? `${tail.slice(0, max - 1)}…` : tail
  })
}
