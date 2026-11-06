"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useEffect, useId, useState } from "react"

import {
  DENIED_CHOICE,
  GRANTED_CHOICE,
  OPEN_CONSENT_EVENT,
  type ConsentChoice,
} from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"
import { cn } from "@/lib/utils"

// 말풍선 왼쪽의 그림 — 쿠키 먹는 정글 갈매기(DESIGN.md 결정 로그 V22).
// 192px 정사각 투명 WebP 를 48px 로 보인다. 바꿀 때는 이 경로 하나만 고친다
const MASCOT_SRC = "/images/consent/gull-cookie.webp"

// 컴팩트 컨트롤 — 보이는 높이 24px(min-h-6), 누르는 영역은 hit-area 로 44px 보장
const BTN =
  "hit-area inline-flex min-h-6 flex-1 items-center justify-center rounded-(--radius-control) px-2 text-note font-semibold transition-colors duration-(--motion-fast) ease-soft disabled:opacity-40"
// 거절(필수만)과 동의(모두 동의·선택 저장)는 같은 모양이다 — 한쪽만 눈에 띄게 두지 않는다
const CHOICE_BTN = `${BTN} border border-line-strong bg-surface-sunken text-fg-body hover:border-line-ink hover:text-fg-ink`

const OPTIONAL_ROWS: Array<{ key: keyof ConsentChoice; label: string; desc: string }> = [
  { key: "analytics", label: "분석", desc: "방문 통계 · Google(미국)" },
  { key: "marketing", label: "마케팅", desc: "광고·상담창 · Google·Meta(미국), 카카오, 채널톡" },
]

/**
 * 옵트인 쿠키 동의 배너 (PIPA/GDPR). 미결정 시 자동 노출되며, 동의 전에는
 * 마케팅/분석 픽셀이 발화하지 않는다(AppChrome + lib/analytics 게이팅).
 * 푸터 "쿠키 설정"에서 재오픈 가능 — 이때는 세부 설정을 펼친 채로 연다.
 *
 * 모양: 그림 + 말풍선. 평소엔 한 줄 안내와 버튼 2개(필수만 · 모두 동의), '설정'을 누르면
 * 그 자리에서 분석·마케팅을 골라 저장한다. 닫기(X)는 두지 않는다 — 거절(필수만)이 동의만큼 쉽다.
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
      className="group fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-3 z-(--z-consent) flex max-w-[calc(100vw-24px)] items-end gap-1 sm:bottom-5 sm:left-5"
    >
      <Image
        src={MASCOT_SRC}
        alt=""
        width={192}
        height={192}
        aria-hidden="true"
        className="-mb-0.5 size-12 shrink-0 select-none object-contain transition-transform duration-(--motion-base) ease-soft group-hover:-rotate-6"
      />

      {/* 말풍선 — 꼬리는 갈매기 부리·볼 쪽(왼쪽 아래)을 향한다. 꼬리가 잘리지 않게 스크롤은 안쪽 상자가 맡는다 */}
      <div
        className={cn(
          "relative max-w-full rounded-md border border-line-strong bg-surface-sheet shadow-deep before:absolute before:-left-[5px] before:bottom-3.5 before:size-2 before:rotate-45 before:border-b before:border-l before:border-line-strong before:bg-surface-sheet",
          expanded ? "w-[232px]" : "w-[212px]",
        )}
      >
        {/* 아래 여백 12px — 버튼(24px)의 hit-area(44px)가 아래로 10px 나온다. 8px 이면 2px 가 넘쳐
            스크롤 상자가 생기고, 스크롤바를 늘 보이는 설정에서는 처음부터 옆에 스크롤바가 떴다 */}
        <div className="relative max-h-[calc(100dvh-24px)] overflow-y-auto px-2.5 pb-3 pt-2">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-label text-fg-ink">쿠키 조금만 쓸게요</p>
            <button
              type="button"
              onClick={toggleSettings}
              aria-expanded={expanded}
              aria-controls={panelId}
              className="hit-area -mr-1 inline-flex items-center gap-0.5 px-1 text-note text-fg-muted transition-colors duration-(--motion-fast) ease-soft hover:text-fg-ink"
            >
              설정
              <ChevronDown
                aria-hidden
                className={cn("size-3 transition-transform duration-(--motion-fast) ease-soft", expanded && "rotate-180")}
              />
            </button>
          </div>
          <p className="mt-0.5 text-note text-fg-muted break-keep">
            선택 쿠키는 동의 시에만 켜요 ·{" "}
            <Link href="/privacy#cookies" prefetch={false} className="link-quiet text-fg-body whitespace-nowrap">
              자세히
            </Link>
          </p>

          {expanded ? (
            <ul id={panelId} className="mt-1.5 divide-y divide-line-hair border-t border-line-hair">
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

          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => void commitChoice(DENIED_CHOICE)}
              disabled={saving}
              className={CHOICE_BTN}
            >
              필수만
            </button>
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
  )
}
