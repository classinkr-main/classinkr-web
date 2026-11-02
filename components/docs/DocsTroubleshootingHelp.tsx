import Link from "next/link"
import { ArrowRight, LifeBuoy, MessageCircle } from "lucide-react"

import { DocsAskChatbotButton } from "./DocsAskChatbotButton"
import { cn } from "./utils"

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-white"

/**
 * 문제 해결 문서 끝의 "그래도 안 되면" 안내.
 * 순서대로 해도 해결되지 않은 사람이 바로 다음 행동(챗봇에 묻기, 상담 남기기)으로 넘어가게 한다.
 */
export function DocsTroubleshootingHelp({
  docTitle,
  contactHref,
  className,
}: {
  docTitle: string
  contactHref: string
  className?: string
}) {
  return (
    <section
      aria-labelledby="docs-still-stuck"
      className={cn(
        "rounded-xl border border-black/[0.16] bg-white px-5 py-6 sm:px-7 sm:py-7 print:hidden",
        className
      )}
    >
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">
        <LifeBuoy className="h-4 w-4" aria-hidden />
        추가 지원
      </p>
      <h2
        id="docs-still-stuck"
        className="mt-2 text-xl font-black tracking-card text-[#111110] md:text-2xl"
      >
        그래도 안 되면
      </h2>
      <p className="mt-3 max-w-2xl break-keep text-[15px] leading-7 text-[#31302E]">
        위 순서대로 해도 그대로라면 증상을 적어 챗봇에게 물어보세요. 바로 해결되지 않으면 상담을 남겨
        주세요. 담당 매니저가 확인하고 연락드립니다.
      </p>
      <p className="mt-2 max-w-2xl break-keep text-sm leading-6 text-[#615D59]">
        쓰는 기기, 문제가 생긴 화면, 해 본 방법을 함께 적어 주시면 더 빨리 확인할 수 있어요.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <DocsAskChatbotButton
          prefill={`'${docTitle}' 문서대로 해 봤는데 해결되지 않았어요. `}
          className={cn(
            "inline-flex min-h-11 origin-center items-center gap-2 rounded-[6px] bg-[#084734] px-5 text-sm font-bold text-white transition-colors duration-150 hover:bg-[#065c41] active:scale-[0.98]",
            FOCUS_RING
          )}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          챗봇에게 묻기
        </DocsAskChatbotButton>
        <Link
          href={contactHref}
          className={cn(
            "group inline-flex min-h-11 origin-center items-center gap-2 rounded-[6px] border border-[#084734]/30 px-5 text-sm font-bold text-[#084734] transition-colors duration-150 hover:border-[#084734]/60 active:scale-[0.98]",
            FOCUS_RING
          )}
        >
          상담 남기기
          <ArrowRight
            className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </section>
  )
}
