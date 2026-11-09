import { PROOF_CONTAINER } from "./ProofParts"
import { PROOF_INSTITUTIONS } from "./proof-copy"

// 분야별 칸 폭(80rem 이상 12칸). 사교육은 이름이 많아 안에서 두 단으로 흐른다.
const GROUP_SPAN: Record<string, string> = {
  공교육: "xl:col-span-3",
  사교육: "xl:col-span-4",
  기타교육: "xl:col-span-2",
}

/**
 * 기관 띠 — 표지 바로 아래의 목록(부록 역할이라 sunken 지면, 리듬 band). 사례 수·분야별 수·나라는 content.ts 에서 센다.
 * 휴대폰 1열 → 40rem 2열 → 80rem 12칸(요약 3 · 공교육 3 · 사교육 4 · 기타교육 2).
 */
export function ProofInstitutions() {
  const { title, total, unit, countries, groups } = PROOF_INSTITUTIONS
  return (
    <section aria-labelledby="proof-institutions-title" className="bg-surface-sunken py-10 md:py-12">
      <div className={PROOF_CONTAINER}>
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-12">
          <div className="xl:col-span-3">
            <h2 id="proof-institutions-title" className="text-ui font-semibold text-fg-ink">
              {title}
            </h2>
            <p className="mt-3 flex items-baseline gap-1 text-fg-ink">
              <span className="text-numeral">{total}</span>
              <span className="text-body-l font-medium">{unit}</span>
            </p>
            <p className="mt-3 text-note text-fg-muted">{countries}</p>
          </div>

          {groups.map((group) => (
            <div key={group.id} className={GROUP_SPAN[group.id]}>
              <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-3">
                <h3 className="text-ui font-semibold text-fg-ink">{group.label}</h3>
                <p className="text-h3 tabular-nums text-fg-ink">
                  <span className="sr-only">{group.label} 기관 수 </span>
                  {group.institutions.length}
                </p>
              </div>
              <ul
                className={
                  group.institutions.length > 5
                    ? "mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-ui text-fg-ink"
                    : "mt-3 grid gap-y-1.5 text-ui text-fg-ink"
                }
              >
                {group.institutions.map((item) => (
                  <li key={item.slug} className="min-w-0">
                    {item.name}
                    {item.country ? <span className="ml-1.5 text-note text-fg-muted">{item.country}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
