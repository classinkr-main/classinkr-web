"use client"

// 사람별 사이드바 배치 편집기 — 설정 › 회원에서 SUPER_ADMIN 이 다른 사람의 배치를 고친다.
//
// 2026-09-10 전면 공개 전환 이후 이 화면은 "권한"을 다루지 않는다 — 여기서 정하는 것은 그 사람
// 사이드바에서 항목이 상시·접힘·숨김 중 어디에 놓이는지뿐이다. 숨김(2026-09-25)도 목록 정리일 뿐
// 숨긴 탭은 ⌘K와 주소로 그대로 열린다. 프리셋 선택(7종)은 제거됐다(admin-nav-access.ts 상단 주석 참조).
//
// (2026-11-20) "전체 사이드바" 지정 하나가 돌아왔다. 기본은 간소 사이드바(매출 장부 + 견적·문서 + 하드웨어 재고)
// 이고, 이 토글을 켜면 그 사람은 역할을 올리지 않고도 전체 사이드바를 본다 — 저장값은
// nav_preset = "super"(FULL_NAV_PRESET), 끄면 null 이다. 이것도 메뉴 표시일 뿐 접근 권한이
// 아니다(데이터는 각 API 의 역할 검사가 막는다). SUPER_ADMIN 은 역할만으로 항상 전체라 토글이 잠긴다.
//
// 행 목록·미리보기·저장 푸터는 본인 편집(MyNavEditorDrawer)과 같은 NavPreferenceEditor 를 쓴다.
// 미리보기는 그 안에서 admin-nav-access 의 resolveAdminNavAccess 를 쓴다 — 여기서 배치를 다시
// 계산하면 실제 사이드바와 어긋나고, 어긋난 미리보기는 이 기능 전체의 신뢰를 깎는다.
import { useMemo, useRef, useState } from "react"

import { Check } from "lucide-react"

import {
  FULL_NAV_PRESET,
  getSimpleNavPrimaryLabels,
  hasFullAdminNav,
  normalizeNavOverrides,
  type NavOverrides,
} from "@/components/admin/admin-nav-access"
import NavPreferenceEditor, {
  countNavPreferenceExceptions,
  NavPreferenceDialog,
  NavPreferenceFooter,
  type NavSaveState,
} from "@/components/admin/settings/NavPreferenceEditor"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { adminFetchJson } from "@/lib/admin-client"

interface MemberNavAccessDrawerProps {
  userId: string
  displayName: string
  targetRole: string
  /** 그 사람의 현재 nav_preset. "super" 면 전체 사이드바 지정 계정이다. */
  initialPreset?: string | null
  initialOverrides: Record<string, string>
  onClose: () => void
  /**
   * 저장된 값 — 호출부 MembersPanel 이 회원 행에 담는다. navPreset 은 "super"(전체 사이드바 지정)
   * 또는 null 이다.
   */
  onSaved: (navOverrides: NavOverrides, navPreset: string | null) => void
}

