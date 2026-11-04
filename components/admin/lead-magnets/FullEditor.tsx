"use client"

/**
 * 자료 전체 편집(③) — 공개 화면 그대로 넓게 펼쳐 고친다.
 * 화면: 자료 페이지 · 블로그 신청 상자 · PDF(실제 PDF 미리보기 + PDF 에만 나오는 내용).
 * 오른쪽 속성: 문구(고른 칸의 쓰이는 곳·되돌리기) · 설정 · 세일즈 · 추적·배치 · 점검.
 * 초안은 목록 화면과 같은 상태를 쓴다 — 닫아도 초안은 남고, 저장해야 운영에 반영된다.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Trash2, X } from "lucide-react"

import { useDialogFocus } from "@/components/admin/use-dialog-focus"
import { adminFetch } from "@/lib/admin-client"
import { isHandcraftedLeadMagnetPdf, leadMagnetPdfRoutePath, legacyLeadMagnetPdfPath } from "@/lib/lead-magnet-pdf/links"
import type { LeadMagnet, LeadMagnetCategory, LeadMagnetGate, LeadMagnetStatus, LeadMagnetTier } from "@/lib/lead-magnets"
import type { LeadMagnetQualityArea, LeadMagnetQualityIssue } from "@/lib/lead-magnet-quality"
import {
  actionPlanToText,
  arrayToText,
  buildTrackedResourceUrl,
  caseCardsToText,
  emptyPdfGuide,
  emptyStoryGuide,
  finalizeDraft,
  linksToText,
  scoreBandsToText,
  scriptSamplesToText,
  textToActionPlan,
  textToArray,
  textToCaseCards,
  textToLinks,
  textToScoreBands,
  textToScriptSamples,
  textToWorksheetRows,
  toAbsoluteUrl,
  worksheetRowsToText,
} from "./model"
import { BlogGateSurface, ResourcePageSurface, fieldInfo, setValueAtPath, valueAtPath, type UpdateDraft } from "./Surfaces"

type Surface = "page" | "blog" | "pdf"
type InspectorTab = "text" | "settings" | "sales" | "routing" | "check"

const STATUS_OPTIONS: Array<{ value: LeadMagnetStatus; label: string }> = [
  { value: "draft", label: "초안" },
  { value: "review", label: "리뷰" },
  { value: "unlisted", label: "링크 공개" },
]
const GATE_OPTIONS: Array<{ value: LeadMagnetGate; label: string }> = [
  { value: "open", label: "공개 · 바로 보기" },
  { value: "email", label: "이메일 게이트" },
  { value: "login", label: "로그인 게이트" },
]
const TIER_OPTIONS: Array<{ value: LeadMagnetTier; label: string }> = [
  { value: "basic", label: "기본" },
  { value: "advanced", label: "심화" },
]
const CATEGORY_OPTIONS: Array<{ value: LeadMagnetCategory; label: string }> = [
  { value: "operations", label: "운영" },
  { value: "hardware", label: "하드웨어" },
  { value: "software", label: "소프트웨어" },
  { value: "case-study", label: "사례" },
  { value: "security", label: "보안" },
]

/** 품질 점검 영역 → 열 화면·속성 탭 */
export function areaTarget(area: LeadMagnetQualityArea): { surface: Surface; tab: InspectorTab } {
  switch (area) {
    case "copy":
      return { surface: "blog", tab: "text" }
    case "page":
    case "content":
      return { surface: "page", tab: "text" }
    case "pdf":
      return { surface: "pdf", tab: "text" }
    case "sales":
      return { surface: "page", tab: "sales" }
    case "routing":
      return { surface: "page", tab: "routing" }
  }
}

const inputCls =
  "h-10 w-full rounded-[6px] border border-[#E5E5E0] bg-white px-3 text-[14px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/20"
const areaCls =
  "w-full rounded-[6px] border border-[#E5E5E0] bg-white px-3 py-2 text-[14px] leading-6 text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/20"

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-semibold text-[#31302E]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-5 text-[#615D59]">{hint}</p> : null}
    </div>
  )
}

/** 여러 줄 묶음을 글로 고치는 칸 — 쓰는 동안은 글을 그대로 들고, 바뀔 때마다 구조로 바꿔 초안에 넣는다. */
function StructuredText<T>({
  id,
  label,
  hint,
  value,
  toText,
  fromText,
  onChange,
  rows = 5,
}: {
  id: string
  label: string
  hint?: string
  value: T
  toText: (value: T) => string
  fromText: (text: string) => T
  onChange: (value: T) => void
  rows?: number
}) {
  const [text, setText] = useState(() => toText(value))
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea
        id={id}
        rows={rows}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          onChange(fromText(event.target.value))
        }}
        className={areaCls}
      />
    </Field>
  )
}

