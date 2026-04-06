"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { X, Type, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EmailTemplate } from "@/lib/automation-types"
import VariablePalette, {
  ALL_VARIABLES,
  applyPreview,
  highlightVariables,
} from "./VariablePalette"

interface Props {
  open: boolean
  initial?: Partial<EmailTemplate>
  onSave: (data: { name: string; subject: string; body: string; variables: string[] }) => Promise<void>
  onClose: () => void
  loading?: boolean
}

interface SlashState {
  field: "subject" | "body"
  query: string
  activeIndex: number
}

export default function TemplateEditorDrawer({ open, initial, onSave, onClose, loading }: Props) {
  const [name,    setName]    = useState(initial?.name    ?? "")
  const [subject, setSubject] = useState(initial?.subject ?? "")
  const [body,    setBody]    = useState(initial?.body    ?? "")

  const bodyRef        = useRef<HTMLTextAreaElement>(null)
  const subjectRef     = useRef<HTMLInputElement>(null)
  const overlayRef     = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<"subject" | "body">("body")

  const [slashState, setSlashState] = useState<SlashState | null>(null)

  // ── computed ───────────────────────────────────────────────────────────────
  const filteredVars = useMemo(() => {
    if (!slashState) return ALL_VARIABLES.slice()
    const q = slashState.query.toLowerCase()
    if (!q) return ALL_VARIABLES.slice()
    return ALL_VARIABLES.filter(
      (v) => v.key.includes(q) || v.label.includes(q)
    )
  }, [slashState])

  const usedVars = useMemo(
    () =>
      ALL_VARIABLES
        .filter((v) => body.includes(`{${v.key}}`) || subject.includes(`{${v.key}}`))
        .map((v) => v.key),
    [body, subject]
  )

  // ── init on open ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setName(initial?.name    ?? "")
      setSubject(initial?.subject ?? "")
      setBody(initial?.body    ?? "")
      setSlashState(null)
    }
  }, [open, initial])

  // ── ESC + scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (slashState) { setSlashState(null); return }
        onClose()
      }
    }
    if (open) {
      document.addEventListener("keydown", onKey)
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, onClose, slashState])

  // ── slash detection ────────────────────────────────────────────────────────
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
        const el    = subjectRef.current
        const pos   = el.selectionStart ?? subject.length
        const before = subject.slice(0, pos)
        const idx   = before.search(/\/[a-zA-Z가-힣_]*$/)
        if (idx === -1) { setSlashState(null); return }
        const next  = subject.slice(0, idx) + insert + subject.slice(pos)
        setSubject(next)
        const newPos = idx + insert.length
        requestAnimationFrame(() => {
          el.focus()
          el.selectionStart = newPos
          el.selectionEnd   = newPos
        })
      } else if (slashState.field === "body" && bodyRef.current) {
        const el    = bodyRef.current
        const pos   = el.selectionStart ?? body.length
        const before = body.slice(0, pos)
        const idx   = before.search(/\/[a-zA-Z가-힣_]*$/)
        if (idx === -1) { setSlashState(null); return }
        const next  = body.slice(0, idx) + insert + body.slice(pos)
        setBody(next)
        const newPos = idx + insert.length
        requestAnimationFrame(() => {
          el.focus()
          el.selectionStart = newPos
          el.selectionEnd   = newPos
        })
      }
      setSlashState(null)
    },
    [slashState, subject, body]
  )

  // ── palette click insert ───────────────────────────────────────────────────
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
          el.focus()
          el.selectionStart = start + insert.length
          el.selectionEnd   = start + insert.length
        })
      } else if (bodyRef.current) {
        const el    = bodyRef.current
        const start = el.selectionStart ?? body.length
        const end   = el.selectionEnd   ?? body.length
        const next  = body.slice(0, start) + insert + body.slice(end)
        setBody(next)
        requestAnimationFrame(() => {
          el.focus()
          el.selectionStart = start + insert.length
          el.selectionEnd   = start + insert.length
        })
      }
    },
    [subject, body]
  )

  // ── keyboard nav for slash popup ───────────────────────────────────────────
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
        if (target) {
          e.preventDefault()
          selectSlashVar(target.key)
        }
      }
    },
    [slashState, filteredVars, selectSlashVar]
  )

  // ── overlay scroll sync ────────────────────────────────────────────────────
  const handleBodyScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const variables = ALL_VARIABLES
      .filter((v) => body.includes(`{${v.key}}`) || subject.includes(`{${v.key}}`))
      .map((v) => v.key)
    await onSave({ name, subject, body, variables })
  }

  if (!open) return null

  const showSubjectSlash = !!(slashState?.field === "subject" && filteredVars.length > 0)
  const showBodySlash    = !!(slashState?.field === "body"    && filteredVars.length > 0)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[680px] bg-white shadow-2xl border-l border-[#e8e8e4] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#e8e8e4] flex-shrink-0">
          <div>
            <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-0.5">
              {initial?.id ? "템플릿 편집" : "새 템플릿"}
            </p>
            <h2 className="text-[15px] font-bold text-[#111110]">{name || "이름 없음"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={loading || !name || !subject || !body}
              className="bg-[#084734] hover:bg-[#084734]/90 text-white"
            >
              {loading ? "저장 중..." : "저장"}
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#f0f0ec] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Field rows + variable palette */}
        <div className="px-6 pt-4 pb-0 space-y-3 flex-shrink-0">

          {/* Name + Subject */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-[#1a1a1a]/60">템플릿 이름 *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 데모 신청 웰컴 메일"
              />
            </div>

            {/* Subject with slash popup */}
            <div className="space-y-1.5 relative">
              <Label className="text-[12px] font-medium text-[#1a1a1a]/60">
                이메일 제목 *{" "}
                <span className="text-[#1a1a1a]/30 font-normal">
                  — <kbd className="text-[9px] bg-[#f0f0ec] px-1 py-0.5 rounded font-mono">/</kbd> 로 변수 삽입
                </span>
              </Label>
              <Input
                ref={subjectRef}
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value)
                  detectSlash(e.target.value, e.target.selectionStart ?? e.target.value.length, "subject")
                }}
                onKeyDown={(e) => handleKeyDown(e, "subject")}
                onFocus={() => { lastFocusedRef.current = "subject" }}
                placeholder="예: {name}님, 클래스인에 오신 것을 환영합니다"
              />
              {/* Subject slash popup */}
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
          </div>

          {/* Variable palette */}
          <div className="pb-3 border-b border-[#e8e8e4]">
            <div className="flex items-center gap-2 mb-2">
              <Type className="w-3.5 h-3.5 text-[#1a1a1a]/30" />
              <span className="text-[11px] font-medium text-[#1a1a1a]/30">변수 팔레트</span>
              <span className="text-[10px] text-[#1a1a1a]/20">
                — 클릭 삽입 또는 에디터에서{" "}
                <kbd className="bg-[#f0f0ec] px-1 rounded font-mono text-[9px]">/</kbd>{" "}
                입력
              </span>
            </div>
            <VariablePalette onInsert={handleInsertVariable} usedVars={usedVars} />
          </div>
        </div>

        {/* Split editor */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left: body editor with highlight overlay */}
          <div className="flex-1 flex flex-col border-r border-[#e8e8e4]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#FAFAF8] border-b border-[#e8e8e4] flex-shrink-0">
              <span className="text-[11px] font-medium text-[#1a1a1a]/40">HTML 편집</span>
              <div className="flex items-center gap-2">
                {showBodySlash && (
                  <span className="text-[10px] text-[#084734]/70 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    변수 선택 중
                  </span>
                )}
                <span className="text-[10px] text-[#1a1a1a]/25">{body.length}자</span>
              </div>
            </div>

            {/* Overlay + textarea container */}
            <div className="relative flex-1 overflow-hidden">
              {/* Highlight overlay (renders behind textarea) */}
              <div
                ref={overlayRef}
                aria-hidden="true"
                className="absolute inset-0 px-4 py-3 text-[12px] font-mono leading-relaxed overflow-hidden pointer-events-none"
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  color: "transparent",
                }}
                dangerouslySetInnerHTML={{ __html: highlightVariables(body) }}
              />

              {/* Actual textarea with transparent text */}
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  detectSlash(
                    e.target.value,
                    e.target.selectionStart ?? e.target.value.length,
                    "body"
                  )
                }}
                onKeyDown={(e) => handleKeyDown(e, "body")}
                onFocus={() => { lastFocusedRef.current = "body" }}
                onScroll={handleBodyScroll}
                placeholder={"<p>안녕하세요, {name}님!</p>\n<p>{org}에서 연락드립니다.</p>\n\n<p>감사합니다.</p>"}
                className="absolute inset-0 resize-none px-4 py-3 text-[12px] font-mono leading-relaxed focus:outline-none placeholder:text-[#1a1a1a]/20"
                style={{
                  background: "transparent",
                  color: "transparent",
                  caretColor: "#111110",
                  WebkitTextFillColor: "transparent",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                }}
                spellCheck={false}
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
          </div>

          {/* Right: preview */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-[#FAFAF8] border-b border-[#e8e8e4] flex-shrink-0">
              <span className="text-[11px] font-medium text-[#1a1a1a]/40">미리보기</span>
              <span className="text-[10px] text-[#1a1a1a]/25">샘플 값으로 치환</span>
            </div>

            {subject && (
              <div className="px-4 py-2.5 border-b border-[#e8e8e4]/60 bg-[#f9f9f7] flex-shrink-0">
                <p className="text-[10px] text-[#1a1a1a]/30 mb-0.5">제목</p>
                <p className="text-[12px] font-medium text-[#111110] leading-snug">
                  {applyPreview(subject)}
                </p>
              </div>
            )}

            <div
              className="flex-1 overflow-y-auto px-4 py-4 text-[12px] prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html:
                  applyPreview(body) ||
                  '<p style="color:#ccc">본문을 입력하면 미리보기가 표시됩니다.</p>',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 border-t border-[#e8e8e4] bg-[#FAFAF8] flex-shrink-0 flex items-center justify-between gap-4">
          <p className="text-[10px] text-[#1a1a1a]/30">
            <span className="font-mono">{"{변수}"}</span> 형태로 작성 · 발송 시 수신자 값으로 치환 · HTML 태그 사용 가능
          </p>
          {usedVars.length > 0 && (
            <p className="text-[10px] text-[#084734]/60 shrink-0">
              사용 중: {usedVars.map((k) => `{${k}}`).join(", ")}
            </p>
          )}
        </div>
      </div>
    </>
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
      className={`w-full flex items-center justify-between px-3 py-2 text-left text-[12px] transition-colors ${
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
