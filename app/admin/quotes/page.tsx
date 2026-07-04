"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ChevronDown,
  ClipboardList,
  FileSignature,
  FileText,
  Link2,
  Plus,
  Ticket,
  Users,
} from "lucide-react"

import HardwareQuotesPanel from "@/components/admin/documents/HardwareQuotesPanel"
import SoftwareQuoteCodesPanel from "@/components/admin/documents/SoftwareQuoteCodesPanel"
import { ContractsPanel } from "@/components/admin/documents/ContractsPanel"
import { ReceiptsPanel } from "@/components/admin/documents/ReceiptsPanel"
import type { StandardQuoteTemplateId } from "@/lib/standard-quote-template"

type DocumentTab = "hardware" | "software" | "contracts" | "receipts" | "links"
type HardwareQuoteQuickAction = "new" | StandardQuoteTemplateId
type HardwareQuoteQuickActionRequest = {
  key: string
  action: HardwareQuoteQuickAction
} | null

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

const QUICK_QUOTE_ACTIONS: Array<{
  action: HardwareQuoteQuickAction
  label: string
  description: string
  href: string
}> = [
  {
    action: "new",
    label: "빠른 견적 작성",
    description: "리드 없이 고객명만 입력해 견적을 바로 만듭니다.",
    href: "/admin/quotes/new",
  },
  {
    action: "recording_studio",
    label: "녹화 세트 견적",
    description: "86형 보드, T1, 벽걸이, 자동 녹화 1년 패키지",
    href: "/admin/quotes/recording-studio",
  },
  {
    action: "online_suite",
    label: "AI Suite 견적",
    description: "월 구독형 통합 학원 패키지 견적",
    href: "/admin/quotes/ai-suite",
  },
]

function normalizeDocumentTab(raw: string | null): DocumentTab {
  if (raw === "software" || raw === "software-code" || raw === "sw") return "software"
  if (raw === "contract" || raw === "contracts") return "contracts"
  if (raw === "receipt" || raw === "receipts") return "receipts"
  if (raw === "links" || raw === "shares") return "links"

  return "hardware"
}

function normalizeHardwareQuoteAction(raw: string | null): HardwareQuoteQuickAction | null {
  if (!raw) return null
  if (raw === "new" || raw === "quick" || raw === "quote") return "new"
  if (
    raw === "recording_studio" ||
    raw === "online_suite" ||
    raw === "board_86" ||
    raw === "board_75" ||
    raw === "camera_t1"
  ) {
    return raw
  }
  return null
}

function tabFromParams(params: Pick<URLSearchParams, "get">) {
  return normalizeDocumentTab(params.get("tab") ?? params.get("type"))
}

function tabFromSearch() {
  if (typeof window === "undefined") return "hardware" as DocumentTab
  return tabFromParams(new URLSearchParams(window.location.search))
}

function quickActionFromParams(params: Pick<URLSearchParams, "get" | "toString">): HardwareQuoteQuickActionRequest {
  const action = normalizeHardwareQuoteAction(params.get("action") ?? params.get("quick"))
  if (!action) return null
  return {
    action,
    key: params.toString(),
  }
}

function quickActionFromSearch() {
  if (typeof window === "undefined") return null
  return quickActionFromParams(new URLSearchParams(window.location.search))
}

function QuoteCreateButton({
  onSelect,
}: {
  onSelect: (action: HardwareQuoteQuickAction) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onSelect("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-l-md bg-[#084734] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
        >
          <Plus className="h-4 w-4" />
          견적서 작성
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="견적 템플릿 선택"
          className="inline-flex h-9 items-center rounded-r-md border-l border-white/20 bg-[#084734] px-2 text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-[#e8e8e4] bg-white p-1 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.05)_0px_8px_28px]"
        >
          {QUICK_QUOTE_ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(item.action)
                setOpen(false)
              }}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#ECFDF5]"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#ECFDF5] text-[#084734]">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#111110]">{item.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[#1a1a1a]/50">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
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
  const quickActionSequenceRef = useRef(0)
  const [activeTab, setActiveTab] = useState<DocumentTab>(() => tabFromSearch())
  const [hardwareQuickAction, setHardwareQuickAction] = useState<HardwareQuoteQuickActionRequest>(() =>
    quickActionFromSearch()
  )

  const handleTabChange = (tab: DocumentTab) => {
    setActiveTab(tab)
    setHardwareQuickAction(null)

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      url.searchParams.delete("action")
      url.searchParams.delete("quick")
      window.history.replaceState(null, "", url.toString())
    }
  }

  const openHardwareQuickAction = (action: HardwareQuoteQuickAction) => {
    quickActionSequenceRef.current += 1
    setActiveTab("hardware")
    setHardwareQuickAction({
      action,
      key: `manual-${action}-${quickActionSequenceRef.current}`,
    })

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", "hardware")
      url.searchParams.set("action", action)
      window.history.replaceState(null, "", url.toString())
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#e8e8e4] bg-white px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="text-lg font-bold tracking-[-0.02em] text-[#111110] sm:text-xl">
              견적·문서
            </h1>
            <span className="hidden truncate text-[12px] text-[#1a1a1a]/45 sm:inline">
              견적 · 계약 · 수납을 한 흐름으로
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/admin/crm"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">CRM 고객</span>
            </a>
            <QuoteCreateButton onSelect={openHardwareQuickAction} />
          </div>
        </div>

        <div className="admin-scroll-snap-x no-scrollbar -mb-px mt-3 flex gap-0.5 overflow-x-auto">
          {DOCUMENT_TABS.map((tab) => {
            const active = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                title={tab.description}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border-[#084734] text-[#111110]"
                    : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
                }`}
              >
                <span className={active ? "text-[#084734]" : "text-[#1a1a1a]/40"}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-0 py-0">
        {activeTab === "hardware" && (
          <HardwareQuotesPanel
            quickAction={hardwareQuickAction}
            onQuickActionConsumed={() => setHardwareQuickAction(null)}
          />
        )}
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
