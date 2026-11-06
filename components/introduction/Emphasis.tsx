import { Fragment } from "react"

/**
 * lib/introduction/content.ts 문자열의 `**굵게**` 표기만 강조로 바꿔 그린다.
 * 그 밖의 마크다운은 해석하지 않는다(원문 그대로 둔다).
 */
export function Emphasis({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-semibold text-fg-ink">
            {part}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  )
}

/** 메타 설명·alt 처럼 강조 표기를 걷어낸 평문이 필요할 때 쓴다. */
export function stripEmphasis(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1")
}
