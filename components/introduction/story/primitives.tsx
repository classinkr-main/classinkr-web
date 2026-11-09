import { Fragment, type ReactNode } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// /introduction/story 전용 조각. components/introduction/sections 와 같은 규칙(DESIGN.md §5-A)을 따르되
// 그 폴더를 import 하지 않는다 — 대표 랜딩이 바뀌어도 이 페이지가 흔들리지 않게 자기 폴더에 둔다.

/** 모든 섹션의 안쪽 컨테이너(max-w-page 1296, 거터 16/24/48) */
export const STORY_CONTAINER = "mx-auto max-w-page px-4 sm:px-6 lg:px-12"

/** primary 채움(뷰포트당 하나) · line 보조 · 텍스트 링크. 휴대폰에서는 버튼이 전폭으로 쌓인다.
 *  line 은 PDF 이름·크기가 들어가 360px 화면에서 넘칠 수 있어 줄바꿈을 허용한다(높이는 최소 48) */
export const STORY_PRIMARY = cn(buttonVariants({ size: "cta" }), "w-full shadow-none sm:w-auto")
export const STORY_LINE = cn(
  buttonVariants({ variant: "line", size: "cta" }),
  "h-auto min-h-12 w-full whitespace-normal py-2 sm:w-auto"
)
export const STORY_TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent underline-offset-4 hover:underline"

/** 두 줄 이상 제목 — 줄마다 블록. 읽기 도구·검색에는 한 문장으로 이어지도록 줄 사이에 공백을 둔다 */
export function Lines({ lines, lineClassName }: { lines: readonly string[]; lineClassName?: string }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={line}>
          {index > 0 ? " " : null}
          <span className={cn("block", lineClassName)}>{line}</span>
        </Fragment>
      ))}
    </>
  )
}

/** 장 섹션 — 리듬 base(64/96). 지면은 기본 paper, 근거 장만 sunken(부록 역할) */
export function StoryChapter({
  id,
  surface = "paper",
  children,
}: {
  id: string
  surface?: "paper" | "sunken"
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("py-16 md:py-24", surface === "sunken" ? "bg-surface-sunken" : "bg-surface-paper")}
    >
      <div className={STORY_CONTAINER}>{children}</div>
    </section>
  )
}

/**
 * 장 머리(V12-A): 1px 먹 masthead → 레일 Kicker(폴리오 + 라벨, 1–3칸) + 본문 칸 H2·덱(4–12칸).
 * 64rem 미만은 Kicker 를 H2 위 12px 에 쌓는다. 그린 0.
 */
export function StoryChapterHead({
  id,
  folio,
  kicker,
  title,
  lead,
  children,
}: {
  id: string
  folio: string
  kicker: string
  title: readonly string[]
  lead?: string
  children?: ReactNode
}) {
  return (
    <header className="masthead lg:grid lg:grid-cols-12 lg:gap-x-6">
      <p data-kicker="" className="flex items-center gap-3 text-label text-fg-ink lg:col-span-3">
        <span aria-hidden="true" className="text-folio tabular-nums text-fg-muted">
          {folio}
        </span>
        <span>{kicker}</span>
      </p>
      <div className="mt-3 lg:col-span-9 lg:mt-0">
        <h2 id={`${id}-title`} className="max-w-heading text-h2 text-fg-ink">
          <Lines lines={title} />
        </h2>
        {lead ? <p className="mt-4 max-w-deck text-body-l text-fg-body md:mt-5">{lead}</p> : null}
        {children}
      </div>
    </header>
  )
}

/** 두 자리 폴리오(01, 02 …) */
export function folio(n: number) {
  return String(n).padStart(2, "0")
}

// 흩어진 도구 묶음의 기울기(시안 4). 정지한 모양일 뿐 움직이지 않는다
const TILTS = ["-rotate-3", "rotate-2", "-rotate-1", "rotate-3", "-rotate-2", "rotate-1"] as const

/** 흩어진 수업 도구 한 개 — 흰 낱장(r0, hair). 누를 수 없는 표지라 둥글리지 않는다 */
export function ToolChip({ tool, index }: { tool: string; index: number }) {
  return (
    <li
      className={cn(
        "whitespace-nowrap border border-line-hair bg-surface-sheet px-3 py-1.5 text-caption text-fg-body",
        TILTS[index % TILTS.length]
      )}
    >
      {tool}
    </li>
  )
}

/** 화면 캡처·구성도 매트(V16): sunken 20px(≥64rem 32px) 위에 r0 + hair 캡처 */
export function StoryMat({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-surface-sunken p-5 lg:p-8", className)}>{children}</div>
}
