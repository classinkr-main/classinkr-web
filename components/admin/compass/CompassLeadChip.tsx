"use client"

// Compass 상태 칩 — 우리 리드 카드/행 위에 마케팅팀(Compass) 콜 상태를 **병기**한다.
//
// 톤 규약: 아웃라인·무채색. 채움 배경과 상태색을 쓰지 않는다 — 이건 우리 파이프라인 상태가
// 아니라 남의 원장에서 읽어 온 참조값이라, 우리 상태 배지(미확인·연락함·전환)보다 조용해야 한다.
// 매칭이 없으면 이 컴포넌트 자체가 그려지지 않는다(호출부에서 entry 없으면 null).

import { ExternalLink } from "lucide-react"

import type { CompassOverlayEntry } from "@/lib/compass/overlay"
import { summarizeCompassEntry } from "@/lib/compass/overlay"

const BASE_CLASS =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-[#e8e8e4] bg-white " +
  "px-1.5 py-0.5 text-[11px] font-medium leading-tight text-[#615D59]"

export function CompassLeadChip({
  entry,
  /**
   * 새 탭 링크로 그릴지. 조상이 <button>인 자리(보드 카드·모바일 카드)에서는 false —
   * button 안에 a를 넣으면 유효하지 않은 DOM이 되고 클릭 대상이 겹친다.
   */
  interactive = true,
  className = "",
}: {
  entry: CompassOverlayEntry
  interactive?: boolean
  className?: string
}) {
  const summary = summarizeCompassEntry(entry)
  const body = (
    <>
      <span className="shrink-0 font-semibold text-[#111110]">{summary.primary}</span>
      {summary.details.length > 0 ? (
        <span className="min-w-0 truncate">· {summary.details.join(" · ")}</span>
      ) : null}
      {interactive ? <ExternalLink aria-hidden className="h-2.5 w-2.5 shrink-0 opacity-60" /> : null}
    </>
  )

  if (!interactive) {
    return (
      <span className={`${BASE_CLASS} ${className}`} title={summary.title}>
        {body}
      </span>
    )
  }

  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer"
      // 행 전체가 상세 진입점인 표/목록 안에서 쓰인다 — 클릭이 행 열기로 새어 나가지 않게 막는다.
      onClick={(event) => event.stopPropagation()}
      title={`${summary.title} — Compass에서 열기`}
      aria-label={`${summary.title} — Compass에서 열기`}
      className={`${BASE_CLASS} transition-colors hover:border-[#c8c8c4] hover:text-[#111110] ${className}`}
    >
      {body}
    </a>
  )
}

/**
 * 브리지가 죽었을 때의 한 줄. 칩이 사라진 이유를 말하지 않으면 "마케팅팀이 아직 안 건드림"으로
 * 오독된다 — 무음 강등을 금지하는 자리다.
 */
export function CompassBridgeDownNote({ className = "" }: { className?: string }) {
  return (
    <p
      role="status"
      className={`flex items-center gap-1.5 text-[11px] font-medium text-[#84827a] ${className}`}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8c8c4]" />
      Compass 연결 끊김 — 마케팅팀 콜 상태를 지금은 겹쳐 볼 수 없습니다. 칩이 없는 것이 &ldquo;미접촉&rdquo;을
      뜻하지 않습니다.
    </p>
  )
}
