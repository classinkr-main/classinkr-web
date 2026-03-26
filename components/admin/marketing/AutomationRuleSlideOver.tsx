"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { X, Check, Zap, Clock, Timer, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PRESET_TAGS } from "@/lib/marketing-types"
import {
  PRESET_CRON_OPTIONS, PRESET_DELAY_OPTIONS,
  type EmailTemplate, type AutomationRule,
  type SegmentConfig, type TriggerConfig, type TriggerType, type AutomationStatus,
  type SegmentPreviewResponse,
} from "@/lib/automation-types"

interface Props {
  open: boolean
  templates: EmailTemplate[]
  initial?: AutomationRule           // 편집 모드
  onSave: (data: {
    name: string; triggerType: TriggerType; triggerConfig: TriggerConfig
    segmentConfig: SegmentConfig; templateId: string; status: AutomationStatus
  }) => Promise<void>
  onClose: () => void
  adminToken: string
  loading?: boolean
}

const SOURCES = [
  { value: "demo_modal", label: "데모 신청" },
  { value: "contact_page", label: "문의 페이지" },
  { value: "newsletter", label: "뉴스레터" },
  { value: "manual", label: "수동 등록" },
]
const LEAD_STATUSES = [
  { value: "new", label: "신규" }, { value: "contacted", label: "연락됨" },
  { value: "converted", label: "전환" }, { value: "closed", label: "종료" },
]
const TARGET_TABLES = [
  { value: "both", label: "리드 + 구독자" },
  { value: "subscribers", label: "구독자만" },
  { value: "leads", label: "리드만" },
]
const TRIGGER_OPTIONS = [
  { value: "on_submit" as TriggerType, icon: Zap, label: "폼 제출 즉시", desc: "새 제출 발생 시 즉시 발송" },
  { value: "scheduled" as TriggerType, icon: Clock, label: "스케줄 발송", desc: "정해진 일정에 정기 발송" },
  { value: "delay" as TriggerType, icon: Timer, label: "지연 발송", desc: "제출 N시간 후 자동 발송" },
]

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]
}

