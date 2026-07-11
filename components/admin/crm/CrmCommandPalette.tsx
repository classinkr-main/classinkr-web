"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Building2,
  CircleDollarSign,
  ClipboardList,
  LayoutGrid,
  ListChecks,
  Package,
  PhoneCall,
  Search,
  Target,
  Users,
} from "lucide-react"

import { adminFetchJsonCached } from "@/lib/admin-client"

// CRM 내비 라우트 인덱스 — ⌘K "이동" 명령. AdminSidebar의 CRM 확장과 동일 라우트
// + 머니 표면(매출 장부·하드웨어 재고) 점프를 함께 인덱싱한다.
const NAV_CMDS: Array<{ label: string; sub: string; href: string; icon: ReactNode }> = [
  { label: "현황 · 홈", sub: "코크핏·작업대", href: "/admin/crm", icon: <LayoutGrid className="h-4 w-4" /> },
  { label: "통합 고객", sub: "운영 목록", href: "/admin/crm/customers/unified", icon: <Users className="h-4 w-4" /> },
  { label: "리드 보드", sub: "리드 관리", href: "/admin/crm/customers/leads", icon: <PhoneCall className="h-4 w-4" /> },
  { label: "원천 고객", sub: "NEO 어카운트", href: "/admin/crm/customers/accounts", icon: <Building2 className="h-4 w-4" /> },
  { label: "매출 · 견적", sub: "Deals", href: "/admin/crm/deals", icon: <CircleDollarSign className="h-4 w-4" /> },
  { label: "워크스페이스", sub: "계약·설치·정산 큐", href: "/admin/crm/deals/kpi", icon: <Target className="h-4 w-4" /> },
  { label: "매출 장부", sub: "DSH·REV·KPI 콕핏", href: "/admin/branch/ledger", icon: <BookOpenCheck className="h-4 w-4" /> },
  { label: "하드웨어 재고", sub: "입출고·위치 맵", href: "/admin/hardware", icon: <Package className="h-4 w-4" /> },
  { label: "기록 · 활동", sub: "타임라인", href: "/admin/crm/activity", icon: <Activity className="h-4 w-4" /> },
  { label: "인사이트", sub: "분석", href: "/admin/crm/insights", icon: <BarChart3 className="h-4 w-4" /> },
  { label: "데이터 점검", sub: "매칭 인박스", href: "/admin/crm/matching", icon: <ListChecks className="h-4 w-4" /> },
  { label: "참석자 입력", sub: "Capture", href: "/admin/crm/capture", icon: <ClipboardList className="h-4 w-4" /> },
]

interface CustomerRow {
  key: string
  name: string
  contact: string | null
  sourceLabel: string
  source: "lead" | "neo_account" | "customer"
  href: string
}

interface UnifiedResponse {
  rows: CustomerRow[]
}

type CmdItem =
  | { kind: "nav"; id: string; label: string; sub: string; icon: ReactNode; href: string }
  | { kind: "customer"; id: string; label: string; sub: string; icon: ReactNode; key: string; href?: string }

