"use client"

import Link from "next/link"
import { useEffect } from "react"

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[AdminError]", error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#FAFAF8" }}
    >
      <div className="w-full max-w-md text-center">
        <div
          className="rounded-2xl p-10 mx-auto"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow:
              "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px",
          }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6 mx-auto"
            style={{ backgroundColor: "#ECFDF5" }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#084734"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1
            className="font-bold mb-3"
            style={{
              fontSize: "28px",
              lineHeight: 1.1,
              letterSpacing: "-0.625px",
              color: "#111110",
            }}
          >
            일시적인 오류가 발생했어요
          </h1>
          <p
            className="mb-8"
            style={{
              fontSize: "15px",
              lineHeight: 1.5,
              color: "#615D59",
            }}
          >
            관리자 페이지에서 예기치 않은 오류가 발생했습니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center font-semibold transition-colors"
              style={{
                backgroundColor: "#084734",
                color: "#ffffff",
                padding: "10px 24px",
                borderRadius: "6px",
                fontSize: "15px",
                border: "none",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            <Link
              href="/admin/overview"
              className="inline-flex items-center justify-center font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(0,0,0,0.05)",
                color: "#111110",
                padding: "10px 24px",
                borderRadius: "6px",
                fontSize: "15px",
                textDecoration: "none",
              }}
            >
              대시보드로
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
