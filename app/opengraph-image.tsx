import { ImageResponse } from "next/og"

export const alt = "클래스인 Classin — 학원 전자칠판·수업 녹화·운영 플랫폼"
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
            backgroundColor: "#084734",
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
              backgroundColor: "#084734",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#ffffff", fontSize: 28, fontWeight: 700 }}>C</span>
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
            maxWidth: 820,
          }}
        >
          학원 전자칠판·수업 녹화
          <br />
          운영 플랫폼, 클래스인
        </h1>

        {/* Sub text */}
        <p
          style={{
            fontSize: 22,
            fontWeight: 400,
            color: "#615D59",
            lineHeight: 1.4,
            marginTop: 28,
            maxWidth: 640,
          }}
        >
          전자칠판, 수업 녹화, 교안, LMS와 관리자 데이터를
          <br />
          한 흐름으로 연결하는 클래스인
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
              color: "#084734",
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
