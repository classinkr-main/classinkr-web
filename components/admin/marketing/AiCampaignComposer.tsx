"use client"

import { useState, useCallback, useMemo } from "react"
import { Sparkles, Send, RefreshCw, Loader2, User, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PRESET_TAGS } from "@/lib/marketing-types"
import type { Subscriber } from "@/lib/marketing-types"

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface AiPreviewResult {
  subject: string
  body: string
}

interface RecipientPreview {
  subscriber: Subscriber
  status: "idle" | "loading" | "done" | "error"
  result?: AiPreviewResult
  error?: string
  expanded: boolean
}

interface Props {
  subscribers: Subscriber[]
  onSend: (data: {
    brief: string
    targetTags: string[]
    recipientCount: number
  }) => Promise<void>
  loading?: boolean
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function getToken() {
  return typeof window !== "undefined"
    ? sessionStorage.getItem("admin_password") ?? ""
    : ""
}

function filterSubscribers(subs: Subscriber[], tags: string[]): Subscriber[] {
  if (tags.length === 0) return subs.filter((s) => s.status === "active")
  return subs.filter(
    (s) => s.status === "active" && tags.some((t) => s.tags.includes(t))
  )
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function AiCampaignComposer({ subscribers, onSend, loading }: Props) {
  const [brief,      setBrief]      = useState("")
  const [targetTags, setTargetTags] = useState<string[]>([])
  const [previews,   setPreviews]   = useState<RecipientPreview[]>([])
  const [sending,    setSending]    = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)

  const matched = useMemo(
    () => filterSubscribers(subscribers, targetTags),
    [subscribers, targetTags]
  )

  const toggleTag = (tag: string) =>
    setTargetTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )

