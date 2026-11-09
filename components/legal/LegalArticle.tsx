import type { ReactNode } from "react"

interface LegalArticleProps {
  eyebrow: string
  title: string
  description: string
  lastUpdated: string
  children: ReactNode
}

export function LegalArticle({
  eyebrow,
  title,
  description,
  lastUpdated,
  children,
}: LegalArticleProps) {
  return (
    <div className="min-h-screen bg-[#FAFAF8] pt-24 text-[#111110] md:pt-28">
      <section className="border-b border-black/[0.08] bg-white">
        <div className="container mx-auto max-w-4xl px-5 py-12 md:px-6 md:py-16">
          <p className="mb-4 text-sm font-semibold text-fg-accent">{eyebrow}</p>
          <h1 className="text-3xl font-black leading-tight md:text-5xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-[#615D59] md:text-lg md:leading-8">
            {description}
          </p>
          <p className="mt-6 text-sm font-medium text-[#A39E98]">최종 업데이트: {lastUpdated}</p>
        </div>
      </section>

      <article className="container mx-auto max-w-4xl px-5 py-10 md:px-6 md:py-14">
        <div className="space-y-5">{children}</div>
      </article>
    </div>
  )
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-lg border border-black/[0.08] bg-white p-5 shadow-[rgba(0,0,0,0.03)_0px_4px_18px] md:p-7"
    >
      <h2 className="text-xl font-bold leading-snug text-[#111110] md:text-2xl">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-[#615D59] md:text-[15px] md:leading-8">
        {children}
      </div>
    </section>
  )
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-fg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-fg-accent/15 bg-fg-accent/8 p-4 text-sm leading-7 text-fg-accent md:p-5">
      {children}
    </div>
  )
}

/** 가로로 넘치면 표 안에서만 스크롤한다(overflow-hidden 금지 — 375px 에서 칸이 잘린다). 첫 칸은 행 제목. */
export function LegalTable({ headers, rows }: { headers: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line-hair">
      <table
        className="w-full border-collapse text-left text-note leading-6 md:text-caption"
        style={{ minWidth: `${headers.length * 9}rem` }}
      >
        <thead className="bg-surface-paper text-fg-ink">
          <tr>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="border-b border-line-hair px-3 py-2 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line-hair align-top last:border-b-0">
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row" className="px-3 py-2 font-semibold text-fg-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex} className="px-3 py-2">
                    {cell}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
