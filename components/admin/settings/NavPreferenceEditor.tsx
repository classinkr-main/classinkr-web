"use client"

// 사이드바 편집기 공통 본문 — 행마다 상시 | 기타 | 숨김 3단 선택 + 미리보기.
//
// 두 곳이 같은 본문을 쓴다: 본인 편집(MyNavEditorDrawer, /api/admin/me/nav)과 설정 › 회원의
// SUPER_ADMIN 편집(MemberNavAccessDrawer, /api/admin/users). 행 목록·미리보기를 두 벌로 두면
// 한쪽만 고쳐지고, 어긋난 미리보기는 이 기능 전체의 신뢰를 깎는다.
//
// 이 화면은 권한을 다루지 않는다. 모든 매니저가 같은 메뉴를 갖고, 여기서 고르는 것은 그
// 사람 사이드바 목록에서 항목이 놓이는 자리뿐이다. "숨김"도 목록에서 치우는 것일 뿐이라 숨긴
// 탭은 ⌘K와 주소로 그대로 열린다(admin-nav-access.ts 상단 주석 — 도달성 불변식).
//
// 판정·미리보기는 반드시 admin-nav-access 의 resolveAdminNavAccess·buildNavPreferenceRows 를
// 쓴다 — 여기서 다시 계산하면 실제 사이드바와 어긋난다.
//
// (2026-09-25) 같은 스크롤 영역 아래에 "CRM 하위 탭" 섹션을 둔다 — CRM 본문 탭 줄(CrmSubnav)의
// 개인 숨김(nav_overrides 의 crm:<href> 키, 표시|숨김 2단). 행·판정은 buildCrmSubnavPreferenceRows ·
// setCrmSubnavOverride 가 정본이다. 두 범위는 한 오버라이드 객체에 함께 저장된다.
import { useId, useMemo, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { Check, CircleAlert, Loader2, X } from "lucide-react"

import { ADMIN_NAV_CATEGORY_META } from "@/components/admin/admin-nav"
import {
  buildCrmSubnavPreferenceRows,
  buildNavPreferenceRows,
  resolveAdminNavAccess,
  setCrmSubnavOverride,
  setNavOverride,
  type CrmSubnavPreference,
  type NavAccessContext,
  type NavOverrides,
  type NavPreference,
} from "@/components/admin/admin-nav-access"

export const NAV_PREFERENCE_OPTIONS: Array<{ value: NavPreference; label: string }> = [
  { value: "primary", label: "상시" },
  { value: "folded", label: "기타" },
  { value: "hidden", label: "숨김" },
]

// 선택된 값의 톤 — 명시적 선택 상태라 면을 쓴다(DESIGN.md 어드민 라벨 단순화).
// 상시만 Success 축, 기타·숨김은 중립이다(숨김은 경고가 아니라 정리다).
const OPTION_ACTIVE_TONE: Record<NavPreference, string> = {
  primary: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  folded: "border-[rgba(0,0,0,0.14)] bg-white text-[#111110]",
  hidden: "border-[rgba(0,0,0,0.14)] bg-white text-[#615D59]",
}

/** CRM 하위 탭 2단 선택 — 자리 개념이 없어 표시|숨김뿐이다. */
export const CRM_SUBNAV_PREFERENCE_OPTIONS: Array<{ value: CrmSubnavPreference; label: string }> = [
  { value: "shown", label: "표시" },
  { value: "hidden", label: "숨김" },
]

// 표시는 기존 "기타" 톤(중립 선택), 숨김은 기존 "숨김" 톤을 그대로 쓴다.
const CRM_OPTION_ACTIVE_TONE: Record<CrmSubnavPreference, string> = {
  shown: OPTION_ACTIVE_TONE.folded,
  hidden: OPTION_ACTIVE_TONE.hidden,
}

export const NAV_UNHIDEABLE_REASON = "로그인 첫 화면이라 숨길 수 없습니다"
export const NAV_HIDDEN_REACH_NOTE = "숨긴 탭도 ⌘K와 주소로 그대로 열립니다."
export const CRM_SUBNAV_SECTION_NOTE =
  "현황·고객DB(통합)·검수는 CRM 진입 탭이라 숨길 수 없습니다. 숨긴 탭은 CRM 탭 줄의 '숨긴 탭 N · 보기'에 모입니다."

/** 기본과 다른 항목 수(사이드바 + CRM 하위 탭) — 드로어 머리말용. */
export function countNavPreferenceExceptions(ctx: NavAccessContext): number {
  const topLevel = buildNavPreferenceRows(ctx).filter((row) => row.isException).length
  const crm = buildCrmSubnavPreferenceRows(ctx.overrides).filter((row) => row.isException).length
  return topLevel + crm
}

interface NavPreferenceEditorProps {
  role: string
  overrides: NavOverrides
  onChange: (next: NavOverrides) => void
  /** 안내 문구의 주어 — 본인 편집이면 "내", 회원 관리면 "이 사람". */
  subject: "self" | "member"
  disabled?: boolean
}

export default function NavPreferenceEditor({
  role,
  overrides,
  onChange,
  subject,
  disabled = false,
}: NavPreferenceEditorProps) {
  const reasonId = useId()
  const crmHeadingId = useId()
  const ctx = useMemo<NavAccessContext>(() => ({ role, overrides }), [role, overrides])
  const rows = useMemo(() => buildNavPreferenceRows(ctx), [ctx])
  const crmRows = useMemo(() => buildCrmSubnavPreferenceRows(overrides), [overrides])
  const preview = useMemo(() => resolveAdminNavAccess(ctx), [ctx])

  const foldedItems = preview.folded.flatMap((group) => group.items)
  const foldedCategoryLabel = preview.folded
    .map((group) => ADMIN_NAV_CATEGORY_META[group.category].label)
    .join(" · ")
  const crmHiddenRows = crmRows.filter((row) => row.preference === "hidden")
  const exceptionCount =
    rows.filter((row) => row.isException).length + crmRows.filter((row) => row.isException).length
  const whose = subject === "self" ? "내" : "이 사람"

  const choose = (href: string, next: NavPreference) => {
    onChange(setNavOverride(overrides, href, next))
  }

  const chooseCrm = (href: string, next: CrmSubnavPreference) => {
    onChange(setCrmSubnavOverride(overrides, href, next))
  }

  return (
    <>
      {/* 안내 — 이 화면이 접근을 다루지 않는다는 것과 숨김의 범위를 분명히 한다. */}
      <div className="border-b border-[#e8e8e4] px-5 py-3">
        <p className="text-[12px] leading-relaxed text-[#1a1a1a]/55">
          모든 매니저가 같은 메뉴를 갖습니다. 여기서는 {whose} 사이드바에서 각 탭이 상시(상단)·기타·숨김
          중 어디에 놓일지만 정합니다. 숨김은 목록에서 치우는 것일 뿐 도달성을 줄이지 않습니다. 실제
          데이터 권한은 각 화면의 서버 검사가 정합니다.
        </p>
      </div>

      {/* 탭 목록 — 3단 선택 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul>
          {rows.map(({ item, preference, base, isException, hideable }, index) => {
            const rowReasonId = `${reasonId}-reason-${index}`
            return (
            <li
              key={item.href}
              className="flex items-center justify-between gap-3 border-b border-[#f0f0ec] px-3 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/35" />
                  <span
                    className={`truncate text-[12.5px] font-medium ${
                      preference === "hidden" ? "text-[#1a1a1a]/45" : "text-[#111110]"
                    }`}
                  >
                    {item.label}
                  </span>
                  {isException ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-[#A8741A]">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#A8741A]" />
                      예외
                    </span>
                  ) : null}
                  {!isException && base === "hidden" ? (
                    <span className="shrink-0 text-[10.5px] text-[#1a1a1a]/40">기본 숨김</span>
                  ) : null}
                </div>
                {!hideable ? (
                  <p id={rowReasonId} className="mt-0.5 pl-[22px] text-[10.5px] text-[#1a1a1a]/40">
                    {NAV_UNHIDEABLE_REASON}
                  </p>
                ) : null}
              </div>
              <div
                role="group"
                aria-label={`${item.label} 자리`}
                className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] p-0.5"
              >
                {NAV_PREFERENCE_OPTIONS.map((option) => {
                  const active = preference === option.value
                  const locked = option.value === "hidden" && !hideable
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      disabled={disabled || locked}
                      title={locked ? NAV_UNHIDEABLE_REASON : undefined}
                      aria-describedby={locked ? rowReasonId : undefined}
                      onClick={() => choose(item.href, option.value)}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? OPTION_ACTIVE_TONE[option.value]
                          : "border-transparent text-[#1a1a1a]/40 hover:bg-white hover:text-[#111110]"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </li>
            )
          })}
        </ul>

        {/* CRM 하위 탭 — CRM 본문 탭 줄의 개인 숨김. 진입 탭 3개는 행 자체가 없다(숨길 수 없음). */}
        <section aria-labelledby={crmHeadingId} className="mt-2 border-t border-[#e8e8e4] pt-3">
          <div className="px-3 pb-1">
            <h3 id={crmHeadingId} className="text-[12px] font-semibold text-[#111110]">
              CRM 하위 탭
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#1a1a1a]/45">{CRM_SUBNAV_SECTION_NOTE}</p>
          </div>
          <ul>
            {crmRows.map(({ item, preference, base, isException }) => (
              <li
                key={item.href}
                className="flex items-center justify-between gap-3 border-b border-[#f0f0ec] px-3 py-2.5 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`truncate text-[12.5px] font-medium ${
                      preference === "hidden" ? "text-[#1a1a1a]/45" : "text-[#111110]"
                    }`}
                  >
                    {item.displayLabel}
                  </span>
                  {isException ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-[#A8741A]">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#A8741A]" />
                      예외
                    </span>
                  ) : null}
                  {!isException && base === "hidden" ? (
                    <span className="shrink-0 text-[10.5px] text-[#1a1a1a]/40">기본 숨김</span>
                  ) : null}
                </div>
                <div
                  role="group"
                  aria-label={`${item.displayLabel} 표시`}
                  className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] p-0.5"
                >
                  {CRM_SUBNAV_PREFERENCE_OPTIONS.map((option) => {
                    const active = preference === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => chooseCrm(item.href, option.value)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? CRM_OPTION_ACTIVE_TONE[option.value]
                            : "border-transparent text-[#1a1a1a]/40 hover:bg-white hover:text-[#111110]"
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 미리보기 — 저장 전에 실제 사이드바 결과를 보여주는 핵심 장치 */}
      <div className="space-y-1.5 border-t border-[#e8e8e4] px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-[#615D59]">미리보기</p>
          <button
            type="button"
            onClick={() => onChange({})}
            disabled={disabled || exceptionCount === 0}
            className="text-[11px] text-[#615D59] underline-offset-2 transition-colors hover:text-[#111110] hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
          >
            기본으로 되돌리기
          </button>
        </div>
        <p className="text-[11.5px] leading-relaxed text-[#111110]">
          <span className="font-semibold">상시 {preview.primary.length}</span>
          <span className="text-[#1a1a1a]/55">
            {" "}
            {preview.primary.map((item) => item.label).join(" · ")}
          </span>
        </p>
        {foldedItems.length > 0 ? (
          <p className="text-[11px] text-[#1a1a1a]/50">
            ▸ 기타 {foldedItems.length} ({foldedCategoryLabel})
          </p>
        ) : null}
        {preview.hidden.length > 0 ? (
          <p className="text-[11px] text-[#1a1a1a]/50">
            숨김 {preview.hidden.length} — {preview.hidden.map((item) => item.label).join(" · ")}
          </p>
        ) : null}
        {crmHiddenRows.length > 0 ? (
          <p className="text-[11px] text-[#1a1a1a]/50">
            CRM 숨긴 탭 {crmHiddenRows.length} — {crmHiddenRows.map((row) => row.item.displayLabel).join(" · ")}
          </p>
        ) : null}
        <p className="text-[11px] text-[#1a1a1a]/40">{NAV_HIDDEN_REACH_NOTE}</p>
      </div>
    </>
  )
}

export type NavSaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string }

/** 두 드로어가 공유하는 저장 푸터 — 저장 중·저장됨·오류 상태를 명시적으로 그린다. */
export function NavPreferenceFooter({
  save,
  onClose,
  onSave,
}: {
  save: NavSaveState
  onClose: () => void
  onSave: () => void
}) {
  const saving = save.status === "saving"

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-t border-[#e8e8e4] px-5 py-3.5">
        <div className="text-[11px]" aria-live="polite">
          {save.status === "saving" ? (
            <span className="inline-flex items-center gap-1 text-[#1a1a1a]/50">
              <Loader2 className="h-3 w-3 animate-spin" /> 저장 중...
            </span>
          ) : null}
          {save.status === "saved" ? (
            <span className="inline-flex items-center gap-1 font-medium text-[#084734]">
              <Check className="h-3 w-3" /> 저장됨
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[13px] text-[#615D59] transition-colors hover:text-[#111110] disabled:opacity-40"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-[#084734] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#065c41] disabled:opacity-40"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
      {save.status === "error" ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 border-t border-[#F2B8B8] bg-[#FCE9E9] px-5 py-2.5 text-[12px] text-[#B43E3E]"
        >
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {save.message}
        </p>
      ) : null}
    </>
  )
}

interface NavPreferenceDialogProps {
  ariaLabel: string
  eyebrow: string
  title: string
  subtitle?: string
  onClose: () => void
  closeButtonRef: RefObject<HTMLButtonElement | null>
  children: ReactNode
}

/**
 * 두 드로어가 공유하는 오버레이·다이얼로그 틀. admin 트리 안의 fixed 오버레이는 조상의
 * transform(RouteTransition 등)에 끌려가지 않도록 document.body 로 포털한다.
 */
export function NavPreferenceDialog({
  ariaLabel,
  eyebrow,
  title,
  subtitle,
  onClose,
  closeButtonRef,
  children,
}: NavPreferenceDialogProps) {
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(0,0,0,0.4)] p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-[rgba(0,0,0,0.08)] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e4] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">{eyebrow}</p>
            <h2 className="mt-0.5 truncate text-[15px] font-semibold text-[#111110]">{title}</h2>
            {subtitle ? <p className="mt-1 text-[12px] text-[#1a1a1a]/45">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgba(0,0,0,0.05)] text-[#111110] transition-colors hover:bg-[rgba(0,0,0,0.1)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
