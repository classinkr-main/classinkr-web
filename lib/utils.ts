import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tokens.css @theme 의 --text-* 15종과 같은 목록. tests/lib/cn.test.ts 가 대조한다.
// 함정: text-* 크기는 leading-* 과 충돌 그룹이라 cn('leading-7 text-h3') 는 leading-7 을 지운다. 행간 덮어쓰기는 text-* 뒤에 둔다.
export const TEXT_SCALE = [
  "poster", "display", "h1", "h2", "h3", "body-l", "body", "article",
  "ui", "caption", "note", "label", "folio", "numeral", "quote",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TEXT_SCALE],
      tracking: ["label", "abbr"],
      container: ["measure", "deck", "heading", "display", "quote", "page", "article"],
      ease: ["soft", "drift"],
      aspect: ["case", "screen", "portrait"],
      animate: ["skeleton"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
