// components/admin/campaigns/projects/ProjectCard.tsx
// 마케팅 프로젝트(D3-3) 리스트의 순수 프레젠테이션 조각 — 상태·데이터 fetch 없음.
// ProjectsClient(리스트)·ProjectDetailPanel(상세)·렌더 테스트가 함께 import 한다(SSOT, 로컬 재구현 금지).
// DESIGN.md §2 팔레트만 사용(AI 파스텔 금지).
//
// 정직 규칙(project-rollup 순수함수와 동일):
//  - 예산 소진(budgetSpent)은 링크된 행사의 KRW 광고비만 합산한다. Meta 라이브 집행(USD 등)·
//    이메일·문자 발송비는 통화/개념이 달라 소진에 넣지 않는다(채널·통화 가로지르는 조작 지표 금지, ROAS 없음).
//  - 예산 미배정(budget null)이면 소진%는 0%가 아니라 "—"(거짓 0% 방지).
//
// 상태칩·기간·배정예산 포맷터는 manage 의 CampaignRow 를 그대로 재사용한다 —
// ProjectStatus = CampaignStatus 이고 라벨/토큰이 동일해 중복 리터럴을 만들지 않는다.

import { CalendarDays, FolderKanban, Layers, Megaphone, User } from "lucide-react"

import type { ProjectRollup, ProjectWithRollup } from "@/lib/types/marketing-campaign"

import { CampaignStatusChip, formatBudget, formatCampaignPeriod } from "../manage/CampaignRow"

// 프로젝트 상태칩은 캠페인과 동일한 운영 상태 스케일(계획/진행/일시중지/완료)을 쓴다 —
// manage 의 CampaignStatusChip 을 그대로 재수출한다(SSOT). 상세 패널이 이 이름으로 가져다 쓴다.
export { CampaignStatusChip as ProjectStatusChip } from "../manage/CampaignRow"

/* ── 포맷터·상수(순수·모듈 스코프) ───────────────────────────── */

const KRW_FMT = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
})

// 소진액은 항상 number(≥0) — null 케이스가 없어 formatBudget 대신 직접 포맷한다.
export function formatWon(amount: number): string {
  return KRW_FMT.format(amount)
}

// 예산 소진 바 아래 고정 캡션 — 소진 집계 범위를 정직하게 못박는다(오독 방지).
export const BUDGET_CAVEAT = "소진은 행사 KRW 광고비 기준 · Meta(USD)·이메일·문자 제외"

/* ── 롤업 통계 줄(순수) ───────────────────────────────────────── */

function StatItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[#A39E98]">{icon}</span>
      {label}
      <b className="font-semibold tabular-nums text-[#111110]">{value}</b>
    </span>
  )
}

// 멤버 캠페인 롤업 요약 — 캠페인/채널/행사 수. 리스트 카드와 상세 카드가 공유.
export function ProjectRollupStats({ rollup }: { rollup: ProjectRollup }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#615D59]">
      <StatItem icon={<Megaphone className="h-3 w-3" />} label="캠페인" value={rollup.campaignCount} />
      <StatItem icon={<Layers className="h-3 w-3" />} label="채널" value={rollup.channelCount} />
      <StatItem icon={<CalendarDays className="h-3 w-3" />} label="행사" value={rollup.eventCount} />
    </div>
  )
}

/* ── 예산 소진 바(순수) ───────────────────────────────────────── */

// 배정 대비 소진 진행바 + 정직 캡션. spentPct null(예산 미배정) → "—", 100% 초과 → 경고색.
export function ProjectBudgetBar({ rollup }: { rollup: ProjectRollup }) {
  const { budgetAllocated, budgetSpent, spentPct } = rollup
  const overspent = spentPct != null && spentPct > 100
  // 바 폭은 0~100 로 클램프(초과분은 색으로만 신호, 폭을 넘기지 않는다).
  const barPct = spentPct == null ? 0 : Math.min(100, Math.max(0, spentPct))

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-[#615D59]">
        <span className="tabular-nums">
          배정 <b className="font-semibold text-[#111110]">{formatBudget(budgetAllocated)}</b>
        </span>
        <span className="tabular-nums">
          소진 <b className="font-semibold text-[#111110]">{formatWon(budgetSpent)}</b>{" "}
          <span className={overspent ? "font-semibold text-[#A8741A]" : "text-[#615D59]"}>
            ({spentPct == null ? "—" : `${spentPct}%`})
          </span>
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0EC]"
        role="progressbar"
        aria-valuenow={spentPct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] ${overspent ? "bg-[#A8741A]" : "bg-[#084734]"}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-[#A39E98]">{BUDGET_CAVEAT}</p>
    </div>
  )
}

/* ── 프로젝트 카드(순수) ──────────────────────────────────────── */

export function ProjectCard({
  project,
  onOpen,
}: {
  project: ProjectWithRollup
  onOpen?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5 text-left transition hover:border-[#084734]/25 hover:bg-[#fafaf8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-bold text-[#111110]">{project.name}</h3>
            <CampaignStatusChip status={project.status} />
          </div>
          {project.objective && (
            <p className="mt-0.5 truncate text-[12px] text-[#615D59]">{project.objective}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] tabular-nums text-[#615D59]">
            {formatCampaignPeriod(project.startsAt, project.endsAt)}
          </p>
          {project.owner && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#615D59]">
              <User className="h-3 w-3" />
              {project.owner}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5">
        <ProjectRollupStats rollup={project.rollup} />
      </div>

      <div className="mt-3">
        <ProjectBudgetBar rollup={project.rollup} />
      </div>
    </button>
  )
}

/* ── 빈 상태(순수) ────────────────────────────────────────────── */

export function ProjectsEmpty({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center">
      <div className="mx-auto mb-3 inline-flex rounded-xl bg-[#ECFDF5] p-2.5 text-[#084734]">
        <FolderKanban className="h-5 w-5" />
      </div>
      <p className="text-[14px] font-semibold text-[#111110]">아직 프로젝트가 없습니다</p>
      <p className="mt-1 text-[12px] text-[#615D59]">여러 캠페인을 묶는 새 프로젝트로 시작하세요.</p>
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
        >
          새 프로젝트
        </button>
      )}
    </div>
  )
}
