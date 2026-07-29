"use client"

// 슈퍼 관리자 전용 탭 권한 편집기 — 스펙 docs/active/admin-tab-restructure-2026-07-29.md §5.4.
// 미리보기는 반드시 admin-nav-access의 resolveNavAccess를 쓴다. 여기서 배치를 다시 계산하면
// 실제 사이드바와 어긋나고, 어긋난 미리보기는 이 기능 전체의 신뢰를 깎는다.
import { useMemo, useRef, useState } from "react"
import { Check, CircleAlert, Loader2, X } from "lucide-react"

import { ADMIN_NAV, ADMIN_NAV_CATEGORY_META } from "@/components/admin/admin-nav"
import {
  NAV_PRESETS,
  isNavPresetKey,
  normalizeNavOverrides,
  resolveNavAccess,
  resolveNavPlacement,
  type NavAccessContext,
  type NavPlacement,
  type NavPresetKey,
} from "@/components/admin/admin-nav-access"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { adminFetchJson } from "@/lib/admin-client"

const PLACEMENTS: Array<{ value: NavPlacement; label: string }> = [
  { value: "primary", label: "상시" },
  { value: "folded", label: "기타" },
  { value: "deny", label: "차단" },
]

// 선택된 배치별 톤 — DESIGN.md 운영 상태 스케일(Danger/Success)을 그대로 쓴다.
// "기타"는 상태 신호가 아니라 중립 선택이라 뉴트럴 톤을 쓴다.
const PLACEMENT_ACTIVE_TONE: Record<NavPlacement, string> = {
  primary: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  folded: "border-[rgba(0,0,0,0.14)] bg-white text-[#111110]",
  deny: "border-[#F2B8B8] bg-[#FCE9E9] text-[#B43E3E]",
}

type SaveState = { status: "idle" | "saving" | "saved" } | { status: "error"; message: string }

interface MemberNavAccessDrawerProps {
  userId: string
  displayName: string
  targetRole: string
  initialPreset: string | null
  initialOverrides: Record<string, string>
  onClose: () => void
  onSaved: (navPreset: string | null, navOverrides: Record<string, NavPlacement>) => void
}

