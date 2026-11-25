"use client"

import { buildAdminAiAnnouncement, buildExpiryWarning } from "@/lib/admin-ai/a11y"
import type { AdminAiState } from "@/lib/admin-ai/store"

/**
 * 스크린리더 전용 알림 — 대화 전체를 aria-live 로 두지 않고 "새 답변 한 줄"과 "만료 1분 전" 한 줄만 읽는다.
 * 카드 시계(남은 시간)는 live 영역 밖이라 읽히지 않는다. 두 줄을 따로 두어 만료 경고가 생겨도
 * 답변을 다시 읽지 않는다.
 */
export function AdminAiAnnouncer({ state }: { state: AdminAiState }) {
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {buildAdminAiAnnouncement(state)}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {buildExpiryWarning(state)}
      </p>
    </>
  )
}
