// components/admin/campaigns/projects/ProjectCard.tsx
// 마케팅 프로젝트(D3-3) 리스트의 순수 프레젠테이션 조각 — 상태·데이터 fetch 없음.
// ProjectsClient(리스트)·ProjectDetailPanel(상세)·렌더 테스트가 함께 import 한다(SSOT, 로컬 재구현 금지).
// DESIGN.md §2 팔레트만 사용(AI 파스텔 금지).
//
// 정직 규칙(project-rollup 순수함수와 동일):
//  - 예산 소진(budgetSpent)은 링크된 행사의 KRW 광고비만 합산한다. Meta 라이브 집행(USD 등)·
//    이메일·문자 발송비는 통화/개념이 달라 소진에 넣지 않는다(채널·통화 가로지르는 조작 지표 금지, ROAS 없음).
//  - 예산 미배정(budget null)이면 소진%는 0%가 아니라 "—"(거짓 0% 방지).
//  - 위 캐비앗은 **섹션 레벨에서 한 번만** 말한다(ProjectBudgetCaveat) — 카드마다 반복하면
//    벽지가 되어 오히려 안 읽힌다. 카드는 캐비앗을 렌더하지 않는다(리스트 헤더·상세 요약이 담당).
//
// 시각 규칙(DESIGN.md §2 "그린은 액센트로만, 넓은 면은 뉴트럴"):
//  - 소진은 넓은 진행바가 아니라 **수치 주도** — 퍼센트가 앵커고, 그린은 고정폭 3px 미터에만 쓴다.
//  - 롤업 수치(캠페인/채널/행사)는 카드의 실체다 — 숫자를 크게, 라벨을 작고 흐리게.
//
// 상태칩·기간·배정예산 포맷터는 manage 의 CampaignRow 를 그대로 재사용한다 —
// ProjectStatus = CampaignStatus 이고 라벨/토큰이 동일해 중복 리터럴을 만들지 않는다.

import { FolderKanban, Info, User } from "lucide-react"

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

// 소진 집계 범위를 정직하게 못박는 캐비앗 문구(SSOT).
export const BUDGET_CAVEAT = "소진은 행사 KRW 광고비 기준 · Meta(USD)·이메일·문자 제외"

/**
 * 정직 캐비앗 — **섹션당 한 번만** 렌더한다(리스트 헤더의 소진 열 주석 / 상세 요약 카드).
 * 카드 안에서는 절대 쓰지 않는다: 프로젝트 N개면 N번 반복돼 문구가 배경으로 죽는다.
 */
export function ProjectBudgetCaveat({ className = "" }: { className?: string }) {
  return (
    <p
      className={`inline-flex items-center gap-1 text-[11px] leading-tight text-[#A39E98] ${className}`}
    >
      <Info className="h-3 w-3 shrink-0" aria-hidden />
      {BUDGET_CAVEAT}
    </p>
  )
}

/* ── 롤업 통계 스트립(순수) ───────────────────────────────────── */

// 숫자가 주역, 라벨은 조역. 0 은 "값"이라기보단 부재라 흐리게 둔다(굵은 0 의 나열 방지).
function StatItem({ label, value, divide }: { label: string; value: number; divide: boolean }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 ${
        divide ? "border-l border-[rgba(0,0,0,0.08)] pl-2.5" : ""
      }`}
    >
      <b
        className={`text-[14px] font-bold leading-4 tabular-nums ${
          value === 0 ? "text-[#A39E98]" : "text-[#111110]"
        }`}
      >
        {value}
      </b>
      <span className="text-[10.5px] text-[#A39E98]">{label}</span>
    </span>
  )
}

// 멤버 캠페인 롤업 요약 — 캠페인/채널/행사 수. 리스트 카드와 상세 카드가 공유.
export function ProjectRollupStats({ rollup }: { rollup: ProjectRollup }) {
  const items = [
    { label: "캠페인", value: rollup.campaignCount },
    { label: "채널", value: rollup.channelCount },
    { label: "행사", value: rollup.eventCount },
  ]
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {items.map((item, i) => (
        <StatItem key={item.label} label={item.label} value={item.value} divide={i > 0} />
      ))}
    </div>
  )
}

/* ── 예산 소진(순수) ──────────────────────────────────────────── */

/**
 * 소진 미터 — 고정폭(기본 56px) 3px 트랙. 넓은 면을 그린으로 채우지 않는다.
 * 값은 옆의 퍼센트 텍스트가 말하므로 미터는 장식(aria-hidden) — 초과 시 valuenow>max 같은
 * 잘못된 ARIA 를 만들지 않는다.
 */
function BudgetMeter({
  barPct,
  overspent,
  className,
}: {
  barPct: number
  overspent: boolean
  className: string
}) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[3px] shrink-0 overflow-hidden rounded-full bg-[#E5E5E0] ${className}`}
    >
      <span
        className={`block h-full rounded-full transition-[width] ${
          overspent ? "bg-[#A8741A]" : "bg-[#084734]"
        }`}
        style={{ width: `${barPct}%` }}
      />
    </span>
  )
}

