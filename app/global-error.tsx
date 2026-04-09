"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[GlobalError]", error)
  }, [error])

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily: "Inter, -apple-system, system-ui, Segoe UI, Helvetica, Arial, sans-serif",
          backgroundColor: "#FAFAF8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "16px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            backgroundColor: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: "16px",
            padding: "40px",
            maxWidth: "400px",
            width: "100%",
            boxShadow:
              "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "#ECFDF5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: "24px",
            }}
          >
            ⚠
          </div>
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              color: "#111110",
              margin: "0 0 12px",
            }}
          >
            오류가 발생했어요
          </h1>
          <p
            style={{
              fontSize: "15px",
              lineHeight: 1.5,
              color: "#615D59",
              margin: "0 0 28px",
            }}
          >
            앱에서 예기치 않은 오류가 발생했습니다.
          </p>
          <button
            onClick={reset}
            style={{
              backgroundColor: "#084734",
              color: "#ffffff",
              padding: "10px 24px",
              borderRadius: "6px",
              fontSize: "15px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
