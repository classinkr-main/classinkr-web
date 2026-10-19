import Link from "next/link"

import {
  SYNC_HEALTH_SOURCE_LABEL,
  describeHealthySyncSource,
  describeSyncSourceHealth,
  worstSyncHealthTone,
  type SyncHealthCopy,
  type SyncHealthTone,
  type SyncSourceHealth,
} from "@/lib/admin/sync-health"

// 데이터 신선도 경고 띠 — "무엇이 멈췄고, 화면 값이 언제 것이며, 누가 무엇을 하면 풀리는지" 한 줄 + 자세히.
//
// 표시 전용이다: props(원천별 건강 상태 + 기준 시각)만으로 그린다. 훅·상태가 없어 서버 셸
// (SyncHealthBannerServer)과 클라이언트 어디서든 렌더된다. "자세히"는 <details>라 JS 없이 열린다.
// 판정·문구는 전부 lib/admin/sync-health.ts(순수 함수)가 소유한다 — 여기서 새로 판정하지 않는다.
//
// 톤은 DESIGN.md §2 운영 상태 스케일(Danger/Warning 틴트·보더·강조 텍스트)만 쓴다. 확인 불가(unknown)는
// 정상인 척하지 않되 경보처럼 보이지도 않게 틴트 없는 중립 캡션으로 둔다. 전부 정상이면 banner는 아무것도
// 그리지 않고, summary(운영 상태 화면용)는 원천별 한 줄을 조용히 보여 준다.

const TONE_CLASS: Record<SyncHealthTone, { box: string; text: string; dot: string }> = {
  danger: { box: "border-[#F2B8B8] bg-[#FCE9E9]", text: "text-[#8F2C2C]", dot: "bg-[#B43E3E]" },
  warning: { box: "border-[#ECD29C] bg-[#FBF1E0]", text: "text-[#7A520F]", dot: "bg-[#A8741A]" },
  neutral: { box: "border-[rgba(0,0,0,0.08)] bg-white", text: "text-[#615D59]", dot: "bg-[#A39E98]" },
}

const OK_DOT = "bg-[#084734]"

// summary는 채움 없이 테두리 한 곳에만 가장 심각한 톤을 싣는다(장부 상태 줄과 같은 아웃라인 강조).
const SUMMARY_BORDER: Record<SyncHealthTone | "ok", string> = {
  danger: "border-[#B43E3E]",
  warning: "border-[#A8741A]",
  neutral: "border-black/[0.08]",
  ok: "border-black/[0.08]",
}

export interface SyncHealthBannerProps {
  /** 이 화면이 기대는 원천만 넘긴다(요청 순서대로 그린다). */
  sources: readonly SyncSourceHealth[]
  /** 상대시간("27일 전") 기준 시각(ms). 서버 셸은 보고서 생성 시각을 넘긴다. */
  nowMs: number
  /** banner: 문제 있을 때만 띠 / summary: 원천별 한 줄(정상 포함) — 운영 상태 화면용. */
  variant?: "banner" | "summary"
  /** 바깥 여백(화면마다 다른 좌우 패딩을 맞춘다). */
  className?: string
  /** "자세히" 안의 운영 상태 링크를 숨긴다(운영 상태 화면 자신). */
  hideOpsLink?: boolean
}