/**
 * 배정 대비 소진 — 수치 주도 블록(우측 정렬). 리스트 카드와 상세 요약이 공유한다.
 * spentPct null(예산 미배정) → 퍼센트 "—" + 미터 자체를 그리지 않는다(빈 트랙은 0% 로 오독된다).
 * 100% 초과 → 퍼센트·미터를 Warning 토큰으로 + "초과" 라벨(색만으로 신호하지 않는다).
 */
export function ProjectBudgetBlock({
  rollup,
  meterClassName = "w-14",
}: {
  rollup: ProjectRollup
  meterClassName?: string
}) {
  const { budgetAllocated, budgetSpent, spentPct } = rollup
  const hasBudget = spentPct != null
  const overspent = hasBudget && spentPct > 100
  // 미터 폭은 0~100 으로 클램프(초과분은 색·라벨로만 신호, 폭을 넘기지 않는다).
  const barPct = hasBudget ? Math.min(100, Math.max(0, spentPct)) : 0

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px] text-[#A39E98]">소진</span>
        <b
          className={`text-[13.5px] font-bold leading-4 tabular-nums ${
            overspent ? "text-[#A8741A]" : hasBudget ? "text-[#111110]" : "text-[#A39E98]"
          }`}
        >
          {hasBudget ? `${spentPct}%` : "—"}
        </b>
        {overspent && <span className="text-[10px] font-semibold text-[#A8741A]">초과</span>}
        {hasBudget && (
          <BudgetMeter barPct={barPct} overspent={overspent} className={meterClassName} />
        )}
      </div>
      <div className="text-[11.5px] leading-4 tabular-nums text-[#615D59]">
        {/* "/" 는 장식이 아니라 배정 대비 소진이라는 관계 자체다 — aria 에서 숨기지 않는다. */}
        <b className="font-semibold text-[#31302E]">{formatWon(budgetSpent)}</b>
        <span className="px-1 text-[#A39E98]">/</span>
        {formatBudget(budgetAllocated)}
      </div>
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
      className="group block w-full rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-3.5 py-2.5 text-left transition hover:border-[#084734]/25 hover:bg-[#FAFAF8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
    >
      {/* 1행: 이름·상태·목표 | 소진(수치 주도).
          모바일에선 소진 블록을 아래로 접는다 — 나란히 두면 금액 폭에 밀려 이름이 10자에서 잘린다. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-[14px] font-bold leading-5 text-[#111110]">
              {project.name}
            </h3>
            <CampaignStatusChip status={project.status} />
          </div>
          {project.objective && (
            <p className="mt-0.5 truncate text-[11.5px] leading-4 text-[#615D59]">
              {project.objective}
            </p>
          )}
        </div>
        <ProjectBudgetBlock rollup={project.rollup} />
      </div>

      {/* 2행: 롤업 수치(카드의 실체) | 기간·담당 */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <ProjectRollupStats rollup={project.rollup} />
        <span className="shrink-0 text-[11px] leading-4 tabular-nums text-[#615D59]">
          {formatCampaignPeriod(project.startsAt, project.endsAt)}
          {project.owner && (
            <>
              <span className="px-1 text-[#A39E98]" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-0.5">
                <User className="h-2.5 w-2.5 text-[#A39E98]" aria-hidden />
                {project.owner}
              </span>
            </>
          )}
        </span>
      </div>
    </button>
  )
}

/* ── 빈 상태(순수) ────────────────────────────────────────────── */

export function ProjectsEmpty({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center">
      <div className="mx-auto mb-3 inline-flex rounded-xl border border-[#BDEFD8] bg-[#ECFDF5] p-2.5 text-[#084734]">
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
