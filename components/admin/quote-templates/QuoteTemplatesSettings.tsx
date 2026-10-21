"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { adminFetchJson } from "@/lib/admin-client"
import {
  DEFAULT_QUOTE_TEMPLATE_DEFAULTS,
  QUOTE_TEMPLATE_CATALOG,
  QUOTE_TEMPLATE_INSTALLATION_OPTIONS,
  QUOTE_TEMPLATE_PAYMENT_OPTIONS,
  QUOTE_TEMPLATE_VALIDITY_DAYS,
  QUOTE_TEMPLATE_VAT_OPTIONS,
  getQuoteTemplateCatalogEntry,
  getQuoteTemplateProductLineLabel,
  getQuoteTemplateSupplierLabel,
  quoteTemplateDiscountPercent,
  type QuoteTemplateDefaults,
  type QuoteTemplateScope,
  type QuoteTemplateView,
} from "@/lib/quote-team-templates"
import type { QuoteTemplateCatalogResponse } from "@/lib/repositories/quote-team-templates"
import { QUOTE_NOTE_PRESETS, type QuoteProductLine, type StandardQuoteTemplateId } from "@/lib/standard-quote-template"

// 견적 템플릿 설정(/admin/quotes/templates) — 디자인 정본: 캔버스 Templates.dc.html.
// 왼쪽 = 기본(코드, 읽기 전용) / 팀(DB). 오른쪽 = 편집. 할인 단가는 표시만 한다(승인 없음).

const API = "/api/admin/quote-templates"

interface DraftItem {
  sku: string
  quantity: number
  unitPrice: number
}

interface Draft {
  /** 팀 템플릿 id. null = 아직 저장 안 된 새 템플릿·복제본 */
  id: string | null
  name: string
  productLine: QuoteProductLine
  sourceTemplateId: StandardQuoteTemplateId | null
  items: DraftItem[]
  defaults: QuoteTemplateDefaults
  scope: QuoteTemplateScope
  showInMenu: boolean
}

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`
const man = (value: number) => `${(value / 10_000).toLocaleString("ko-KR")}만`

function draftFrom(view: QuoteTemplateView): Draft {
  return {
    id: view.kind === "team" ? view.id : null,
    name: view.name,
    productLine: view.productLine,
    sourceTemplateId: view.baseTemplateId,
    items: view.items.map((item) => ({ sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice })),
    defaults: { ...view.defaults, notePresetIds: [...view.defaults.notePresetIds] },
    scope: view.scope,
    showInMenu: view.showInMenu,
  }
}

function blankDraft(): Draft {
  return {
    id: null,
    name: "새 템플릿",
    productLine: "hardware",
    sourceTemplateId: null,
    items: [],
    defaults: { ...DEFAULT_QUOTE_TEMPLATE_DEFAULTS, notePresetIds: [] },
    scope: "mine",
    showInMenu: false,
  }
}

function formatDate(iso: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}월 ${date.getDate()}일`
}

function summaryOf(view: QuoteTemplateView) {
  return view.items.map((item) => `${item.name.replace("전자칠판 ", "")} ×${item.quantity}`).join(", ")
}

const selectClass =
  "h-9 rounded-md border border-[#E8E8E4] bg-white px-2.5 text-[13px] text-[#111110] focus:border-[#084734] focus:outline-none disabled:bg-[#FAFAF8] disabled:text-[#78736D]"

