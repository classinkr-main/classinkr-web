import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          backgroundColor: "#084734",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: 110,
            fontWeight: 700,
            fontFamily: "sans-serif",
            lineHeight: 1,
          }}
        >
          C
        </span>
      </div>
    ),
    { ...size }
  )
}