export default function MemberNavAccessDrawer({
  userId,
  displayName,
  targetRole,
  initialPreset = null,
  initialOverrides,
  onClose,
  onSaved,
}: MemberNavAccessDrawerProps) {
  // 전면 공개 이후 오버라이드는 역할과 무관하게 똑같이 적용된다 — SUPER_ADMIN 이라고 무시되지
  // 않으므로 예전의 전체 잠금(locked)은 사라졌다. 정규화가 hidden 을 보존해야 한다 — 버리면
  // 이 드로어를 한 번 저장하는 것만으로 그 사람이 숨긴 탭이 조용히 되살아난다. CRM 하위 탭
  // 선택(crm: 키, 2026-09-25)도 같은 이유로 정규화가 보존하고, 편집기 아래 섹션에서 함께 고친다.
  const [overrides, setOverrides] = useState<NavOverrides>(() =>
    normalizeNavOverrides(initialOverrides)
  )
  // 전체 사이드바 지정 — "super" 만 뜻이 있다. 레거시 값(sales·branch 등)은 꺼짐으로 읽고, 저장하면
  // null 로 정리된다(2026-09-10 부터 이 드로어가 하던 일 그대로).
  const [fullNavDesignated, setFullNavDesignated] = useState(initialPreset === FULL_NAV_PRESET)
  const [save, setSave] = useState<NavSaveState>({ status: "idle" })
  const navPreset = fullNavDesignated ? FULL_NAV_PRESET : null
  // 역할만으로 이미 전체인 사람(SUPER_ADMIN)은 지정이 아무것도 바꾸지 않는다 — 토글을 잠근다.
  const fullByRole = hasFullAdminNav({ role: targetRole })
  const saving = save.status === "saving"

  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(userId, onClose, closeButtonRef)

  const exceptionCount = useMemo(
    () => countNavPreferenceExceptions({ role: targetRole, preset: navPreset, overrides }),
    [targetRole, navPreset, overrides]
  )

  const handleSave = async () => {
    setSave({ status: "saving" })
    try {
      // PATCH는 두 컬럼을 함께 덮어쓴다(app/api/admin/users/route.ts) — 하나만 보내면
      // 나머지가 null/{}로 밀린다. 프리셋은 "전체 사이드바" 토글 값 그대로 보낸다: 켜짐 = "super",
      // 꺼짐 = null. **항상 null 로 밀던 예전 동작을 되살리지 말 것** — 배치만 고쳐 저장해도 지정
      // 계정의 전체 사이드바가 조용히 꺼진다.
      await adminFetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, navPreset, navOverrides: overrides }),
      })
      setSave({ status: "saved" })
      onSaved(overrides, navPreset)
    } catch (error) {
      setSave({
        status: "error",
        message: error instanceof Error ? error.message : "저장에 실패했습니다.",
      })
    }
  }

  return (
    <NavPreferenceDialog
      ariaLabel={`${displayName} 사이드바 배치`}
      eyebrow="사이드바 배치"
      title={displayName}
      subtitle={`기본과 다른 항목 ${exceptionCount}개`}
      onClose={onClose}
      closeButtonRef={closeButtonRef}
    >
      {/* 전체 사이드바 지정 — 회원 카드의 실행 권한 토글과 같은 체크 모양(aria-pressed). */}
      <div className="border-b border-[#e8e8e4] px-5 py-3">
        <button
          type="button"
          aria-pressed={fullByRole || fullNavDesignated}
          disabled={fullByRole || saving}
          onClick={() => {
            setFullNavDesignated((previous) => !previous)
            setSave({ status: "idle" })
          }}
          className="flex w-full items-start gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2.5 text-left transition-colors hover:bg-[#ECFDF5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
        >
          <span
            aria-hidden
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              fullByRole || fullNavDesignated
                ? "border-[#084734] bg-[#084734] text-white"
                : "border-[rgba(0,0,0,0.16)] bg-white text-transparent"
            }`}
          >
            <Check className="h-3 w-3" />
          </span>
          <span>
            <span className="block text-[12px] font-semibold text-[#111110]">전체 사이드바</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-[#1a1a1a]/45">
              {fullByRole
                ? "최고 관리자는 항상 전체 사이드바를 봅니다."
                : `끄면 ${getSimpleNavPrimaryLabels().join(" · ")}만 보입니다. 켜도 역할과 데이터 권한은 그대로입니다.`}
            </span>
          </span>
        </button>
      </div>
      <NavPreferenceEditor
        role={targetRole}
        preset={navPreset}
        overrides={overrides}
        onChange={(next) => {
          setOverrides(next)
          if (save.status !== "saving") setSave({ status: "idle" })
        }}
        subject="member"
        disabled={saving}
      />
      <NavPreferenceFooter save={save} onClose={onClose} onSave={() => void handleSave()} />
    </NavPreferenceDialog>
  )
}
