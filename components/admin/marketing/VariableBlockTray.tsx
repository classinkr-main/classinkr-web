"use client"

/**
 * VariableBlockTray — 시안 1a의 "변수 블록" 트레이 (카드형: 변수명 + 소스 필드 + 예시값)
 *
 * 정직 원칙: 여기 노출하는 변수는 실제 발송 백엔드(app/api/admin/email/send)의
 * replacePlaceholders가 치환하는 {name}/{org}/{role} 만이다 — 치환 안 되는 변수를
 * 트레이에 올려 "될 것처럼" 보이게 하지 않는다. 예시값은 가능하면 현재 대상 표본의
 * 실값, 빈 값 수(emptyCount)는 공백("")으로 발송된다는 사실과 함께 표기한다.
 */

import type { VariableBlockDef } from "./send-center-types"

interface Props {
  variables: VariableBlockDef[]
  onInsert: (token: string) => void
  /** 초안(제목+본문)에서 이미 쓰인 토큰 — 카드에 사용 중 표시 */
  usedTokens: string[]
}

export default function VariableBlockTray({ variables, onInsert, usedTokens }: Props) {
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-[#111110]">변수 블록</span>
        <span className="text-[11px] text-[#1a1a1a]/40">클릭하면 커서 위치에 삽입 · 발송 시 수신자별로 치환</span>
        <span className="ml-auto rounded-full border border-[#e8e8e4] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/50">
          구독자 DB
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {variables.map((v) => {
          const used = usedTokens.includes(v.token)
          return (
            <button
              key={v.token}
              type="button"
              onClick={() => onInsert(v.token)}
              title={`${v.label} — 클릭하여 삽입`}
              className={`group flex flex-col items-start gap-1 rounded-lg border bg-white px-3 py-2.5 text-left transition-all hover:border-[#084734]/40 hover:bg-[#ECFDF5] active:scale-[0.98] ${
                used ? "border-[#084734]/35 shadow-[0_1px_0_rgba(8,71,52,0.06)]" : "border-[#e8e8e4]"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-mono text-[12px] font-bold text-[#084734]">{v.token}</span>
                {used && (
                  <span className="rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[9px] font-semibold text-[#084734]">
                    사용 중
                  </span>
                )}
              </span>
              <span className="font-mono text-[10px] text-[#1a1a1a]/35">{v.source}</span>
              <span className="text-[11px] text-[#1a1a1a]/55">예) {v.example}</span>
              {typeof v.emptyCount === "number" && v.emptyCount > 0 && (
                <span className="text-[10px] font-medium text-[#A8741A]">
                  빈 값 {v.emptyCount}명 — 공백으로 발송됨
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
