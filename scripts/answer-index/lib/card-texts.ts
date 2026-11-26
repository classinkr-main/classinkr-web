/**
 * 카드 답 글 그리기(문체 점검 style-audit.ts 와 다듬기 전수 시험 tests/chatbot/answer-index/shape-cards.test.ts 공용).
 * respond.ts 와 같은 순서로 카드마다 글을 만든다: doc 은 문장 묶기 → 결론 문장(first)을 맨 앞 문단으로 → (켰으면) 결론 한 줄(headline)을
 * 근거가 첫 문단에 없을 때만 맨 앞에 → 리드. fixed·policy 는 카드 글, howto 는 증상·가이드 답, gap 은 틀 문장 + 관련 문장.
 * 상담 안내·끝맺음·복합 답 머리 줄은 카드 밖(respond.ts)이라 여기에는 없다. 모델·네트워크·데이터베이스를 부르지 않는다.
 */

type SentenceItem = { group: string; id: number; text: string }
type Ref = { unit: string; i: number; hash?: string }

export interface CardText {
  id: string
  kind: string
  /** 사람이 쓴 글(policy, policyGoverned fixed): 다듬을 때 끝맺음을 지우지 않는다. */
  policyGoverned: boolean
  asks: string[] | null
  /** 카드 본문(리드 없음). */
  text: string
  /** 붙일 리드 문장(없으면 null). respond.ts 는 리드를 첫 문단 앞에 붙인 뒤 다듬는다. */
  lead: string | null
}

export interface RenderCardTextsOptions {
  /** 자료 폴더(없으면 ANSWER_INDEX_DATA_DIR > data/answer-index). */
  dir?: string
  /** doc 카드의 first·headline 을 쓰는지(false 면 둘 다 쓰지 않는다). */
  conclusion?: boolean
  /** headline 을 그리는지(런타임 CHATBOT_COMPILED_HEADLINE, 기본 꺼짐). */
  headline?: boolean
  onError?: (id: string, error: Error) => void
}

export async function renderCardTexts(options: RenderCardTextsOptions = {}): Promise<{ cards: CardText[]; total: number; excluded: number; problems: number }> {
  const { loadAnswerIndexData, answerIndexDataDir } = await import("@/lib/chatbot/answer-index/load")
  const { curatedLegacyText, curatedTextHash, symptomTopicById, findPublicGuide } = await import("@/lib/chatbot/answer-index/curated")
  const { groupSentenceParagraphs } = await import("@/lib/chatbot/answer-index/paragraphs")
  const { LEAD_TEXT, gapLeadLine, GAP_RELATED_INTRO } = await import("@/lib/chatbot/answer-index/respond")
  const { buildSymptomTopicAnswer, buildVagueErrorAnswer } = await import("@/lib/chatbot/symptom-triage")
  const { formatCsFigmaGuideAnswer } = await import("@/lib/cs-figma-guides")
  const conclusion = options.conclusion ?? true
  const data = loadAnswerIndexData({ curatedTextHash, dir: options.dir ?? answerIndexDataDir(process.env) })
  const out: CardText[] = []
  const live = (ref: Ref) => {
    const sentence = data.currentUnits.get(ref.unit)?.sentences[ref.i]
    return sentence && (ref.hash === undefined || sentence.hash === ref.hash) ? sentence : null
  }
  // 카드 종류마다 answer 의 꼴이 달라 칸을 느슨하게 읽는다(그리기 실패는 onError 로 알린다).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const card of data.cards as unknown as Array<Record<string, any>>) {
    let text: string | null = null
    let lead: string | null = null
    try {
      if (card.kind === "doc") {
        const items: SentenceItem[] = []
        for (const ref of card.answer.sentences ?? []) {
          for (const sentenceId of ref.ids as number[]) {
            const sentence = data.currentUnits.get(ref.unit)?.sentences[sentenceId]
            if (sentence) items.push({ group: ref.unit, id: sentence.i, text: sentence.text })
          }
        }
        let paragraphs = groupSentenceParagraphs(items)
        let headline: string | null = null
        if (conclusion) {
          const first = card.answer.first as Ref | undefined
          if (first && live(first)) {
            const at = items.findIndex((item) => item.group === first.unit && item.id === first.i)
            if (at > 0) {
              const groups: SentenceItem[][] = []
              let current: SentenceItem[] = []
              for (const item of items) {
                const previous = current.at(-1)
                if (previous && (previous.group !== item.group || item.id !== previous.id + 1)) {
                  groups.push(current)
                  current = []
                }
                current.push(item)
              }
              if (current.length > 0) groups.push(current)
              const rest = groups.map((group) => group.filter((item) => item !== items[at]).map((item) => item.text).join(" ")).filter(Boolean)
              paragraphs = [items[at].text, ...rest]
            }
          } else if (options.headline && card.answer.headline) {
            const basis = card.answer.headline.basis as Ref[]
            const sentences = basis.map(live)
            if (sentences.every(Boolean) && !sentences.some((sentence) => (paragraphs[0] ?? "").includes(sentence!.text))) headline = String(card.answer.headline.text).trim()
          }
        }
        if (headline) paragraphs = [headline, ...paragraphs]
        text = paragraphs.join("\n\n")
        lead = !headline && card.answer.lead && card.answer.lead !== "none" ? ((LEAD_TEXT as Record<string, string>)[card.answer.lead] ?? null) : null
      } else if (card.kind === "fixed") {
        text = "text" in card.answer ? card.answer.text : curatedLegacyText(card.answer.curatedRef)
      } else if (card.kind === "policy") {
        text = card.answer.text
      } else if (card.kind === "howto") {
        if (card.answer.guide) {
          const guide = findPublicGuide(card.answer.guide)
          text = guide ? formatCsFigmaGuideAnswer(guide) : null
        } else {
          const topic = symptomTopicById(card.answer.symptomTopic)
          text = topic ? (buildSymptomTopicAnswer(topic, { question: "" })?.answer ?? null) : buildVagueErrorAnswer().answer
        }
      } else if (card.kind === "gap") {
        const items: SentenceItem[] = []
        for (const related of (card.answer?.related ?? []).slice(0, 2)) {
          const sentence = data.currentUnits.get(related.unit)?.sentences[related.i]
          if (sentence) items.push({ group: related.unit, id: sentence.i, text: sentence.text })
        }
        text = [gapLeadLine(card.topic), items.length ? `${GAP_RELATED_INTRO}\n${groupSentenceParagraphs(items).join("\n")}` : null].filter(Boolean).join("\n\n")
      }
    } catch (error) {
      options.onError?.(String(card.id), error as Error)
    }
    if (!text) continue
    out.push({
      id: String(card.id),
      kind: String(card.kind),
      policyGoverned: card.kind === "policy" || (card.kind === "fixed" && card.policyGoverned === true),
      asks: card.kind === "gap" ? null : ((card.asks as string[] | undefined) ?? null),
      text,
      lead,
    })
  }
  return { cards: out, total: data.cards.length, excluded: data.excluded.length, problems: data.problems.length }
}
