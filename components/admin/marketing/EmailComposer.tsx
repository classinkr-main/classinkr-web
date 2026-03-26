/**
 * ─────────────────────────────────────────────────────────────
 * EmailComposer  —  이메일 캠페인 작성 & 발송 컴포넌트
 * ─────────────────────────────────────────────────────────────
 */

"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Send, Eye, EyeOff, Loader2, Type, Zap } from "lucide-react"
import { PRESET_TAGS } from "@/lib/marketing-types"
import VariablePalette, {
  ALL_VARIABLES,
  applyPreview,
  highlightVariables,
} from "./VariablePalette"

interface Props {
  onSend: (data: { subject: string; body: string; targetTags: string[] }) => Promise<void>
  loading?: boolean
  subscriberCount: number
  initialTags?: string[]
  onClearInitialTags?: () => void
}

interface SlashState {
  field: "subject" | "body"
  query: string
  activeIndex: number
}

export default function EmailComposer({ onSend, loading, subscriberCount, initialTags, onClearInitialTags }: Props) {
  const [subject,     setSubject]     = useState("")
  const [body,        setBody]        = useState("")
  const [targetTags,  setTargetTags]  = useState<string[]>(initialTags ?? [])
  const [showPreview, setShowPreview] = useState(false)

  // 리드 세그먼트에서 전달된 태그 동기화
  useEffect(() => {
    if (initialTags && initialTags.length > 0) {
      setTargetTags(initialTags)
      onClearInitialTags?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTags])
  const [slashState,  setSlashState]  = useState<SlashState | null>(null)

  const bodyRef        = useRef<HTMLTextAreaElement>(null)
  const subjectRef     = useRef<HTMLInputElement>(null)
  const overlayRef     = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<"subject" | "body">("body")

  // ── computed ─────────────────────────────────────────────────────────────
  const filteredVars = useMemo(() => {
    if (!slashState) return ALL_VARIABLES.slice()
    const q = slashState.query.toLowerCase()
    if (!q) return ALL_VARIABLES.slice()
    return ALL_VARIABLES.filter((v) => v.key.includes(q) || v.label.includes(q))
  }, [slashState])

  const usedVars = useMemo(
    () =>
      ALL_VARIABLES
        .filter((v) => body.includes(`{${v.key}}`) || subject.includes(`{${v.key}}`))
        .map((v) => v.key),
    [body, subject]
  )

  // ── slash detection ───────────────────────────────────────────────────────
  const detectSlash = useCallback(
    (value: string, cursorPos: number, field: "subject" | "body") => {
      const before = value.slice(0, cursorPos)
      const match  = before.match(/\/([a-zA-Z가-힣_]*)$/)
      if (match) {
        setSlashState((prev) => ({
          field,
          query: match[1],
          activeIndex: prev?.field === field ? prev.activeIndex : 0,
        }))
      } else {
        setSlashState(null)
      }
    },
    []
  )

  const selectSlashVar = useCallback(
    (key: string) => {
      if (!slashState) return
      const insert = `{${key}}`

      if (slashState.field === "subject" && subjectRef.current) {
        const el     = subjectRef.current
        const pos    = el.selectionStart ?? subject.length
        const before = subject.slice(0, pos)
        const idx    = before.search(/\/[a-zA-Z가-힣_]*$/)
        if (idx === -1) { setSlashState(null); return }
        const next   = subject.slice(0, idx) + insert + subject.slice(pos)
        setSubject(next)
        const newPos = idx + insert.length
        requestAnimationFrame(() => {
          el.focus(); el.selectionStart = newPos; el.selectionEnd = newPos
        })
      } else if (slashState.field === "body" && bodyRef.current) {
        const el     = bodyRef.current
        const pos    = el.selectionStart ?? body.length
        const before = body.slice(0, pos)
        const idx    = before.search(/\/[a-zA-Z가-힣_]*$/)
        if (idx === -1) { setSlashState(null); return }
        const next   = body.slice(0, idx) + insert + body.slice(pos)
        setBody(next)
        const newPos = idx + insert.length
        requestAnimationFrame(() => {
          el.focus(); el.selectionStart = newPos; el.selectionEnd = newPos
        })
      }
      setSlashState(null)
    },
    [slashState, subject, body]
  )

  // ── palette insert ────────────────────────────────────────────────────────
  const handleInsertVariable = useCallback(
    (key: string) => {
      const insert = `{${key}}`
      if (lastFocusedRef.current === "subject" && subjectRef.current) {
        const el    = subjectRef.current
        const start = el.selectionStart ?? subject.length
        const end   = el.selectionEnd   ?? subject.length
        const next  = subject.slice(0, start) + insert + subject.slice(end)
        setSubject(next)
        requestAnimationFrame(() => {
          el.focus(); el.selectionStart = start + insert.length; el.selectionEnd = start + insert.length
        })
      } else if (bodyRef.current) {
        const el    = bodyRef.current
        const start = el.selectionStart ?? body.length
        const end   = el.selectionEnd   ?? body.length
        const next  = body.slice(0, start) + insert + body.slice(end)
        setBody(next)
        requestAnimationFrame(() => {
          el.focus(); el.selectionStart = start + insert.length; el.selectionEnd = start + insert.length
        })
      }
    },
    [subject, body]
  )

  // ── keyboard nav ──────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, field: "subject" | "body") => {
      if (!slashState || slashState.field !== field || filteredVars.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSlashState((s) =>
          s ? { ...s, activeIndex: (s.activeIndex + 1) % filteredVars.length } : null
        )
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSlashState((s) =>
          s ? { ...s, activeIndex: (s.activeIndex - 1 + filteredVars.length) % filteredVars.length } : null
        )
      } else if (e.key === "Enter" || e.key === "Tab") {
        const target = filteredVars[slashState.activeIndex]
        if (target) { e.preventDefault(); selectSlashVar(target.key) }
      } else if (e.key === "Escape") {
        setSlashState(null)
      }
    },
    [slashState, filteredVars, selectSlashVar]
  )

  // ── scroll sync ───────────────────────────────────────────────────────────
  const handleBodyScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop
  }

  // ── send ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) return
    await onSend({ subject, body, targetTags })
    setSubject("")
    setBody("")
    setTargetTags([])
    setSlashState(null)
  }

  const toggleTag = (tag: string) =>
    setTargetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )

  const showSubjectSlash = !!(slashState?.field === "subject" && filteredVars.length > 0)
  const showBodySlash    = !!(slashState?.field === "body"    && filteredVars.length > 0)

  return (
    <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
      <h3 className="text-[15px] font-semibold text-[#111110] mb-4 flex items-center gap-2">
        <Send className="w-4 h-4 text-[#084734]" />
        이메일 캠페인 작성
      </h3>

      <div className="grid gap-4">

        {/* Subject */}
        <div className="grid gap-2 relative">
          <Label htmlFor="ec-subject">
            제목{" "}
            <span className="text-[#1a1a1a]/30 font-normal text-[11px]">
              — <kbd className="bg-[#f0f0ec] px-1 py-0.5 rounded font-mono text-[9px]">/</kbd> 로 변수 삽입
            </span>
          </Label>
          <Input
            id="ec-subject"
            ref={subjectRef}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              detectSlash(e.target.value, e.target.selectionStart ?? e.target.value.length, "subject")
            }}
            onKeyDown={(e) => handleKeyDown(e, "subject")}
            onFocus={() => { lastFocusedRef.current = "subject" }}
            placeholder="예) {name}님, Classin 3월 교육 혁신 세미나에 초대합니다!"
          />
          {showSubjectSlash && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-[#e8e8e4] rounded-xl shadow-xl overflow-hidden">
              <SlashPopupHeader />
              {filteredVars.map((v, i) => (
                <SlashPopupItem
                  key={v.key}
                  varKey={v.key}
                  label={v.label}
                  example={v.example}
                  active={i === slashState!.activeIndex}
                  onSelect={selectSlashVar}
                />
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ec-body">본문</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => { setShowPreview(!showPreview); setSlashState(null) }}
            >
              {showPreview ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
              {showPreview ? "편집" : "미리보기"}
            </Button>
          </div>

          {showPreview ? (
            <div className="p-4 border rounded-lg bg-[#FAFAF8] min-h-[200px] text-sm leading-relaxed">
              {body ? (
                <div dangerouslySetInnerHTML={{ __html: applyPreview(body) }} />
              ) : (
                <span className="text-[#1a1a1a]/30">(본문을 작성해주세요)</span>
              )}
            </div>
          ) : (
            /* Body with highlight overlay */
            <div className="relative border rounded-lg overflow-hidden" style={{ minHeight: 200 }}>
              {/* Overlay */}
              <div
                ref={overlayRef}
                aria-hidden="true"
                className="absolute inset-0 p-3 text-sm overflow-hidden pointer-events-none"
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  color: "transparent",
                  lineHeight: "1.5",
                }}
                dangerouslySetInnerHTML={{ __html: highlightVariables(body) }}
              />
              {/* Textarea */}
              <textarea
                id="ec-body"
                ref={bodyRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  detectSlash(e.target.value, e.target.selectionStart ?? e.target.value.length, "body")
                }}
                onKeyDown={(e) => handleKeyDown(e, "body")}
                onFocus={() => { lastFocusedRef.current = "body" }}
                onScroll={handleBodyScroll}
                rows={8}
                placeholder={`안녕하세요 {name}님,\n\nClassin에서 준비한 특별한 소식을 전해드립니다.\n\n{org} 관계자 여러분을 위한...\n\n감사합니다.\nClassin 팀`}
                className="relative w-full p-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#084734]/20"
                style={{
                  background: "transparent",
                  color: "transparent",
                  caretColor: "#111110",
                  WebkitTextFillColor: "transparent",
                  minHeight: 200,
                  lineHeight: "1.5",
                }}
              />
              {/* Body slash popup */}
              {showBodySlash && (
                <div className="absolute right-2 top-2 z-10 bg-white border border-[#e8e8e4] rounded-xl shadow-xl overflow-hidden w-[256px]">
                  <SlashPopupHeader />
                  {filteredVars.map((v, i) => (
                    <SlashPopupItem
                      key={v.key}
                      varKey={v.key}
                      label={v.label}
                      example={v.example}
                      active={i === slashState!.activeIndex}
                      onSelect={selectSlashVar}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Variable palette */}
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Type className="w-3 h-3 text-[#1a1a1a]/30" />
              <span className="text-[10px] font-medium text-[#1a1a1a]/30">변수 팔레트</span>
              {usedVars.length > 0 && (
                <span className="text-[10px] text-[#084734]/60">
                  · 사용 중: {usedVars.map((k) => `{${k}}`).join(", ")}
                </span>
              )}
            </div>
            <VariablePalette onInsert={handleInsertVariable} usedVars={usedVars} compact />
          </div>
        </div>

        {/* Target tags */}
        <div className="grid gap-2">
          {initialTags && initialTags.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#084734]/8 rounded-lg text-[11px] text-[#084734]">
              <Send className="w-3 h-3 shrink-0" />
              리드 세그먼트에서 전달된 대상: <strong>{initialTags.join(", ")}</strong>
            </div>
          )}
          <Label>발송 대상 (태그 선택, 미선택 시 전체 발송)</Label>
          <div className="flex flex-wrap gap-1.5 p-3 border rounded-lg bg-[#FAFAF8]">
            {PRESET_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={`cursor-pointer text-[11px] px-2 py-0.5 transition-colors ${
                  targetTags.includes(tag)
                    ? "bg-[#084734] text-white hover:bg-[#084734]/90"
                    : "bg-white text-[#1a1a1a]/60 hover:bg-[#084734]/10 border border-[#e8e8e4]"
                }`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
          <p className="text-[11px] text-[#1a1a1a]/40">
            {targetTags.length > 0
              ? `선택된 태그: ${targetTags.join(", ")}`
              : `전체 active 구독자 ${subscriberCount}명에게 발송됩니다.`}
          </p>
        </div>

        {/* Send button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={loading || !subject.trim() || !body.trim()}
            className="bg-[#084734] hover:bg-[#084734]/90 text-white"
          >
            {loading ? (
              <span className="flex items-center">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                발송 중...
              </span>
            ) : (
              <span className="flex items-center">
                <Send className="mr-1.5 h-3.5 w-3.5" />
                이메일 발송
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Slash popup subcomponents ────────────────────────────────────────────────

function SlashPopupHeader() {
  return (
    <div className="px-3 py-1.5 bg-[#f9f9f7] border-b border-[#e8e8e4] flex items-center gap-2">
      <Zap className="w-3 h-3 text-[#084734]" />
      <span className="text-[10px] text-[#1a1a1a]/40 font-medium">
        변수 선택{" "}
        <span className="text-[#1a1a1a]/25">↑↓ 이동 · Enter 삽입 · Esc 닫기</span>
      </span>
    </div>
  )
}

function SlashPopupItem({
  varKey,
  label,
  example,
  active,
  onSelect,
}: {
  varKey: string
  label: string
  example: string
  active: boolean
  onSelect: (key: string) => void
}) {
  return (
    <button
      type="button"
      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-[12px] transition-colors ${
        active ? "bg-[#f0f0ec]" : "hover:bg-[#fafaf8]"
      }`}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect(varKey)
      }}
    >
      <span className="font-mono text-[#111110]">{"{" + varKey + "}"}</span>
      <span className="text-[#1a1a1a]/40 text-[11px] ml-3">
        {label}
        <span className="text-[#1a1a1a]/25 ml-1">→ {example}</span>
      </span>
    </button>
  )
}