export default function QuoteTemplatesSettings() {
  const [catalog, setCatalog] = useState<QuoteTemplateCatalogResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)

  const load = useCallback(async (selectAfter?: string | null) => {
    try {
      const data = await adminFetchJson<QuoteTemplateCatalogResponse>(API, { cache: "no-store" })
      setCatalog(data)
      setLoadError(null)
      const next = [...data.team, ...data.base].find((view) => view.id === selectAfter) ?? data.team[0] ?? data.base[0]
      if (next) {
        setSelectedId(next.id)
        setDraft(draftFrom(next))
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "견적 템플릿을 불러오지 못했습니다.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedView = useMemo(
    () => [...(catalog?.team ?? []), ...(catalog?.base ?? [])].find((view) => view.id === selectedId) ?? null,
    [catalog, selectedId]
  )
  // 저장 전 새 템플릿·복제본은 selectedView 가 없다 — 편집 가능.
  const isNew = draft !== null && draft.id === null && selectedId === null
  const locked = !isNew && (!selectedView || !selectedView.canEdit)
  const isBase = !isNew && selectedView?.kind === "base"
  const teamReady = catalog?.available === true

  const pick = (view: QuoteTemplateView) => {
    setSelectedId(view.id)
    setDraft(draftFrom(view))
    setMessage(null)
  }

  const startDraft = (next: Draft) => {
    setSelectedId(null)
    setDraft(next)
    setMessage(null)
  }

  const duplicate = () => {
    if (!draft) return
    startDraft({ ...draft, id: null, name: `${draft.name} (복제)`, scope: "mine", showInMenu: false })
  }

  const patch = (next: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...next } : current))
  const patchItem = (sku: string, next: Partial<DraftItem>) =>
    setDraft((current) =>
      current ? { ...current, items: current.items.map((item) => (item.sku === sku ? { ...item, ...next } : item)) } : current
    )
  const patchDefaults = (next: Partial<QuoteTemplateDefaults>) =>
    setDraft((current) => (current ? { ...current, defaults: { ...current.defaults, ...next } } : current))

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    try {
      const body = JSON.stringify({
        name: draft.name,
        productLine: draft.productLine,
        sourceTemplateId: draft.sourceTemplateId,
        items: draft.items,
        defaults: draft.defaults,
        scope: draft.scope,
        showInMenu: draft.showInMenu,
      })
      const result = await adminFetchJson<{ template: QuoteTemplateView }>(
        draft.id ? `${API}/${draft.id}` : API,
        { method: draft.id ? "PATCH" : "POST", body }
      )
      await load(result.template.id)
      setMessage({ tone: "ok", text: "템플릿을 저장했습니다." })
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "저장하지 못했습니다." })
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!draft?.id || !window.confirm(`'${draft.name}' 템플릿을 보관할까요? 작성 화면 목록에서 빠집니다.`)) return
    setSaving(true)
    try {
      await adminFetchJson(`${API}/${draft.id}`, { method: "DELETE" })
      await load(null)
      setMessage({ tone: "ok", text: "보관했습니다." })
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "보관하지 못했습니다." })
    } finally {
      setSaving(false)
    }
  }

  const total = draft?.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0
  const listTotal =
    draft?.items.reduce((sum, item) => sum + (getQuoteTemplateCatalogEntry(item.sku)?.listPrice ?? 0) * item.quantity, 0) ?? 0
  const addable = draft
    ? QUOTE_TEMPLATE_CATALOG.filter((entry) => entry.productLine === draft.productLine && !draft.items.some((item) => item.sku === entry.sku))
    : []

  const groups: Array<{ key: "base" | "team"; label: string; hint: string; items: QuoteTemplateView[] }> = [
    { key: "base", label: "기본 템플릿", hint: "코드에 정의된 표준 구성 · 정가 고정", items: catalog?.base ?? [] },
    { key: "team", label: "팀 템플릿", hint: "영업팀이 저장한 구성 · 단가 조정 가능", items: catalog?.team ?? [] },
  ]

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[13px] leading-[1.45] text-[#111110]">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[#E8E8E4] bg-white px-4 py-3.5 sm:px-6">
        <a href="/admin/quotes" className="text-[12.5px] text-[#615D59] hover:text-[#084734]">
          ← 견적·문서
        </a>
        <h1 className="text-lg font-bold tracking-[-0.02em]">견적 템플릿</h1>
        <span className="text-xs text-[#78736D]">작성 화면의 &lsquo;템플릿&rsquo;과 + 견적서 메뉴에 나오는 구성</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => startDraft(blankDraft())}
          disabled={!teamReady}
          title={teamReady ? undefined : "팀 템플릿 표 적용 후 사용할 수 있습니다."}
          className="h-9 rounded-md border border-[#084734] bg-white px-3 text-[12.5px] font-semibold text-[#084734] disabled:cursor-not-allowed disabled:border-[#E8E8E4] disabled:text-[#78736D]"
        >
          + 새 템플릿
        </button>
      </header>

      <main className="px-4 pb-12 pt-5 sm:px-6">
        {catalog?.warning && (
          <p role="status" className="mb-3 rounded-lg border border-[#ECD29C] bg-white px-4 py-2.5 text-[12.5px] text-[#7A520F]">
            {catalog.warning}
          </p>
        )}
        {loadError && (
          <p role="alert" className="mb-3 rounded-lg border border-[#E5B4B4] bg-white px-4 py-2.5 text-[12.5px] text-[#9B2C2C]">
            {loadError}
          </p>
        )}

        <div className="flex flex-wrap overflow-hidden rounded-[10px] border border-[#E8E8E4] bg-white">
          <aside aria-label="템플릿 목록" className="min-w-0 flex-[1_1_340px] border-r border-[#E8E8E4]">
            {groups.map((group) => (
              <section key={group.key} className="border-b border-[#F0F0EC] pb-1.5">
                <h2 className="px-4 pb-0.5 pt-3.5 text-[11.5px] font-semibold text-[#31302E]">
                  {group.label} <span className="font-normal text-[#78736D]">{group.items.length}</span>
                </h2>
                <p className="mx-4 mb-1.5 text-[11.5px] text-[#78736D]">{group.hint}</p>
                {group.key === "team" && group.items.length === 0 && (
                  <p className="mx-4 mb-2 text-[11.5px] text-[#78736D]">
                    {teamReady ? "아직 없습니다. 기본 템플릿을 복제하거나 + 새 템플릿으로 만드세요." : "표 적용 전이라 기본 템플릿만 보입니다."}
                  </p>
                )}
                {group.items.map((view) => {
                  const on = view.id === selectedId
                  const flag = view.hasDiscount ? "할인 단가" : view.showInMenu ? "메뉴 표시" : ""
                  return (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => pick(view)}
                      aria-pressed={on}
                      className={`block w-full py-2.5 pl-[18px] pr-4 text-left hover:bg-[#FCFCFA] ${on ? "bg-[#F6F5F2] shadow-[inset_2px_0_0_#084734]" : ""}`}
                    >
                      <span className="flex items-baseline justify-between gap-2.5">
                        <span className="truncate font-semibold">{view.name}</span>
                        <span className="whitespace-nowrap font-semibold tabular-nums">{man(view.total)}</span>
                      </span>
                      <span className="mt-0.5 flex justify-between gap-2 text-[11.5px] text-[#78736D]">
                        <span className="truncate">
                          {view.productLine === "software" ? "SW" : "HW"} · {summaryOf(view)}
                        </span>
                        <span className={`whitespace-nowrap ${view.hasDiscount ? "font-semibold text-[#7A520F]" : ""}`}>{flag}</span>
                      </span>
                    </button>
                  )
                })}
              </section>
            ))}
          </aside>

          {draft ? (
            <section aria-label="템플릿 편집" className="flex min-w-0 flex-[999_1_600px] flex-col gap-6 px-4 py-6 sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-[1_1_300px]">
                  <div className="text-xs text-[#615D59]">
                    {getQuoteTemplateProductLineLabel(draft.productLine)} · {getQuoteTemplateSupplierLabel(draft.productLine)} ·{" "}
                    {isNew ? "저장 전" : isBase ? "기본 제공" : [selectedView?.ownerName, formatDate(selectedView?.updatedAt ?? null)].filter(Boolean).join(" · ")}
                  </div>
                  <input
                    aria-label="템플릿 이름"
                    value={draft.name}
                    onChange={(event) => patch({ name: event.target.value })}
                    disabled={locked}
                    maxLength={60}
                    className="mt-1 h-10 w-full border-0 border-b border-[#E8E8E4] bg-transparent p-0 text-[19px] font-bold text-[#111110] focus:border-[#084734] focus:outline-none disabled:text-[#111110]"
                  />
                </div>
                <div className="text-right">
                  <strong className="block text-[22px] tracking-[-0.02em] tabular-nums">{won(total)}</strong>
                  <span className="text-[11.5px] text-[#78736D]">
                    {total >= listTotal ? "정가 기준 · VAT 별도" : `정가 대비 ${won(listTotal - total)} 할인 · VAT 별도`}
                  </span>
                </div>
              </div>

              {locked && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#E8E8E4] px-4 py-3">
                  <p className="min-w-0 flex-[1_1_260px] text-[12.5px] text-[#31302E]">
                    {isBase ? (
                      <>
                        <b>기본 템플릿</b> — 카탈로그 정가를 그대로 씁니다. 단가를 바꾸려면 복제해서 팀 템플릿으로 만드세요.
                      </>
                    ) : (
                      <>
                        <b>다른 사람의 템플릿</b> — 만든 사람이나 관리자만 고칠 수 있습니다. 복제해서 내 템플릿으로 만드세요.
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={duplicate}
                    disabled={!teamReady}
                    title={teamReady ? undefined : "팀 템플릿 표 적용 후 사용할 수 있습니다."}
                    className="h-[34px] rounded-md border border-[#31302E] bg-white px-3 text-[12.5px] font-semibold text-[#111110] disabled:cursor-not-allowed disabled:border-[#E8E8E4] disabled:text-[#78736D]"
                  >
                    복제해서 수정
                  </button>
                </div>
              )}

              {!locked && (
                <div role="group" aria-label="유형" className="flex flex-wrap items-center gap-3.5 text-[12.5px]">
                  <span className="text-xs text-[#78736D]">유형</span>
                  {(["hardware", "software"] as const).map((line) => {
                    const on = draft.productLine === line
                    return (
                      <button
                        key={line}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          // 견적 1장 = 공급자 1곳 — 유형을 바꾸면 다른 줄 품목은 뺀다.
                          patch({
                            productLine: line,
                            sourceTemplateId: line === draft.productLine ? draft.sourceTemplateId : null,
                            items: draft.items.filter((item) => getQuoteTemplateCatalogEntry(item.sku)?.productLine === line),
                          })
                        }
                        className={`py-1 ${on ? "font-semibold text-[#111110] shadow-[inset_0_-1.5px_0_#111110]" : "text-[#615D59]"}`}
                      >
                        {line === "hardware" ? "HW · 퀴드러닝" : "SW · 클래스인"}
                      </button>
                    )
                  })}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-xs font-semibold text-[#78736D]">품목 · 기본 수량 · 단가</h3>
                <div className="overflow-x-auto border-t border-[#E8E8E4]">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[minmax(0,1fr)_104px_150px_120px_24px] gap-3 border-b border-[#E8E8E4] py-2 text-[11.5px] text-[#78736D]">
                      <span>품목</span>
                      <span className="text-center">기본 수량</span>
                      <span className="text-right">템플릿 단가</span>
                      <span className="text-right">공급가</span>
                      <span />
                    </div>
                    {draft.items.length === 0 && <p className="py-3 text-[12px] text-[#78736D]">아래에서 품목을 추가하세요.</p>}
                    {draft.items.map((item) => {
                      const entry = getQuoteTemplateCatalogEntry(item.sku)
                      const listPrice = entry?.listPrice ?? 0
                      const pct = quoteTemplateDiscountPercent(listPrice, item.unitPrice)
                      const changed = item.unitPrice !== listPrice
                      return (
                        <div key={item.sku} className="grid grid-cols-[minmax(0,1fr)_104px_150px_120px_24px] items-center gap-3 border-b border-[#F0F0EC] py-2">
                          <span className="min-w-0">
                            <span className="block font-semibold">{entry?.name ?? item.sku}</span>
                            <span className={`block text-[11.5px] ${changed ? "font-semibold text-[#7A520F]" : "text-[#78736D]"}`}>
                              {!changed ? "정가" : pct !== null ? `정가 ${won(listPrice)} · ${pct}% 할인` : `정가 ${won(listPrice)} · 정가보다 높음`}
                            </span>
                          </span>
                          <span className="inline-flex items-center justify-self-center rounded-md border border-[#E8E8E4]">
                            <button
                              type="button"
                              aria-label="수량 줄이기"
                              disabled={locked || item.quantity <= 1}
                              onClick={() => patchItem(item.sku, { quantity: item.quantity - 1 })}
                              className="h-[30px] w-[30px] hover:bg-[#F0F0EC] disabled:text-[#CFCBC5] disabled:hover:bg-transparent"
                            >
                              −
                            </button>
                            <span className="min-w-6 text-center font-semibold tabular-nums">{item.quantity}</span>
                            <button
                              type="button"
                              aria-label="수량 늘리기"
                              disabled={locked}
                              onClick={() => patchItem(item.sku, { quantity: item.quantity + 1 })}
                              className="h-[30px] w-[30px] hover:bg-[#F0F0EC] disabled:text-[#CFCBC5] disabled:hover:bg-transparent"
                            >
                              +
                            </button>
                          </span>
                          <span
                            className={`flex h-[34px] items-center gap-1 rounded-md border px-2.5 ${
                              locked ? "border-[#F0F0EC] bg-[#FAFAF8]" : changed ? "border-[#ECD29C] bg-white" : "border-[#E8E8E4] bg-white"
                            }`}
                          >
                            <input
                              aria-label={`${entry?.name ?? item.sku} 템플릿 단가`}
                              inputMode="numeric"
                              value={item.unitPrice.toLocaleString("ko-KR")}
                              disabled={locked}
                              onChange={(event) =>
                                patchItem(item.sku, { unitPrice: Number.parseInt(event.target.value.replace(/[^0-9]/g, ""), 10) || 0 })
                              }
                              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-[13px] tabular-nums text-[#111110] focus:outline-none"
                            />
                            <span className="text-[11.5px] text-[#78736D]">원</span>
                          </span>
                          <span className="text-right font-semibold tabular-nums">{won(item.unitPrice * item.quantity)}</span>
                          {!locked ? (
                            <button
                              type="button"
                              aria-label={`${entry?.name ?? item.sku} 빼기`}
                              onClick={() => patch({ items: draft.items.filter((other) => other.sku !== item.sku) })}
                              className="text-[#78736D] hover:text-[#111110]"
                            >
                              ×
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                {!locked && addable.length > 0 && (
                  <label className="mt-2.5 inline-flex items-center gap-2 text-xs text-[#31302E]">
                    + 카탈로그에서 품목 추가
                    <select
                      value=""
                      onChange={(event) => {
                        const entry = getQuoteTemplateCatalogEntry(event.target.value)
                        if (entry) patch({ items: [...draft.items, { sku: entry.sku, quantity: 1, unitPrice: entry.listPrice }] })
                      }}
                      className={selectClass}
                    >
                      <option value="">품목 선택</option>
                      {addable.map((entry) => (
                        <option key={entry.sku} value={entry.sku}>
                          {entry.name} · {won(entry.listPrice)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-[#615D59]">
                  기본 유효기한
                  <select
                    value={draft.defaults.validityDays}
                    disabled={locked}
                    onChange={(event) => patchDefaults({ validityDays: Number(event.target.value) as QuoteTemplateDefaults["validityDays"] })}
                    className={selectClass}
                  >
                    {QUOTE_TEMPLATE_VALIDITY_DAYS.map((days) => (
                      <option key={days} value={days}>
                        {days}일
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-[#615D59]">
                  부가세
                  <select
                    value={draft.defaults.vat}
                    disabled={locked}
                    onChange={(event) => patchDefaults({ vat: event.target.value as QuoteTemplateDefaults["vat"] })}
                    className={selectClass}
                  >
                    {QUOTE_TEMPLATE_VAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-[#615D59]">
                  설치 방식
                  <select
                    value={draft.defaults.installation}
                    disabled={locked}
                    onChange={(event) => patchDefaults({ installation: event.target.value as QuoteTemplateDefaults["installation"] })}
                    className={selectClass}
                  >
                    {QUOTE_TEMPLATE_INSTALLATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-[#615D59]">
                  결제 방식
                  <select
                    value={draft.defaults.payment}
                    disabled={locked}
                    onChange={(event) => patchDefaults({ payment: event.target.value as QuoteTemplateDefaults["payment"] })}
                    className={selectClass}
                  >
                    {QUOTE_TEMPLATE_PAYMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold text-[#78736D]">기본으로 넣을 메모 문구</h3>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTE_NOTE_PRESETS.map((preset) => {
                    const on = draft.defaults.notePresetIds.includes(preset.id)
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={on}
                        disabled={locked}
                        title={preset.text}
                        onClick={() =>
                          patchDefaults({
                            notePresetIds: on
                              ? draft.defaults.notePresetIds.filter((id) => id !== preset.id)
                              : [...draft.defaults.notePresetIds, preset.id],
                          })
                        }
                        className={`h-[30px] rounded-full border bg-transparent px-3 text-xs ${
                          on ? "border-[#084734] font-semibold text-[#084734]" : "border-[#E8E8E4] text-[#615D59]"
                        } enabled:hover:border-[#084734] enabled:hover:text-[#084734]`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-[12.5px]">
                <div role="group" aria-label="공개 범위" className="flex items-center gap-3.5">
                  <span className="text-xs text-[#78736D]">공개 범위</span>
                  {(
                    [
                      ["mine", "나만"],
                      ["team", "팀 전체"],
                    ] as const
                  ).map(([scope, label]) => {
                    const on = draft.scope === scope
                    return (
                      <button
                        key={scope}
                        type="button"
                        aria-pressed={on}
                        disabled={locked}
                        onClick={() => patch({ scope })}
                        className={`py-1 ${on ? "font-semibold text-[#111110] shadow-[inset_0_-1.5px_0_#111110]" : "text-[#615D59]"}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <label className="flex items-center gap-2 text-[#31302E]">
                  <input
                    type="checkbox"
                    checked={draft.showInMenu}
                    disabled={locked}
                    onChange={(event) => patch({ showInMenu: event.target.checked })}
                    className="h-4 w-4 accent-[#084734]"
                  />
                  &lsquo;+ 견적서&rsquo; 메뉴에 바로 표시
                </label>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-[#F0F0EC] pt-4">
                {message && (
                  <span role="status" className={`mr-auto text-[12.5px] ${message.tone === "error" ? "text-[#9B2C2C]" : "text-[#084734]"}`}>
                    {message.text}
                  </span>
                )}
                {draft.id && !locked && (
                  <button
                    type="button"
                    onClick={archive}
                    disabled={saving}
                    className="h-9 rounded-md border border-[#E8E8E4] bg-white px-3 text-[12.5px] font-semibold text-[#615D59]"
                  >
                    보관
                  </button>
                )}
                {!locked && (
                  <>
                    <button
                      type="button"
                      onClick={duplicate}
                      disabled={saving || !teamReady || isNew}
                      className="h-9 rounded-md border border-[#E8E8E4] bg-white px-3 text-[12.5px] font-semibold text-[#31302E] disabled:text-[#CFCBC5]"
                    >
                      복제
                    </button>
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving || !teamReady || draft.items.length === 0}
                      className="h-9 rounded-md bg-[#084734] px-3.5 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#9DB8AE]"
                    >
                      {saving ? "저장 중…" : "템플릿 저장"}
                    </button>
                  </>
                )}
              </div>
            </section>
          ) : (
            <section className="flex min-w-0 flex-[999_1_600px] items-center justify-center p-10 text-[#78736D]">
              {loadError ? "목록을 불러오지 못했습니다." : "불러오는 중…"}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
