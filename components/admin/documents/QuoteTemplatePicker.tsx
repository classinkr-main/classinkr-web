"use client"

import { useState } from "react"
import { Plus, Search } from "lucide-react"

import {
  buildQuoteTemplatePreview,
  countHiddenBaseQuoteTemplates,
  filterQuoteTemplatePickerGroups,
  getDefaultQuoteTemplatePresetId,
  listQuoteTemplatePickerGroups,
  type QuoteTemplatePreview,
  type QuoteTemplatePreviewLine,
} from "@/lib/quote-template-picker"
import type { QuoteProductLine, StandardQuoteTemplateId } from "@/lib/standard-quote-template"

// 견적서 탭 = 템플릿 화면(2026-11-23 정정). 왼쪽은 템플릿 목록, 오른쪽은 고른 템플릿의 기본 구성 미리보기.
// 저장한 견적 목록·상세는 히스토리 탭(HardwareQuotesPanel 의 history 화면)이 맡고, 두 화면은 같은 틀을 쓴다.
//
// 목록과 미리보기 값은 lib/quote-template-picker.ts 가 템플릿 정의(STANDARD_QUOTE_TEMPLATES)에서 계산한다.
// 팀 템플릿(quote_team_templates) 줄은 없다 — 작성기가 "팀 템플릿을 지정해 열기"를 받지 않는다
// (initialTemplateId 는 기본 템플릿 id 만). 팀 템플릿은 작성 창 안의 템플릿 목록에서 고른다.
// 같은 이유로 작성기는 프리셋 지정도 받지 않아, "이 템플릿으로 작성"은 항상 기본 구성으로 열린다.

const TEMPLATE_SETTINGS_HREF = "/admin/quotes/templates"
const DESKTOP_QUERY = "(min-width: 1024px)"

const TEXT_LINK =
  "font-semibold text-[#084734] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
