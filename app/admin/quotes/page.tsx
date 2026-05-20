"use client"

import { useState, type ReactNode } from "react"
import {
  ChevronRight,
  ClipboardList,
  FileSignature,
  FileText,
  Link2,
  Ticket,
  Users,
} from "lucide-react"

import HardwareQuotesPanel from "@/components/admin/documents/HardwareQuotesPanel"
import SoftwareQuoteCodesPanel from "@/components/admin/documents/SoftwareQuoteCodesPanel"
import { ContractsPanel } from "@/components/admin/documents/ContractsPanel"
import { ReceiptsPanel } from "@/components/admin/documents/ReceiptsPanel"

type DocumentTab = "hardware" | "software" | "contracts" | "receipts" | "links"

interface DocumentTabItem {
  key: DocumentTab
  label: string
  description: string
  icon: ReactNode
}

const DOCUMENT_TABS: DocumentTabItem[] = [
  {
    key: "hardware",
    label: "하드웨어 견적서",
    description: "품목, 수량, 계약 전환까지 이어지는 매출 견적",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: "software",
    label: "SW 견적 코드",
    description: "체크아웃으로 이어지는 1회성 결제 코드",
    icon: <Ticket className="h-4 w-4" />,
  },
  {
    key: "contracts",
    label: "계약서",
    description: "서명 완료와 계약 확정 상태 관리",
    icon: <FileSignature className="h-4 w-4" />,
  },
  {
    key: "receipts",
    label: "영수증",
    description: "수납 확인, 현금영수증, PDF 발행 기록",
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    key: "links",
    label: "공유 링크",
    description: "열람 로그와 발송 상태를 모을 다음 단계",
    icon: <Link2 className="h-4 w-4" />,
  },
]

const SALES_PROGRESS = [
  {
    label: "견적 생성",
    value: "제안 준비",
    detail: "하드웨어 견적과 SW 결제 코드를 고객별 제안으로 정리",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    label: "계약 진행",
    value: "서명 추적",
    detail: "파트너 서명, 어드민 서명, 공유 링크 상태를 분리해서 확인",
    icon: <FileSignature className="h-4 w-4" />,
  },
  {
    label: "매출 확정",
    value: "수납 기록",
    detail: "결제 완료, 영수증 발행, 후속 전달 이력을 매출 진행 현황으로 연결",
    icon: <ClipboardList className="h-4 w-4" />,
  },
]

function tabFromSearch() {
  if (typeof window === "undefined") return "hardware" as DocumentTab

  const params = new URLSearchParams(window.location.search)
  const raw = params.get("tab") ?? params.get("type")

  if (raw === "software" || raw === "software-code" || raw === "sw") return "software"
  if (raw === "contract" || raw === "contracts") return "contracts"
  if (raw === "receipt" || raw === "receipts") return "receipts"
  if (raw === "links" || raw === "shares") return "links"

  return "hardware"
}

function SalesProgressStrip() {
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      {SALES_PROGRESS.map((item) => (
        <div key={item.label} className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#1a1a1a]/55">
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
                {item.label}
              </p>
              <p className="mt-1 text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
                {item.value}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/50">
                {item.detail}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PanelShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1a1a1a]/35">
        Next
      </p>
      <h2 className="mt-2 text-[17px] font-semibold text-[#111110]">{title}</h2>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1a1a1a]/55">
        {description}
      </p>
      {children}
    </div>
  )
}

export default function QuotesPage() {
  const [activeTab, setActiveTab] = useState<DocumentTab>(() => tabFromSearch())

  const handleTabChange = (tab: DocumentTab) => {
    setActiveTab(tab)

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      window.history.replaceState(null, "", url.toString())
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#e8e8e4] bg-white px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">
              Admin
            </p>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">
              견적·문서
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#1a1a1a]/50">
              견적 생성, 계약 서명, 수납 확인을 한 흐름으로 정리합니다.
              CRM은 고객별 접점과 로그를 보여주고, 이 허브는 매출 진행 현황과 실제 문서 작업을 처리합니다.
            </p>
          </div>
          <a
            href="/admin/crm"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 self-start rounded-md border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[12px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] lg:self-auto"
          >
            <Users className="h-4 w-4" />
            CRM에서 고객 보기
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <SalesProgressStrip />

        <div className="admin-scroll-snap-x no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5">
          {DOCUMENT_TABS.map((tab) => {
            const active = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`min-h-[74px] w-[158px] shrink-0 rounded-xl border px-3 py-3 text-left transition-colors sm:min-h-[96px] sm:w-auto ${
                  active
                    ? "border-[#111110] bg-[#111110] text-white"
                    : "border-[#e8e8e4] bg-[#fafaf8] text-[#111110] hover:border-[#c8c8c4]"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                    active ? "bg-white/12 text-white" : "bg-white text-[#1a1a1a]/45"
                  }`}
                >
                  {tab.icon}
                </span>
                <span className="mt-2 block text-[13px] font-semibold sm:mt-3">{tab.label}</span>
                <span
                  className={`mt-1 hidden text-[11px] leading-snug sm:block ${
                    active ? "text-white/58" : "text-[#1a1a1a]/42"
                  }`}
                >
                  {tab.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-0 py-0">
        {activeTab === "hardware" && <HardwareQuotesPanel />}
        {activeTab === "software" && <SoftwareQuoteCodesPanel />}
        {activeTab === "contracts" && <ContractsPanel />}
        {activeTab === "receipts" && <ReceiptsPanel />}
        {activeTab === "links" && (
          <div className="p-6">
            <PanelShell
              title="공유 링크와 열람 로그는 다음 단계에서 연결합니다."
              description="문서 상태와 발송 상태를 분리한 뒤, 견적 링크 열람, 계약 서명 링크, PDF 발송 기록을 같은 row 모델로 모을 예정입니다."
            >
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {[
                  ["견적 공개 링크", "quote_documents 버전 고정 링크와 고객 열람 시각"],
                  ["계약 서명 링크", "partner_signed, admin_signed 상태와 서명 URL"],
                  ["영수증 전달", "PDF, 이메일 발송, 현금영수증 발행 기록"],
                ].map(([title, detail]) => (
                  <div key={title} className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
                    <p className="text-[13px] font-semibold text-[#111110]">{title}</p>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#1a1a1a]/50">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
            </PanelShell>
          </div>
        )}
      </div>
    </div>
  )
}
