/**
 * ─────────────────────────────────────────────────────────────
 * EmailComposer  —  이메일 캠페인 작성 & 발송 컴포넌트
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-19] 이메일 작성 플로우
 *   1. 제목 + 본문 작성 (HTML 지원)
 *   2. 대상 태그 선택 (빈 = 전체 active 구독자)
 *   3. 미리보기에서 {name} 치환 확인
 *   4. 발송 버튼 클릭 → /api/admin/email/send 호출
 *
 * [NOTE-12] {name}, {org}, {role} 등 변수 클릭 삽입 & 하이라이트.
 */

"use client"

import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, Send, Eye, EyeOff, Loader2, MailCheck, Type } from "lucide-react"
import type { EmailDraft } from "@/lib/marketing-types"
import { PRESET_TAGS } from "@/lib/marketing-types"
import VariablePalette, { ALL_VARIABLES, applyPreview } from "./VariablePalette"

interface Props {
  value: EmailDraft
  onChange: (value: EmailDraft) => void
  onSend: (data: EmailDraft) => Promise<void>
  loading?: boolean
  subscriberCount: number
}

function getToken() {
  return sessionStorage.getItem("admin_password") ?? ""
}

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })
}

export default function EmailComposer({
  value,
  onChange,
  onSend,
  loading,
  subscriberCount,
}: Props) {
  const [showPreview, setShowPreview] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [testLoading, setTestLoading] = useState(false)
  const [testNotice, setTestNotice] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const updateDraft = (next: Partial<EmailDraft>) => {
    onChange({ ...value, ...next })
  }

  const toggleTag = (tag: string) => {
    const nextTags = value.targetTags.includes(tag)
      ? value.targetTags.filter((t) => t !== tag)
      : [...value.targetTags, tag]
    updateDraft({ targetTags: nextTags })
  }

  // 변수 팔레트 — 커서 위치에 {variable} 삽입
  const handleInsertVariable = (key: string) => {
    const ta = bodyRef.current
    const token = `{${key}}`
    if (!ta) {
      updateDraft({ body: value.body + token })
      return
    }
    const start = ta.selectionStart ?? value.body.length
    const end = ta.selectionEnd ?? value.body.length
    const next = value.body.slice(0, start) + token + value.body.slice(end)
    updateDraft({ body: next })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const usedVars = ALL_VARIABLES
    .filter((v) => value.body.includes(`{${v.key}}`))
    .map((v) => v.key)

  const handleSubmit = async () => {
    if (!value.subject.trim() || !value.body.trim()) return
    await onSend(value)
  }

  const handleTestSend = async () => {
    if (!value.subject.trim() || !value.body.trim() || !testEmail.trim()) return

    setTestLoading(true)
    setTestNotice(null)

    try {
      const res = await adminFetch("/api/admin/email/send", {
        method: "POST",
        body: JSON.stringify({
          subject: value.subject,
          body: value.body,
          targetTags: value.targetTags,
          mode: "test",
          testEmail: testEmail.trim(),
        }),
      })

      if (res.status === 401) {
        setTestNotice("인증이 만료되었습니다. 다시 로그인해 주세요.")
        return
      }

      const result = await res.json()
      if (!res.ok || !result.ok || result.status === "failed") {
        setTestNotice(result.error || "테스트 발송에 실패했습니다.")
        return
      }

      setTestNotice(`✓ ${testEmail.trim()} 주소로 테스트 발송했습니다.`)
    } catch {
      setTestNotice("테스트 발송에 실패했습니다.")
    } finally {
      setTestLoading(false)
    }
  }

  // 미리보기용 변수 치환
  const previewBody = applyPreview(value.body)
  const bodyLen = value.body.replace(/\s+/g, " ").trim().length

  return (
    <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
      <h3 className="text-[15px] font-semibold text-[#111110] mb-5 flex items-center gap-2">
        <Send className="w-4 h-4 text-[#084734]" />
        이메일 캠페인 작성
      </h3>

      <div className="grid gap-5">
        {/* 제목 */}
        <div className="grid gap-2">
          <Label htmlFor="email-subject">제목</Label>
          <Input
            id="email-subject"
            value={value.subject}
            onChange={(e) => updateDraft({ subject: e.target.value })}
            placeholder="예) {name}님, Classin 3월 교육 혁신 세미나에 초대합니다!"
          />
        </div>

        {/* 본문 */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="email-body">본문</Label>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] tabular-nums ${bodyLen === 0 ? "text-[#1a1a1a]/25" : bodyLen < 200 ? "text-amber-500" : "text-[#084734]"}`}>
                {bodyLen}자
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                {showPreview ? "편집" : "미리보기"}
              </Button>
            </div>
          </div>

          {showPreview ? (
            <div
              className="p-4 border rounded-lg bg-[#FAFAF8] min-h-[200px] text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: previewBody.replace(/\n/g, "<br>") || "<span style='color:#1a1a1a40'>(본문을 작성해주세요)</span>" }}
            />
          ) : (
            <textarea
              ref={bodyRef}
              id="email-body"
              value={value.body}
              onChange={(e) => updateDraft({ body: e.target.value })}
              rows={9}
              placeholder={`안녕하세요 {name}님,\n\nClassin에서 준비한 특별한 소식을 전해드립니다.\n\n{org} 관계자 여러분을 위한...\n\n감사합니다.\nClassin 팀`}
              className="w-full p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#084734]/20 min-h-[200px]"
            />
          )}

          {/* 변수 팔레트 */}
          {!showPreview && (
            <div className="rounded-lg border border-[#e8e8e4] bg-[#FAFAF8] px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2">
                <Type className="w-3.5 h-3.5 text-[#1a1a1a]/30" />
                <span className="text-[11px] font-medium text-[#1a1a1a]/40">변수 팔레트</span>
                <span className="text-[10px] text-[#1a1a1a]/25">— 클릭하면 커서 위치에 삽입</span>
              </div>
              <VariablePalette onInsert={handleInsertVariable} usedVars={usedVars} />
            </div>
          )}
        </div>

        {/* 대상 태그 */}
        <div className="grid gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label>발송 대상 (태그 선택, 미선택 시 전체 발송)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 justify-start px-0 text-[11px] text-[#1a1a1a]/45 hover:bg-transparent hover:text-[#111110] sm:h-7 sm:px-2"
              onClick={() => updateDraft({ targetTags: [] })}
              disabled={value.targetTags.length === 0}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              대상 초기화
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 p-3 border rounded-lg bg-[#FAFAF8]">
            {PRESET_TAGS.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={`cursor-pointer text-[11px] px-2 py-0.5 transition-colors ${
                  value.targetTags.includes(tag)
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
            {value.targetTags.length > 0
              ? `선택된 태그: ${value.targetTags.join(", ")}`
              : `전체 active 구독자 ${subscriberCount}명에게 발송됩니다.`}
          </p>
        </div>

        {/* 테스트 발송 */}
        <div className="grid gap-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="test-email">테스트 발송</Label>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/40">
                실제 구독자에게는 보내지 않고 이 주소로만 확인합니다.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestSend}
              disabled={loading || testLoading || !value.subject.trim() || !value.body.trim() || !testEmail.trim()}
              className="w-full sm:w-auto"
            >
              {testLoading ? (
                <span className="flex items-center">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  전송 중...
                </span>
              ) : (
                <span className="flex items-center">
                  <MailCheck className="mr-1.5 h-3.5 w-3.5" />
                  테스트 발송
                </span>
              )}
            </Button>
          </div>
          <Input
            id="test-email"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="test@example.com"
          />
          {testNotice && (
            <p className={`rounded-lg border px-3 py-2 text-[12px] ${testNotice.startsWith("✓") ? "border-green-100 bg-green-50 text-green-700" : "border-[#e8e8e4] bg-white text-[#111110]"}`}>
              {testNotice}
            </p>
          )}
        </div>

        {/* 발송 버튼 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            onClick={handleSubmit}
            disabled={loading || !value.subject.trim() || !value.body.trim()}
            className="w-full bg-[#084734] text-white hover:bg-[#084734]/90 sm:w-auto"
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
