"use client"

// 사람별 사이드바 배치 편집기 — 설정 › 회원에서 SUPER_ADMIN 이 다른 사람의 배치를 고친다.
//
// 2026-09-10 전면 공개 전환 이후 이 화면은 "권한"을 다루지 않는다 — 모든 매니저가 같은 목록을
// 보고, 여기서 정하는 것은 그 사람 사이드바에서 항목이 상시·기타·숨김 중 어디에 놓이는지뿐이다.
// 숨김(2026-09-25)도 목록 정리일 뿐 숨긴 탭은 ⌘K와 주소로 그대로 열린다. 프리셋 선택은 제거됐다
// (admin-nav-access.ts 상단 주석 참조).
//
// 행 목록·미리보기·저장 푸터는 본인 편집(MyNavEditorDrawer)과 같은 NavPreferenceEditor 를 쓴다.
// 미리보기는 그 안에서 admin-nav-access 의 resolveAdminNavAccess 를 쓴다 — 여기서 배치를 다시
// 계산하면 실제 사이드바와 어긋나고, 어긋난 미리보기는 이 기능 전체의 신뢰를 깎는다.
import { useMemo, useRef, useState } from "react"

import {
  normalizeNavOverrides,
  type NavOverrideValue,
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
  initialOverrides: Record<string, string>
  onClose: () => void
  /** 저장된 오버라이드(숨김 포함) — 호출부 MembersPanel 이 키 개수를 세고 회원 행에 담는다. */
  onSaved: (navOverrides: Record<string, NavOverrideValue>) => void
}

export default function MemberNavAccessDrawer({
  userId,
  displayName,
  targetRole,
  initialOverrides,
  onClose,
  onSaved,
}: MemberNavAccessDrawerProps) {
  // 전면 공개 이후 오버라이드는 역할과 무관하게 똑같이 적용된다 — SUPER_ADMIN 이라고 무시되지
  // 않으므로 예전의 전체 잠금(locked)은 사라졌다. 정규화가 hidden 을 보존해야 한다 — 버리면
  // 이 드로어를 한 번 저장하는 것만으로 그 사람이 숨긴 탭이 조용히 되살아난다.
  const [overrides, setOverrides] = useState<Record<string, NavOverrideValue>>(() =>
    normalizeNavOverrides(initialOverrides)
  )
  const [save, setSave] = useState<NavSaveState>({ status: "idle" })

  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(userId, onClose, closeButtonRef)

  const exceptionCount = useMemo(
    () => countNavPreferenceExceptions({ role: targetRole, overrides }),
    [targetRole, overrides]
  )

  const handleSave = async () => {
    setSave({ status: "saving" })
    try {
      // PATCH는 두 컬럼을 함께 덮어쓴다(app/api/admin/users/route.ts) — 하나만 보내면
      // 나머지가 null/{}로 밀린다. 프리셋은 더 이상 화면을 가르지 않으므로 항상 null 로
      // 밀어 레거시 값을 정리한다.
      await adminFetchJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, navPreset: null, navOverrides: overrides }),
      })
      setSave({ status: "saved" })
      onSaved(overrides)
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
      <NavPreferenceEditor
        role={targetRole}
        overrides={overrides}
        onChange={(next) => {
          setOverrides(next)
          if (save.status !== "saving") setSave({ status: "idle" })
        }}
        subject="member"
        disabled={save.status === "saving"}
      />
      <NavPreferenceFooter save={save} onClose={onClose} onSave={() => void handleSave()} />
    </NavPreferenceDialog>
  )
}