  // ── 미리보기 생성 ──────────────────────────────────────────────────────────
  const handlePreview = useCallback(async () => {
    if (!brief.trim()) return
    const samples = matched.slice(0, 3)
    if (samples.length === 0) return

    setPreviews(
      samples.map((s) => ({ subscriber: s, status: "loading", expanded: true }))
    )

    await Promise.allSettled(
      samples.map(async (s, idx) => {
        try {
          const res = await fetch("/api/admin/marketing/ai", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify({
              brief,
              recipient: {
                name:   s.name,
                org:    s.org,
                role:   s.role,
                phone:  s.phone,
                size:   s.size,
                source: s.source,
                tags:   s.tags,
              },
            }),
          })
          const data = await res.json()
          if (!res.ok || data.error) throw new Error(data.error || "AI 생성 실패")

          setPreviews((prev) =>
            prev.map((p, i) =>
              i === idx
                ? { ...p, status: "done", result: { subject: data.subject, body: data.body } }
                : p
            )
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : "오류"
          setPreviews((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, status: "error", error: msg } : p))
          )
        }
      })
    )
  }, [brief, matched])

  // ── 전체 발송 ──────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!brief.trim() || matched.length === 0) return
    setSending(true)
    setSendResult(null)
    try {
      await onSend({ brief, targetTags, recipientCount: matched.length })
      setSendResult(`${matched.length}명에게 AI 개인화 발송이 요청되었습니다.`)
    } catch {
      setSendResult("발송 중 오류가 발생했습니다.")
    } finally {
      setSending(false)
    }
  }

  const toggleExpanded = (idx: number) =>
    setPreviews((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, expanded: !p.expanded } : p))
    )

  const hasPreview = previews.length > 0
  const allDone    = previews.every((p) => p.status === "done" || p.status === "error")

  return (
    <div className="space-y-5">
      {/* ── 캠페인 브리프 ── */}
      <div className="bg-white rounded-xl border border-[#e8e8e4] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          </div>
          <h3 className="text-[15px] font-semibold text-[#111110]">AI 개인화 발송</h3>
          <span className="text-[11px] text-[#1a1a1a]/40 ml-1">
            — 수신자별 완전히 다른 내용 생성
          </span>
        </div>

        <div className="space-y-4">
          {/* 브리프 */}
          <div>
            <label className="text-[12px] font-medium text-[#1a1a1a]/60 block mb-1.5">
              캠페인 목표 *
              <span className="text-[#1a1a1a]/30 font-normal ml-1">
                — AI가 각 수신자에게 맞는 이메일을 작성합니다
              </span>
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="예: 데모 신청 팔로업. 학원 규모와 역할을 고려한 따뜻하고 개인적인 톤으로 클래스인의 가치를 전달하고 무료 상담을 유도."
              className="w-full px-3 py-2.5 border border-[#e8e8e4] rounded-lg text-[13px] text-[#111110] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-none placeholder:text-[#1a1a1a]/25 leading-relaxed"
            />
          </div>

          {/* 대상 태그 */}
          <div>
            <label className="text-[12px] font-medium text-[#1a1a1a]/60 block mb-1.5">
              발송 대상 태그
              <span className="text-[#1a1a1a]/30 font-normal ml-1">
                — 미선택 시 전체 active 구독자 ({subscribers.filter(s => s.status === "active").length}명)
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5 p-3 border border-[#e8e8e4] rounded-lg bg-[#FAFAF8]">
              {PRESET_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={`cursor-pointer text-[11px] px-2 py-0.5 transition-colors ${
                    targetTags.includes(tag)
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "bg-white text-[#1a1a1a]/60 hover:bg-violet-50 hover:text-violet-700 border border-[#e8e8e4]"
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-1.5">
              {targetTags.length > 0
                ? `선택된 태그: ${targetTags.join(", ")} — 매칭 구독자 ${matched.length}명`
                : `전체 active 구독자 ${matched.length}명`}
            </p>
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handlePreview}
              disabled={!brief.trim() || matched.length === 0 || previews.some((p) => p.status === "loading")}
              variant="outline"
              size="sm"
              className="border-violet-200 text-violet-700 hover:bg-violet-50"
            >
              {previews.some((p) => p.status === "loading") ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  AI 생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  샘플 3명 미리보기
                </>
              )}
            </Button>

            {hasPreview && allDone && (
              <Button
                onClick={handleSend}
                disabled={sending || loading || !brief.trim()}
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    발송 요청 중...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    전체 {matched.length}명에게 AI 발송
                  </>
                )}
              </Button>
            )}

            {hasPreview && (
              <button
                onClick={() => { setPreviews([]); setSendResult(null) }}
                className="text-[12px] text-[#1a1a1a]/40 hover:text-[#1a1a1a]/60 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                초기화
              </button>
            )}
          </div>

          {/* 발송 결과 */}
          {sendResult && (
            <div className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-100 text-[13px] text-violet-700">
              ✓ {sendResult}
            </div>
          )}
        </div>
      </div>

      {/* ── AI 미리보기 카드 ── */}
      {previews.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-[#1a1a1a]/40 mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            AI 생성 미리보기 (샘플 {previews.length}명)
            <span className="text-[11px] text-[#1a1a1a]/25">— 실제 발송 시 각 수신자마다 다른 내용이 생성됩니다</span>
          </p>
          <div className="grid grid-cols-3 gap-4">
            {previews.map((p, idx) => (
              <PreviewCard
                key={p.subscriber.email}
                preview={p}
                onToggle={() => toggleExpanded(idx)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function PreviewCard({
  preview,
  onToggle,
}: {
  preview: RecipientPreview
  onToggle: () => void
}) {
  const s = preview.subscriber

  return (
    <div className="bg-white rounded-xl border border-[#e8e8e4] overflow-hidden">
      {/* 수신자 헤더 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#e8e8e4] bg-[#fafaf8]">
        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-[12px] font-bold text-violet-600 flex-shrink-0">
          {s.name?.[0] || <User className="w-3.5 h-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[#111110] truncate">{s.name || "이름 없음"}</p>
          <p className="text-[10px] text-[#1a1a1a]/40 truncate">{s.org || "-"} · {s.role || "-"}</p>
        </div>
        {preview.status === "done" && (
          <button onClick={onToggle} className="shrink-0 text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60">
            {preview.expanded
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* 내용 */}
      <div className="p-4">
        {preview.status === "loading" && (
          <div className="space-y-2 animate-pulse">
            <div className="h-2.5 bg-[#f0f0ec] rounded w-3/4" />
            <div className="h-2.5 bg-[#f0f0ec] rounded w-full" />
            <div className="h-2.5 bg-[#f0f0ec] rounded w-5/6" />
            <div className="h-2.5 bg-[#f0f0ec] rounded w-2/3" />
            <p className="text-[10px] text-violet-400 flex items-center gap-1 pt-1">
              <Sparkles className="w-3 h-3" /> AI 생성 중...
            </p>
          </div>
        )}

        {preview.status === "error" && (
          <p className="text-[12px] text-red-500">{preview.error}</p>
        )}

        {preview.status === "done" && preview.result && (
          <>
            {/* 제목 */}
            <div className="mb-2">
              <p className="text-[9px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wider mb-0.5">제목</p>
              <p className="text-[12px] font-medium text-[#111110] leading-snug">{preview.result.subject}</p>
            </div>

            {/* 본문 (접기/펼치기) */}
            {preview.expanded && (
              <div>
                <p className="text-[9px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wider mb-1">본문</p>
                <div
                  className="text-[11px] text-[#1a1a1a]/60 leading-relaxed prose prose-xs max-w-none [&>p]:mb-1.5"
                  dangerouslySetInnerHTML={{ __html: preview.result.body }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
