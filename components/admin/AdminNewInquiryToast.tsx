"use client"

// 어드민 어느 화면에 있든 새 문의가 들어오면 우하단에 알린다 — 인앱 알림 벨은 읽히지 않는다
// (09-24 실측 1,902건 누적·30일 읽음 0). 기획: docs/active/admin-lead-visitor-glance-plan-2026-11-04.md §3.5
//
//  - 원천은 "오늘 유입"(useLiveIntake, Overview "지금" 띠와 같은 응답·캐시 슬롯)이다. 외부 발송이 아니다.
//  - 첫 조회는 기준점만 잡는다 — 화면을 연 순간 오늘 들어온 문의 전부를 새 알림으로 띄우지 않는다.
//  - 같은 문의는 한 번만 알린다(셸이 살아 있는 동안 기억). 조회 실패는 조용히 넘긴다.
//  - 개인 설정으로 끌 수 있다(new-inquiry-alert-pref, 이 브라우저에만 저장).

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"

import { compassLeadUrl } from "@/lib/compass/normalize"
import { INTAKE_SOURCE_KIND_LABEL, type IntakeFeedItem } from "@/lib/marketing/intake-feed"
import { useLiveIntake } from "@/components/admin/overview/useLiveIntake"
import { setNewInquiryAlertEnabled, useNewInquiryAlertEnabled } from "@/components/admin/new-inquiry-alert-pref"

const KST_HHMM = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })
const AUTO_DISMISS_MS = 20_000

function identityKeys(item: IntakeFeedItem): string[] {
  const keys = [item.key]
  if (item.adminLeadId) keys.push(`a:${item.adminLeadId}`)
  if (item.compassLeadId != null) keys.push(`c:${item.compassLeadId}`)
  return keys
}

interface ToastState {
  item: IntakeFeedItem
  more: number
}

export default function AdminNewInquiryToast() {
  const enabled = useNewInquiryAlertEnabled()
  const { data } = useLiveIntake({ enabled })
  const seenRef = useRef<Set<string> | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (!data || !(data.adminMeasured || data.compassMeasured)) return
    if (seenRef.current == null) {
      seenRef.current = new Set(data.items.flatMap(identityKeys))
      return
    }
    const seen = seenRef.current
    // 표시 키는 Compass 미러가 붙는 순간 a:<id> → c:<id> 로 바뀔 수 있다 — 두 원천 id 어느 쪽이든 본 적 있으면 같은 문의다.
    const fresh = data.items.filter((item) => !identityKeys(item).some((key) => seen.has(key)))
    for (const item of data.items) for (const key of identityKeys(item)) seen.add(key)
    if (fresh.length === 0) return
    // 외부 시스템(오늘 유입 조회) 결과를 받아 화면 상태를 맞추는 자리다 — 렌더 중 파생값이 아니다.
    setToast({ item: fresh[0], more: fresh.length - 1 })
  }, [data])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  if (!enabled || !toast) return null

  const { item, more } = toast
  const who = item.name ?? item.org ?? "이름 미상"
  const detail = [item.name ? item.org : null, INTAKE_SOURCE_KIND_LABEL[item.sourceKind ?? "other"], KST_HHMM.format(new Date(item.at))]
    .filter((part): part is string => Boolean(part))
    .join(" · ")
  const adminHref = item.adminLeadId ? `/admin/crm/customers/leads?lead=${encodeURIComponent(item.adminLeadId)}` : null
  const compassHref = !adminHref && item.compassLeadId != null ? compassLeadUrl(item.compassLeadId) : null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-4 z-50 flex w-[340px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[rgba(0,0,0,0.05)_0px_20px_52px,rgba(0,0,0,0.04)_0px_8px_20px,rgba(0,0,0,0.03)_0px_2px_6px] lg:bottom-6 lg:right-6"
    >
      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#A8741A]" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-[#111110]">
          새 문의 {more > 0 ? `${more + 1}건` : "1건"}
          {item.reinflow ? <span className="ml-1.5 text-[12px] font-bold text-[#7A520F]">재유입</span> : null}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-[#615D59]">
          {who}
          {detail ? ` · ${detail}` : ""}
          {more > 0 ? ` 외 ${more}건` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          {adminHref ? (
            <Link href={adminHref} onClick={() => setToast(null)} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[#084734] hover:underline">
              보기 →
            </Link>
          ) : compassHref ? (
            <a href={compassHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-[#084734] hover:underline">
              Compass →
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setNewInquiryAlertEnabled(false)
              setToast(null)
            }}
            className="inline-flex min-h-11 items-center text-[12px] text-[#615D59] hover:text-[#111110] hover:underline"
          >
            이 알림 끄기
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={() => setToast(null)}
        className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#615D59] hover:bg-[#f5f5f2] hover:text-[#111110]"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
