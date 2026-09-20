"use client"

import { useEffect, useState } from "react"
import { Plus, X } from "lucide-react"

import SaveStateCaption, { type SaveState } from "@/components/admin/crm/SaveStateCaption"
import { adminFetchJson } from "@/lib/admin-client"
import { isDuplicateTag, normalizeTag, SUGGESTED_TAGS } from "@/lib/crm/tag-suggestions"
import { runOptimistic } from "@/lib/crm/optimistic-update"

// 고객 360 태그 칩 편집기(§13 Q3) — 태그 UI 최초 도입. 개요 탭이 기본 소비처지만 customerKey·
// initialTags를 props로만 받아 드로어 등 다른 화면에서도 재사용할 수 있게 만들었다.
//
// 낙관 갱신 규약(lib/crm/optimistic-update.ts): 추가/제거 모두 화면을 먼저 바꾸고 POST/DELETE
// /api/admin/crm/customers/{key}/tags를 호출한다. 성공하면 그 응답의 tags(서버 정규화·중복 제거
// 최종본)로 다시 맞추고, 실패하면 되돌린 뒤 SaveStateCaption에 실패 문구 + 재시도를 남긴다.

export interface CustomerTagChipsProps {
  /** 통합 고객 키(`lead:{id}` | `neo:{id}`) — 태그 API 경로 세그먼트이자 리셋 트리거. */
  customerKey: string
  initialTags: string[]
  onChange?: (tags: string[]) => void
}

const TAG_INPUT_MAX_LENGTH = 40