function Select<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)} className={inputCls}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-[#F0EFEC] p-[3px]">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`h-8 rounded-md px-3 text-[13px] font-semibold ${active ? "bg-white text-[#111110] shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-[#615D59] hover:text-[#111110]"}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function FullEditor({
  open,
  draft,
  baseline,
  update,
  resetKey,
  changedCount,
  saving,
  writable,
  isNew,
  quality,
  magnets,
  initialArea,
  notice,
  error,
  onClose,
  onSave,
  onRevert,
  onDelete,
  onDuplicate,
  onCopy,
}: {
  open: boolean
  draft: LeadMagnet
  baseline: LeadMagnet
  update: UpdateDraft
  /** 다른 자료로 바뀌거나 되돌렸을 때 묶음 글 칸을 다시 읽는다 */
  resetKey: string
  changedCount: number
  saving: boolean
  writable: boolean
  isNew: boolean
  quality: readonly LeadMagnetQualityIssue[]
  magnets: readonly LeadMagnet[]
  initialArea: LeadMagnetQualityArea | null
  notice: string
  error: string
  onClose: () => void
  onSave: () => void
  onRevert: () => void
  onDelete: () => void
  onDuplicate: () => void
  onCopy: (value: string, message: string) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useDialogFocus(open, onClose, closeRef)
  const [surface, setSurface] = useState<Surface>(() => (initialArea ? areaTarget(initialArea).surface : "page"))
  const [tab, setTab] = useState<InspectorTab>(() => (initialArea ? areaTarget(initialArea).tab : "text"))
  const [device, setDevice] = useState<"pc" | "mobile">("pc")
  const [focus, setFocus] = useState<string | null>("title")

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const info = fieldInfo(focus)
  const focusValue = focus ? valueAtPath(draft, focus) : null
  const focusOriginal = focus ? valueAtPath(baseline, focus) : null
  const fixCount = quality.filter((issue) => issue.severity === "fix").length

  const goArea = (area: LeadMagnetQualityArea) => {
    const target = areaTarget(area)
    setSurface(target.surface)
    setTab(target.tab)
  }

  const set = <K extends keyof LeadMagnet>(key: K, value: LeadMagnet[K]) => update((d) => ({ ...d, [key]: value }))
  const setSales = (patch: Partial<NonNullable<LeadMagnet["salesPlaybook"]>>) =>
    update((d) => ({
      ...d,
      salesPlaybook: {
        intentScore: 15,
        intentLabel: "자료 관심 리드",
        ownerNote: "",
        firstResponse: "",
        qualificationQuestions: [],
        followUpSequence: [],
        nextCtas: [],
        ...d.salesPlaybook,
        ...patch,
      },
    }))
  const resourceUrl = draft.resourceUrl?.trim() || `/resources/${draft.slug}`

  return (
    <div role="dialog" aria-modal="true" aria-label="자료 전체 편집" className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E8E4] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button ref={closeRef} type="button" aria-label="전체 편집 닫기" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#31302E] hover:bg-[#F6F5F4]">
            <X className="h-4 w-4" />
          </button>
          <span className="truncate text-[15px] font-bold text-[#111110]">{draft.title || "새 자료"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="고칠 화면"
            value={surface}
            onChange={setSurface}
            options={[
              { value: "page", label: "자료 페이지" },
              { value: "blog", label: "블로그 신청 상자" },
              { value: "pdf", label: "PDF" },
            ]}
          />
          {surface !== "pdf" ? (
            <Segmented label="화면 폭" value={device} onChange={setDevice} options={[{ value: "pc", label: "PC" }, { value: "mobile", label: "모바일" }]} />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 text-[13px] font-semibold ${changedCount > 0 ? "text-[#A8741A]" : "text-[#615D59]"}`}>
            <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${changedCount > 0 ? "bg-[#A8741A]" : "bg-[#D5D2CB]"}`} />
            {changedCount > 0 ? `변경 ${changedCount}곳 · 저장 전` : "바뀐 곳 없음"}
          </span>
          <button type="button" onClick={onRevert} disabled={changedCount === 0} className="h-10 rounded-md bg-black/[0.05] px-3 text-[13px] font-semibold text-[#111110] disabled:opacity-50">
            되돌리기
          </button>
          <button type="button" onClick={onSave} disabled={saving || !writable} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#084734] px-5 text-[13px] font-semibold text-white hover:bg-[#065c41] disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            저장
          </button>
        </div>
      </div>
      {notice || error ? (
        <p role={error ? "alert" : "status"} className={`border-b border-[#E8E8E4] px-5 py-2 text-[13px] ${error ? "text-[#B43E3E]" : "text-[#084734]"}`}>
          {error || notice}
        </p>
      ) : null}

      <fieldset disabled={!writable} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-[#E8E6E1] p-4 sm:p-6">
          {surface === "pdf" ? (
            <PdfWorkspace key={resetKey} draft={draft} update={update} magnets={magnets} />
          ) : (
            <div className="mx-auto bg-white shadow-[0_4px_18px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]" style={{ maxWidth: device === "mobile" ? 390 : 1040 }}>
              {surface === "page" ? (
                <ResourcePageSurface draft={draft} baseline={baseline} update={update} onFocusField={setFocus} compact={device === "mobile"} full />
              ) : (
                <div className="space-y-4 p-4 sm:p-8">
                  <p className="text-[14px] leading-7 text-[#615D59]">…블로그 글 맨 아래에 이 상자가 붙습니다.</p>
                  <BlogGateSurface draft={draft} baseline={baseline} update={update} onFocusField={setFocus} compact={device === "mobile"} />
                </div>
              )}
            </div>
          )}
        </div>

        <aside aria-label="속성" className="flex min-h-0 w-full shrink-0 flex-col border-t border-[#E8E8E4] lg:w-[340px] lg:border-l lg:border-t-0">
          <nav aria-label="속성 탭" className="flex gap-4 overflow-x-auto border-b border-[#E8E8E4] px-4">
            {(
              [
                ["text", "문구"],
                ["settings", "설정"],
                ["sales", "세일즈"],
                ["routing", "추적·배치"],
                ["check", fixCount > 0 ? `점검 ${fixCount}` : "점검"],
              ] as Array<[InspectorTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px shrink-0 border-b-2 px-0.5 py-2.5 text-[13px] font-semibold ${tab === key ? "border-[#084734] text-[#111110]" : "border-transparent text-[#615D59] hover:text-[#111110]"}`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {tab === "text" ? (
              <section aria-label="고른 문구" className="space-y-3">
                {info && focus ? (
                  <div className="space-y-2 rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] p-4">
                    <p className="flex justify-between gap-2">
                      <span className="text-[14px] font-bold text-[#111110]">{info.label}</span>
                      <span className="text-[12px] tabular-nums text-[#615D59]">{(focusValue ?? "").length}자</span>
                    </p>
                    <p className="text-[12px] font-semibold text-[#615D59]">같이 바뀌는 곳</p>
                    <ul className="space-y-0.5 text-[13px] text-[#31302E]">
                      {info.where.map((where) => (
                        <li key={where}>· {where}</li>
                      ))}
                    </ul>
                    {focusValue !== focusOriginal && focusOriginal !== null ? (
                      <>
                        <p className="text-[12px] leading-5 text-[#615D59]">원래 문구 · {focusOriginal || "(비어 있음)"}</p>
                        <button type="button" onClick={() => update((d) => setValueAtPath(d, focus, focusOriginal))} className="h-8 rounded-md border border-[#E8E8E4] bg-white px-3 text-[13px] font-semibold text-[#111110]">
                          이 칸만 되돌리기
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[13px] leading-6 text-[#615D59]">화면의 글자를 누르면 그 문구가 어디에 같이 쓰이는지 여기에 보입니다.</p>
                )}
                <p className="text-[12px] leading-5 text-[#615D59]">점선이 보이는 글자는 눌러서 바로 고칩니다. 고친 칸은 연두색으로 남습니다.</p>
              </section>
            ) : null}

            {tab === "settings" ? (
              <section aria-label="설정" className="space-y-4">
                <Field label="슬러그" htmlFor="lm-slug" hint={isNew ? "자료 주소 /resources/<슬러그> 에 쓰입니다." : "저장된 자료의 슬러그를 바꾸면 블로그에 붙은 연결이 끊길 수 있습니다."}>
                  <input id="lm-slug" value={draft.slug} onChange={(event) => set("slug", event.target.value)} className={inputCls} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="상태" htmlFor="lm-status">
                    <Select id="lm-status" value={draft.status} options={STATUS_OPTIONS} onChange={(value) => set("status", value)} />
                  </Field>
                  <Field label="게이트" htmlFor="lm-gate">
                    <Select id="lm-gate" value={draft.gate} options={GATE_OPTIONS} onChange={(value) => set("gate", value)} />
                  </Field>
                  <Field label="분류" htmlFor="lm-cat">
                    <Select id="lm-cat" value={draft.category} options={CATEGORY_OPTIONS} onChange={(value) => set("category", value)} />
                  </Field>
                  <Field label="티어" htmlFor="lm-tier">
                    <Select id="lm-tier" value={draft.tier} options={TIER_OPTIONS} onChange={(value) => set("tier", value)} />
                  </Field>
                </div>
                <Field label="예상 소요 시간(분)" htmlFor="lm-min">
                  <input id="lm-min" type="number" min={1} value={draft.estimatedMinutes} onChange={(event) => set("estimatedMinutes", Math.max(1, Number(event.target.value) || 1))} className={inputCls} />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-[#31302E]">
                  <input type="checkbox" checked={draft.published} onChange={(event) => set("published", event.target.checked)} className="h-[18px] w-[18px] accent-[#084734]" />
                  자료실·블로그에 공개
                </label>
                <Field label="CTA 본문" htmlFor="lm-cta-body" hint="지금 공개 화면에는 나오지 않습니다(신청 상자는 요약을 씁니다).">
                  <textarea id="lm-cta-body" rows={3} value={draft.ctaCopy.body} onChange={(event) => update((d) => ({ ...d, ctaCopy: { ...d.ctaCopy, body: event.target.value } }))} className={areaCls} />
                </Field>
                <Field label="블로그 톤" htmlFor="lm-blog-tone" hint="이 자료를 붙일 글의 말투 메모입니다.">
                  <textarea id="lm-blog-tone" rows={2} value={draft.blogTone} onChange={(event) => set("blogTone", event.target.value)} className={areaCls} />
                </Field>
                <Field label="가이드 톤" htmlFor="lm-guide-tone">
                  <textarea id="lm-guide-tone" rows={2} value={draft.guideTone} onChange={(event) => set("guideTone", event.target.value)} className={areaCls} />
                </Field>
                <div className="flex flex-wrap gap-2 border-t border-[#E8E8E4] pt-4">
                  <button type="button" onClick={onDuplicate} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black/[0.05] px-3 text-[13px] font-semibold text-[#111110]">
                    <Copy className="h-3.5 w-3.5" />
                    복제
                  </button>
                  <button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#F2B8B8] bg-white px-3 text-[13px] font-semibold text-[#B43E3E]">
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </button>
                </div>
              </section>
            ) : null}

            {tab === "sales" ? (
              <section aria-label="세일즈" key={`sales-${resetKey}`} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="리드 의도 점수" htmlFor="lm-intent" hint="0~40">
                    <input id="lm-intent" type="number" min={0} max={40} value={draft.salesPlaybook?.intentScore ?? 15} onChange={(event) => setSales({ intentScore: Number(event.target.value) || 0 })} className={inputCls} />
                  </Field>
                  <Field label="의도 라벨" htmlFor="lm-intent-label">
                    <input id="lm-intent-label" value={draft.salesPlaybook?.intentLabel ?? ""} onChange={(event) => setSales({ intentLabel: event.target.value })} className={inputCls} />
                  </Field>
                </div>
                <Field label="담당자 메모" htmlFor="lm-owner" hint="리드가 이 자료를 받았을 때 내부에서 어떻게 해석할지.">
                  <textarea id="lm-owner" rows={3} value={draft.salesPlaybook?.ownerNote ?? ""} onChange={(event) => setSales({ ownerNote: event.target.value })} className={areaCls} />
                </Field>
                <Field label="첫 응대 문구" htmlFor="lm-first" hint="신청 직후 전화·카카오·이메일 첫 문장.">
                  <textarea id="lm-first" rows={3} value={draft.salesPlaybook?.firstResponse ?? ""} onChange={(event) => setSales({ firstResponse: event.target.value })} className={areaCls} />
                </Field>
                <StructuredText id="lm-qual" label="자격 확인 질문" hint="한 줄에 하나" value={draft.salesPlaybook?.qualificationQuestions ?? []} toText={arrayToText} fromText={textToArray} onChange={(value) => setSales({ qualificationQuestions: value })} />
                <StructuredText id="lm-follow" label="빠른 후속 시퀀스" hint="## D+0 5분 | 제목 / - 할 일" value={draft.salesPlaybook?.followUpSequence ?? []} toText={actionPlanToText} fromText={textToActionPlan} onChange={(value) => setSales({ followUpSequence: value })} rows={7} />
                <StructuredText id="lm-next" label="다음 CTA" hint="한 줄에 하나" value={draft.salesPlaybook?.nextCtas ?? []} toText={arrayToText} fromText={textToArray} onChange={(value) => setSales({ nextCtas: value })} />
                <StructuredText id="lm-prep" label="상담 준비 자료" hint="한 줄에 하나 · PDF에도 나옵니다" value={draft.consultationPrep} toText={arrayToText} fromText={textToArray} onChange={(value) => set("consultationPrep", value)} />
              </section>
            ) : null}

            {tab === "routing" ? (
              <section aria-label="추적·배치" key={`routing-${resetKey}`} className="space-y-4">
                <Field label="추적 SourceDetail" htmlFor="lm-source" hint="CRM·구독자 source_detail 에 남는 값. 기본값 lead_magnet:<슬러그>.">
                  <input id="lm-source" value={draft.sourceDetail} onChange={(event) => set("sourceDetail", event.target.value as `lead_magnet:${string}`)} className={inputCls} />
                </Field>
                <Field label="자료 URL" htmlFor="lm-url" hint="신청 뒤 열리는 링크. PDF 경로면 저장된 내용으로 바로 만든 PDF가 열립니다.">
                  <input id="lm-url" value={draft.resourceUrl ?? ""} onChange={(event) => set("resourceUrl", event.target.value)} className={inputCls} />
                </Field>
                <Field label="Storage 경로" htmlFor="lm-storage" hint="materials 버킷의 비공개 파일. 적으면 이 파일이 우선입니다.">
                  <input id="lm-storage" value={draft.storagePath ?? ""} onChange={(event) => set("storagePath", event.target.value)} className={inputCls} />
                </Field>
                <div className="space-y-2 rounded-[10px] border border-[#E8E8E4] bg-[#FAFAF8] p-3">
                  <p className="text-[12px] font-semibold text-[#31302E]">CTA 배치용 UTM 링크</p>
                  <p className="break-all text-[12px] text-[#615D59]">{buildTrackedResourceUrl(resourceUrl, draft.slug)}</p>
                  <button type="button" onClick={() => onCopy(buildTrackedResourceUrl(resourceUrl, draft.slug), "CTA 배치용 추적 링크를 복사했습니다.")} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[13px] font-semibold text-[#111110] ring-1 ring-[#E8E8E4]">
                    <Copy className="h-3.5 w-3.5" />
                    복사
                  </button>
                  <button type="button" onClick={() => onCopy(toAbsoluteUrl(resourceUrl), "공개 자료 링크를 복사했습니다.")} className="ml-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-3 text-[13px] font-semibold text-[#111110] ring-1 ring-[#E8E8E4]">
                    공개 링크 복사
                  </button>
                </div>
                <StructuredText id="lm-place" label="추천 배치" hint="어떤 블로그·제품·이메일 CTA에 붙일지 한 줄에 하나" value={draft.suggestedPlacements} toText={arrayToText} fromText={textToArray} onChange={(value) => set("suggestedPlacements", value)} rows={6} />
              </section>
            ) : null}

            {tab === "check" ? (
              <section aria-label="품질 점검" className="space-y-2">
                {quality.length === 0 ? (
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-[#084734]">
                    <CheckCircle2 className="h-4 w-4" />
                    품질 기준을 모두 채웠습니다
                  </p>
                ) : (
                  quality.map((issue) => (
                    <div key={`${issue.id}-${issue.field ?? ""}`} className="space-y-1 border-b border-[#E8E8E4] pb-3">
                      <p className={`text-[12px] font-bold ${issue.severity === "fix" ? "text-[#B43E3E]" : "text-[#A8741A]"}`}>
                        {issue.severity === "fix" ? "고쳐야 함" : "다듬으면 좋음"}
                        {issue.where ? ` · ${issue.where}` : ""}
                      </p>
                      <p className="text-[13px] leading-6 text-[#111110]">{issue.message}</p>
                      <button type="button" onClick={() => goArea(issue.area)} className="text-[13px] font-semibold text-[#084734] hover:underline">
                        고치러 가기
                      </button>
                    </div>
                  ))
                )}
              </section>
            ) : null}
          </div>
        </aside>
      </fieldset>
    </div>
  )
}

/**
 * PDF 화면 — 왼쪽 실제 PDF 미리보기(저장 전 초안 그대로), 오른쪽 PDF 에만 나오는 내용 편집.
 * 사이트 CSP 가 iframe·object 로 PDF 를 띄우는 것을 막으므로(frame-ancestors·object-src) 새 탭으로 연다.
 */
function PdfWorkspace({ draft, update, magnets }: { draft: LeadMagnet; update: UpdateDraft; magnets: readonly LeadMagnet[] }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [renderedFrom, setRenderedFrom] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState("")
  const draftJson = useMemo(() => JSON.stringify(finalizeDraft(draft)), [draft])
  const stale = renderedFrom !== null && renderedFrom !== draftJson

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
  }, [pdfUrl])

  const render = async () => {
    // 팝업 차단을 피하려고 누른 순간 빈 탭을 먼저 연다 — PDF 가 오면 그 탭으로 보낸다
    const tab = window.open("", "_blank")
    setRendering(true)
    setRenderError("")
    try {
      const response = await adminFetch("/api/admin/lead-magnets/pdf-preview", {
        method: "POST",
        body: JSON.stringify({ leadMagnet: JSON.parse(draftJson) }),
        adminReadOnly: true,
      })
      if (!response.ok) throw new Error(String(response.status))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setRenderedFrom(draftJson)
      if (tab) tab.location.href = url
    } catch {
      tab?.close()
      setRenderError("PDF 미리보기를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.")
    } finally {
      setRendering(false)
    }
  }

  const guide = draft.pdfGuide ?? emptyPdfGuide()
  const story = draft.storyGuide ?? emptyStoryGuide()
  const setGuide = (patch: Partial<typeof guide>) => update((d) => ({ ...d, pdfGuide: { ...(d.pdfGuide ?? emptyPdfGuide()), ...patch } }))
  const setStory = (patch: Partial<typeof story>) => update((d) => ({ ...d, storyGuide: { ...(d.storyGuide ?? emptyStoryGuide()), ...patch } }))
  const related = new Set(guide.relatedMagnets)
  const handcrafted = isHandcraftedLeadMagnetPdf(draft.slug)
  const savedPdfHref = handcrafted ? legacyLeadMagnetPdfPath(draft.slug) : leadMagnetPdfRoutePath(draft.slug)

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section aria-label="PDF 미리보기" className="min-w-0 flex-[999_1_420px] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#111110]">실제 PDF 미리보기</p>
            <p className={`text-[12px] ${stale ? "text-[#A8741A]" : "text-[#615D59]"}`}>
              {stale
                ? "미리보기 뒤에 바뀐 내용이 있습니다"
                : handcrafted
                  ? "저장 전 초안으로 자동 생성하면 이렇게 나옵니다."
                  : "저장 전 초안 그대로 새 탭에 만듭니다. 저장하면 받는 사람의 PDF도 몇 분 안에 바뀝니다."}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void render()} disabled={rendering} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#084734] px-3 text-[13px] font-semibold text-white disabled:opacity-60">
              {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {pdfUrl ? "다시 만들기" : "PDF 미리보기 만들기"}
            </button>
            {draft.published ? (
              <a href={savedPdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black/[0.05] px-3 text-[13px] font-semibold text-[#111110]">
                저장된 PDF
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
        {renderError ? (
          <p role="alert" className="flex items-center gap-2 rounded-[10px] bg-white px-4 py-3 text-[13px] text-[#B43E3E]">
            <AlertTriangle className="h-4 w-4" />
            {renderError}
          </p>
        ) : null}
        {handcrafted ? (
          <p className="rounded-[10px] border border-[#ECD29C] bg-[#FBF1E0] px-4 py-3 text-[13px] leading-6 text-[#7A520F]">
            이 자료는 따로 만든 PDF 파일을 그대로 보냅니다. 여기서 고친 내용은 받는 사람의 PDF에 들어가지 않습니다(자료 페이지·블로그 상자에는 들어갑니다).
            자동 생성 PDF로 바꿀지는 따로 정합니다.
          </p>
        ) : null}
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-[#D5D2CB] bg-white px-6 py-10 text-center text-[13px] leading-6 text-[#615D59]">
          {pdfUrl ? (
            <>
              <p className="font-semibold text-[#111110]">새 탭에서 PDF 미리보기를 열었습니다.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black/[0.05] px-3 font-semibold text-[#111110]">
                  다시 열기
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a href={pdfUrl} download={`${draft.slug}-미리보기.pdf`} className="inline-flex h-9 items-center rounded-md bg-black/[0.05] px-3 font-semibold text-[#111110]">
                  내려받기
                </a>
              </div>
            </>
          ) : (
            <p>
              「PDF 미리보기 만들기」를 누르면 지금 초안으로 PDF를 그려 새 탭에 엽니다.
              <br />
              문항·담긴 것·점수 해석·실행 플랜은 「자료 페이지」 화면에서 고친 내용이 그대로 들어갑니다.
            </p>
          )}
        </div>
      </section>

      <section aria-label="PDF에만 나오는 내용" className="min-w-0 flex-[1_1_360px] space-y-4 rounded-[10px] bg-white p-4">
        <p className="text-[13px] font-bold text-[#111110]">PDF에만 나오는 내용</p>
        <Field label="부제" htmlFor="pdf-subtitle">
          <input id="pdf-subtitle" value={guide.subtitle} onChange={(event) => setGuide({ subtitle: event.target.value })} className={inputCls} />
        </Field>
        <StructuredText id="pdf-best" label="이럴 때 쓰세요" hint="한 줄에 하나" value={guide.bestUsedWhen} toText={arrayToText} fromText={textToArray} onChange={(value) => setGuide({ bestUsedWhen: value })} />
        <StructuredText id="pdf-how" label="사용 방법" hint="한 줄에 하나" value={guide.howToUse} toText={arrayToText} fromText={textToArray} onChange={(value) => setGuide({ howToUse: value })} />
        <StructuredText id="pdf-prompts" label="같이 이야기할 질문" hint="한 줄에 하나" value={guide.discussionPrompts} toText={arrayToText} fromText={textToArray} onChange={(value) => setGuide({ discussionPrompts: value })} />
        <StructuredText id="pdf-ctas" label="상담 CTA 링크" hint="라벨 | URL | 설명" value={guide.consultationCtas} toText={linksToText} fromText={textToLinks} onChange={(value) => setGuide({ consultationCtas: value })} />
        <Field label="전문가 한마디" htmlFor="pdf-expert">
          <textarea id="pdf-expert" rows={3} value={guide.expertNote} onChange={(event) => setGuide({ expertNote: event.target.value })} className={areaCls} />
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-[12px] font-semibold text-[#31302E]">다음에 권할 자료</legend>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-[6px] border border-[#E5E5E0] p-2">
            {magnets
              .filter((magnet) => magnet.slug !== draft.slug)
              .map((magnet) => (
                <label key={magnet.slug} className="flex items-start gap-2 text-[13px] text-[#31302E]">
                  <input
                    type="checkbox"
                    checked={related.has(magnet.slug)}
                    onChange={(event) =>
                      setGuide({
                        relatedMagnets: event.target.checked
                          ? [...guide.relatedMagnets, magnet.slug]
                          : guide.relatedMagnets.filter((slug) => slug !== magnet.slug),
                      })
                    }
                    className="mt-1 h-4 w-4 accent-[#084734]"
                  />
                  {magnet.title}
                </label>
              ))}
          </div>
        </fieldset>

        <div className="space-y-3 border-t border-[#E8E8E4] pt-4">
          <p className="text-[13px] font-bold text-[#111110]">스토리</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="머리말" htmlFor="story-eyebrow">
              <input id="story-eyebrow" value={story.eyebrow} onChange={(event) => setStory({ eyebrow: event.target.value })} className={inputCls} />
            </Field>
            <Field label="제목" htmlFor="story-title">
              <input id="story-title" value={story.title} onChange={(event) => setStory({ title: event.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="본문" htmlFor="story-body" hint="제목·본문·장면이 모두 있어야 PDF에 나옵니다.">
            <textarea id="story-body" rows={4} value={story.body} onChange={(event) => setStory({ body: event.target.value })} className={areaCls} />
          </Field>
          <StructuredText id="story-beats" label="장면" hint="한 줄에 하나" value={story.beats} toText={arrayToText} fromText={textToArray} onChange={(value) => setStory({ beats: value })} />
          <Field label="한 줄 정리" htmlFor="story-take">
            <input id="story-take" value={story.takeaway} onChange={(event) => setStory({ takeaway: event.target.value })} className={inputCls} />
          </Field>
        </div>

        <div className="space-y-3 border-t border-[#E8E8E4] pt-4">
          <p className="text-[13px] font-bold text-[#111110]">현장 한마디</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="말한 사람" htmlFor="voice-speaker">
              <input id="voice-speaker" value={draft.expertVoice?.speaker ?? ""} onChange={(event) => update((d) => ({ ...d, expertVoice: { speaker: event.target.value, role: d.expertVoice?.role, comment: d.expertVoice?.comment ?? "" } }))} className={inputCls} />
            </Field>
            <Field label="소속" htmlFor="voice-role">
              <input id="voice-role" value={draft.expertVoice?.role ?? ""} onChange={(event) => update((d) => ({ ...d, expertVoice: { speaker: d.expertVoice?.speaker ?? "", role: event.target.value, comment: d.expertVoice?.comment ?? "" } }))} className={inputCls} />
            </Field>
          </div>
          <Field label="코멘트" htmlFor="voice-comment" hint="말한 사람과 코멘트가 모두 있어야 나옵니다.">
            <textarea id="voice-comment" rows={3} value={draft.expertVoice?.comment ?? ""} onChange={(event) => update((d) => ({ ...d, expertVoice: { speaker: d.expertVoice?.speaker ?? "", role: d.expertVoice?.role, comment: event.target.value } }))} className={areaCls} />
          </Field>
        </div>

        <div className="space-y-3 border-t border-[#E8E8E4] pt-4">
          <p className="text-[13px] font-bold text-[#111110]">직접 채우는 표</p>
          <Field label="표 제목" htmlFor="ws-title">
            <input id="ws-title" value={draft.worksheet?.title ?? ""} onChange={(event) => update((d) => ({ ...d, worksheet: { title: event.target.value, columns: d.worksheet?.columns ?? [], rows: d.worksheet?.rows ?? [], intro: d.worksheet?.intro, formula: d.worksheet?.formula, note: d.worksheet?.note } }))} className={inputCls} />
          </Field>
          <StructuredText id="ws-cols" label="입력 칸 머리" hint="한 줄에 하나(항목 열 제외)" value={draft.worksheet?.columns ?? []} toText={arrayToText} fromText={textToArray} onChange={(value) => update((d) => ({ ...d, worksheet: { title: d.worksheet?.title ?? "계산표", rows: d.worksheet?.rows ?? [], intro: d.worksheet?.intro, formula: d.worksheet?.formula, note: d.worksheet?.note, columns: value } }))} rows={3} />
          <StructuredText id="ws-rows" label="행" hint="라벨 | 힌트 · 맨 앞 * 는 합계 줄" value={draft.worksheet?.rows ?? []} toText={worksheetRowsToText} fromText={textToWorksheetRows} onChange={(value) => update((d) => ({ ...d, worksheet: { title: d.worksheet?.title ?? "계산표", columns: d.worksheet?.columns ?? [], intro: d.worksheet?.intro, formula: d.worksheet?.formula, note: d.worksheet?.note, rows: value } }))} />
          <Field label="계산식 안내" htmlFor="ws-formula">
            <input id="ws-formula" value={draft.worksheet?.formula ?? ""} onChange={(event) => update((d) => ({ ...d, worksheet: { title: d.worksheet?.title ?? "계산표", columns: d.worksheet?.columns ?? [], rows: d.worksheet?.rows ?? [], intro: d.worksheet?.intro, note: d.worksheet?.note, formula: event.target.value } }))} className={inputCls} />
          </Field>
        </div>

        <div className="space-y-3 border-t border-[#E8E8E4] pt-4">
          <StructuredText id="pdf-cases" label="도입 사례 카드" hint="## 익명 라벨 | 과목·유형 / 고민: … / 변화: … / 인용: … · 정량 성과 수치는 넣지 않습니다" value={draft.caseCards ?? []} toText={caseCardsToText} fromText={textToCaseCards} onChange={(value) => assign(update, "caseCards", value)} rows={7} />
          <StructuredText id="pdf-scripts" label="상황별 멘트 예시" hint="## 상황 / 권장: … / 피하기: … / 이유: …" value={draft.scriptSamples ?? []} toText={scriptSamplesToText} fromText={textToScriptSamples} onChange={(value) => assign(update, "scriptSamples", value)} rows={7} />
          <StructuredText id="pdf-flags" label="레드 플래그" hint="한 줄에 하나" value={draft.redFlags ?? []} toText={arrayToText} fromText={textToArray} onChange={(value) => assign(update, "redFlags", value)} />
          <StructuredText id="pdf-score" label="점수 해석" hint="0-10점 | 라벨 | 설명 · 자료 페이지에서도 고칠 수 있습니다" value={draft.scoreBands} toText={scoreBandsToText} fromText={textToScoreBands} onChange={(value) => assign(update, "scoreBands", value)} />
          <StructuredText id="pdf-links" label="더 확인할 링크" hint="라벨 | URL | 설명" value={draft.sourceLinks ?? []} toText={linksToText} fromText={textToLinks} onChange={(value) => assign(update, "sourceLinks", value)} />
        </div>
      </section>
    </div>
  )
}

function assign<K extends keyof LeadMagnet>(update: UpdateDraft, key: K, value: LeadMagnet[K]) {
  update((d) => ({ ...d, [key]: value }))
}