const SOLID_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#084734] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
const GHOST_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12.5px] font-semibold text-[#31302E] transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"

type ProductLineFilter = QuoteProductLine | "all"

const PRODUCT_LINE_OPTIONS: Array<{ key: ProductLineFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "software", label: "SW" },
  { key: "hardware", label: "HW" },
]

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`
}

function formatMan(value: number) {
  return `${(Math.round(value / 1000) / 10).toLocaleString("ko-KR")}만`
}

function quantityText(line: QuoteTemplatePreviewLine) {
  if (line.quantity == null) return ""
  return `×${line.quantity}${line.quantityUnit && line.quantityUnit !== "대" ? line.quantityUnit : ""}`
}

function amountText(line: QuoteTemplatePreviewLine) {
  if (line.kind === "pending") return "별도 청구"
  return line.amount != null ? formatMoney(line.amount) : "—"
}

export type QuoteTemplatePickerSelection = { templateId: StandardQuoteTemplateId; presetId: string | null }

type QuoteTemplatePickerProps = {
  /** 개인 설정의 숨긴 템플릿 id(useQuoteWorkspacePreferences). */
  hiddenTemplateIds?: readonly string[]
  /** 그 템플릿으로 작성기를 연다. */
  onCompose: (templateId: StandardQuoteTemplateId) => void
}

export default function QuoteTemplatePicker({ hiddenTemplateIds = [], onCompose }: QuoteTemplatePickerProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [productLine, setProductLine] = useState<ProductLineFilter>("all")
  // 고른 줄이 없으면(null) 보이는 목록의 첫 줄이 선택이다.
  const [selection, setSelection] = useState<QuoteTemplatePickerSelection | null>(null)

  return (
    <QuoteTemplatePickerView
      hiddenTemplateIds={hiddenTemplateIds}
      searchTerm={searchTerm}
      productLine={productLine}
      selection={selection}
      onSearchTermChange={setSearchTerm}
      onProductLineChange={setProductLine}
      onSelect={(next) => {
        // 좁은 화면에는 미리보기 칸이 없다 — 줄을 누르면 바로 작성 창을 연다.
        if (typeof window !== "undefined" && !window.matchMedia(DESKTOP_QUERY).matches) {
          onCompose(next.templateId)
          return
        }
        setSelection(next)
      }}
      onSelectPreset={setSelection}
      onCompose={onCompose}
    />
  )
}

type QuoteTemplatePickerViewProps = QuoteTemplatePickerProps & {
  searchTerm: string
  productLine: ProductLineFilter
  selection: QuoteTemplatePickerSelection | null
  onSearchTermChange: (value: string) => void
  onProductLineChange: (value: ProductLineFilter) => void
  /** 목록 줄을 눌렀다. */
  onSelect: (selection: QuoteTemplatePickerSelection) => void
  /** 미리보기의 구성 버튼을 눌렀다. */
  onSelectPreset: (selection: QuoteTemplatePickerSelection) => void
}

/** 상태 없는 표시부 — 훅이 없어 테스트가 요소를 펼쳐 핸들러를 직접 부를 수 있다. */
export function QuoteTemplatePickerView({
  hiddenTemplateIds = [],
  searchTerm,
  productLine,
  selection,
  onSearchTermChange,
  onProductLineChange,
  onSelect,
  onSelectPreset,
  onCompose,
}: QuoteTemplatePickerViewProps) {
  const allGroups = listQuoteTemplatePickerGroups(hiddenTemplateIds)
  const hiddenCount = countHiddenBaseQuoteTemplates(hiddenTemplateIds)

  if (allGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-[#111110]">표시할 템플릿이 없습니다.</p>
        <p className="mt-1 text-xs text-[#615D59]">
          기본 템플릿을 모두 숨겼습니다.{" "}
          <a href={TEMPLATE_SETTINGS_HREF} className={TEXT_LINK}>
            템플릿 관리
          </a>
          에서 다시 표시할 수 있습니다.
        </p>
      </div>
    )
  }

  const counts: Record<ProductLineFilter, number> = { all: 0, software: 0, hardware: 0 }
  for (const group of allGroups) {
    counts[group.productLine] += group.templates.length
    counts.all += group.templates.length
  }

  const groups = filterQuoteTemplatePickerGroups(allGroups, { query: searchTerm, productLine })
  const visible = groups.flatMap((group) => group.templates)
  const selected = visible.find((template) => template.id === selection?.templateId) ?? visible[0] ?? null
  const presetId = selected
    ? selection?.templateId === selected.id
      ? selection.presetId
      : getDefaultQuoteTemplatePresetId(selected.id)
    : null
  const preview = selected ? buildQuoteTemplatePreview(selected.id, presetId) : null

  return (
    <div className="flex overflow-hidden rounded-[10px] border border-[#e8e8e4] bg-white">
      <aside aria-label="견적서 템플릿" className="w-full min-w-0 shrink-0 border-[#e8e8e4] lg:w-[400px] lg:border-r">
        <div className="flex flex-col gap-2.5 border-b border-[#e8e8e4] px-3.5 py-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="템플릿 이름"
              aria-label="템플릿 검색"
              className="h-9 w-full rounded-md border border-[#e8e8e4] bg-white pl-9 pr-3 text-[13px] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
            />
          </label>
          <div role="group" aria-label="유형" className="flex h-8 items-center gap-4">
            {PRODUCT_LINE_OPTIONS.map((option) => {
              const active = productLine === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onProductLineChange(option.key)}
                  aria-pressed={active}
                  className={`py-1.5 text-[12.5px] ${
                    active ? "font-semibold text-[#111110] shadow-[inset_0_-1.5px_0_#111110]" : "text-[#615D59] hover:text-[#111110]"
                  }`}
                >
                  {option.label} <span className="font-normal tabular-nums text-[#78736D]">{counts[option.key]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-[#111110]">조건에 맞는 템플릿이 없습니다.</p>
            <button
              type="button"
              onClick={() => {
                onSearchTermChange("")
                onProductLineChange("all")
              }}
              className={`${GHOST_BUTTON} mt-3`}
            >
              전체 보기
            </button>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.productLine} className="border-b border-[#f0f0ec] pb-1.5">
              <h2 className="flex items-center gap-2 border-b border-[#E6E4DF] bg-[#F2F1EE] px-4 py-2.5 text-[15.5px] font-extrabold tracking-[-0.015em] text-[#111110]">
                {group.label}
                <span className="rounded-full bg-white/80 px-2 py-px text-[12.5px] font-bold tabular-nums text-[#31302E]">
                  {group.templates.length}
                </span>
                <span className="ml-auto text-[11.5px] font-normal tracking-normal text-[#615D59]">
                  공급자 {group.supplierLabel}
                </span>
              </h2>
              {group.templates.map((template) => {
                const active = template.id === selected?.id
                return (
                  <button
                    key={template.id}
                    type="button"
                    data-template-id={template.id}
                    title={template.description}
                    onClick={() =>
                      onSelect({ templateId: template.id, presetId: getDefaultQuoteTemplatePresetId(template.id) })
                    }
                    aria-pressed={active}
                    className={`block w-full py-2.5 pl-[18px] pr-4 text-left transition-colors ${
                      active ? "bg-[#F6F5F2] shadow-[inset_2px_0_0_#084734]" : "hover:bg-[#FCFCFA]"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2.5">
                      <span className="truncate text-[13px] font-semibold text-[#111110]">{template.label}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#111110]">
                        {formatMan(buildQuoteTemplatePreview(template.id).totalAmount)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[#78736D]">
                      {template.presetLabels.length > 0 ? template.presetLabels.join(" · ") : template.description}
                    </span>
                  </button>
                )
              })}
            </section>
          ))
        )}

        <p className="px-4 py-3 text-[11.5px] leading-relaxed text-[#78736D]">
          팀에서 저장한 템플릿은 작성 창의 템플릿 목록에서 고릅니다.
          {hiddenCount > 0 && (
            <>
              {" "}
              숨긴 템플릿 {hiddenCount}개는{" "}
              <a href={TEMPLATE_SETTINGS_HREF} className={TEXT_LINK}>
                템플릿 관리
              </a>
              에서 다시 표시할 수 있습니다.
            </>
          )}
        </p>
      </aside>

      <div className="hidden min-w-0 flex-1 lg:block">
        {preview && selected ? (
          <QuoteTemplatePreviewPane
            preview={preview}
            presets={selected.presets}
            onSelectPreset={(nextPresetId) => onSelectPreset({ templateId: selected.id, presetId: nextPresetId })}
            onCompose={() => onCompose(selected.id)}
          />
        ) : (
          <p className="px-7 py-16 text-center text-sm text-[#78736D]">왼쪽에서 템플릿을 고르세요.</p>
        )}
      </div>
    </div>
  )
}

