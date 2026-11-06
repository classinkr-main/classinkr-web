import { Reveal } from "@/components/landing/Reveal"
import { HOME_COPY } from "./home-copy"

const { roles } = HOME_COPY
const HEAD = "pb-4 text-caption font-medium"
const CELL = "py-4 align-top text-body break-keep"

export function HomeRoles() {
  return (
    <section className="bg-surface-paper pb-20 pt-8 md:pb-32 md:pt-16">
      <Reveal className="mx-auto max-w-[1040px] px-4 sm:px-6">
        <h2 className="text-h2 text-fg-ink break-keep text-balance">{roles.heading}</h2>

        {/* 실제 표 — 페이지에서 헤어라인을 쓰는 유일한 곳. md 아래는 같은 내용을 역할별 블록으로 */}
        <table className="mt-10 hidden w-full table-fixed text-left md:table">
          <caption className="sr-only">{roles.caption}</caption>
          <thead>
            <tr className="border-b border-line-hair">
              <th scope="col" className={`w-40 pr-6 ${HEAD} text-fg-muted`}>{roles.columns.role}</th>
              <th scope="col" className={`pr-6 ${HEAD} text-fg-muted`}>{roles.columns.before}</th>
              <th scope="col" className={`${HEAD} text-fg-ink`}>{roles.columns.after}</th>
            </tr>
          </thead>
          <tbody>
            {roles.rows.map((row) => (
              <tr key={row.role} className="border-b border-line-hair">
                <th scope="row" className={`pr-6 ${CELL} font-semibold text-fg-ink`}>{row.role}</th>
                <td className={`pr-6 ${CELL} text-fg-muted`}>{row.before}</td>
                <td className={`${CELL} text-fg-ink`}>{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="mt-8 space-y-6 md:hidden">
          {roles.rows.map((row) => (
            <li key={row.role}>
              <p className="text-body font-semibold text-fg-ink">{row.role}</p>
              <p className="mt-2 text-body text-fg-muted break-keep">
                <span className="mr-2 text-caption font-medium">{roles.columns.before}</span>
                {row.before}
              </p>
              <p className="mt-1 text-body text-fg-ink break-keep">
                <span className="mr-2 text-caption font-medium">{roles.columns.after}</span>
                {row.after}
              </p>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
