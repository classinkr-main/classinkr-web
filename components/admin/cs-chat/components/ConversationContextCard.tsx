import { ExternalLink, Inbox } from "lucide-react"

import type { ContextCardData } from "../ops-desk"

/**
 * 상담 맥락 카드(IC-10). 공개 챗봇·채널톡·브리지에서 넘어온 customer_context 를 대화 맨 위에 보인다.
 * 값은 모두 ops-desk.readContextCard 에서 개인정보 가림을 거친 글이고, 비어 있으면 카드를 그리지 않는다.
 * 'Inbox에서 열기'는 상담 Inbox 목록으로 간다 — 상담 id 깊은 링크 형식은 아직 정해지지 않았다(결정 14).
 */
export default function ConversationContextCard({ card }: { card: ContextCardData }) {
  return (
    <section
      aria-label="상담 맥락"
      data-testid="conversation-context-card"
      className="rounded-lg border border-black/[0.08] bg-[#FAFAF8] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-[#31302E]">상담 맥락</h3>
        <a
          href="/admin/channel-talk"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.08] bg-white px-2.5 text-[12px] font-semibold text-[#31302E] hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
        >
          <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
          Inbox에서 열기
          <span className="sr-only">(새 탭에서 열림)</span>
        </a>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-[12px] leading-5 sm:grid-cols-[88px_minmax(0,1fr)]">
        {card.source ? (<><dt className="text-[#78736D]">출처</dt><dd className="text-[#31302E]">{card.source}</dd></>) : null}
        {card.institution ? (<><dt className="text-[#78736D]">기관</dt><dd className="text-[#31302E]">{card.institution}</dd></>) : null}
        {card.summary ? (<><dt className="text-[#78736D]">챗봇 요약</dt><dd className="text-[#31302E]">{card.summary}</dd></>) : null}
        {card.lastQuestion ? (<><dt className="text-[#78736D]">직전 질문</dt><dd className="text-[#31302E]">{card.lastQuestion}</dd></>) : null}
        {card.documents.length > 0 ? (
          <>
            <dt className="text-[#78736D]">문서</dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-1">
              {card.documents.map((path) => (
                <a
                  key={path}
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#084734] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
                >
                  {path}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only">(새 탭에서 열림)</span>
                </a>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
    </section>
  )
}