export default function MemberNavAccessDrawer({
  userId,
  displayName,
  targetRole,
  initialPreset,
  initialOverrides,
  onClose,
  onSaved,
}: MemberNavAccessDrawerProps) {
  // SUPER_ADMIN 대상은 resolveNavPlacement가 오버라이드 조회 전에 이미 배치를 확정해
  // 반환한다(admin-nav-access.ts) — 즉 이 사람에게 오버라이드를 걸어도 실제로는 무시된다.
  // 편집 UI를 열어두면 "저장했는데 왜 안 바뀌지"만 만들기 때문에 아예 전부 잠근다.
  const locked = targetRole === "SUPER_ADMIN"

  const [preset, setPreset] = useState<NavPresetKey | null>(
    isNavPresetKey(initialPreset) ? initialPreset : null
  )
  const [overrides, setOverrides] = useState<Record<string, NavPlacement>>(() =>
    normalizeNavOverrides(initialOverrides)
  )
  const [save, setSave] = useState<SaveState>({ status: "idle" })

  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(userId, onClose, closeButtonRef)

  const ctx = useMemo<NavAccessContext>(
    () => ({ role: targetRole, preset, overrides }),
    [targetRole, preset, overrides]
  )
  // 프리셋만 적용했을 때의 배치 — "예외" 뱃지·오버라이드 정리(setPlacement) 판정 기준.
  const presetOnly = useMemo<NavAccessContext>(
    () => ({ role: targetRole, preset, overrides: {} }),
    [targetRole, preset]
  )

  const preview = useMemo(() => resolveNavAccess(ctx), [ctx])
  const foldedCount = useMemo(
    () => preview.folded.reduce((sum, group) => sum + group.items.length, 0),
    [preview]
  )
  const foldedCategoryLabel = useMemo(
    () => preview.folded.map((group) => ADMIN_NAV_CATEGORY_META[group.category].label).join(" · "),
    [preview]
  )

  const rows = useMemo(
    () =>
      ADMIN_NAV.map((item) => {
        const current = resolveNavPlacement(item.href, ctx)
        const base = resolveNavPlacement(item.href, presetOnly)
        return { item, current, isException: current !== base }
      }),
    [ctx, presetOnly]
  )
  const exceptionCount = useMemo(() => rows.filter((row) => row.isException).length, [rows])

  // 프리셋 기본값과 같아지면 오버라이드를 지운다 — 불필요한 예외가 쌓이면 읽기 어려워진다.
  const setPlacement = (href: string, next: NavPlacement) => {
    if (locked) return
    const base = resolveNavPlacement(href, presetOnly)
    setOverrides((prev) => {
      const draft = { ...prev }
      if (next === base) delete draft[href]
      else draft[href] = next
      return draft
    })
  }

  const handleSave = async () => {
    if (locked) return
    setSave({ status: "saving" })
    try {
      // PATCH는 두 컬럼을 함께 덮어쓴다(app/api/admin/users/route.ts) — 하나만 보내면
      // 나머지가 null/{}로 밀린다. 그래서 preset/overrides를 항상 같이 보낸다.
      await adminFetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, navPreset: preset, navOverrides: overrides }),
      })
      setSave({ status: "saved" })
      onSaved(preset, overrides)
    } catch (error) {
      setSave({
        status: "error",
        message: error instanceof Error ? error.message : "저장에 실패했습니다.",
      })
    }
  }

  const saving = save.status === "saving"

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,0,0,0.4)] p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} 탭 권한 설정`}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-[rgba(0,0,0,0.08)] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e4] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#615D59]">탭 권한</p>
            <h2 className="mt-0.5 truncate text-[15px] font-semibold text-[#111110]">{displayName}</h2>
            <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
              {locked ? "최고 관리자는 항상 전체 메뉴를 봅니다" : `예외 ${exceptionCount}개`}
            </p>
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

        {/* 프리셋 */}
        <div className="border-b border-[#e8e8e4] px-5 py-4">
          <label htmlFor="nav-access-preset" className="mb-1.5 block text-[11px] font-medium text-[#615D59]">
            프리셋
          </label>
          <select
            id="nav-access-preset"
            value={preset ?? ""}
            disabled={locked}
            onChange={(event) => {
              const value = event.target.value
              setPreset(value === "" ? null : (value as NavPresetKey))
            }}
            className="w-full rounded-lg border border-[#E5E5E0] bg-white px-3 py-2 text-[13px] focus:border-[#084734] focus:outline-none focus:ring-1 focus:ring-[#084734] disabled:cursor-not-allowed disabled:bg-[#fafaf8] disabled:text-[#1a1a1a]/40"
          >
            <option value="">미배정 (기존 동작 유지)</option>
            {(Object.keys(NAV_PRESETS) as NavPresetKey[]).map((key) => (
              <option key={key} value={key}>
                {NAV_PRESETS[key].label}
              </option>
            ))}
          </select>
        </div>

        {/* 탭 목록 — 3-way 토글 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <ul>
            {rows.map(({ item, current, isException }) => (
              <li
                key={item.href}
                className="flex items-center justify-between gap-3 border-b border-[#f0f0ec] px-3 py-2.5 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <item.icon className="h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/35" />
                  <span className="truncate text-[12.5px] font-medium text-[#111110]">{item.label}</span>
                  {isException ? (
                    <span className="shrink-0 rounded-full border border-[#ECD29C] bg-[#FBF1E0] px-1.5 py-0.5 text-[10px] font-semibold text-[#A8741A]">
                      예외
                    </span>
                  ) : null}
                </div>
                <div className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] p-0.5">
                  {PLACEMENTS.map((placement) => {
                    const active = current === placement.value
                    return (
                      <button
                        key={placement.value}
                        type="button"
                        aria-pressed={active}
                        disabled={locked}
                        onClick={() => setPlacement(item.href, placement.value)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          active
                            ? PLACEMENT_ACTIVE_TONE[placement.value]
                            : "border-transparent text-[#1a1a1a]/40 hover:bg-white hover:text-[#111110]"
                        }`}
                      >
                        {placement.label}
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 미리보기 — 저장 전에 실제 사이드바 결과를 보여주는 핵심 장치 */}
        <div className="space-y-2 border-t border-[#e8e8e4] px-5 py-4">
          <p className="text-[11px] font-medium text-[#615D59]">미리보기</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.primary.map((item) => (
              <span
                key={item.href}
                className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#111110]"
              >
                {item.label}
              </span>
            ))}
          </div>
          {foldedCount > 0 ? (
            <p className="text-[11px] text-[#1a1a1a]/45">
              ▸ 기타 {foldedCount} ({foldedCategoryLabel})
            </p>
          ) : null}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-2 border-t border-[#e8e8e4] px-5 py-3.5">
          <div className="text-[11px]">
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
              onClick={handleSave}
              disabled={locked || saving}
              className="rounded-lg bg-[#084734] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#065c41] disabled:opacity-40"
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
      </div>
    </div>
  )
}
