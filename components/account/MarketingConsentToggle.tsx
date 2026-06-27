"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

const PENDING_CONSENT_KEY = "cln_pending_marketing_consent"

async function fetchConsent(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/account/marketing-consent", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; consent?: boolean }
    return data.ok ? Boolean(data.consent) : null
  } catch {
    return null
  }
}

async function postConsent(consent: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/account/marketing-consent", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consent }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function MarketingConsentToggle() {
  const [consent, setConsent] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const drainedRef = useRef(false)

  useEffect(() => {
    let active = true

    const init = async () => {
      const current = await fetchConsent()
      if (!active) return

      // 첫 로그인 시 다이얼로그 체크박스가 남긴 의도를 한 번만 반영한다.
      let next = current
      if (!drainedRef.current) {
        drainedRef.current = true
        let pending: string | null = null
        try {
          pending = window.localStorage.getItem(PENDING_CONSENT_KEY)
        } catch {
          pending = null
        }
        if (pending !== null) {
          try {
            window.localStorage.removeItem(PENDING_CONSENT_KEY)
          } catch {
            // 무시: 스토리지 접근 실패는 동의 기록에 영향 없음
          }
          if (pending === "1" && current !== true) {
            const ok = await postConsent(true)
            if (active && ok) next = true
          }
        }
      }

      if (active) setConsent(next ?? false)
    }

    void init()
    return () => {
      active = false
    }
  }, [])

  const handleToggle = async () => {
    if (consent === null || saving) return
    const nextValue = !consent
    setSaving(true)
    setError("")
    const ok = await postConsent(nextValue)
    if (ok) {
      setConsent(nextValue)
    } else {
      setError("동의 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    }
    setSaving(false)
  }

  const checked = consent === true
  const disabled = consent === null || saving

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[#1A1A1A]">마케팅 정보 수신</p>
        <p className="mt-1 text-[13px] leading-5 text-[#6B6661]">
          신규 자료·웨비나·제품 소식을 이메일로 받아봅니다. 언제든 다시 끌 수 있습니다.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="마케팅 정보 수신 동의"
        onClick={handleToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:opacity-50 ${
          checked ? "bg-[#084734]" : "bg-[#D6D3D0]"
        }`}
      >
        {saving ? (
          <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
        ) : (
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        )}
      </button>
      {error ? (
        <p role="alert" className="sr-only">
          {error}
        </p>
      ) : null}
    </div>
  )
}
