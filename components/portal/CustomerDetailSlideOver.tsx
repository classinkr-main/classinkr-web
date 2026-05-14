"use client";

import { useEffect, useState } from "react";
import { Mail, MapPin, Phone, User2, X } from "lucide-react";

import { portalFetch } from "@/lib/portal/portal-fetch";
import type {
  Customer,
  CustomerDetailPayload,
  CustomerDealHistoryItem,
  DealStage,
} from "@/lib/portal/types";

interface Props {
  customerId: string;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
}

const STAGE_COLOR: Record<DealStage, string> = {
  contact: "bg-[#f0f0ec] text-[#615D59]",
  quote: "bg-[#ECFDF5] text-[#084734]",
  contract: "bg-[#D1FAE5] text-[#065c41]",
  confirmed: "bg-[#D1FAE5] text-[#065c41]",
  installation: "bg-orange-100 text-orange-700",
  payment: "bg-emerald-100 text-emerald-700",
  closed: "bg-[#f0f0ec] text-[#A39E98]",
  cancelled: "bg-[#FEF3EE] text-[#B85C33]",
};

const STAGE_LABEL: Record<DealStage, string> = {
  contact: "컨택",
  quote: "견적",
  contract: "계약",
  confirmed: "확정",
  installation: "설치",
  payment: "수납",
  closed: "완료",
  cancelled: "취소",
};

function formatKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calendarSourceLabel(
  source: CustomerDetailPayload["recent_calendar_events"][number]["source_type"]
) {
  return (
    {
      installation: "설치",
      meeting: "미팅",
      document_due: "문서 기한",
      internal: "내부 일정",
    }[source] ?? source
  );
}

function calendarSourceTone(
  source: CustomerDetailPayload["recent_calendar_events"][number]["source_type"]
) {
  return (
    {
      installation: "bg-amber-50 text-amber-700",
      meeting: "bg-[#ECFDF5] text-[#084734]",
      document_due: "bg-[#f0f0ec] text-[#615D59]",
      internal: "bg-[#f0f0ec] text-[#615D59]",
    }[source] ?? "bg-[#f0f0ec] text-[#615D59]"
  );
}

const SECTION_HEADER =
  "text-xs font-semibold uppercase tracking-widest text-[#1a1a1a]/30 mb-3";

