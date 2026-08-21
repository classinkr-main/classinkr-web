"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, Loader2 } from "lucide-react"

// 공용 금액 입력 — 어드민의 금액 칸이 파일마다 재구현되며 갈라지던 것을 하나로 모은다.
// (캠페인 채널 예산 · 행사 성과 퀵 입력이 첫 소비자. 매출 장부 계열은 후속 웨이브.)
//
// 이 컴포넌트가 없앤 실측 결함 셋:
//   1) 조합(IME) 삼킴 — onChange 에서 replace(/[^0-9]/g,"") 로 즉시 거르면 한글 조합 중간
//      문자열이 통째로 지워져 최종값이 빈 문자열이 되고, 사용자에게는 아무 피드백도 없다.
//   2) 무음 소실 — 숫자가 아닌 입력이 조용히 사라져 "안 눌렸나?" 로 읽힌다.
//   3) 자릿수 오독 — 콤마 없이 12000000 을 눈으로 세다 0 하나를 틀린다.
//
// type="number" 를 쓰지 않는 이유: 휠 스크롤이 값을 바꾸는 사고와 IME/포맷 제어 불가를
// 동시에 피하려면 text + inputMode="numeric" 조합이 유일한 안전지대다.

/* ─── 순수 로직 (테스트 대상) ──────────────────────────────────────────────── */

/**
 * 소수점 앞의 정수부 숫자만 뽑는다.
 *
 * 소수점 뒤를 "버린다"는 게 핵심 — 단순히 숫자 아닌 문자를 전부 지우면 "12.5" 가 "125" 로
 * 열 배 부풀어 오른다. 원화 금액은 정수 도메인이라 내림(floor)이 정본이고, 표시·커밋 양쪽이
 * 같은 규칙을 써야 화면과 저장값이 갈라지지 않는다.
 */
function extractIntegerDigits(raw: string): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "")
  const dot = text.indexOf(".")
  const head = dot === -1 ? text : text.slice(0, dot)
  return head.replace(/[^0-9]/g, "")
}

function countDigits(text: string): number {
  let count = 0
  for (const char of text) if (char >= "0" && char <= "9") count += 1
  return count
}

/**
 * 표시용 천단위 구분 — 숫자 외 문자를 걷어내고 선행 0을 정리한 뒤 3자리마다 콤마를 넣는다.
 * 빈 입력은 빈 문자열(placeholder 가 드러나야 하므로 "0" 을 지어내지 않는다).
 */
