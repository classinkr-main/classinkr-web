import { Check } from "lucide-react"

import { StoryChapter, StoryChapterHead, folio } from "./primitives"
import { STORY_PROBLEM, STORY_TOOL_TABLE } from "./story-copy"

/**
 * 01 문제 — 선생님 A–E 표(원문 「클래스인 도입 배경」) → 기존 도구의 구조적 한계 4 + 클래스인의 답.
 * 표의 클래스인 열은 운영자 지정 장치라 그린 채움으로 세운다(이 열 하나뿐). 나머지 도구는 회색 낱장.
 * 좁은 화면에서는 표만 가로로 스크롤한다(페이지 가로 스크롤 0).
 */
export function StoryProblem() {
  const { id, kicker, title, lead, limitsTitle, limitLabel, answerLabel, limits } = STORY_PROBLEM
  const table = STORY_TOOL_TABLE
  return (
    <StoryChapter id={id}>
      <StoryChapterHead id={id} folio={folio(1)} kicker={kicker} title={title} lead={lead} />

      <div
        role="region"
        aria-label={table.regionLabel}
        tabIndex={0}
        // relative: 표 안 sr-only(absolute) 글자가 이 스크롤 상자 밖 기준으로 잡혀 페이지 가로 스크롤을 만들지 않게 가둔다
        className="relative mt-10 overflow-x-auto border border-line-hair bg-surface-sheet md:mt-12"
      >
        <table className="w-full min-w-[60rem] border-collapse text-left text-caption text-fg-body">
          <caption className="sr-only">{table.caption}</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th scope="col" className="w-40 px-4 py-4 align-bottom text-label text-fg-muted">
                {table.taskHeader}
              </th>
              {table.teachers.map((teacher) => (
                <th key={teacher} scope="col" className="px-3 py-4 align-bottom text-ui font-semibold text-fg-ink">
                  {teacher}
                </th>
              ))}
              <th scope="col" className="w-52 bg-fg-accent px-5 py-4 align-bottom text-fg-on-accent">
                <span className="block text-note">{table.classinTeacher}</span>
                <span className="block text-body-l font-semibold">{table.classinHeader}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.task} className="border-t border-line-hair first:border-t-0">
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-ui font-semibold text-fg-ink">
                  {row.task}
                </th>
                {row.tools.map((tools, index) => (
                  <td key={index} className="px-3 py-3 align-middle">
                    {tools.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {tools.map((tool) => (
                          <span key={tool} className="whitespace-nowrap bg-surface-sunken px-2.5 py-1">
                            {tool}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <>
                        <span aria-hidden="true" className="status-dot" data-state="na" />
                        <span className="sr-only">{table.emptyLabel}</span>
                      </>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap bg-fg-accent px-5 py-3 font-semibold text-fg-on-accent">
                  <span className="inline-flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4" />
                    {row.classin}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-note text-fg-muted">{table.note}</p>

      <div className="mt-16 md:mt-20">
        <h3 className="max-w-heading text-h3 text-fg-ink">{limitsTitle}</h3>
        <ol className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {limits.map((limit, index) => (
            <li key={limit.title} className="border-t border-line-ink pt-5">
              <p className="text-folio tabular-nums text-fg-muted">
                {limitLabel} {index + 1}
              </p>
              <h4 className="mt-1.5 text-body-l font-semibold text-fg-ink">{limit.title}</h4>
              <p className="mt-3 flex gap-2.5 text-body text-fg-body">
                <Check aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-fg-ink" />
                <span>
                  <span className="sr-only">{answerLabel}: </span>
                  {limit.answer}
                </span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </StoryChapter>
  )
}
