/**
 * FreshnessCaption — CRM 목록 상단 "기준 HH:MM · 갱신 N초 전" 캡션 단위 테스트(2026-09-17 우선순위 P2).
 *
 * node 환경(jsdom 없음)이라 마크업은 renderToStaticMarkup 으로, onRefresh 클릭은 컴포넌트를 함수로
 * 호출해 얻은 엘리먼트 트리에서 버튼의 onClick 을 직접 실행해 확인한다. 그래서 react 의
 * useSyncExternalStore 만 고정 시각을 돌려주도록 대체한다(모든 렌더 케이스는 nowMs 를 주므로 결과 불변).
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"

const NOW = Date.parse("2026-09-18T03:00:00.000Z") // 12:00 KST

vi.mock("react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react")>()
  return { ...mod, useSyncExternalStore: () => NOW }
})

import FreshnessCaption, { formatAgo, formatBasisTime } from "@/components/admin/crm/FreshnessCaption"

const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString()

describe("formatBasisTime", () => {
  it("KST HH:MM 으로 적고, 없거나 깨진 값은 null", () => {
    expect(formatBasisTime("2026-09-18T03:00:00.000Z")).toBe("12:00")
    expect(formatBasisTime("2026-09-17T23:05:00.000Z")).toBe("08:05")
    expect(formatBasisTime(null)).toBeNull()
    expect(formatBasisTime(undefined)).toBeNull()
    expect(formatBasisTime("not-a-date")).toBeNull()
  })
})

describe("formatAgo 경계", () => {
  it("5초 미만은 방금, 60초 전까지 초, 60분 전까지 분, 그 뒤는 시간", () => {
    expect(formatAgo(NOW, NOW)).toBe("방금")
    expect(formatAgo(NOW - 4_400, NOW)).toBe("방금")
    expect(formatAgo(NOW - 5_000, NOW)).toBe("5초 전")
    expect(formatAgo(NOW - 59_000, NOW)).toBe("59초 전")
    expect(formatAgo(NOW - 60_000, NOW)).toBe("1분 전")
    expect(formatAgo(NOW - 59 * 60_000, NOW)).toBe("59분 전")
    expect(formatAgo(NOW - 60 * 60_000, NOW)).toBe("1시간 전")
    expect(formatAgo(NOW - 3 * 60 * 60_000, NOW)).toBe("3시간 전")
  })

  it("ISO 문자열도 받고, 미래 시각은 방금으로 고정하며, 없거나 깨진 값은 null", () => {
    expect(formatAgo(iso(30_000), NOW)).toBe("30초 전")
    expect(formatAgo(NOW + 60_000, NOW)).toBe("방금")
    expect(formatAgo(null, NOW)).toBeNull()
    expect(formatAgo(undefined, NOW)).toBeNull()
    expect(formatAgo("garbage", NOW)).toBeNull()
  })
})

describe("FreshnessCaption 렌더 (nowMs 고정)", () => {
  it("기준 시각과 상대 갱신 시각을 함께 적고 항상 role=status 다", () => {
    const html = renderToStaticMarkup(
      <FreshnessCaption generatedAt={iso(45_000)} receivedAt={NOW - 30_000} nowMs={NOW} />
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-freshness="fresh"')
    expect(html).toContain("기준 11:59")
    expect(html).toContain("갱신 30초 전")
    expect(html).not.toContain("<button")
  })

  it("receivedAt 이 없으면 generatedAt 으로 상대 시각을 잰다", () => {
    const html = renderToStaticMarkup(<FreshnessCaption generatedAt={iso(2 * 60_000)} nowMs={NOW} />)
    expect(html).toContain("기준 11:58")
    expect(html).toContain("갱신 2분 전")
  })

  it("refreshing 이면 스피너와 갱신 중을 보이고 성공 문구는 숨긴다", () => {
    const html = renderToStaticMarkup(
      <FreshnessCaption generatedAt={iso(45_000)} receivedAt={NOW - 30_000} refreshing nowMs={NOW} onRefresh={() => undefined} />
    )
    expect(html).toContain("갱신 중")
    expect(html).toContain("animate-spin")
    expect(html).not.toContain("갱신 30초 전")
    expect(html).toContain('data-freshness="refreshing"')
    // 재조회 중에는 새로고침 버튼을 잠근다.
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })

  it("staleReason=error 면 갱신 실패 · 이전 값 문구와 warning 톤", () => {
    const html = renderToStaticMarkup(
      <FreshnessCaption generatedAt={iso(45_000)} receivedAt={NOW - 30_000} staleReason="error" nowMs={NOW} />
    )
    expect(html).toContain("갱신 실패 · 이전 값 30초 전")
    expect(html).toContain('data-freshness="error"')
    expect(html).toContain("text-[#7A520F]")
    expect(html).not.toContain("text-[#615D59]")
  })

  it("onRefresh 가 있을 때만 새로고침 버튼을 붙인다(모바일 44px 터치 타겟)", () => {
    const without = renderToStaticMarkup(<FreshnessCaption receivedAt={NOW - 10_000} nowMs={NOW} />)
    expect(without).not.toContain("새로고침")
    const with_ = renderToStaticMarkup(<FreshnessCaption receivedAt={NOW - 10_000} nowMs={NOW} onRefresh={() => undefined} />)
    expect(with_).toContain("새로고침")
    expect(with_).toMatch(/<button[^>]*type="button"/)
    expect(with_).toContain("min-h-11")
  })

  it("아무 시각도 없으면 문구 없이 버튼만 남고 role=status 는 유지된다", () => {
    const html = renderToStaticMarkup(<FreshnessCaption nowMs={NOW} onRefresh={() => undefined} />)
    expect(html).toContain('role="status"')
    expect(html).not.toContain("기준")
    expect(html).not.toContain("갱신 ")
    expect(html).toContain("새로고침")
  })
})

function findButton(node: ReactNode): ReactElement<{ onClick?: () => void; disabled?: boolean }> | null {
  if (!node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child)
      if (found) return found
    }
    return null
  }
  const el = node as ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>
  if (el.type === "button") return el
  return findButton(el.props?.children ?? null)
}

describe("FreshnessCaption onRefresh 배선", () => {
  it("새로고침 버튼 클릭이 onRefresh 를 정확히 한 번 부른다", () => {
    const onRefresh = vi.fn()
    const tree = FreshnessCaption({ receivedAt: NOW - 10_000, nowMs: NOW, onRefresh })
    const button = findButton(tree)
    expect(button).not.toBeNull()
    expect(button?.props.disabled).toBe(false)
    button?.props.onClick?.()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("refreshing 중엔 버튼이 disabled 다", () => {
    const tree = FreshnessCaption({ receivedAt: NOW - 10_000, nowMs: NOW, refreshing: true, onRefresh: () => undefined })
    expect(findButton(tree)?.props.disabled).toBe(true)
  })
})