export default function AutomationRuleSlideOver({ open, templates, initial, onSave, onClose, adminToken, loading }: Props) {
  const [step, setStep] = useState(1)

  // Step 1
  const [name, setName] = useState(initial?.name ?? "")
  const [triggerType, setTriggerType] = useState<TriggerType>(initial?.triggerType ?? "on_submit")
  const [cronValue, setCronValue] = useState((initial?.triggerConfig as { cron?: string })?.cron ?? PRESET_CRON_OPTIONS[0].cron)
  const [customCron, setCustomCron] = useState("")
  const [useCustomCron, setUseCustomCron] = useState(false)
  const [delayHours, setDelayHours] = useState((initial?.triggerConfig as { hours?: number })?.hours ?? 24)

  // Step 2
  const [targetTable, setTargetTable] = useState<"leads"|"subscribers"|"both">(initial?.segmentConfig?.targetTable ?? "both")
  const [selectedSources, setSelectedSources] = useState<string[]>(initial?.segmentConfig?.sources ?? [])
  const [selectedLeadStatuses, setSelectedLeadStatuses] = useState<string[]>(initial?.segmentConfig?.leadStatuses ?? [])
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.segmentConfig?.tags ?? [])
  const [daysSinceSubmit, setDaysSinceSubmit] = useState<string>(initial?.segmentConfig?.daysSinceSubmit?.toString() ?? "")
  const [preview, setPreview] = useState<SegmentPreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Step 3
  const [templateId, setTemplateId] = useState(initial?.templateId ?? "")
  const [saveAsActive, setSaveAsActive] = useState(false)

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (open) { document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden" }
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = "" }
  }, [open, onClose])

  // 세그먼트 변경 시 300ms debounce → preview API
  const fetchPreview = useCallback(async () => {
    if (step !== 2) return
    setPreviewLoading(true)
    try {
      const seg: SegmentConfig = {
        targetTable,
        sources: selectedSources.length > 0 ? (selectedSources as SegmentConfig["sources"]) : undefined,
        leadStatuses: selectedLeadStatuses.length > 0 ? (selectedLeadStatuses as SegmentConfig["leadStatuses"]) : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        daysSinceSubmit: daysSinceSubmit ? parseInt(daysSinceSubmit) : null,
      }
      const res = await fetch("/api/admin/automation/segment/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ segmentConfig: seg }),
      })
      if (res.ok) setPreview(await res.json())
    } catch { /* silent */ } finally {
      setPreviewLoading(false)
    }
  }, [step, targetTable, selectedSources, selectedLeadStatuses, selectedTags, daysSinceSubmit, adminToken])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchPreview, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [fetchPreview])

  if (!open) return null

  const buildTriggerConfig = (): TriggerConfig => {
    if (triggerType === "scheduled") return { type: "scheduled", cron: useCustomCron ? customCron : cronValue }
    if (triggerType === "delay") return { type: "delay", hours: delayHours }
    return { type: "on_submit" }
  }

  const buildSegmentConfig = (): SegmentConfig => ({
    targetTable,
    sources: selectedSources.length > 0 ? (selectedSources as SegmentConfig["sources"]) : undefined,
    leadStatuses: selectedLeadStatuses.length > 0 ? (selectedLeadStatuses as SegmentConfig["leadStatuses"]) : undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    daysSinceSubmit: daysSinceSubmit ? parseInt(daysSinceSubmit) : null,
  })

  const handleSave = () => {
    onSave({
      name, triggerType,
      triggerConfig: buildTriggerConfig(),
      segmentConfig: buildSegmentConfig(),
      templateId,
      status: saveAsActive ? "active" : "draft",
    })
  }

  const selectedTemplate = templates.find((t) => t.id === templateId)
  const previewBody = selectedTemplate?.body
    .replace(/\{name\}/g, "홍길동").replace(/\{org\}/g, "ABC학원").replace(/\{role\}/g, "원장").replace(/\{email\}/g, "sample@abc.kr")

  // ─── 공통 스타일 ───────────────────────────────────────────
  const chipBase = "px-2.5 py-1 rounded-full text-[11px] border transition-colors cursor-pointer select-none"
  const chipActive = "bg-[#084734] text-white border-[#084734]"
  const chipInactive = "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#1a1a1a]/30 bg-white"

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* 슬라이드오버 패널 */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[520px] bg-white shadow-2xl border-l border-[#e8e8e4] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#e8e8e4] flex-shrink-0">
          <div>
            <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-0.5">
              {initial ? "규칙 편집" : "새 자동화 규칙"}
            </p>
            <h2 className="text-[15px] font-bold text-[#111110]">
              {name || "규칙 이름 없음"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f0f0ec] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-[#e8e8e4] flex-shrink-0 bg-[#FAFAF8]">
          {[{ n: 1, label: "트리거" }, { n: 2, label: "세그먼트" }, { n: 3, label: "템플릿" }].map(({ n, label }, i) => (
            <div key={n} className="flex items-center">
              <button
                onClick={() => n < step && setStep(n)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                  n === step ? "bg-white border border-[#e8e8e4] shadow-sm" : "hover:bg-white/60"
                } ${n > step ? "cursor-default" : "cursor-pointer"}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  n < step ? "bg-[#084734] text-white" : n === step ? "bg-[#111110] text-white" : "bg-[#e8e8e4] text-[#1a1a1a]/40"
                }`}>
                  {n < step ? <Check className="w-2.5 h-2.5" /> : n}
                </div>
                <span className={`text-[11px] font-medium ${n === step ? "text-[#111110]" : "text-[#1a1a1a]/40"}`}>{label}</span>
              </button>
              {i < 2 && <div className="w-6 h-px bg-[#e8e8e4] mx-1" />}
            </div>
          ))}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: 트리거 ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">규칙 이름 *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 데모 신청 즉시 웰컴 메일" />
              </div>

              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">트리거 타입</Label>
                <div className="space-y-2">
                  {TRIGGER_OPTIONS.map(({ value, icon: Icon, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTriggerType(value)}
                      className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                        triggerType === value
                          ? "border-[#084734] bg-[#084734]/4 shadow-sm"
                          : "border-[#e8e8e4] hover:border-[#c8c8c4] bg-white"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        triggerType === value ? "bg-[#084734]/10" : "bg-[#f0f0ec]"
                      }`}>
                        <Icon className={`w-4 h-4 ${triggerType === value ? "text-[#084734]" : "text-[#1a1a1a]/40"}`} />
                      </div>
                      <div>
                        <p className={`text-[13px] font-semibold ${triggerType === value ? "text-[#084734]" : "text-[#111110]"}`}>{label}</p>
                        <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">{desc}</p>
                      </div>
                      <div className={`ml-auto w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                        triggerType === value ? "border-[#084734] bg-[#084734]" : "border-[#e8e8e4]"
                      }`}>
                        {triggerType === value && <div className="w-full h-full rounded-full bg-white scale-[0.4]" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* scheduled 추가 옵션 */}
              {triggerType === "scheduled" && (
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-[#1a1a1a]/60">발송 주기</Label>
                  <div className="space-y-1.5">
                    {PRESET_CRON_OPTIONS.map((opt) => (
                      <label key={opt.cron} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        !useCustomCron && cronValue === opt.cron ? "border-[#084734] bg-[#084734]/4" : "border-[#e8e8e4] hover:border-[#c8c8c4]"
                      }`}>
                        <input type="radio" className="hidden" checked={!useCustomCron && cronValue === opt.cron}
                          onChange={() => { setCronValue(opt.cron); setUseCustomCron(false) }} />
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                          !useCustomCron && cronValue === opt.cron ? "border-[#084734] bg-[#084734]" : "border-[#e8e8e4]"
                        }`} />
                        <span className="text-[12px] text-[#111110]">{opt.label}</span>
                        <span className="ml-auto text-[10px] font-mono text-[#1a1a1a]/30">{opt.cron}</span>
                      </label>
                    ))}
                    <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      useCustomCron ? "border-[#084734] bg-[#084734]/4" : "border-[#e8e8e4] hover:border-[#c8c8c4]"
                    }`}>
                      <input type="radio" className="hidden" checked={useCustomCron} onChange={() => setUseCustomCron(true)} />
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${useCustomCron ? "border-[#084734] bg-[#084734]" : "border-[#e8e8e4]"}`} />
                      <span className="text-[12px] text-[#111110]">직접 입력</span>
                      {useCustomCron && (
                        <input
                          className="ml-2 flex-1 bg-transparent font-mono text-[11px] outline-none text-[#1a1a1a]/70 placeholder:text-[#1a1a1a]/30"
                          placeholder="0 9 * * 1"
                          value={customCron}
                          onChange={(e) => setCustomCron(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </label>
                  </div>
                </div>
              )}

              {/* delay 추가 옵션 */}
              {triggerType === "delay" && (
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-[#1a1a1a]/60">발송 시점</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_DELAY_OPTIONS.map((opt) => (
                      <button
                        key={opt.hours}
                        type="button"
                        onClick={() => setDelayHours(opt.hours)}
                        className={`px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
                          delayHours === opt.hours
                            ? "bg-[#084734] text-white border-[#084734]"
                            : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: 세그먼트 ── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* 대상 테이블 */}
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">대상 테이블</Label>
                <div className="flex gap-2">
                  {TARGET_TABLES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTargetTable(value as typeof targetTable)}
                      className={`flex-1 py-2 rounded-lg border text-[12px] font-medium transition-colors ${
                        targetTable === value
                          ? "bg-[#084734] text-white border-[#084734]"
                          : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 유입 경로 */}
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">
                  유입 경로 <span className="text-[#1a1a1a]/30 font-normal">(OR 조건 · 비워두면 전체)</span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCES.map(({ value, label }) => (
                    <button key={value} type="button"
                      onClick={() => setSelectedSources(toggle(selectedSources, value))}
                      className={`${chipBase} ${selectedSources.includes(value) ? chipActive : chipInactive}`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* 리드 상태 (리드 포함 시) */}
              {(targetTable === "leads" || targetTable === "both") && (
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-[#1a1a1a]/60">
                    리드 상태 <span className="text-[#1a1a1a]/30 font-normal">(비워두면 전체)</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_STATUSES.map(({ value, label }) => (
                      <button key={value} type="button"
                        onClick={() => setSelectedLeadStatuses(toggle(selectedLeadStatuses, value))}
                        className={`${chipBase} ${selectedLeadStatuses.includes(value) ? chipActive : chipInactive}`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* 태그 (구독자 포함 시) */}
              {(targetTable === "subscribers" || targetTable === "both") && (
                <div className="space-y-2">
                  <Label className="text-[12px] font-medium text-[#1a1a1a]/60">
                    태그 <span className="text-[#1a1a1a]/30 font-normal">(OR 조건 · 비워두면 전체)</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TAGS.map((tag) => (
                      <button key={tag} type="button"
                        onClick={() => setSelectedTags(toggle(selectedTags, tag))}
                        className={`${chipBase} ${selectedTags.includes(tag) ? chipActive : chipInactive}`}
                      >{tag}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* 기간 */}
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">기간 조건</Label>
                <div className="flex items-center gap-3">
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
                    !daysSinceSubmit ? "border-[#084734] bg-[#084734]/4" : "border-[#e8e8e4]"
                  }`}>
                    <div className={`w-3 h-3 rounded-full border-2 ${!daysSinceSubmit ? "border-[#084734] bg-[#084734]" : "border-[#e8e8e4]"}`} />
                    <span className="text-[12px]" onClick={() => setDaysSinceSubmit("")}>전체 기간</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#1a1a1a]/50">최근</span>
                    <input
                      type="number"
                      value={daysSinceSubmit}
                      onChange={(e) => setDaysSinceSubmit(e.target.value)}
                      placeholder="7"
                      min={1}
                      className="w-16 h-8 px-2 rounded-lg border border-[#e8e8e4] text-[12px] text-center focus:outline-none focus:border-[#c8c8c4]"
                    />
                    <span className="text-[12px] text-[#1a1a1a]/50">일 이내</span>
                  </div>
                </div>
              </div>

              {/* 세그먼트 미리보기 카운트 */}
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                previewLoading ? "bg-[#FAFAF8] border-[#e8e8e4]" : "bg-blue-50 border-blue-100"
              }`}>
                <Target className={`w-4 h-4 flex-shrink-0 ${previewLoading ? "text-[#1a1a1a]/30 animate-pulse" : "text-blue-500"}`} />
                {previewLoading ? (
                  <p className="text-[12px] text-[#1a1a1a]/40">수신자 수 계산 중...</p>
                ) : preview ? (
                  <div>
                    <p className="text-[13px] font-semibold text-blue-700">
                      예상 수신자: {preview.estimatedCount.toLocaleString()}명
                    </p>
                    <p className="text-[11px] text-blue-500 mt-0.5">
                      리드 {preview.breakdown.leads}명 + 구독자 {preview.breakdown.subscribers}명 (이메일 보유 기준)
                    </p>
                  </div>
                ) : (
                  <p className="text-[12px] text-[#1a1a1a]/40">조건을 설정하면 예상 수신자 수가 표시됩니다.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: 템플릿 + 저장 ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">이메일 템플릿 선택 *</Label>
                {templates.length === 0 ? (
                  <div className="text-center py-8 text-[#1a1a1a]/30 border border-dashed border-[#e8e8e4] rounded-xl">
                    <p className="text-[12px]">등록된 템플릿이 없습니다.</p>
                    <p className="text-[11px] mt-1">먼저 템플릿 탭에서 템플릿을 만들어주세요.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplateId(t.id)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                          templateId === t.id
                            ? "border-[#084734] bg-[#084734]/4 shadow-sm"
                            : "border-[#e8e8e4] hover:border-[#c8c8c4] bg-white"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                          templateId === t.id ? "border-[#084734] bg-[#084734]" : "border-[#e8e8e4]"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#111110] truncate">{t.name}</p>
                          <p className="text-[11px] text-[#1a1a1a]/40 truncate">{t.subject}</p>
                        </div>
                        {t.variables.length > 0 && (
                          <div className="flex gap-1 flex-shrink-0">
                            {t.variables.slice(0, 2).map((v) => (
                              <span key={v} className="text-[9px] font-mono px-1 bg-[#084734]/10 text-[#084734] rounded">{"{" + v + "}"}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 선택 템플릿 미리보기 */}
              {selectedTemplate && previewBody && (
                <div>
                  <Label className="text-[12px] font-medium text-[#1a1a1a]/60 mb-2 block">미리보기</Label>
                  <div className="rounded-xl border border-[#e8e8e4] overflow-hidden">
                    <div className="bg-[#f0f0ec] px-4 py-2.5 border-b border-[#e8e8e4]">
                      <p className="text-[11px] font-medium text-[#1a1a1a]/50">제목:</p>
                      <p className="text-[12px] text-[#111110]">
                        {selectedTemplate.subject
                          .replace(/\{name\}/g, "홍길동").replace(/\{org\}/g, "ABC학원").replace(/\{role\}/g, "원장")}
                      </p>
                    </div>
                    <div
                      className="px-4 py-4 text-[12px] prose prose-sm max-w-none max-h-[200px] overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: previewBody }}
                    />
                  </div>
                </div>
              )}

              {/* 저장 상태 선택 */}
              <div className="space-y-2">
                <Label className="text-[12px] font-medium text-[#1a1a1a]/60">저장 후 상태</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveAsActive(false)}
                    className={`flex-1 py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${
                      !saveAsActive ? "border-[#111110] bg-[#111110] text-white" : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
                    }`}
                  >
                    초안으로 저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveAsActive(true)}
                    className={`flex-1 py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${
                      saveAsActive ? "border-[#084734] bg-[#084734] text-white" : "border-[#e8e8e4] text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
                    }`}
                  >
                    바로 활성화
                  </button>
                </div>
                <p className="text-[10px] text-[#1a1a1a]/30">
                  바로 활성화 선택 시 저장 즉시 자동 발송이 시작됩니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 네비게이션 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e8e8e4] flex-shrink-0 bg-[#FAFAF8]">
          <Button
            variant="outline" size="sm"
            onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
          >
            {step === 1 ? "취소" : "이전"}
          </Button>

          {step < 3 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !name.trim()}
            >
              다음 단계
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading || !templateId}
              className="bg-[#084734] hover:bg-[#084734]/90 text-white"
            >
              {loading ? "저장 중..." : "규칙 저장"}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
