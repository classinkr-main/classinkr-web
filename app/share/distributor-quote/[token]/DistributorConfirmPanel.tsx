"use client"

import { useState } from "react"

import { formatDate, formatTime } from "@/lib/format"

// 총판 견적서 공유 링크의 [견적 확인](2026-11-24). 누르면 확인 시각이 남고, 총판 이메일로 확인 완료 사본이,
// 사내에는 알림이 간다. 금액이 수정되면 확인이 풀려 다시 누르게 된다.

function formatDateTime(value: string) {
  return `${formatDate(value, "prose")} ${formatTime(value)}`
}

export default function DistributorConfirmPanel({
  token,
  initialConfirmedAt,
  initialConfirmedByName,
  revisedAt,
  hasEmail,
  available,
}: {
  token: string
  initialConfirmedAt: string | null
  initialConfirmedByName: string | null
  revisedAt: string | null
  hasEmail: boolean
  /** 확인 칸(마이그레이션)이 없으면 버튼을 내놓지 않는다. */
  available: boolean
}) {
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt)
  const [confirmedByName, setConfirmedByName] = useState(initialConfirmedByName)
  const [name, setName] = useState("")
  const [asking, setAsking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!available) return null

  if (confirmedAt) {
    return (
      <section className="border-b border-line-hair bg-surface-sunken px-6 py-4 text-body text-fg-accent sm:px-10 print:hidden">
        <p className="text-label">견적 확인 완료</p>
        <p className="mt-0.5 text-caption text-fg-muted">
          {formatDateTime(confirmedAt)}
          {confirmedByName ? ` · ${confirmedByName}` : ""}
          {hasEmail ? " · 확인 내용을 등록된 이메일로 보내 드렸습니다." : ""}
        </p>
      </section>
    )
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/share/distributor-quote/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { confirmedAt?: string | null; confirmedByName?: string | null; error?: string }
        | null
      if (!response.ok || !payload?.confirmedAt) {
        throw new Error(payload?.error ?? "확인을 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.")
      }
      setConfirmedAt(payload.confirmedAt)
      setConfirmedByName(payload.confirmedByName ?? null)
      setAsking(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "확인을 저장하지 못했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="border-b border-line-hair bg-surface-sheet px-6 py-5 sm:px-10 print:hidden">
      {revisedAt && (
        <p className="mb-3 rounded-lg border border-line-strong bg-surface-sunken px-3 py-2 text-caption text-fg-danger">
          {formatDateTime(revisedAt)}에 금액이 수정됐습니다. 바뀐 금액을 확인하고 다시 눌러 주세요.
        </p>
      )}
      {!asking ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-fg-body">아래 금액과 품목을 확인하셨으면 견적 확인을 눌러 주세요.</p>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="rounded-lg bg-fg-accent px-4 py-2 text-label text-fg-on-accent hover:bg-fg-accent-hover"
          >
            견적 확인
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="distributor-confirm-name" className="text-body text-fg-body">
            확인하시는 분 이름(선택)
          </label>
          <input
            id="distributor-confirm-name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 배철웅"
            className="w-full max-w-xs rounded-lg border border-line-control bg-surface-sheet px-3 py-2 text-body text-fg-ink placeholder:text-fg-placeholder"
          />
          <p className="text-caption text-fg-muted">
            {hasEmail
              ? "확인하면 담당자에게 알림이 가고, 확인 내용이 등록된 이메일로 발송됩니다."
              : "확인하면 담당자에게 알림이 갑니다."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-lg bg-fg-accent px-4 py-2 text-label text-fg-on-accent hover:bg-fg-accent-hover disabled:opacity-60"
            >
              {submitting ? "저장 중…" : "확인했습니다"}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={submitting}
              className="rounded-lg border border-line-control px-4 py-2 text-label text-fg-body hover:bg-surface-sunken"
            >
              취소
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-caption text-fg-danger">{error}</p>}
    </section>
  )
}
