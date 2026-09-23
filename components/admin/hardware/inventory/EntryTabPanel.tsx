"use client"

// 입출고 탭 본문 — HardwareInventoryClient(오케스트레이터)에서 그대로 잘라낸 구조 분해다.
// "빠른 기록" 시트(QuickRecordSheet)는 activeTab과 무관하게 열릴 수 있어 별도 컴포넌트로
// 분리돼 있다 — 이 파일은 입고/출고 하위 세그먼트(inbound·outbound) 요약 뷰만 담당한다.
// 감사(2026-09-07 #6) 탭 경계 분해 원칙과 동일하게 순수 구조 분해 — state는 전부 부모 소유.
import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { Plus } from "lucide-react"

import { SectionLoadingFallback, type HardwareTab } from "./shared"

// 입고/출고 요약은 첫 페인트("home" 탭)에 필요 없다 — 이 탭 파일 자체가 이미 next/dynamic으로
// 지연 로드되므로 여기서 다시 감싸는 것은 하위 섹션 각각을 별도 청크로 더 쪼개는 것(교체 시
// 서로 영향 없음)이다. ssr:false + 스켈레톤은 기존 관례(HardwareInventoryClient) 그대로.
const InboundLotsSection = dynamic(() => import("./InboundLotsSection"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})
const OutboundPeriodSection = dynamic(() => import("./OutboundPeriodSection"), {
  ssr: false,
  loading: () => <SectionLoadingFallback />,
})

interface EntryTabPanelProps {
  activePanelId: string
  activeTabId: string
  reduceMotion: boolean | null
  entrySub: "inbound" | "outbound"
  setEntrySub: (value: "inbound" | "outbound") => void
  openFreshSheet: () => void
  inboundSearch: ComponentProps<typeof InboundLotsSection>["inboundSearch"]
  setInboundSearch: ComponentProps<typeof InboundLotsSection>["setInboundSearch"]
  inboundLots: ComponentProps<typeof InboundLotsSection>["inboundLots"]
  outboundBuckets: ComponentProps<typeof OutboundPeriodSection>["outboundBuckets"]
  outPeriod: ComponentProps<typeof OutboundPeriodSection>["outPeriod"]
  setOutPeriod: ComponentProps<typeof OutboundPeriodSection>["setOutPeriod"]
  openPeriods: ComponentProps<typeof OutboundPeriodSection>["openPeriods"]
  setOpenPeriods: ComponentProps<typeof OutboundPeriodSection>["setOpenPeriods"]
  setCustomerDetail: ComponentProps<typeof OutboundPeriodSection>["setCustomerDetail"]
  setActiveTab: (tab: HardwareTab) => void
  onShowLotHistory?: ComponentProps<typeof InboundLotsSection>["onShowLotHistory"]
  onAddToLot?: ComponentProps<typeof InboundLotsSection>["onAddToLot"]
  canWrite?: boolean
}

export default function EntryTabPanel({
  activePanelId,
  activeTabId,
  reduceMotion,
  entrySub,
  setEntrySub,
  openFreshSheet,
  inboundSearch,
  setInboundSearch,
  inboundLots,
  outboundBuckets,
  outPeriod,
  setOutPeriod,
  openPeriods,
  setOpenPeriods,
  setCustomerDetail,
  setActiveTab,
  onShowLotHistory,
  onAddToLot,
  canWrite = true,
}: EntryTabPanelProps) {
  return (
    <motion.div
      id={activePanelId}
      role="tabpanel"
      aria-labelledby={activeTabId}
      className="space-y-5"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
    >
      {/* 뷰 전환 줄 — 카드 없이 세그먼트+CTA만. 콘텐츠 카드(물량·집계)가 시각적 주인공이 되도록 한다. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 보기 전환은 누름 버튼 묶음(aria-pressed) — role=tab 인데 방향키 이동이 없던 것을 정직하게(E-8). */}
        <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]" role="group" aria-label="입출고 보기">
          <button
            type="button"
            aria-pressed={entrySub === "inbound"}
            onClick={() => setEntrySub("inbound")}
            className={`cursor-pointer rounded-md px-3.5 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
              entrySub === "inbound" ? "bg-[#ECFDF5] text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
            }`}
          >
            입고 · 물량번호
          </button>
          <button
            type="button"
            aria-pressed={entrySub === "outbound"}
            onClick={() => setEntrySub("outbound")}
            className={`cursor-pointer rounded-md px-3.5 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 ${
              entrySub === "outbound" ? "bg-[#ECFDF5] text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
            }`}
          >
            출고 · 기간 집계
          </button>
        </div>
        <button
          type="button"
          onClick={openFreshSheet}
          className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <Plus className="h-3.5 w-3.5" />
          {/* 라벨이 실제 동작을 말한다(E-9) — 입고 보기에서는 입고표(i), 출고 보기에서는 출고 시트(o)를 연다. */}
          {entrySub === "inbound" ? "입고 등록" : "출고 기록"}
          <kbd aria-hidden className="hidden rounded border border-white/30 px-1 font-sans text-[10.5px] font-semibold text-white/80 md:inline">
            {entrySub === "inbound" ? "i" : "o"}
          </kbd>
        </button>
      </div>

      {entrySub === "inbound" && (
        <InboundLotsSection
          inboundSearch={inboundSearch}
          setInboundSearch={setInboundSearch}
          inboundLots={inboundLots}
          onShowLotHistory={onShowLotHistory}
          onAddToLot={onAddToLot}
          canWrite={canWrite}
        />
      )}

      {entrySub === "outbound" && (
        <OutboundPeriodSection
          outboundBuckets={outboundBuckets}
          outPeriod={outPeriod}
          setOutPeriod={setOutPeriod}
          openPeriods={openPeriods}
          setOpenPeriods={setOpenPeriods}
          setCustomerDetail={setCustomerDetail}
        />
      )}

      <div className="flex justify-end">
        <button type="button" onClick={() => setActiveTab("history")} className="-mx-2 cursor-pointer rounded px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40">
          전체 내역 →
        </button>
      </div>
    </motion.div>
  )
}
