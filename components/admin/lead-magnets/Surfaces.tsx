"use client"

/**
 * 공개 화면 그대로의 미리보기 + 인라인 편집 — 오른쪽 패널(편집 탭)과 전체 편집(③)이 같이 쓴다.
 * 모양은 실제 화면을 따른다: 블로그 신청 상자 components/blog/LeadMagnetGate.tsx,
 * 자료 페이지 app/resources/[slug]/page.tsx. 신청 폼 칸·버튼처럼 코드에 고정된 문구는 고칠 수 없게 둔다.
 */
import type { ReactNode } from "react"
import { CheckCircle2, FileText, Minus, Plus } from "lucide-react"

import type { LeadMagnet } from "@/lib/lead-magnets"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetItemCount,
  getLeadMagnetPublicGateLabel,
  getLeadMagnetTierLabel,
} from "@/lib/lead-magnets-helpers"
import { InlineText } from "./InlineText"
import { emptyPdfGuide } from "./model"

export type UpdateDraft = (fn: (draft: LeadMagnet) => LeadMagnet) => void

/** 칸 경로 → 이름·같이 바뀌는 공개 화면. 경로는 "sections.0.items.2" 꼴이고 앞부분으로 찾는다. */
const FIELD_INFO: Array<[RegExp, string, string[]]> = [
  [/^title$/, "자료 제목", ["자료 페이지 제목", "자료실 카드 제목", "검색 결과 제목", "PDF 표지"]],
  [/^pdfGuide\.outcome$/, "한 줄 설명", ["자료 페이지 설명", "자료실 카드 설명", "PDF"]],
  [/^summary$/, "요약", ["블로그 신청 상자 설명", "검색 결과 설명", "PDF 표지", "자료 페이지 설명(한 줄 설명이 비었을 때)"]],
  [/^audience$/, "추천 대상", ["자료 페이지 「추천 대상」", "PDF"]],
  [/^formatLabel$/, "형식 설명", ["블로그 신청 상자", "자료실 카드", "자료 페이지 「이 PDF에 담긴 것」"]],
  [/^deliverables/, "담긴 것", ["블로그 신청 상자(앞 4개)", "자료 페이지 「이 PDF에 담긴 것」", "PDF"]],
  [/^ctaCopy\.eyebrow$/, "머리말", ["블로그 신청 상자"]],
  [/^ctaCopy\.title$/, "상자 제목", ["블로그 신청 상자"]],
  [/^ctaCopy\.buttonLabel$/, "버튼", ["블로그 신청 상자 버튼"]],
  [/^sections\.\d+\.title$/, "섹션 제목", ["자료 페이지 점검 문항", "PDF 본문"]],
  [/^sections\.\d+\.description$/, "섹션 설명", ["자료 페이지 점검 문항", "PDF 본문"]],
  [/^sections\.\d+\.items/, "점검 문항", ["자료 페이지 점검 문항", "PDF 본문", "문항 수 표시"]],
  [/^scoreBands/, "점수 해석", ["자료 페이지 「점수 해석」", "PDF"]],
  [/^actionPlan/, "실행 플랜", ["자료 페이지 실행 플랜", "PDF"]],
  [/^redFlags/, "레드 플래그", ["자료 페이지", "PDF"]],
]

export function fieldInfo(path: string | null): { label: string; where: string[] } | null {
  if (!path) return null
  const hit = FIELD_INFO.find(([pattern]) => pattern.test(path))
  return hit ? { label: hit[1], where: hit[2] } : null
}

