"use client"

import Image from "next/image"
import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"
import { useEffect, useId, useState } from "react"

import {
  DENIED_CHOICE,
  GRANTED_CHOICE,
  OPEN_CONSENT_EVENT,
  type ConsentChoice,
} from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"
import { cn } from "@/lib/utils"

// 말풍선 오른쪽의 그림 — 쿠키 먹는 정글 갈매기(DESIGN.md 결정 로그 V22·V27).
// 192px 정사각 투명 WebP 를 46px 로 보인다. 바꿀 때는 이 경로 하나만 고친다
const MASCOT_SRC = "/images/consent/gull-cookie.webp"

// 상자 없는 굵은 글자 버튼(V27-A). 보이는 높이 24px(h-6), 누르는 영역은 hit-area 로 44px 보장.
// 거절(필수만)과 동의(모두 동의·선택 저장)는 같은 모양이다 — 한쪽만 눈에 띄게 두지 않는다
const CHOICE_BTN =
  "hit-area inline-flex h-6 items-center px-1.5 text-note font-semibold whitespace-nowrap text-fg-ink underline decoration-transparent underline-offset-4 transition-colors duration-(--motion-fast) ease-soft hover:decoration-line-link disabled:opacity-40"

// 베어 문 자리에서 떨어진 부스러기 3개 — 말풍선 오른쪽 위(갈매기 쪽)
const CRUMBS = [
  "left-[calc(100%+4px)] top-1.5 size-1 bg-[#C99357]",
  "left-[calc(100%+11px)] top-0 size-[3px] bg-[#B07A3E]",
  "left-[calc(100%+9px)] top-[15px] size-[3px] bg-[#D4A86E]",
]

const OPTIONAL_ROWS: Array<{ key: keyof ConsentChoice; label: string; desc: string }> = [
  { key: "analytics", label: "분석", desc: "방문 통계 · Google(미국)" },
  { key: "marketing", label: "마케팅", desc: "광고·상담창 · Google·Meta(미국), 카카오, 채널톡" },
]

/**
 * 옵트인 쿠키 동의 배너 (PIPA/GDPR). 미결정 시 자동 노출되며, 동의 전에는
 * 마케팅/분석 픽셀이 발화하지 않는다(AppChrome + lib/analytics 게이팅).
 * 푸터 "쿠키 설정"에서 재오픈 가능 — 이때는 세부 설정을 펼친 채로 연다.
 *
 * 모양(V27-A '한 입'): 오른쪽 아래, 말풍선 + 갈매기. 말풍선 오른쪽 위를 한 입 베어 문 자국과 부스러기.
 * 배너가 떠 있는 동안 챗봇 런처·모바일 CTA 는 숨는다(site-base.css [data-hide-with-banner])
 * — 그래서 런처 자리를 그대로 쓴다. 평소엔 한 줄 안내와 톱니 · 필수만 | 모두 동의,
 * 톱니를 누르면 그 자리에서 분석·마케팅을 골라 저장한다. 닫기(X)는 두지 않는다 — 거절이 동의만큼 쉽다.
 */