function QuoteTemplatePreviewPane({
  preview,
  presets,
  onSelectPreset,
  onCompose,
}: {
  preview: QuoteTemplatePreview
  presets: Array<{ id: string; label: string; description: string }>
  onSelectPreset: (presetId: string) => void
  onCompose: () => void
}) {
  return (
    <section aria-label="템플릿 미리보기" className="flex min-w-0 flex-col gap-6 px-7 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-[#78736D]">템플릿</span>
            <span
              className={`rounded border px-1.5 text-[11px] font-semibold tracking-wide ${
                preview.productLine === "software" ? "border-[#084734]/35 text-[#084734]" : "border-[#e8e8e4] text-[#615D59]"
              }`}
            >
              {preview.productLineLabel} · {preview.supplierBusinessName}
            </span>
          </div>
          <h2 className="mt-1.5 truncate text-lg font-bold tracking-[-0.02em] text-[#111110]">{preview.label} 견적서</h2>
          <p className="mt-0.5 text-xs text-[#615D59]">{preview.description}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-[-0.02em] tabular-nums text-[#111110]">{formatMoney(preview.totalAmount)}</p>
          <p className="text-[11.5px] text-[#78736D]">{preview.vatIncluded ? "VAT 포함" : "VAT 별도"} · 수량 1 기준</p>
          <button type="button" onClick={onCompose} className={`${SOLID_BUTTON} mt-2`}>
            <Plus className="h-3.5 w-3.5" />
            이 템플릿으로 작성
          </button>
        </div>
      </div>

      {presets.length > 0 && (
        <div className="rounded-lg border border-[#e8e8e4] px-4 py-3.5">
          <h3 className="text-[11.5px] font-semibold text-[#78736D]">구성</h3>
          <div role="group" aria-label="구성" className="mt-2 flex flex-wrap gap-2">
            {presets.map((preset) => {
              const active = preset.id === preview.presetId
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-preset-id={preset.id}
                  title={preset.description}
                  onClick={() => onSelectPreset(preset.id)}
                  aria-pressed={active}
                  className={`inline-flex h-8 items-center rounded-md border px-3 text-[12.5px] transition-colors ${
                    active
                      ? "border-[#31302E] bg-[#F6F5F2] font-semibold text-[#111110]"
                      : "border-[#e8e8e4] bg-white text-[#615D59] hover:border-[#c8c8c4] hover:text-[#111110]"
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          {!preview.matchesDefault && (
            <p className="mt-2.5 text-xs text-[#615D59]">
              작성 창은 기본 구성으로 열립니다. 이 구성의 옵션은 작성 창에서 고릅니다.
            </p>
          )}
        </div>
      )}

      <div className="max-w-[640px]">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_112px] gap-2 border-b border-[#e8e8e4] pb-1.5 text-[11.5px] font-semibold text-[#78736D]">
          <span>품목</span>
          <span className="text-right">수량</span>
          <span className="text-right">금액</span>
        </div>
        {preview.lines.map((line) => (
          <div
            key={line.key}
            className="grid grid-cols-[minmax(0,1fr)_56px_112px] gap-2 border-b border-[#f0f0ec] py-2 text-[12.5px]"
          >
            <span className="min-w-0">
              <span className="block truncate">{line.name}</span>
              {line.description && <span className="block text-[11px] text-[#78736D]">{line.description}</span>}
            </span>
            <span className="text-right tabular-nums text-[#78736D]">{quantityText(line)}</span>
            <span className={`text-right tabular-nums ${line.kind === "priced" ? "font-semibold" : "text-[#78736D]"}`}>
              {line.kind === "note" ? "—" : amountText(line)}
            </span>
          </div>
        ))}
        {!preview.vatIncluded && (
          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 py-2 text-[12.5px] text-[#615D59]">
            <span>부가세 (10%)</span>
            <span className="text-right tabular-nums">{formatMoney(preview.vatAmount)}</span>
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2 border-t border-[#31302E] pt-2.5 text-[12.5px] font-bold">
          <span>합계</span>
          <span className="text-right tabular-nums">{formatMoney(preview.totalAmount)}</span>
        </div>
        {preview.pendingAmountNote && <p className="mt-2 text-[11.5px] text-[#78736D]">{preview.pendingAmountNote}</p>}

        <dl className="mt-4 grid grid-cols-[72px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
          <dt className="text-[#78736D]">공급자</dt>
          <dd className="text-[#31302E]">{preview.supplierBusinessName}</dd>
          <dt className="text-[#78736D]">부가세</dt>
          <dd className="text-[#31302E]">{preview.vatIncluded ? "포함" : "별도"}</dd>
          {preview.deliveryLocationNote && (
            <>
              <dt className="text-[#78736D]">납품 장소</dt>
              <dd className="text-[#31302E]">{preview.deliveryLocationNote}</dd>
            </>
          )}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[#615D59]">
          고객·수량·금액·할인·유효기한은 작성 창에서 정합니다. 저장한 견적서는 히스토리 탭에 나타납니다.
        </p>
      </div>
    </section>
  )
}
