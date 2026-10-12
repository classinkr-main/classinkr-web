import Image from "next/image"

/**
 * 갈매봇 그림. 작은 자리(22~52px)는 얼굴, 큰 자리는 전신을 쓴다 — 22px 에서 전신은 뭉개진다.
 * 그림만 파랑·노랑이고 화면 크롬은 DESIGN.md 팔레트를 따른다.
 */
export function GalmaebotAvatar({
  variant = "face",
  size,
  muted = false,
  className = "",
}: {
  variant?: "face" | "full"
  size: number
  /** 장애 상태 — 흑백·반투명으로 낮춘다. */
  muted?: boolean
  className?: string
}) {
  const tone = muted ? "opacity-70 grayscale" : ""

  if (variant === "full") {
    return (
      <Image
        src="/images/admin/galmaebot.png"
        alt=""
        width={size}
        height={size}
        className={`shrink-0 ${tone} ${className}`}
      />
    )
  }

  return (
    <Image
      src="/images/admin/galmaebot-face.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-white ring-1 ring-[#E8E8E4] ${tone} ${className}`}
    />
  )
}
