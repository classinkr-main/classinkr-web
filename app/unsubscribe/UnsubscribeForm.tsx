"use client"

import { useState } from "react"
import Link from "next/link"

interface Props {
  email: string
}

export default function UnsubscribeForm({ email }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.error === "string" ? data.error : "요청에 실패했습니다.")
      }

      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "요청에 실패했습니다.")
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-6">
        {/* Green checkmark circle */}
        <div
          className="flex items-center justify-center w-14 h-14 rounded-full"
          style={{ background: "#ECFDF5" }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M6 14.5L11.5 20L22 9"
              stroke="#084734"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <h1
            className="text-[22px] font-bold leading-snug tracking-[-0.25px]"
            style={{ color: "#111110" }}
          >
            수신이 거부되었습니다
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: "#615D59" }}>
            더 이상 마케팅 이메일을 받지 않습니다.
            <br />
            언제든지 다시 구독할 수 있습니다.
          </p>
        </div>

        <Link
          href="/"
          className="text-[15px] font-semibold transition-opacity hover:opacity-70"
          style={{ color: "#084734" }}
        >
          홈으로
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
      {/* Brand */}
      <span
        className="text-[13px] font-bold tracking-widest uppercase"
        style={{ color: "#084734" }}
        aria-label="ClassIn"
      >
        ClassIn
      </span>

      {/* Heading */}
      <div className="flex flex-col gap-2">
        <h1
          className="text-[22px] font-bold leading-snug tracking-[-0.25px]"
          style={{ color: "#111110" }}
        >
          이메일 수신을 거부하시겠어요?
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "#615D59" }}>
          수신 거부 후에도 중요한 공지는 발송될 수 있습니다.
        </p>
      </div>

      {/* Email pill badge */}
      <div
        className="inline-flex items-center px-4 py-2 rounded-full text-[13px] font-medium break-all"
        style={{
          background: "#F6F5F4",
          color: "#615D59",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        {email}
      </div>

      {/* Error message */}
      {status === "error" && errorMsg && (
        <p className="text-[13px]" style={{ color: "#b91c1c" }}>
          {errorMsg}
        </p>
      )}

      {/* CTA button */}
      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full py-3 rounded-md text-[15px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-60"
        style={{ background: "#084734" }}
        onMouseEnter={(e) => {
          if (status !== "loading") (e.currentTarget as HTMLButtonElement).style.background = "#065c41"
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = "#084734"
        }}
      >
        {status === "loading" ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="2"
              />
              <path
                d="M14 8a6 6 0 0 0-6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            처리 중…
          </span>
        ) : (
          "수신 거부 확인"
        )}
      </button>

      {/* Ghost back link */}
      <Link
        href="/"
        className="text-[14px] transition-opacity hover:opacity-70"
        style={{ color: "#A39E98" }}
      >
        마음이 바뀌었어요 — 돌아가기
      </Link>
    </form>
  )
}
