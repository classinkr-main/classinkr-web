"use client"

import { useState } from "react"

import { cny, cnyExact } from "@/lib/branch/money-format"

// 축약 금액(억/만) + 호버 시 원값 전체 자릿수. 2026-07-17 사용성 디벨롭 항목 1 —
// 표시 레이어 전용, 집계·계산 로직은 건드리지 않는다. 시안:
// docs/active/mockups/branch-usability-accuracy-2026-07-17.html (.money/.tip)
//
// 품질 웨이브 4 — 항목 2. 기존엔 hover 전용이라 키보드·터치 사용자는 정확값(반올림 없는
// 시트 원값)을 볼 방법이 없었다. tabIndex로 포커스 가능하게 하고 focus-visible(키보드
// 포커스만, 마우스/터치 클릭 포커스는 제외 — 브라우저 기본 휴리스틱)에도 같은 툴팁을
// 띄운다. aria-label에 근사값+정확값을 함께 실어 스크린리더가 title 렌더링에 기대지
// 않게 한다(title은 하위호환을 위해 유지).
//
// R5 항목 1. 위 주석이 자인했던 한계(터치 탭은 :focus-visible을 트리거하지 않아 툴팁이
// 안 뜬다) 해소 — onClick으로 pinned 상태를 토글해 탭 1번으로 툴팁을 고정하고, 다시
// 탭하면 해제한다. 이제 실제 토글 동작을 갖는 위젯이라 role="button"으로 승격하고
// aria-expanded를 병기(ARIA 스펙상 aria-expanded는 button 등 위젯 role에서만 유효 —
// 이전의 순수 헬퍼-텍스트 span에는 넣지 않았던 이유가 여기서 해소됨). PipelineCard
// (sections/BranchPipelineKanban.tsx)와 동일하게 Enter/Space 키보드 활성화도 지원하고,
// 이 span이 클릭 가능한 행/카드/아코디언 헤더 안에 중첩될 수 있어(예: DealModal,
// BranchKpiAccordion) stopPropagation으로 부모 onClick(모달 오픈·아코디언 토글 등)이
// 함께 트리거되지 않게 막는다. 표시 전용 — 금액 계산/집계 로직은 그대로다.
export default function MoneyValue({
  value,
  prefix = "¥",
}: {
  value: number | null | undefined
  prefix?: string
}) {
  const [pinned, setPinned] = useState(false)
  const exact = `${prefix}${cnyExact(value)}`
  const approx = `${prefix}${cny(value)}`

  function togglePinned(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    setPinned((v) => !v)
  }

  return (
    <span
      role="button"
      className="group/money relative cursor-help border-b border-dashed border-black/25 tabular-nums focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
      title={exact}
      tabIndex={0}
      aria-expanded={pinned}
      aria-label={`${approx} · 정확한 값 ${exact}`}
      onClick={togglePinned}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          togglePinned(e)
        }
      }}
    >
      {prefix}
      {cny(value)}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-[calc(100%+8px)] z-20 whitespace-nowrap rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity duration-150 group-hover/money:opacity-100 group-focus-visible/money:opacity-100 ${pinned ? "opacity-100" : "opacity-0"}`}
      >
        {exact}
        <small className="mt-0.5 block text-[10.5px] font-medium text-[#B9B5AF]">
          시트 원값 · 반올림 없음
        </small>
      </span>
    </span>
  )
}
