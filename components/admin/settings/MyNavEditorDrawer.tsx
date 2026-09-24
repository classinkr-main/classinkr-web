"use client"

// 본인 사이드바 편집 — 사이드바 사용자 블록의 "사이드바 편집" 버튼, 모바일 메뉴, ⌘K 명령
// (window 이벤트 admin:open-nav-editor)이 연다. 저장은 PATCH /api/admin/me/nav(본인 행만).
//
// 설정 탭에 두지 않는 이유: 설정 API 는 STAFF_ADMIN 전용이라 EDITOR·VIEWER·BRANCH 가 자기
// 사이드바를 고칠 길이 없어진다(app/api/admin/settings/route.ts). 이 편집은 권한이 아니라 취향이다.
import { useMemo, useRef, useState } from "react"

import { normalizeNavOverrides, type NavOverrideValue } from "@/components/admin/admin-nav-access"
import { saveMyNavOverrides } from "@/components/admin/my-nav-preferences"
import NavPreferenceEditor, {
  countNavPreferenceExceptions,
  NavPreferenceDialog,
  NavPreferenceFooter,
  type NavSaveState,
} from "@/components/admin/settings/NavPreferenceEditor"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"

interface MyNavEditorDrawerProps {
  role: string
  name: string
  initialOverrides: Record<string, string>
  onClose: () => void
  /** 서버가 정규화해 돌려준 값. 셸이 사이드바·⌘K 에 즉시 반영한다. */
  onSaved: (navOverrides: Record<string, NavOverrideValue>) => void
}

export default function MyNavEditorDrawer({
  role,
  name,
  initialOverrides,
  onClose,
  onSaved,
}: MyNavEditorDrawerProps) {
  const [overrides, setOverrides] = useState<Record<string, NavOverrideValue>>(() =>
    normalizeNavOverrides(initialOverrides)
  )
  const [save, setSave] = useState<NavSaveState>({ status: "idle" })

  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useDialogFocus(true, onClose, closeButtonRef)

  const exceptionCount = useMemo(
    () => countNavPreferenceExceptions({ role, overrides }),
    [role, overrides]
  )

  const handleSave = async () => {
    setSave({ status: "saving" })
    try {
      const saved = await saveMyNavOverrides(overrides)
      setSave({ status: "saved" })
      onSaved(saved)
    } catch (error) {
      setSave({
        status: "error",
        message: error instanceof Error ? error.message : "저장에 실패했습니다.",
      })
    }
  }

  return (
    <NavPreferenceDialog
      ariaLabel="사이드바 편집"
      eyebrow="사이드바 편집"
      title={name ? `${name}님의 사이드바` : "내 사이드바"}
      subtitle={`기본과 다른 항목 ${exceptionCount}개 · 나에게만 적용됩니다`}
      onClose={onClose}
      closeButtonRef={closeButtonRef}
    >
      <NavPreferenceEditor
        role={role}
        overrides={overrides}
        onChange={(next) => {
          setOverrides(next)
          if (save.status !== "saving") setSave({ status: "idle" })
        }}
        subject="self"
        disabled={save.status === "saving"}
      />
      <NavPreferenceFooter save={save} onClose={onClose} onSave={() => void handleSave()} />
    </NavPreferenceDialog>
  )
}
