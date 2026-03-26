"use client"

// ─── Variable definitions (shared across email editors) ───────────────────────

export const VARIABLE_GROUPS = [
  {
    label: "수신자",
    chipClass: "bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100",
    hlBg: "#dbeafe",
    hlColor: "#1e40af",
    vars: [
      { key: "name",  label: "이름",   example: "홍길동" },
      { key: "email", label: "이메일", example: "sample@abc.kr" },
      { key: "role",  label: "직책",   example: "원장" },
      { key: "phone", label: "전화",   example: "010-1234-5678" },
    ],
  },
  {
    label: "학원",
    chipClass: "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100",
    hlBg: "#d1fae5",
    hlColor: "#065f46",
    vars: [
      { key: "org",          label: "학원명", example: "ABC학원" },
      { key: "academy_size", label: "규모",   example: "100~300명" },
    ],
  },
  {
    label: "시스템",
    chipClass: "bg-violet-50 border-violet-100 text-violet-700 hover:bg-violet-100",
    hlBg: "#ede9fe",
    hlColor: "#5b21b6",
    vars: [
      { key: "date",            label: "발송일",   example: "2026년 3월 26일" },
      { key: "unsubscribe_url", label: "수신거부", example: "(링크 자동생성)" },
    ],
  },
] as const

export const ALL_VARIABLES: Array<{ key: string; label: string; example: string }> =
  (VARIABLE_GROUPS as ReadonlyArray<{ vars: ReadonlyArray<{ key: string; label: string; example: string }> }>).flatMap((g) => [...g.vars])

export const SAMPLE_VALUES: Record<string, string> = Object.fromEntries(
  ALL_VARIABLES.map((v) => [v.key, v.example])
)

const HL_MAP: Record<string, { bg: string; color: string }> = {}
for (const g of VARIABLE_GROUPS) {
  for (const v of g.vars) {
    HL_MAP[v.key] = { bg: g.hlBg, color: g.hlColor }
  }
}

/** 미리보기: {var} → 샘플 값으로 치환 */
export function applyPreview(text: string): string {
  let r = text
  for (const v of ALL_VARIABLES) {
    r = r.replace(new RegExp(`\\{${v.key}\\}`, "g"), SAMPLE_VALUES[v.key])
  }
  return r
}

/** 하이라이팅: {var} 패턴을 <mark> 로 감쌈 (overlay용) */
export function highlightVariables(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return esc.replace(/\{([a-zA-Z_]+)\}/g, (match, key) => {
    const hl = HL_MAP[key]
    if (hl) {
      return `<mark style="background:${hl.bg};color:${hl.color};border-radius:3px;font-style:normal">${match}</mark>`
    }
    return `<mark style="background:#fee2e2;color:#991b1b;border-radius:3px;font-style:normal">${match}</mark>`
  })
}

// ─── Palette Component ────────────────────────────────────────────────────────

interface PaletteProps {
  onInsert: (key: string) => void
  usedVars?: string[]
  compact?: boolean
}

export default function VariablePalette({ onInsert, usedVars = [], compact = false }: PaletteProps) {
  return (
    <div className="flex items-start gap-x-4 gap-y-2 flex-wrap">
      {VARIABLE_GROUPS.map((group) => (
        <div key={group.label} className="flex items-center gap-1.5">
          {!compact && (
            <span className="text-[10px] font-semibold text-[#1a1a1a]/30 uppercase tracking-wider shrink-0 select-none">
              {group.label}
            </span>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            {group.vars.map((v) => {
              const used = usedVars.includes(v.key)
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => onInsert(v.key)}
                  title={`예시: ${v.example} — 클릭하여 삽입`}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-all cursor-pointer ${group.chipClass} ${
                    used
                      ? "ring-1 ring-current opacity-100 shadow-sm"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <span className="font-mono">{"{" + v.key + "}"}</span>
                  {!compact && (
                    <span className="opacity-60 text-[10px]">{v.label}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
