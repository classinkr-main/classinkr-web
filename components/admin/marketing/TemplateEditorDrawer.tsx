"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { X, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EmailTemplate } from "@/lib/automation-types"

interface Props {
  open: boolean
  initial?: Partial<EmailTemplate>
  onSave: (data: { name: string; subject: string; body: string; variables: string[] }) => Promise<void>
  onClose: () => void
  loading?: boolean
}

const VARIABLES = [
  { key: "name",  label: "이름",   example: "홍길동" },
  { key: "org",   label: "학원명", example: "ABC학원" },
  { key: "role",  label: "직책",   example: "원장" },
  { key: "email", label: "이메일", example: "sample@abc.kr" },
]

const SAMPLE: Record<string, string> = { name: "홍길동", org: "ABC학원", role: "원장", email: "sample@abc.kr" }

function applyPreview(text: string): string {
  return text
    .replace(/\{name\}/g, SAMPLE.name)
    .replace(/\{org\}/g, SAMPLE.org)
    .replace(/\{role\}/g, SAMPLE.role)
    .replace(/\{email\}/g, SAMPLE.email)
}

/** textarea의 현재 커서 위치에 텍스트를 삽입하고 커서를 삽입 후 위치로 이동 */
function insertAtCursor(
  el: HTMLTextAreaElement,
  currentValue: string,
  insert: string,
  onChange: (v: string) => void
) {
  const start = el.selectionStart ?? currentValue.length
  const end   = el.selectionEnd   ?? currentValue.length
  const newValue = currentValue.slice(0, start) + insert + currentValue.slice(end)
  onChange(newValue)
  requestAnimationFrame(() => {
    el.focus()
    el.selectionStart = start + insert.length
    el.selectionEnd   = start + insert.length
  })
}