/** 경로의 현재 값(글자 수·되돌리기용). 못 찾으면 null */
export function valueAtPath(magnet: LeadMagnet, path: string): string | null {
  let node: unknown = magnet
  for (const part of path.split(".")) {
    if (node === null || node === undefined) return null
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : null
}

export function setValueAtPath(magnet: LeadMagnet, path: string, value: string): LeadMagnet {
  const parts = path.split(".")
  const root = JSON.parse(JSON.stringify(magnet)) as Record<string, unknown>
  if (parts[0] === "pdfGuide" && !root.pdfGuide) root.pdfGuide = emptyPdfGuide()
  let node = root
  for (let index = 0; index < parts.length - 1; index += 1) {
    const next = node[parts[index]]
    if (next === null || typeof next !== "object") return magnet
    node = next as Record<string, unknown>
  }
  node[parts[parts.length - 1]] = value
  return root as unknown as LeadMagnet
}

interface SurfaceProps {
  draft: LeadMagnet
  baseline: LeadMagnet
  update: UpdateDraft
  onFocusField: (path: string) => void
  /** 좁은 패널이면 글자를 한 단계 줄인다 */
  compact?: boolean
}

function bind(props: SurfaceProps, path: string) {
  return {
    value: valueAtPath(props.draft, path) ?? "",
    original: valueAtPath(props.baseline, path) ?? "",
    onChange: (value: string) => props.update((draft) => setValueAtPath(draft, path, value)),
    onFocus: () => props.onFocusField(path),
  }
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#615D59] hover:bg-[#F0EFEC] hover:text-[#111110]"
    >
      {children}
    </button>
  )
}