export default function CustomerTagChips({ customerKey, initialTags, onChange }: CustomerTagChipsProps) {
  const [tags, setTags] = useState<string[]>(initialTags)
  const [input, setInput] = useState("")
  const [pendingTag, setPendingTag] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [failedText, setFailedText] = useState<string | undefined>(undefined)
  const [retry, setRetry] = useState<(() => void) | undefined>(undefined)

  // 드로어 재사용(같은 인스턴스가 다른 고객으로 전환) 대비 — customerKey가 바뀌면 그 시점의
  // initialTags로 되돌린다. initialTags 자체는 의존성에 넣지 않는다: 같은 고객인데 부모가 매
  // 렌더 새 배열 참조를 넘기면 사용자가 방금 붙인 로컬 변경을 계속 되돌리게 된다.
  useEffect(() => {
    setTags(initialTags)
    setInput("")
    setPendingTag(null)
    setSaveState("idle")
    setFailedText(undefined)
    setRetry(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerKey])

  // 저장됨 캡션은 잠깐 보이고 자동으로 idle로 돌아간다(SaveStateCaption 계약 — 시간은 소비처 몫).
  useEffect(() => {
    if (saveState !== "saved") return
    const timer = setTimeout(() => setSaveState("idle"), 2200)
    return () => clearTimeout(timer)
  }, [saveState])

  const apiPath = `/api/admin/crm/customers/${encodeURIComponent(customerKey)}/tags`

  // 중복 경고(클라이언트 검증, 네트워크 없음)는 사용자가 다시 입력을 시작하면 걷는다. 진짜
  // 네트워크 실패(retry가 있는 경우)는 SaveStateCaption 규약대로 명시 재시도까지 남긴다.
  function clearDuplicateHint() {
    if (saveState === "failed" && !retry) {
      setSaveState("idle")
      setFailedText(undefined)
    }
  }

  async function addTag(raw: string) {
    if (pendingTag) return
    const clean = normalizeTag(raw)
    if (!clean) return
    if (isDuplicateTag(tags, clean)) {
      setSaveState("failed")
      setFailedText("이미 있는 태그입니다.")
      setRetry(undefined)
      return
    }

    setPendingTag(clean)
    setSaveState("saving")
    let serverTags: string[] | null = null
    const result = await runOptimistic<string[]>({
      snapshot: () => tags,
      apply: () => setTags((prev) => [...prev, clean]),
      commit: async () => {
        const res = await adminFetchJson<{ tags: string[] }>(apiPath, {
          method: "POST",
          body: JSON.stringify({ tag: clean }),
        })
        serverTags = res.tags
      },
      rollback: (saved) => setTags(saved),
      onError: () => {
        setSaveState("failed")
        setFailedText(`"${clean}" 추가에 실패했습니다.`)
        setRetry(() => () => void addTag(clean))
      },
    })
    setPendingTag(null)
    if (result.ok && serverTags) {
      setTags(serverTags)
      onChange?.(serverTags)
      setInput("")
      setSaveState("saved")
    }
  }

  async function removeTag(tag: string) {
    if (pendingTag) return
    setPendingTag(tag)
    setSaveState("saving")
    let serverTags: string[] | null = null
    const result = await runOptimistic<string[]>({
      snapshot: () => tags,
      apply: () => setTags((prev) => prev.filter((t) => t !== tag)),
      commit: async () => {
        const res = await adminFetchJson<{ tags: string[] }>(`${apiPath}?tag=${encodeURIComponent(tag)}`, {
          method: "DELETE",
        })
        serverTags = res.tags
      },
      rollback: (saved) => setTags(saved),
      onError: () => {
        setSaveState("failed")
        setFailedText(`"${tag}" 제거에 실패했습니다.`)
        setRetry(() => () => void removeTag(tag))
      },
    })
    setPendingTag(null)
    if (result.ok && serverTags) {
      setTags(serverTags)
      onChange?.(serverTags)
      setSaveState("saved")
    }
  }

  const suggestions = SUGGESTED_TAGS.filter((tag) => !isDuplicateTag(tags, tag))

  return (
    <div className="space-y-2">
      {/*
        MOBILE_TOUCH_TARGET_CLASS(44px 모바일 터치 타깃)를 여기 적용하지 않는다 — 그 유틸은
        [&_button]:min-h-11로 하위 button 전부를 키우는데, 붙은 태그의 × 제거 버튼은 얕은 pill
        span 안에 있어 button만 44px로 늘면 pill 밖으로 튀어나온다(부모 span은 안 늘어남).
        기획 §13 Q2의 44px 요구는 태스크 프리셋 칩(독립된 버튼) 전용이고 Q3 공통 규칙에는 없다 —
        Customer360Drawer.tsx의 기존 태그 × 버튼도 같은 이유로 이 클래스를 쓰지 않는다.
      */}
      <div role="group" aria-label="고객 태그" className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[#F6F5F4] px-2.5 py-1 text-[12px] font-medium text-[#31302E]"
          >
            {tag}
            {/* hover:text-[#B43E3E] === STATUS_TONE.danger.text(lib/crm/status-tone.ts) — Tailwind
                정적 스캔 때문에 hover: variant는 리터럴이어야 한다(Customer360Drawer.tsx와 같은 패턴). */}
            <button
              type="button"
              onClick={() => void removeTag(tag)}
              disabled={pendingTag != null}
              aria-label={`태그 ${tag} 제거`}
              className="text-[#31302E]/45 transition-colors hover:text-[#B43E3E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}

        {suggestions.map((tag) => {
          const isPending = pendingTag === tag
          return (
            <button
              key={tag}
              type="button"
              onClick={() => void addTag(tag)}
              disabled={pendingTag != null}
              aria-busy={isPending}
              aria-label={`제안 태그 ${tag} 추가`}
              className={`inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isPending
                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                  : "border-[#C9C6C0] bg-white text-[#31302E] hover:border-[#084734] hover:text-[#084734]"
              }`}
            >
              <Plus className="h-3 w-3" aria-hidden />
              {tag}
            </button>
          )
        })}

        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#615D59]">
          직접 입력
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              clearDuplicateHint()
            }}
            onKeyDown={(event) => {
              // isComposing 가드 — 한글 조합을 막 끝낸 Enter까지 제출로 잡지 않는다
              // (Customer360Drawer.tsx 태그 입력·AdminMoneyInput과 같은 패턴).
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void addTag(input)
              } else if (event.key === "Escape") {
                event.preventDefault()
                setInput("")
                clearDuplicateHint()
              }
            }}
            maxLength={TAG_INPUT_MAX_LENGTH}
            disabled={pendingTag != null}
            placeholder="태그 입력 후 Enter"
            className="h-7 min-w-[110px] flex-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-normal text-[#111110] outline-none focus:border-[#084734] disabled:opacity-60"
          />
        </label>
      </div>

      <SaveStateCaption state={saveState} failedText={failedText} onRetry={retry} />
    </div>
  )
}