export default function TemplateEditorDrawer({ open, initial, onSave, onClose, loading }: Props) {
  const [name,    setName]    = useState(initial?.name    ?? "")
  const [subject, setSubject] = useState(initial?.subject ?? "")
  const [body,    setBody]    = useState(initial?.body    ?? "")

  const bodyRef    = useRef<HTMLTextAreaElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  // 마지막 포커스된 입력 필드 추적 ("subject" | "body")
  const lastFocusedRef = useRef<"subject" | "body">("body")

  // initial 변경 시 초기화 (편집 모드 전환)
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "")
      setSubject(initial?.subject ?? "")
      setBody(initial?.body ?? "")
    }
  }, [open, initial])

  // ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (open) { document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden" }
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = "" }
  }, [open, onClose])

  const handleInsertVariable = useCallback((varKey: string) => {
    const insert = `{${varKey}}`
    if (lastFocusedRef.current === "subject" && subjectRef.current) {
      // Subject input에 삽입
      const el = subjectRef.current
      const start = el.selectionStart ?? subject.length
      const end   = el.selectionEnd   ?? subject.length
      const newSubject = subject.slice(0, start) + insert + subject.slice(end)
      setSubject(newSubject)
      requestAnimationFrame(() => {
        el.focus()
        el.selectionStart = start + insert.length
        el.selectionEnd   = start + insert.length
      })
    } else if (bodyRef.current) {
      insertAtCursor(bodyRef.current, body, insert, setBody)
    }
  }, [subject, body])

  const handleSave = async () => {
    const usedVars = VARIABLES.filter((v) => body.includes(`{${v.key}}`) || subject.includes(`{${v.key}}`)).map((v) => v.key)
    await onSave({ name, subject, body, variables: usedVars })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* 슬라이드오버 (w-[640px] = 분할뷰를 위해 넓게) */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[640px] bg-white shadow-2xl border-l border-[#e8e8e4] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#e8e8e4] flex-shrink-0">
          <div>
            <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-0.5">
              {initial?.id ? "템플릿 편집" : "새 템플릿"}
            </p>
            <h2 className="text-[15px] font-bold text-[#111110]">{name || "이름 없음"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={loading || !name || !subject || !body}
              className="bg-[#084734] hover:bg-[#084734]/90 text-white">
              {loading ? "저장 중..." : "저장"}
            </Button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#f0f0ec] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 기본 필드 */}
        <div className="px-6 pt-4 pb-3 space-y-3 flex-shrink-0 border-b border-[#e8e8e4]">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-[#1a1a1a]/60">템플릿 이름 *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 데모 신청 웰컴 메일"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-[#1a1a1a]/60">이메일 제목 * <span className="text-[#1a1a1a]/30 font-normal">(변수 삽입 가능)</span></Label>
              <Input
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => { lastFocusedRef.current = "subject" }}
                placeholder="예: {name}님, 클래스인에 오신 것을 환영합니다"
                required
              />
            </div>
          </div>

          {/* 변수 팔레트 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[#1a1a1a]/30">
              <Type className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">변수 삽입:</span>
            </div>
            <div className="flex items-center gap-1.5">
              {VARIABLES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleInsertVariable(key)}
                  title={`예시: ${SAMPLE[key]}`}
                  className="group flex items-center gap-1 px-2 py-1 rounded-lg bg-[#084734]/8 hover:bg-[#084734]/15 border border-[#084734]/15 transition-colors"
                >
                  <span className="text-[10px] font-mono text-[#084734]">{"{" + key + "}"}</span>
                  <span className="text-[10px] text-[#084734]/60">{label}</span>
                </button>
              ))}
            </div>
            <span className="text-[10px] text-[#1a1a1a]/25 ml-1">
              ← 클릭하면 커서 위치에 삽입
            </span>
          </div>
        </div>

        {/* 분할 편집 뷰 (편집 | 미리보기) */}
        <div className="flex-1 flex overflow-hidden">

          {/* 좌: HTML 편집 */}
          <div className="flex-1 flex flex-col border-r border-[#e8e8e4]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#FAFAF8] border-b border-[#e8e8e4] flex-shrink-0">
              <span className="text-[11px] font-medium text-[#1a1a1a]/40">HTML 편집</span>
              <span className="text-[10px] text-[#1a1a1a]/25">{body.length}자</span>
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => { lastFocusedRef.current = "body" }}
              placeholder={"<p>안녕하세요, {name}님!</p>\n<p>클래스인 {org}에서 연락드립니다.</p>\n<br>\n<p>감사합니다.</p>"}
              className="flex-1 resize-none px-4 py-3 text-[12px] font-mono text-[#111110] bg-white focus:outline-none placeholder:text-[#1a1a1a]/20 leading-relaxed"
            />
          </div>

          {/* 우: 미리보기 */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-[#FAFAF8] border-b border-[#e8e8e4] flex-shrink-0">
              <span className="text-[11px] font-medium text-[#1a1a1a]/40">미리보기</span>
              <span className="text-[10px] text-[#1a1a1a]/25">샘플: 홍길동 / ABC학원</span>
            </div>

            {/* 제목 미리보기 */}
            {subject && (
              <div className="px-4 py-2.5 border-b border-[#e8e8e4]/60 bg-[#f9f9f7] flex-shrink-0">
                <p className="text-[10px] text-[#1a1a1a]/30 mb-0.5">제목</p>
                <p className="text-[12px] font-medium text-[#111110] leading-snug">
                  {applyPreview(subject)}
                </p>
              </div>
            )}

            {/* 본문 미리보기 */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4 text-[12px] prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: applyPreview(body) || '<p class="text-gray-300">본문을 입력하면 여기에 미리보기가 표시됩니다.</p>' }}
            />
          </div>
        </div>

        {/* 하단 힌트 */}
        <div className="px-6 py-2.5 border-t border-[#e8e8e4] bg-[#FAFAF8] flex-shrink-0">
          <p className="text-[10px] text-[#1a1a1a]/30">
            변수는 <span className="font-mono">{"{name}"}</span> 형태로 작성 · 발송 시 수신자 실제 값으로 치환 · HTML 태그 사용 가능
          </p>
        </div>
      </div>
    </>
  )
}
