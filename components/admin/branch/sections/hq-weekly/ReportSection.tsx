"use client"
// 본사 주간 보고서 한 구획 — ①(문서)과 ②(요약 수치 + 회색 패널)을 CSS로 오간다. 시안 '간이 보고 ①→② 모핑'.
// 문서 표 DOM은 ②에서도 언마운트하지 않는다(grid-template-rows 0fr로 접기만) — 편집 칸 내용이 사라지지 않는다.
// ②에서만 보이는 요소(요약·패널·peek·더보기)는 data-report-exclude를 달아 표 복사에서 빠지고 인쇄에서도 숨긴다.
import type { ReactNode } from "react"
import type { SectionKey } from "@/lib/branch/weekly-action-sections"

export const REPORT_EXCLUDE_ATTR = "data-report-exclude"

export const SECTION_TITLES: Record<SectionKey, string> = {
  perf: "一 실적 진척", collect: "二 이번 달 회수", ka: "三 핵심 KA", market: "四 마케팅 활동", other: "五 기타",
}

const SWAP = "grid transition-[grid-template-rows,opacity] duration-[450ms] ease-in-out motion-reduce:transition-none"

export default function ReportSection({ id, focus, onFocus, first = false, title, peek, moreLabel, doc, summary, panel }: {
  id: SectionKey
  focus: SectionKey | null
  onFocus: (section: SectionKey | null) => void
  first?: boolean
  /** 구획 머리 문구(본사 양식 그대로) */
  title: ReactNode
  /** 접혔을 때 머리 옆에 보이는 한 줄 요약 */
  peek: string
  moreLabel: { open: string; close: string }
  /** ① 문서 표 */
  doc: ReactNode
  /** ② 요약 수치 */
  summary: ReactNode
  /** ② 회색 패널(AI 小结 + 이 구획의 할 일) */
  panel: ReactNode
}) {
  const focused = focus === id
  const dim = focus !== null && !focused
  const toggle = () => onFocus(focused ? null : id)
  return (
    <section data-section={id} aria-label={typeof title === "string" ? title : undefined} className={`${first ? "" : "border-t border-[#E8E8E4]"}`}>
      {/* 머리 전체가 누르는 자리다. 키보드는 안쪽 버튼(제목·더보기)이 받고 클릭은 여기로 올라온다. */}
      <div onClick={toggle} className={`group flex cursor-pointer items-baseline gap-2.5 ${dim ? "py-2.5" : "pb-1.5 pt-3.5"}`}>
        <h3 className="shrink-0 text-[14px] font-bold">
          <button type="button" aria-expanded={focused} className="min-h-11 text-left font-bold md:min-h-7">{title}</button>
        </h3>
        <span {...{ [REPORT_EXCLUDE_ATTR]: "" }} aria-hidden={!dim}
          className={`min-w-0 flex-1 truncate text-[11.5px] text-[#615D59] transition-opacity duration-300 motion-reduce:transition-none print:hidden ${dim ? "opacity-100" : "opacity-0"}`}>{peek}</span>
        <button type="button" {...{ [REPORT_EXCLUDE_ATTR]: "" }} aria-expanded={focused} aria-label={`${focused ? moreLabel.close : moreLabel.open} · ${SECTION_TITLES[id]}`}
          className={`ml-auto inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-[11px] font-bold text-[#084734] transition-opacity duration-200 motion-reduce:transition-none md:min-h-7 print:hidden ${focused ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"}`}>
          {focused ? moreLabel.close : moreLabel.open}
        </button>
      </div>
      <div inert={dim} className={`${SWAP} print:grid-rows-[1fr] print:opacity-100 ${dim ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className={`grid grid-cols-1 pb-3.5 lg:transition-[grid-template-columns,column-gap] lg:duration-[450ms] lg:ease-in-out motion-reduce:transition-none print:grid-cols-[minmax(0,1fr)]! print:gap-x-0! ${focused ? "lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-4" : "lg:grid-cols-[minmax(0,1fr)_0px] lg:gap-x-0"}`}>
            <div className="min-w-0">
              <div inert={focused} className={`${SWAP} print:grid-rows-[1fr] print:opacity-100 ${focused ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"}`}>
                <div className="min-h-0 overflow-hidden">{doc}</div>
              </div>
              <div {...{ [REPORT_EXCLUDE_ATTR]: "" }} inert={!focused} className={`${SWAP} print:hidden ${focused ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="min-h-0 overflow-hidden">{summary}</div>
              </div>
            </div>
            <div {...{ [REPORT_EXCLUDE_ATTR]: "" }} inert={!focused}
              className={`min-w-0 overflow-hidden print:hidden ${focused ? "mt-3 block lg:mt-0" : "hidden lg:block"}`}>
              <div className={`rounded-lg bg-[#F6F5F4] px-3.5 py-3 transition-opacity duration-300 motion-reduce:transition-none lg:w-[360px] ${focused ? "opacity-100 lg:delay-150" : "opacity-0"}`}>{panel}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