export function BlogGateSurface(props: SurfaceProps) {
  const { draft, compact } = props
  const gateLabel = getLeadMagnetPublicGateLabel(draft.gate)
  const usesEmail = draft.gate !== "open"
  const deliverables = draft.deliverables.slice(0, 4)
  return (
    <section aria-label="블로그 신청 상자 미리보기" className="border border-black/[0.08] bg-white">
      <div className="h-1 w-full bg-[#084734]" />
      <div className={`flex flex-wrap items-center gap-6 ${compact ? "p-4" : "p-6 md:p-8"}`}>
        <div className="min-w-0 flex-[999_1_300px] space-y-2.5">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#084734]">
            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              <InlineText label="머리말" singleLine fit {...bind(props, "ctaCopy.eyebrow")} className="font-bold" />
            </span>
            <span className="shrink-0">· {gateLabel}</span>
          </div>
          <InlineText
            label="상자 제목"
            perLine={compact ? 19 : 26}
            {...bind(props, "ctaCopy.title")}
            className={`font-bold leading-snug tracking-[-0.03em] text-[#111110] ${compact ? "text-[20px]" : "text-[26px]"}`}
          />
          <InlineText
            label="요약"
            perLine={compact ? 27 : 44}
            {...bind(props, "summary")}
            className="text-[14px] leading-7 text-[#615D59]"
          />
          <div className="space-y-0.5 text-[12px] font-semibold text-[#615D59]">
            <p>
              {getLeadMagnetItemCount(draft)}문항 · 약 {draft.estimatedMinutes}분
            </p>
            <InlineText label="형식 설명" singleLine {...bind(props, "formatLabel")} className="font-semibold" />
          </div>
          <ul className="grid gap-1.5">
            {deliverables.map((_, index) => (
              <li key={index} className="flex items-start gap-2 text-[14px] leading-6 text-[#31302E]">
                <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                <span className="min-w-0 flex-1">
                  <InlineText label={`담긴 것 ${index + 1}`} perLine={compact ? 26 : 40} {...bind(props, `deliverables.${index}`)} />
                </span>
              </li>
            ))}
          </ul>
          {draft.deliverables.length > 4 ? (
            <p className="text-[12px] text-[#615D59]">담긴 것 {draft.deliverables.length - 4}개 더는 자료 페이지에만 보입니다.</p>
          ) : null}
          <p className="text-[12px] font-semibold text-[#084734]">
            {getLeadMagnetTierLabel(draft.tier)} 자료 · {gateLabel}
          </p>
        </div>
        <div className="min-w-0 flex-[1_1_240px] space-y-2.5 border border-black/[0.08] bg-[#FAFAF8] p-4">
          {usesEmail ? (
            <>
              <p className="text-[13px] font-semibold text-[#111110]">PDF로 자료 받기</p>
              <p className="flex h-10 items-center rounded-[6px] border border-black/[0.08] bg-white px-3 text-[13px] text-[#615D59]">
                이메일을 입력해주세요
              </p>
            </>
          ) : (
            <p className="text-[13px] font-semibold text-[#111110]">{gateLabel}</p>
          )}
          <div className="flex min-h-11 items-center justify-center gap-1.5 rounded-[6px] bg-[#084734] px-3 text-white">
            <span className="min-w-0 max-w-[85%]">
              <InlineText
                label="버튼"
                singleLine
                {...bind(props, "ctaCopy.buttonLabel")}
                className="text-center text-[14px] font-semibold text-white"
                controlClassName="focus:!bg-[#065c41] focus:outline-[#111110]"
              />
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export function ResourcePageSurface(props: SurfaceProps & { full?: boolean }) {
  const { draft, update, compact, full } = props
  // pdfGuide 가 없는 자료도 한 줄 설명을 쓰면 pdfGuide 를 새로 만든다(setValueAtPath)
  const outcomeBound = bind(props, "pdfGuide.outcome")
  const gateLabel = getLeadMagnetPublicGateLabel(draft.gate)

  const addDeliverable = () => update((d) => ({ ...d, deliverables: [...d.deliverables, "새 항목"] }))
  const removeDeliverable = (index: number) =>
    update((d) => ({ ...d, deliverables: d.deliverables.filter((_, i) => i !== index) }))
  const addItem = (sectionIndex: number) =>
    update((d) => ({
      ...d,
      sections: d.sections.map((section, i) => (i === sectionIndex ? { ...section, items: [...section.items, "새 문항"] } : section)),
    }))
  const removeItem = (sectionIndex: number, itemIndex: number) =>
    update((d) => ({
      ...d,
      sections: d.sections.map((section, i) =>
        i === sectionIndex ? { ...section, items: section.items.filter((_, j) => j !== itemIndex) } : section
      ),
    }))
  const addSection = () =>
    update((d) => ({ ...d, sections: [...d.sections, { title: "새 섹션", description: "", items: ["새 문항"] }] }))
  const removeSection = (sectionIndex: number) =>
    update((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== sectionIndex) }))

  const pad = compact ? "px-4 py-5" : "px-6 py-8 md:px-10"
  return (
    <div aria-label="자료 페이지 미리보기" className="bg-white">
      <section className={`border-b border-black/[0.08] bg-[#F6F5F4] ${pad}`}>
        <div className="flex flex-wrap items-start gap-8">
          <div className="min-w-0 flex-[999_1_360px] space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#084734]/[0.08] px-3 py-1 text-[12px] font-semibold text-[#084734]">
                {getLeadMagnetCategoryLabel(draft.category)} · {getLeadMagnetTierLabel(draft.tier)}
              </span>
              <span className="text-[12px] font-semibold text-[#615D59]">무료 · {gateLabel}</span>
            </div>
            <InlineText
              label="자료 제목"
              perLine={compact ? 15 : 22}
              {...bind(props, "title")}
              className={`font-bold leading-[1.1] tracking-[-0.035em] text-[#111110] ${compact ? "text-[26px]" : "text-[38px]"}`}
            />
            <InlineText
              label="한 줄 설명"
              perLine={compact ? 25 : 40}
              {...outcomeBound}
              placeholder={draft.summary ? "비어 있으면 요약이 대신 보입니다" : "자료를 받으면 무엇이 정리되는지 한 문장으로"}
              className="text-[16px] leading-8 text-[#615D59]"
            />
            <dl className="grid max-w-lg grid-cols-4 divide-x divide-black/[0.08] border-y border-black/[0.08]">
              {[
                ["문항", String(getLeadMagnetItemCount(draft))],
                ["소요", `${draft.estimatedMinutes}분`],
                ["형식", "PDF"],
                ["분류", getLeadMagnetCategoryLabel(draft.category)],
              ].map(([k, v], index) => (
                <div key={k} className={`py-2.5 ${index === 0 ? "pr-3" : "px-3"}`}>
                  <dt className="text-[11px] font-semibold text-[#615D59]">{k}</dt>
                  <dd className="mt-0.5 text-[18px] font-bold tabular-nums text-[#111110]">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-start gap-1 text-[13px] text-[#615D59]">
              <span className="shrink-0 pt-0.5">추천 대상 ·</span>
              <span className="min-w-0 flex-1">
                <InlineText label="추천 대상" perLine={compact ? 24 : 50} {...bind(props, "audience")} className="leading-6" />
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_240px] max-w-[340px] space-y-2 border border-black/[0.08] bg-white p-5">
            <p className="text-[12px] font-bold text-[#084734]">무료 PDF 받기</p>
            <p className="text-[17px] font-bold text-[#111110]">기본 정보만 남기면 바로 받습니다</p>
            {["이름 *", "이메일 *", "학원명 *"].map((label) => (
              <p key={label} className="flex h-9 items-center rounded-[6px] border border-black/[0.08] px-2.5 text-[13px] text-[#615D59]">
                {label}
              </p>
            ))}
            <p className="flex h-11 items-center justify-center rounded-[6px] bg-[#084734] text-[14px] font-semibold text-white">PDF 다운로드</p>
            <p className="text-[12px] text-[#615D59]">폼 칸과 버튼 문구는 고정입니다.</p>
          </div>
        </div>
      </section>

      <section className={`border-b border-black/[0.08] bg-[#084734]/[0.04] ${pad}`}>
        <div className="flex flex-wrap gap-6">
          <div className="min-w-0 flex-[0_1_200px] space-y-1.5">
            <p className="text-[12px] font-bold text-[#084734]">이 PDF에 담긴 것</p>
            <InlineText label="형식 설명" perLine={16} {...bind(props, "formatLabel")} className="text-[13px] leading-6 text-[#615D59]" />
          </div>
          <ul className={`min-w-0 flex-[999_1_320px] grid gap-x-8 gap-y-2 ${compact ? "" : "sm:grid-cols-2"}`}>
            {draft.deliverables.map((_, index) => (
              <li key={index} className="flex items-start gap-2 text-[14px] leading-6 text-[#31302E]">
                <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                <span className="min-w-0 flex-1">
                  <InlineText label={`담긴 것 ${index + 1}`} perLine={compact ? 24 : 26} {...bind(props, `deliverables.${index}`)} />
                </span>
                {full ? (
                  <IconButton label={`담긴 것 ${index + 1} 빼기`} onClick={() => removeDeliverable(index)}>
                    <Minus className="h-3.5 w-3.5" />
                  </IconButton>
                ) : null}
              </li>
            ))}
            {full ? (
              <li>
                <button type="button" onClick={addDeliverable} className="inline-flex items-center gap-1 py-1 text-[13px] font-semibold text-[#084734] hover:underline">
                  <Plus className="h-3.5 w-3.5" />
                  담긴 것 추가
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      {full ? (
        <>
          <section className={`space-y-8 border-b border-black/[0.08] ${pad}`}>
            <div className="space-y-1">
              <p className="text-[12px] font-bold text-[#084734]">진단 문항</p>
              <p className="text-[26px] font-bold tracking-[-0.03em] text-[#111110]">전체 점검 문항</p>
            </div>
            {draft.sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="flex flex-wrap gap-6">
                <div className="min-w-0 flex-[1_1_220px] space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold tabular-nums text-[#084734]">{String(sectionIndex + 1).padStart(2, "0")}</span>
                    <span aria-hidden="true" className="h-px flex-1 bg-black/[0.08]" />
                    <IconButton label={`섹션 ${sectionIndex + 1} 빼기`} onClick={() => removeSection(sectionIndex)}>
                      <Minus className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <InlineText label={`섹션 ${sectionIndex + 1} 제목`} perLine={14} {...bind(props, `sections.${sectionIndex}.title`)} className="text-[19px] font-bold leading-tight text-[#111110]" />
                  <InlineText label={`섹션 ${sectionIndex + 1} 설명`} perLine={20} {...bind(props, `sections.${sectionIndex}.description`)} className="text-[13px] leading-6 text-[#615D59]" />
                </div>
                <ol className="min-w-0 flex-[999_1_340px] divide-y divide-black/[0.06] border-t border-black/[0.08]">
                  {section.items.map((_, itemIndex) => (
                    <li key={itemIndex} className="flex items-start gap-3 py-3">
                      <span aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 rounded border border-black/15" />
                      <span className="min-w-0 flex-1">
                        <InlineText label={`섹션 ${sectionIndex + 1} 문항 ${itemIndex + 1}`} perLine={34} {...bind(props, `sections.${sectionIndex}.items.${itemIndex}`)} className="text-[15px] leading-7 text-[#31302E]" />
                      </span>
                      <IconButton label={`문항 ${itemIndex + 1} 빼기`} onClick={() => removeItem(sectionIndex, itemIndex)}>
                        <Minus className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  ))}
                  <li className="py-2">
                    <button type="button" onClick={() => addItem(sectionIndex)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] hover:underline">
                      <Plus className="h-3.5 w-3.5" />
                      문항 추가
                    </button>
                  </li>
                </ol>
              </div>
            ))}
            <button type="button" onClick={addSection} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#084734] hover:underline">
              <Plus className="h-3.5 w-3.5" />
              섹션 추가
            </button>
          </section>

          {draft.scoreBands.length > 0 ? (
            <section className={`space-y-3 border-b border-black/[0.08] bg-[#F6F5F4] ${pad}`}>
              <p className="text-[20px] font-bold text-[#111110]">점수 해석</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {draft.scoreBands.map((_, index) => (
                  <div key={index} className="space-y-1 border border-black/[0.08] bg-white p-4">
                    <InlineText label={`점수 구간 ${index + 1}`} singleLine {...bind(props, `scoreBands.${index}.range`)} className="text-[13px] font-bold text-[#084734]" />
                    <InlineText label={`점수 구간 ${index + 1} 이름`} singleLine {...bind(props, `scoreBands.${index}.label`)} className="text-[16px] font-bold text-[#111110]" />
                    <InlineText label={`점수 구간 ${index + 1} 설명`} perLine={26} {...bind(props, `scoreBands.${index}.description`)} className="text-[13px] leading-6 text-[#615D59]" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {draft.actionPlan.length > 0 ? (
            <section className={`space-y-3 ${pad}`}>
              <p className="text-[12px] font-bold text-[#084734]">실행</p>
              <p className="text-[20px] font-bold text-[#111110]">실행 플랜</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {draft.actionPlan.map((step, index) => (
                  <div key={index} className="space-y-1.5 border border-black/[0.08] p-4">
                    <InlineText label={`실행 ${index + 1} 날짜`} singleLine {...bind(props, `actionPlan.${index}.day`)} className="text-[12px] font-bold text-[#084734]" />
                    <InlineText label={`실행 ${index + 1} 제목`} perLine={22} {...bind(props, `actionPlan.${index}.title`)} className="text-[15px] font-bold text-[#111110]" />
                    <ul className="space-y-1">
                      {step.tasks.map((__, taskIndex) => (
                        <li key={taskIndex} className="flex gap-1.5 text-[13px] leading-6 text-[#31302E]">
                          <span aria-hidden="true">·</span>
                          <span className="min-w-0 flex-1">
                            <InlineText label={`실행 ${index + 1} 할 일 ${taskIndex + 1}`} perLine={24} {...bind(props, `actionPlan.${index}.tasks.${taskIndex}`)} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
