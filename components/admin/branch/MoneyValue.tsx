"use client"

import { cny, cnyExact } from "@/lib/branch/money-format"

// 축약 금액(억/만) + 호버 시 원값 전체 자릿수. 2026-07-17 사용성 디벨롭 항목 1 —
// 표시 레이어 전용, 집계·계산 로직은 건드리지 않는다. 시안:
// docs/active/mockups/branch-usability-accuracy-2026-07-17.html (.money/.tip)
//
// 품질 웨이브 4 — 항목 2. 기존엔 hover 전용이라 키보드·터치 사용자는 정확값(반올림 없는
// 시트 원값)을 볼 방법이 없었다. tabIndex로 포커스 가능하게 하고 focus-visible(키보드
// 포커스만, 마우스/터치 클릭 포커스는 제외 — 브라우저 기본 휴리스틱)에도 같은 툴팁을
// 띄운다. aria-label에 근사값+정확값을 함께 실어 스크린리더가 title 렌더링에 기대지
// 않게 한다(title은 하위호환을 위해 유지). 터치 판단: 이 span은 실제 컨트롤이 아니라
// 아웃라인 강조된 헬퍼 텍스트라 role="button"으로 승격하지 않았다 — 그 결과 터치 탭은
// 대부분의 모바일 브라우저에서 :focus-visible을 트리거하지 않는 포인터 상호작용으로
// 분류돼(마우스 클릭과 동일 취급) 툴팁이 뜨지 않을 수 있다. title 속성도 터치에서는
// iOS/Android 대부분 표시되지 않는다 — 이 한계는 aria/title 범위 밖(탭 시 토글하는
// onClick 핸들러가 필요)이라 이번 웨이브에서는 손대지 않고 판단만 보고한다.
export default function MoneyValue({
  value,
  prefix = "¥",
}: {
  value: number | null | undefined
  prefix?: string
}) {
  const exact = `${prefix}${cnyExact(value)}`
  const approx = `${prefix}${cny(value)}`
  return (
    <span
      className="group/money relative cursor-help border-b border-dashed border-black/25 tabular-nums focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
      title={exact}
      tabIndex={0}
      aria-label={`${approx} · 정확한 값 ${exact}`}
    >
      {prefix}
      {cny(value)}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-20 whitespace-nowrap rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-semibold text-white opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity duration-150 group-hover/money:opacity-100 group-focus-visible/money:opacity-100"
      >
        {exact}
        <small className="mt-0.5 block text-[10.5px] font-medium text-[#B9B5AF]">
          시트 원값 · 반올림 없음
        </small>
      </span>
    </span>
  )
}