export function CustomerDetailSlideOver({ customerId, onClose, onEdit }: Props) {
  const [data, setData] = useState<CustomerDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    portalFetch(`/api/portal/customers/${customerId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "불러오기 실패");
        if (!cancelled) setData(json as CustomerDetailPayload);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "불러오기 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-[#1a1a1a]/40">불러오는 중...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <p className="text-sm text-[#B85C33]">{error}</p>
            <button
              onClick={onClose}
              className="text-xs text-[#1a1a1a]/50 underline"
            >
              닫기
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8e8e4] bg-white px-5 py-4"
            >
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-[#1a1a1a]">
                  {data.customer.name}
                </h2>
                {(data.customer.campus_name || data.customer.region_label) && (
                  <p className="mt-0.5 truncate text-xs text-[#1a1a1a]/50">
                    {[data.customer.campus_name, data.customer.region_label]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-2">
                {onEdit && (
                  <button
                    onClick={() => onEdit(data.customer)}
                    className="rounded-md border border-[#e8e8e4] bg-[#f5f5f2] px-3 py-1.5 text-xs font-medium text-[#1a1a1a] transition hover:bg-[#ebebea]"
                  >
                    수정
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#1a1a1a]/50 transition hover:bg-[#f5f5f2] hover:text-[#1a1a1a]"
                  aria-label="닫기"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto bg-[#f5f5f2] p-5 space-y-6">
              {/* 연락처 정보 */}
              <ContactSection customer={data.customer} />

              {/* 재무 현황 */}
              <FinancialSection summary={data.summary} />

              {/* 최근 일정 */}
              {data.recent_calendar_events.length > 0 && (
                <RecentCalendarSection events={data.recent_calendar_events} />
              )}

              {/* 딜 이력 */}
              {data.deals.length > 0 && (
                <DealHistorySection deals={data.deals} />
              )}

              {/* 최근 활동 */}
              {data.recent_activity.length > 0 && (
                <RecentActivitySection activity={data.recent_activity} />
              )}

              {/* 메모 */}
              {data.customer.notes && (
                <NotesSection notes={data.customer.notes} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sub-sections ─────────────────────────────────────────────────── */

function ContactSection({ customer }: { customer: Customer }) {
  const rows: { icon: React.ReactNode; value: string }[] = [];

  if (customer.contact_name)
    rows.push({ icon: <User2 size={13} />, value: customer.contact_name });
  if (customer.phone)
    rows.push({ icon: <Phone size={13} />, value: customer.phone });
  if (customer.email)
    rows.push({ icon: <Mail size={13} />, value: customer.email });
  if (customer.address)
    rows.push({ icon: <MapPin size={13} />, value: customer.address });

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <p className={SECTION_HEADER}>연락처 정보</p>
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#1a1a1a]">
            <span className="mt-0.5 shrink-0 text-[#1a1a1a]/40">{row.icon}</span>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinancialSection({
  summary,
}: {
  summary: CustomerDetailPayload["summary"];
}) {
  const cards = [
    {
      label: "계약 총액",
      tooltip: "기관과 계약한 총 금액",
      value: formatKRW(summary.contracted_amount),
      highlight: false,
    },
    {
      label: "실수납",
      tooltip: "실제로 입금된 누계 금액",
      value: formatKRW(summary.paid_amount),
      highlight: false,
    },
    {
      label: "미수금",
      tooltip: "아직 받지 못한 금액 (계약 - 수납)",
      value: formatKRW(summary.outstanding_amount),
      highlight: summary.outstanding_amount > 0,
    },
    {
      label: "진행 딜",
      tooltip: undefined,
      value: `${summary.active_deals}건`,
      highlight: false,
    },
  ];

  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <p className={SECTION_HEADER}>재무 현황</p>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-lg border p-3 ${
              card.highlight
                ? "border-amber-200 bg-amber-50"
                : "border-[#e8e8e4] bg-[#f5f5f2]"
            }`}
          >
            <p
              className={`mb-1 text-xs ${
                card.highlight ? "text-amber-600/70" : "text-[#1a1a1a]/40"
              }`}
            >
              {card.tooltip ? (
                <abbr title={card.tooltip} style={{ textDecoration: "underline dotted", textUnderlineOffset: 2, cursor: "help" }}>
                  {card.label}
                </abbr>
              ) : (
                card.label
              )}
            </p>
            <p
              className={`text-sm font-semibold ${
                card.highlight ? "text-amber-700" : "text-[#1a1a1a]"
              }`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── StageMiniBar ─────────────────────────────────────────────────── */

const PIPELINE_STAGES: DealStage[] = [
  "contact",
  "quote",
  "contract",
  "confirmed",
  "installation",
  "payment",
];

const STAGE_DOT_COLOR: Record<string, string> = {
  contact: "#78716c",      // stone-400
  quote: "#3b82f6",        // blue-500
  contract: "#8b5cf6",     // violet-500
  confirmed: "#6366f1",    // indigo-500
  installation: "#f97316", // orange-500
  payment: "#10b981",      // emerald-500
};

function StageMiniBar({ currentStage }: { currentStage: DealStage }) {
  const currentIdx = PIPELINE_STAGES.indexOf(currentStage);
  // If stage is not in the pipeline (e.g. closed/cancelled), fall back to -1 — all shown as muted
  return (
    <div className="mt-2.5 flex items-center gap-0" style={{ fontSize: 9 }}>
      {PIPELINE_STAGES.map((stage, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isFuture = idx > currentIdx;
        const color = STAGE_DOT_COLOR[stage];

        return (
          <div key={stage} className="flex items-center">
            {/* Connecting line before each dot (except first) */}
            {idx > 0 && (
              <div
                style={{
                  width: 16,
                  height: 1,
                  backgroundColor: isPast || isCurrent ? color : "rgba(0,0,0,0.12)",
                  flexShrink: 0,
                }}
              />
            )}
            <div className="flex flex-col items-center gap-0.5">
              {/* Dot */}
              {isCurrent ? (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: color,
                    flexShrink: 0,
                    boxShadow: `0 0 0 2px ${color}33`,
                  }}
                />
              ) : isPast ? (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: color,
                    opacity: 0.65,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    border: "1px solid rgba(0,0,0,0.18)",
                    backgroundColor: "transparent",
                    flexShrink: 0,
                  }}
                />
              )}
              {/* Label */}
              <span
                style={{
                  color: isCurrent ? color : isFuture ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.45)",
                  fontWeight: isCurrent ? 700 : 500,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {STAGE_LABEL[stage]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealHistorySection({ deals }: { deals: CustomerDealHistoryItem[] }) {
  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <p className={SECTION_HEADER}>딜 이력</p>
      <ul className="space-y-3">
        {deals.map((deal) => (
          <li
            key={deal.deal_id}
            className="rounded-lg border border-[#e8e8e4] bg-[#f5f5f2] p-3"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#1a1a1a]">
                  {deal.deal_title}
                </p>
                <p className="mt-0.5 text-xs text-[#1a1a1a]/40">
                  {deal.deal_code}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_COLOR[deal.current_stage]}`}
              >
                {STAGE_LABEL[deal.current_stage]}
              </span>
            </div>
            <StageMiniBar currentStage={deal.current_stage} />
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-[#1a1a1a]/40">계약금액</p>
                <p className="font-medium text-[#1a1a1a]">
                  {formatKRW(deal.contracted_amount)}
                </p>
              </div>
              <div>
                <p className="text-[#1a1a1a]/40">미수금</p>
                <p
                  className={`font-medium ${
                    deal.outstanding_amount > 0
                      ? "text-amber-700"
                      : "text-[#1a1a1a]"
                  }`}
                >
                  {formatKRW(deal.outstanding_amount)}
                </p>
              </div>
              <div>
                <p className="text-[#1a1a1a]/40">다음 설치</p>
                <p className="font-medium text-[#1a1a1a]">
                  {formatDate(deal.next_installation_at)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentActivitySection({
  activity,
}: {
  activity: CustomerDetailPayload["recent_activity"];
}) {
  const items = activity.slice(0, 8);

  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <p className={SECTION_HEADER}>최근 활동</p>
      <ul className="divide-y divide-[#e8e8e4]">
        {items.map((log) => (
          <li key={log.id} className="flex items-start gap-3 py-2 text-sm">
            <span className="mt-0.5 w-20 shrink-0 text-xs text-[#1a1a1a]/40">
              {formatDate(log.created_at)}
            </span>
            <span className="text-[#1a1a1a]">{log.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentCalendarSection({
  events,
}: {
  events: CustomerDetailPayload["recent_calendar_events"];
}) {
  const items = events.slice(0, 4);

  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <p className={SECTION_HEADER}>최근 일정</p>
      <ul className="space-y-3">
        {items.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-[#e8e8e4] bg-[#f5f5f2] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${calendarSourceTone(event.source_type)}`}
              >
                {calendarSourceLabel(event.source_type)}
              </span>
              <span className="text-xs text-[#1a1a1a]/40">
                {formatDateTime(event.starts_at)}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-[#1a1a1a]">
              {event.title}
            </p>
            <p className="mt-1 text-xs text-[#1a1a1a]/50">
              {event.deal_title ?? event.description ?? "거래/메모 정보가 아직 없습니다."}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotesSection({ notes }: { notes: string }) {
  return (
    <section className="rounded-xl border border-[#e8e8e4] bg-white p-4">
      <p className={SECTION_HEADER}>메모</p>
      <div className="rounded-lg bg-[#f5f5f2] p-3">
        <p className="whitespace-pre-wrap text-sm text-[#1a1a1a]">{notes}</p>
      </div>
    </section>
  );
}