function CopyLine({ copy }: { copy: SyncHealthCopy }) {
  const tone = TONE_CLASS[copy.tone]
  return (
    <p className="text-[12px] leading-relaxed text-[#31302E]">
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full ${tone.dot}`} aria-hidden="true" />
      <strong className={`font-bold ${tone.text}`}>{copy.headline}</strong>
      <span> · {copy.asOf}</span>
      {copy.action ? <span className="font-semibold text-[#111110]"> · {copy.action}</span> : null}
    </p>
  )
}

function DetailList({ copies, hideOpsLink }: { copies: SyncHealthCopy[]; hideOpsLink: boolean }) {
  const withDetails = copies.filter((copy) => copy.details.length > 0)
  if (withDetails.length === 0 && hideOpsLink) return null
  return (
    <details className="group mt-1">
      <summary className="inline-flex min-h-11 cursor-pointer select-none items-center text-[11px] font-semibold text-[#615D59] underline-offset-2 hover:underline md:min-h-0">
        자세히
      </summary>
      <div className="mt-1 space-y-1.5 border-t border-[rgba(0,0,0,0.08)] pt-1.5 text-[11px] leading-relaxed text-[#615D59]">
        {withDetails.map((copy) => (
          <div key={copy.source}>
            <p className="font-semibold text-[#31302E]">{SYNC_HEALTH_SOURCE_LABEL[copy.source]}</p>
            <ul className="list-disc pl-4">
              {copy.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </div>
        ))}
        <p>원문 오류는 싣지 않고 분류(권한 오류·설정 누락·네트워크·기타)만 보여 줍니다.</p>
        {hideOpsLink ? null : (
          <Link
            href="/admin/ops"
            prefetch={false}
            className="inline-flex min-h-11 items-center font-semibold text-[#111110] underline underline-offset-2 md:min-h-0"
          >
            운영 상태에서 전체 원천 보기
          </Link>
        )}
      </div>
    </details>
  )
}

export function SyncHealthBanner({
  sources,
  nowMs,
  variant = "banner",
  className = "",
  hideOpsLink = false,
}: SyncHealthBannerProps) {
  if (variant === "summary") {
    return <SyncHealthSummary sources={sources} nowMs={nowMs} className={className} />
  }

  const copies = sources
    .map((health) => describeSyncSourceHealth(health, nowMs))
    .filter((copy): copy is SyncHealthCopy => copy !== null)
  const worst = worstSyncHealthTone(copies)
  if (!worst) return null

  const tone = TONE_CLASS[worst]
  return (
    <div className={className}>
      <section
        aria-label="데이터 동기화 상태"
        data-sync-health-tone={worst}
        className={`rounded-lg border px-3.5 py-2.5 ${tone.box}`}
      >
        <div className="space-y-1">
          {copies.map((copy) => (
            <CopyLine key={copy.source} copy={copy} />
          ))}
        </div>
        <DetailList copies={copies} hideOpsLink={hideOpsLink} />
      </section>
    </div>
  )
}

function SyncHealthSummary({
  sources,
  nowMs,
  className,
}: {
  sources: readonly SyncSourceHealth[]
  nowMs: number
  className: string
}) {
  if (sources.length === 0) return null
  const rows = sources.map((health) => ({ health, copy: describeSyncSourceHealth(health, nowMs) }))
  const copies = rows.map((row) => row.copy).filter((copy): copy is SyncHealthCopy => copy !== null)
  const worst = worstSyncHealthTone(copies)

  return (
    <div className={className}>
      <section
        aria-label="원천 동기화 상태"
        data-sync-health-tone={worst ?? "ok"}
        className={`rounded-2xl border bg-white ${SUMMARY_BORDER[worst ?? "ok"]}`}
      >
        <div className="border-b border-black/[0.08] px-5 py-4">
          <h2 className="text-[15px] font-bold text-[#111110]">원천 동기화</h2>
          <p className="mt-1 text-[12px] text-[#615D59]">
            실행 기록 기준 마지막 성공·연속 실패 — 화면 수치가 언제 값인지와 누가 풀 수 있는지를 봅니다.
          </p>
        </div>
        <ul className="divide-y divide-black/[0.08]">
          {rows.map(({ health, copy }) => (
            <li key={health.source} className="px-5 py-3">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${copy ? TONE_CLASS[copy.tone].dot : OK_DOT}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 text-[12px] leading-relaxed">
                  <p className="font-bold text-[#111110]">{SYNC_HEALTH_SOURCE_LABEL[health.source]}</p>
                  {copy ? (
                    <>
                      <p className={`font-semibold ${TONE_CLASS[copy.tone].text}`}>{copy.headline}</p>
                      <p className="text-[#615D59]">{copy.asOf}</p>
                      {copy.action ? <p className="font-semibold text-[#111110]">{copy.action}</p> : null}
                      {copy.details.length > 0 ? (
                        <ul className="mt-0.5 list-disc pl-4 text-[11px] text-[#615D59]">
                          {copy.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-[#084734]">{describeHealthySyncSource(health, nowMs)}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default SyncHealthBanner
