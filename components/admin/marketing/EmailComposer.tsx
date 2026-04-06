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
 * [NOTE-12] {name}, {org}, {role} 변수 사용법을 안내.
 */

"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Send, Eye, EyeOff, Loader2, MailCheck } from "lucide-react"
import { PRESET_TAGS } from "@/lib/marketing-types"

interface Props {
  onSend: (data: { subject: string; body: string; targetTags: string[] }) => Promise<void>
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

export default function EmailComposer({ onSend, loading, subscriberCount }: Props) {
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [targetTags, setTargetTags] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [testLoading, setTestLoading] = useState(false)
  const [testNotice, setTestNotice] = useState<string | null>(null)

  const toggleTag = (tag: string) => {
    setTargetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) return
    await onSend({ subject, body, targetTags })
    setSubject("")
    setBody("")
    setTargetTags([])
  }

  const handleTestSend = async () => {
    if (!subject.trim() || !body.trim() || !testEmail.trim()) return

    setTestLoading(true)
    setTestNotice(null)

    try {
      const res = await adminFetch("/api/admin/email/send", {
        method: "POST",
        body: JSON.stringify({
          subject,
          body,
          targetTags,
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

      setTestNotice(`${testEmail.trim()} 주소로 테스트 발송했습니다.`)
    } catch {
      setTestNotice("테스트 발송에 실패했습니다.")
    } finally {
      setTestLoading(false)
    }
  }

  // [NOTE-12] 미리보기용 {name} 치환 예시
  const previewBody = body
    .replace(/\{name\}/g, "김원장")
    .replace(/\{org\}/g, "클래스인 아카데미")
    .replace(/\{role\}/g, "원장")

  return (
    <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
      <h3 className="text-[15px] font-semibold text-[#111110] mb-4 flex items-center gap-2">
        <Send className="w-4 h-4 text-[#084734]" />
        이메일 캠페인 작성
      </h3>

      <div className="grid gap-4">
        {/* 제목 */}
        <div className="grid gap-2">
          <Label htmlFor="email-subject">제목</Label>
          <Input
            id="email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="예) {name}님, Classin 3월 교육 혁신 세미나에 초대합니다!"
          />
        </div>

        {/* 본문 */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="email-body">본문</Label>
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

          {showPreview ? (
            /* [NOTE-19] 미리보기 모드: {name} 등 변수가 치환된 상태 표시 */
            <div className="p-4 border rounded-lg bg-[#FAFAF8] min-h-[200px] text-sm leading-relaxed whitespace-pre-wrap">
              {previewBody || "(본문을 작성해주세요)"}
            </div>
          ) : (
            <textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={`안녕하세요 {name}님,\n\nClassin에서 준비한 특별한 소식을 전해드립니다.\n\n{org} 관계자 여러분을 위한...\n\n감사합니다.\nClassin 팀`}
              className="w-full p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#084734]/20 min-h-[200px]"
            />
          )}

          {/* [NOTE-12] 변수 안내 */}
          <p className="text-[11px] text-[#1a1a1a]/40">
            사용 가능한 변수: <code className="bg-[#FAFAF8] px-1 rounded">{"{name}"}</code> 이름,{" "}
            <code className="bg-[#FAFAF8] px-1 rounded">{"{org}"}</code> 학원명,{" "}
            <code className="bg-[#FAFAF8] px-1 rounded">{"{role}"}</code> 직책
          </p>
        </div>

        {/* 대상 태그 필터 */}
        <div className="grid gap-2">
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
              disabled={loading || testLoading || !subject.trim() || !body.trim() || !testEmail.trim()}
              className="w-full sm:w-auto"
            >
              {testLoading ? (
                <span className="flex items-center">
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  테스트 전송 중...
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
          <p className="text-[11px] text-[#1a1a1a]/40">
            발송 전 제목, 본문, 변수 치환 결과를 빠르게 확인할 때 사용합니다.
          </p>
          {testNotice && (
            <p className="rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] text-[#111110]">
              {testNotice}
            </p>
          )}
        </div>

        {/* 발송 버튼 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            onClick={handleSubmit}
            disabled={loading || !subject.trim() || !body.trim()}
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