export default function CrmCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const reqId = useRef(0)

  // ⌘K / Ctrl+K 토글. CRM 레이아웃에만 마운트돼 스코프가 CRM으로 한정된다.
  // 리셋은 effect가 아니라 이벤트 핸들러에서(set-state-in-effect 회피).
  // CRM 라우트에서는 전역 런처(AdminCommandPaletteLauncher)가 언마운트되므로,
  // 사이드바 검색 버튼이 쏘는 admin:open-command-palette 이벤트도 여기서 받아야 한다.
  useEffect(() => {
    function openFresh() {
      setQuery("")
      setRows([])
      setActive(0)
      setOpen(true)
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault()
        setQuery("")
        setRows([])
        setActive(0)
        setOpen((value) => !value)
      } else if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("admin:open-command-palette", openFresh)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("admin:open-command-palette", openFresh)
    }
  }, [])

  // 열릴 때 입력 포커스 — DOM 부수효과만(setState 없음).
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(handle)
  }, [open])

  // 고객 검색 — CrmCustomerPicker와 동일 엔드포인트 재사용(디바운스). 빈 쿼리는 fetch 생략(rows는 useMemo에서 무시).
  useEffect(() => {
    if (!open) return
    const term = query.trim()
    if (!term) return
    const current = ++reqId.current
    const handle = setTimeout(async () => {
      try {
        const data = await adminFetchJsonCached<UnifiedResponse>(
          `/api/admin/crm/customers/unified?q=${encodeURIComponent(term)}&limit=6`,
          undefined,
          { cacheKey: `cmdk:${term}`, ttlMs: 30_000, staleWhileRevalidateMs: 60_000 }
        )
        if (current === reqId.current) setRows(data.rows ?? [])
      } catch {
        if (current === reqId.current) setRows([])
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [query, open])

  const items = useMemo<CmdItem[]>(() => {
    const q = query.trim().toLowerCase()
    const navItems: CmdItem[] = NAV_CMDS.filter(
      (nav) => !q || (nav.label + nav.sub).toLowerCase().includes(q)
    ).map((nav) => ({ kind: "nav", id: `nav:${nav.href}`, label: nav.label, sub: nav.sub, icon: nav.icon, href: nav.href }))
    // 빈 쿼리일 때는 직전 고객 결과를 노출하지 않는다.
    const custItems: CmdItem[] = q
      ? rows.map((row) => ({
          kind: "customer",
          id: `cust:${row.key}`,
          label: row.name,
          sub: row.contact ? `${row.sourceLabel} · ${row.contact}` : row.sourceLabel,
          icon: row.source === "lead" ? <PhoneCall className="h-4 w-4" /> : <Building2 className="h-4 w-4" />,
          key: row.key,
          // 전환 고객(customer:)은 360 상세 미지원 — 원천 href(파트너 워크스페이스)로 이동.
          href: row.source === "customer" ? row.href : undefined,
        }))
      : []
    return [...navItems, ...custItems]
  }, [query, rows])

  // active는 파생 클램프 — items가 줄어도 effect 없이 안전 범위 유지.
  const activeIndex = items.length === 0 ? 0 : Math.min(active, items.length - 1)

  const run = useCallback(
    (item: CmdItem | undefined) => {
      if (!item) return
      setOpen(false)
      if (item.kind === "nav") router.push(item.href)
      else router.push(item.href ?? `/admin/crm/customers/${encodeURIComponent(item.key)}`)
    },
    [router]
  )

  const onInputKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActive((prev) => (items.length ? (Math.min(prev, items.length - 1) + 1) % items.length : 0))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActive((prev) => (items.length ? (Math.min(prev, items.length - 1) - 1 + items.length) % items.length : 0))
      } else if (event.key === "Enter") {
        event.preventDefault()
        run(items[activeIndex])
      }
    },
    [items, activeIndex, run]
  )

  if (!open || typeof document === "undefined") return null

  // document.body로 포털 — RouteTransition 래퍼 등 조상에 transform이 걸리면 fixed가
  // 그 조상 기준으로 배치돼(containing block) 팔레트가 뷰포트 밖으로 밀리는 문제를 차단한다.
  // (AdminNotificationsBell 패널과 동일한 회피 패턴)
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-[#111110]/40 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[min(560px,92vw)] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[#f0f0ec] px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder="화면 이동 · 고객/리드 검색"
            className="flex-1 border-none bg-transparent text-[15px] text-[#111110] outline-none placeholder:text-[#1a1a1a]/30"
          />
          <kbd className="rounded border border-[#e8e8e4] bg-[#fafaf8] px-1.5 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/40">
            ESC
          </kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[#1a1a1a]/40">일치하는 결과가 없습니다.</p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => run(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  index === activeIndex ? "bg-[#fafaf8]" : ""
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    item.kind === "nav" ? "bg-[#fafaf8] text-[#084734]" : "bg-[#ECFDF5] text-[#084734]"
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[#111110]">{item.label}</span>
                  <span className="block truncate text-[11px] text-[#1a1a1a]/45">{item.sub}</span>
                </span>
                <span className="shrink-0 rounded bg-[#fafaf8] px-2 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/40">
                  {item.kind === "nav" ? "이동" : "고객"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
