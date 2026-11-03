import { ImageResponse } from "next/og"
import { color } from "@/lib/design-tokens"

export const alt = "클래스인 Classin — 수업 녹화·AI 강의 평가까지 되는 학원 전자칠판"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          backgroundColor: "#FAFAF8",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Green accent top bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: color.accent,
          }}
        />

        {/* Logo badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: color.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: color.onAccent, fontSize: 28, fontWeight: 700 }}>C</span>
          </div>
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#615D59",
              letterSpacing: "0px",
            }}
          >
            Classin
          </span>
        </div>

        {/* Main heading */}
        <h1
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#111110",
            lineHeight: 1.04,
            letterSpacing: "-2.125px",
            margin: 0,
            maxWidth: 1000,
            // satori 는 <br /> 를 줄바꿈으로 그리지 않는다 — 줄마다 블록으로 쌓는다
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>수업하면 녹화되고,</span>
          <span>끝나면 평가되는 학원 전자칠판</span>
        </h1>

        {/* Sub text */}
        <p
          style={{
            fontSize: 22,
            fontWeight: 400,
            color: "#615D59",
            lineHeight: 1.4,
            marginTop: 28,
            maxWidth: 820,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>수업 녹화 · AI 강의 평가 · 교안·숙제·시험 관리까지</span>
          <span>전자칠판 하나로, 클래스인 Classin</span>
        </p>

        {/* Bottom right accent */}
        <div
          style={{
            position: "absolute",
            bottom: 60,
            right: 96,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              backgroundColor: "#ECFDF5",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 9999,
              padding: "6px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: color.accent,
              letterSpacing: "0.125px",
            }}
          >
            classin.co.kr
          </div>
        </div>

        {/* Decorative green circle */}
        <div
          style={{
            position: "absolute",
            bottom: -120,
            right: -120,
            width: 400,
            height: 400,
            borderRadius: 9999,
            backgroundColor: "#ECFDF5",
            opacity: 0.6,
          }}
        />
      </div>
    ),
    { ...size }
  )
}