export function formatWithCommas(raw: string): string {
  const digits = extractIntegerDigits(raw)
  if (digits === "") return ""
  // 선행 0 제거 — "007" → "7". 전부 0이면 마지막 한 자리는 남긴다("000" → "0").
  const normalized = digits.replace(/^0+(?=\d)/, "")
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** 값 계약상 "매우 큰 수"의 상한 — 이보다 크면 부동소수 정밀도가 깨져 표시와 저장이 갈라진다. */
const MAX_MONEY = Number.MAX_SAFE_INTEGER

/**
 * 커밋용 파싱 — 콤마·통화기호·한글·문자를 걷어내고 정수(내림, 0 이상)로 만든다.
 *
 * 정책:
 *  - 빈 값(공백만 포함)은 0이 아니라 null("미입력"). null 과 0 을 뭉개면 "측정된 0" 과
 *    "아직 안 넣음" 이 같아져 ROI 분모·목표 달성률이 조용히 틀어진다.
 *  - 음수 표기는 금액 도메인에 없다 → 0으로 클램프한다. 부호만 지워 양수로 뒤집으면
 *    (-5000 → 5000) 데이터가 소리 없이 바뀌므로 그 경로는 택하지 않는다.
 *  - 소수는 내림. 상한은 MAX_MONEY 클램프.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = (typeof raw === "string" ? raw : String(raw ?? "")).trim()
  if (text === "") return null
  // 유니코드 빼기표(−)·대시류까지 음수 표기로 본다 — 붙여넣기 경로에서 실제로 들어온다.
  const negative = /^[-−–—]/.test(text)
  const digits = extractIntegerDigits(text)
  if (digits === "") return negative ? 0 : null
  if (negative) return 0
  const parsed = Number(digits)
  if (!Number.isFinite(parsed)) return null
  return Math.min(MAX_MONEY, Math.max(0, Math.floor(parsed)))
}

/** prop 값 → 편집 초안 문자열. allowNull=false 인 필드의 0 은 placeholder 가 대신 보여준다. */
function toDraft(value: number | null, allowNull: boolean): string {
  if (value == null) return ""
  if (!allowNull && value === 0) return ""
  return formatWithCommas(String(value))
}

/* ─── 컴포넌트 ─────────────────────────────────────────────────────────────── */

// SSR(테스트의 renderToStaticMarkup 포함)에서 useLayoutEffect 경고가 나지 않게 환경별로 고른다.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const HINT_MS = 1500

export interface AdminMoneyInputProps {
  /** 현재 값. null = 미입력(0 과 다른 상태). */
  value: number | null
  /** blur·Enter 에서만 호출된다. allowNull=false 면 next 는 절대 null 이 아니다. */
  onCommit: (next: number | null) => void
  /** 기본 true. false 면 빈 입력이 0 으로 커밋된다("미배정=0" 이 도메인 정의인 필드용). */
  allowNull?: boolean
  /** 통화 기호 등 입력 앞에 붙는 장식(예: "₩"). 카운트 필드는 생략한다. */
  prefix?: string
  ariaLabel: string
  /** 인라인 에러 문구의 id — 실패 메시지를 스크린리더에 연결한다. */
  ariaDescribedBy?: string
  disabled?: boolean
  /** 저장 진행 중 — 스피너 + 톤 다운. 잠금은 하지 않는다(잠금은 호출부의 disabled 소관). */
  pending?: boolean
  /** 저장 성공 직후의 짧은 확인 표시. 지속 시간은 호출부가 관리한다. */
  saved?: boolean
  /** 저장 실패 — aria-invalid + danger 보더. "저장된 값"과 "안 실린 값"을 눈으로 구분시킨다. */
  invalid?: boolean
  placeholder?: string
  className?: string
}

export function AdminMoneyInput({
  value,
  onCommit,
  allowNull = true,
  prefix,
  ariaLabel,
  ariaDescribedBy,
  disabled = false,
  pending = false,
  saved = false,
  invalid = false,
  placeholder,
  className = "",
}: AdminMoneyInputProps) {
  const [draft, setDraft] = useState(() => toDraft(value, allowNull))
  // 커밋 후 상위가 canonical 값을 되돌려주면(prop 변경) 초안을 다시 맞춘다.
  // useEffect 대신 "prop 변경 시 렌더 중 state 조정" 패턴(react.dev) — 캐스케이딩 렌더를 피한다.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(toDraft(value, allowNull))
  }

  // 편집이 일어날 때마다 증가 — 포맷 결과가 직전 초안과 같아도(예: 한글 한 글자를 걸러내
  // 초안이 그대로일 때) 반드시 리렌더를 일으켜 DOM 값 복원 + 캐럿 복원이 돌게 한다.
  // 값 자체는 화면에 쓰이지 않으므로 setter 만 꺼내 쓴다.
  const [, setEditNonce] = useState(0)
  const [hintVisible, setHintVisible] = useState(false)
  const [hintSeq, setHintSeq] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const composingRef = useRef(false)
  // 캐럿 위치를 "문자 인덱스"가 아니라 "뒤에 남은 숫자 개수"로 기억한다.
  // 콤마가 몇 개 끼어들든 사용자가 보던 자리 그대로 복원된다.
  const caretDigitsFromEndRef = useRef<number | null>(null)

  useIsomorphicLayoutEffect(() => {
    const pendingCaret = caretDigitsFromEndRef.current
    if (pendingCaret == null) return
    caretDigitsFromEndRef.current = null
    const el = inputRef.current
    if (!el) return
    const text = el.value
    let remaining = pendingCaret
    let position = text.length
    while (position > 0 && remaining > 0) {
      position -= 1
      if (text[position] >= "0" && text[position] <= "9") remaining -= 1
    }
    el.setSelectionRange(position, position)
  })

  useEffect(() => {
    if (!hintVisible) return
    const timer = setTimeout(() => setHintVisible(false), HINT_MS)
    return () => clearTimeout(timer)
    // hintSeq 를 의존성에 두어 힌트가 재발화되면 타이머도 다시 시작한다.
  }, [hintVisible, hintSeq])

  /** raw 문자열을 포맷해 초안에 반영하고, 캐럿과 비숫자 힌트를 함께 처리한다. */
  function applyRaw(raw: string, caret: number) {
    caretDigitsFromEndRef.current = countDigits(raw.slice(caret))
    // 우리가 넣은 콤마는 사용자의 "비숫자 입력"이 아니므로 판정에서 뺀다.
    const droppedNonDigit = /[^0-9]/.test(raw.replace(/,/g, ""))
    if (droppedNonDigit) {
      setHintVisible(true)
      setHintSeq((seq) => seq + 1)
    } else if (hintVisible) {
      setHintVisible(false)
    }
    setDraft(formatWithCommas(raw))
    setEditNonce((nonce) => nonce + 1)
  }

  function commit() {
    const parsed = parseMoneyInput(draft)
    const next = parsed == null && !allowNull ? 0 : parsed
    setDraft(toDraft(next, allowNull))
    if (next !== value) onCommit(next)
  }

  const borderClass = invalid
    ? "border-[#B43E3E] bg-white"
    : "border-[#e8e8e4] bg-[#fafaf8] focus-within:border-[#084734] focus-within:bg-white"

  return (
    <span className={`inline-flex min-w-0 flex-col items-stretch ${className}`}>
      <span
        className={`inline-flex min-w-0 items-center gap-1 rounded-lg border px-2 py-1 transition-colors ${borderClass} ${
          pending ? "opacity-70" : ""
        }`}
      >
        {prefix && (
          <span aria-hidden className="shrink-0 text-[11px] text-[#1a1a1a]/35">
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          placeholder={placeholder}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={(e) => {
            // 조합이 끝난 뒤에야 정규화한다 — 조합 중 변형하면 IME 가 입력을 통째로 잃는다.
            composingRef.current = false
            const el = e.currentTarget
            applyRaw(el.value, el.selectionStart ?? el.value.length)
          }}
          onChange={(e) => {
            const el = e.target
            // 조합 중에는 원문을 그대로 통과시켜 DOM 과 controlled value 를 일치시킨다.
            if (composingRef.current) {
              setDraft(el.value)
              return
            }
            applyRaw(el.value, el.selectionStart ?? el.value.length)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || composingRef.current) return
            if (e.key === "Enter") {
              e.currentTarget.blur()
              return
            }
            const el = e.currentTarget
            const start = el.selectionStart
            const end = el.selectionEnd
            if (e.key === "Backspace" && start != null && start === end && start > 1 && el.value[start - 1] === ",") {
              // 콤마는 우리가 넣은 표시용 문자다 — 지우는 순간 다시 붙어 "안 지워지는 키"로 보인다.
              // 사용자가 의도한 건 그 앞 숫자의 삭제이므로 한 칸 더 당겨 지운다.
              e.preventDefault()
              applyRaw(el.value.slice(0, start - 2) + el.value.slice(start), start - 2)
            }
          }}
          onBlur={commit}
          className="w-full min-w-0 bg-transparent text-right text-[12px] tabular-nums text-[#111110] outline-none placeholder:text-[11px] placeholder:text-[#A39E98] disabled:opacity-50"
        />
        {pending ? (
          <Loader2 aria-hidden className="h-3 w-3 shrink-0 animate-spin text-[#A39E98]" />
        ) : saved ? (
          <Check aria-hidden className="h-3 w-3 shrink-0 text-[#084734]" />
        ) : null}
      </span>
      {/* 항상 렌더된 라이브 리전 — 나중에 삽입된 영역은 스크린리더가 읽지 않는 경우가 있다.
          내용이 없으면 라인박스가 생기지 않아 높이 0 이므로 표 레이아웃을 밀지 않는다. */}
      <span role="status" aria-live="polite" className="text-right text-[11px] leading-tight text-[#B85C33]">
        {hintVisible ? "숫자만 입력할 수 있습니다" : ""}
      </span>
    </span>
  )
}

export default AdminMoneyInput
