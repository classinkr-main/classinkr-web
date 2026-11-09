import type { IntroTable as IntroTableData } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { Emphasis } from "./Emphasis"

/**
 * 소개서 비교·스펙 표. 좁은 화면에서는 표만 가로로 스크롤한다(페이지 가로 스크롤 0).
 * 강조 열(ClassIn)은 색이 아니라 굵기로 구분한다 — 그린은 누를 수 있는 것에만 쓴다(DESIGN.md §2).
 */
export function IntroTable({ table }: { table: IntroTableData }) {
  const { title, columns, rows, highlightColumn, note } = table
  const minWidth = columns.length > 3 ? `${columns.length * 9}rem` : undefined
  const headed = columns.some((column) => column.trim() !== "")

  return (
    <figure className="min-w-0">
      {title ? <figcaption className="mb-3 text-label text-fg-ink">{title}</figcaption> : null}
      <div
        className="overflow-x-auto border-t border-line-ink"
        role="region"
        aria-label={title ?? "표"}
        tabIndex={0}
      >
        <table className="w-full border-collapse text-left text-caption text-fg-body" style={{ minWidth }}>
          {headed ? (
            <thead>
              <tr className="border-b border-line-strong">
                {columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={cn(
                      "px-3 py-3 align-bottom text-label text-fg-muted first:pl-0",
                      index === highlightColumn && "text-fg-ink"
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody className="divide-y divide-line-hair">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => {
                  const Cell = cellIndex === 0 ? "th" : "td"
                  return (
                    <Cell
                      key={cellIndex}
                      scope={cellIndex === 0 ? "row" : undefined}
                      className={cn(
                        "px-3 py-3 align-top first:pl-0",
                        cellIndex === 0 && "font-semibold text-fg-ink",
                        cellIndex === highlightColumn && "font-semibold text-fg-ink"
                      )}
                    >
                      <CellLines value={cell} />
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? <p className="mt-3 text-note text-fg-muted">{note}</p> : null}
    </figure>
  )
}

function CellLines({ value }: { value: string }) {
  const lines = value.split("\n").filter((line) => line.trim() !== "")
  if (lines.length <= 1) return <Emphasis text={value} />
  return (
    <ul className="space-y-1">
      {lines.map((line, index) => (
        <li key={index} className="flex gap-2">
          <span aria-hidden="true" className="text-fg-faint">
            –
          </span>
          <span>
            <Emphasis text={line} />
          </span>
        </li>
      ))}
    </ul>
  )
}