export function ConsentBanner() {
  const { decided, choice, save } = useConsent()
  const [forceOpen, setForceOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [draft, setDraft] = useState<ConsentChoice>(DENIED_CHOICE)
  const panelId = useId()

  // 푸터 "쿠키 설정"에서 재오픈 (이벤트 콜백 내 setState — effect 본문 아님)
  useEffect(() => {
    const reopen = () => {
      setDraft({ analytics: choice.analytics, marketing: choice.marketing })
      setFailed(false)
      setExpanded(true)
      setForceOpen(true)
    }
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [choice.analytics, choice.marketing])

  // open 상태는 렌더에서 파생 — 미결정이면 자동 노출, 재오픈 시 강제 노출
  const open = forceOpen || !decided
  if (!open) return null

  // 저장이 실패하면(네트워크·429 등) 닫지 않고 다시 누르라고 알린다 — 아무 일 없는 것처럼 두지 않는다
  const commitChoice = async (nextChoice: ConsentChoice) => {
    if (saving) return
    setSaving(true)
    setFailed(false)
    try {
      await save(nextChoice)
      setForceOpen(false)
      setExpanded(false)
    } catch (error) {
      console.warn("[consent] failed to save consent:", error)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }
  const toggleSettings = () => {
    if (!expanded) setDraft({ analytics: choice.analytics, marketing: choice.marketing })
    setExpanded((v) => !v)
  }

  return (
    <div
      role="dialog"
      aria-label="쿠키 사용 동의"
      data-consent-banner
      data-inert-with-menu="hide"
      className="group fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] right-3 z-(--z-consent) flex max-w-[calc(100vw-24px)] items-end gap-1 sm:bottom-5 sm:right-5"
    >
      <div className="relative min-w-0">
        {/* 윤곽은 consent-shape 필터가 말풍선(베어 문 자국 포함)과 꼬리를 한 번에 그린다 */}
        <div className="consent-shape relative">
          <div
            className={cn(
              "consent-bite relative z-[1] max-w-full rounded-[10px] bg-surface-sheet",
              expanded ? "w-[232px]" : "w-[200px]",
            )}
          >
            {/* 아래 여백 12px — 버튼(24px)의 hit-area(44px)가 아래로 10px 나온다. 더 줄이면 스크롤 상자가 생긴다 */}
            <div className="max-h-[calc(100dvh-24px)] overflow-y-auto px-2.5 pb-3 pt-2">
              <div className="flex items-baseline gap-2">
                <p className="text-label text-fg-ink">쿠키 한 입만 쓸게요</p>
                <Link
                  href="/privacy#cookies"
                  prefetch={false}
                  className="whitespace-nowrap text-note text-fg-body underline decoration-line-link underline-offset-[0.22em] transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink"
                >
                  자세히
                </Link>
              </div>

              {expanded ? (
                <ul id={panelId} className="mt-1.5 divide-y divide-line-hair border-y border-line-hair">
                  <li className="flex items-center justify-between gap-2 py-1 text-note text-fg-muted">
                    <span>
                      <span className="mr-1.5 font-semibold text-fg-ink">필수</span>보안·이동
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-fg-body">
                      <span aria-hidden className="status-dot" />
                      항상 켜짐
                    </span>
                  </li>
                  {OPTIONAL_ROWS.map((row) => (
                    <li key={row.key}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 py-1 text-note text-fg-muted transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink">
                        <span>
                          <span className="mr-1.5 font-semibold text-fg-ink">{row.label}</span>
                          {row.desc}
                        </span>
                        <input
                          type="checkbox"
                          checked={draft[row.key]}
                          onChange={(e) => setDraft((d) => ({ ...d, [row.key]: e.target.checked }))}
                        />
                      </label>
                    </li>
                  ))}
                  <li className="py-1 text-note">
                    <Link href="/privacy#overseas" prefetch={false} className="link-quiet text-fg-body">
                      보내는 곳·항목·기간 자세히
                    </Link>
                  </li>
                </ul>
              ) : null}

              {failed ? (
                <p role="alert" className="mt-1 text-note text-fg-danger">
                  저장하지 못했어요. 다시 눌러 주세요.
                </p>
              ) : null}

              <div className="mt-1.5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleSettings}
                  aria-label="쿠키 설정"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="hit-area -ml-1 inline-flex size-6 items-center justify-center rounded-(--radius-control) text-fg-muted transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink"
                >
                  <SlidersHorizontal aria-hidden className="size-3.5" />
                </button>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void commitChoice(DENIED_CHOICE)}
                    disabled={saving}
                    className={CHOICE_BTN}
                  >
                    필수만
                  </button>
                  <span aria-hidden className="h-3 w-px bg-line-strong" />
                  {expanded ? (
                    <button type="button" onClick={() => void commitChoice(draft)} disabled={saving} className={CHOICE_BTN}>
                      선택 저장
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void commitChoice(GRANTED_CHOICE)}
                      disabled={saving}
                      className={CHOICE_BTN}
                    >
                      모두 동의
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* 꼬리 — 갈매기(오른쪽 아래)를 향한다. 안쪽 절반은 말풍선(z-1) 아래로 숨는다 */}
          <span aria-hidden className="absolute -right-1 bottom-[13px] size-2.5 rotate-45 bg-surface-sheet" />
        </div>
        {CRUMBS.map((crumb) => (
          <span key={crumb} aria-hidden className={cn("consent-crumb absolute rounded-[40%]", crumb)} />
        ))}
      </div>

      <Image
        src={MASCOT_SRC}
        alt=""
        width={192}
        height={192}
        aria-hidden="true"
        className="consent-gull -mb-[3px] size-[46px] shrink-0 select-none object-contain transition-transform duration-(--motion-base) ease-soft group-hover:-rotate-6"
      />
    </div>
  )
}
