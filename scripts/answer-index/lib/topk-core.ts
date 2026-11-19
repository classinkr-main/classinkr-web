/**
 * 라벨용 상위 카드 덤프(scripts/answer-index/topk.ts)의 본체.
 *
 * 질문마다 지금 색인의 상위 k 카드(id·종류·영역·주제·덮는 것·덮지 않는 것·답 글 앞 200자·점수·확신도), 없는 개념 적중으로 생기는
 * 공백 카드 후보, 지금 결정(kind·card·conf)을 낸다. 색인은 런타임(lib/chatbot/answer-index/index.ts getRouterAnswerIndex)과 같은
 * 경로로 만든다: loadAnswerIndexData({ dir, curatedTextHash }) → compileAnswerIndex. 결정은 decide 가 쓰는 decideWithAnalysis 그대로
 * (문턱 thresholdFor = calibration + CHATBOT_COMPILED_MIN_CONFIDENCE, 끈 카드 CHATBOT_COMPILED_DISABLED_CARDS)이고, 상위 k 는 그
 * 판정이 쓴 질문 전체 분석의 순위다.
 *
 * 런타임(service.ts planCompiledRoute)과 다른 점(알고 쓴다):
 * - 질문 글은 공백만 접는다. 서비스의 개인정보 가리기(redactPii)는 service.ts 안에 있어 하지 않는다.
 * - 옛 정규식 표(vote)는 collectLegacyVotes(질문, null, legacy-alias)로 센다. 서비스가 더하는 정해 둔 답 출처 이름
 *   (buildServiceQuickAnswer·정책 가드의 gateOriginal, 약한 상담 신호)은 service.ts 를 불러야 해서 넣지 않는다.
 * - 증상 신고 판별은 decide 기본값(normalize.ts INDEX_SYMPTOM_RE)이다. 서비스는 service.ts SYMPTOM_REPORT_RE 를 넘기므로
 *   못 찾음의 abstainReason(symptom·nodoc)이 드물게 다를 수 있다(kind·card 는 같다).
 * - 색인 앞 단계(인사·거절 답·관문 밖 정해 둔 답·영어 안내·강한 상담 연결·이미 해 봤다는 화난 문의)를 거치지 않고, 범위 관문
 *   (isCompiledScope)도 판정을 막지 않고 scope 칸으로만 적는다(범위 밖 질문도 상위 카드를 본다).
 * - top 은 질문 전체의 순위다. 두 조각으로 나뉘어 정해지면 결정 카드가 조각 순위에서 나올 수 있다(decision.segments 를 본다).
 * 네트워크·모델 호출 없음.
 */
import { resolve } from "node:path"

import { compileAnswerIndex, type CompiledAnswerIndex } from "@/lib/chatbot/answer-index/compile"
import { curatedLegacyText, curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { decideWithAnalysis, disabledCardIds } from "@/lib/chatbot/answer-index/decide"
import { collectLegacyVotes } from "@/lib/chatbot/answer-index/legacy-votes"
import { answerIndexDataDir, loadAnswerIndexData, type AnswerIndexLoadOptions, type LoadedAnswerIndexData } from "@/lib/chatbot/answer-index/load"
import { isCompiledScope } from "@/lib/chatbot/answer-index/scope"
import type { AnswerCard, AnswerCardKind, AnswerIndexDecisionKind, AnswerIndexUnit } from "@/lib/chatbot/answer-index/types"

export const TOPK_DEFAULT_K = 20
export const ANSWER_PREVIEW_CHARS = 200

type Env = Record<string, string | undefined>

export interface TopKQuestion {
  id: string
  q: string
}

export interface TopKCard {
  rank: number
  id: string
  kind: AnswerCardKind
  area: string
  topic: string
  covers: string | null
  notCovers: string[]
  /** 답 글 앞 200자(doc 는 고른 문장 글, curatedRef 는 옛 답 글, text 는 그대로, gap 은 "공개 안내에 없는 주제: <topic>"). */
  answerPreview: string
  /** 합성 점수. */
  s: number
  conf: number
}

export interface TopKAbsent {
  /** 없는 개념 id(absent.json). */
  id: string
  /** 질문에서 맞은 형태. */
  form: string
  label: string | null
  gapCard: string | null
  /** 그 공백 카드가 지금 판정에 쓰이는지(status 가 active 가 아니거나 낡아 색인에서 빠졌거나, CHATBOT_COMPILED_DISABLED_CARDS 로 껐으면 false). */
  inIndex: boolean
  topic: string | null
  answerPreview: string | null
}

export interface TopKRow {
  id: string
  q: string
  /** 런타임 범위 관문(§3.2 ⑤). out 이면 compiled 라우터에서는 색인이 정하지 않는다. */
  scope: "in" | "out"
  decision: {
    kind: AnswerIndexDecisionKind
    card: string | null
    conf: number
    partial: boolean
    absentHit: string | null
    absentTail: string | null
    abstainReason: string | null
    segments: { text: string; kind: AnswerIndexDecisionKind; card: string | null; conf: number }[] | null
  }
  /** 판정에 넣은 옛 정규식 표(카드 id). */
  votes: string[]
  top: TopKCard[]
  /** 공백 카드 후보(질문에 걸린 없는 개념). */
  absent: TopKAbsent[]
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

function preview(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return collapsed.length > ANSWER_PREVIEW_CHARS ? collapsed.slice(0, ANSWER_PREVIEW_CHARS) : collapsed
}

/** 카드 답 글 미리보기(앞 200자). 글을 만들 수 없으면(옛 답·주제 없음) 빈 글. */
export function cardAnswerPreview(card: AnswerCard, units: ReadonlyMap<string, AnswerIndexUnit>): string {
  switch (card.kind) {
    case "doc": {
      const texts: string[] = []
      for (const ref of card.answer.sentences ?? []) {
        const unit = units.get(ref.unit)
        for (const i of ref.ids ?? []) {
          const text = unit?.sentences[i]?.text
          if (text) texts.push(text)
        }
      }
      return preview(texts.join(" "))
    }
    case "fixed":
      return preview("curatedRef" in card.answer ? (curatedLegacyText(card.answer.curatedRef) ?? "") : card.answer.text)
    case "policy":
      return preview(card.answer.text)
    case "howto": {
      const topic = card.answer.symptomTopic ? curatedLegacyText({ module: "symptom", id: card.answer.symptomTopic }) : null
      const guide = card.answer.guide ? curatedLegacyText({ module: "guide", id: card.answer.guide }) : null
      return preview([topic, guide].filter((part): part is string => Boolean(part)).join(" "))
    }
    case "gap":
      return `공개 안내에 없는 주제: ${card.topic}`
    case "handoff":
      return `상담 연결(${card.answer.handoffKind})`
    default:
      return ""
  }
}

/** 자료 폴더: --data-dir(작업 폴더 기준) 또는 런타임과 같은 answerIndexDataDir()(ANSWER_INDEX_DATA_DIR, 없으면 data/answer-index). */
export function topKDataDir(dirArg?: string | null, env: Env = process.env) {
  const given = dirArg?.trim()
  return given ? resolve(process.cwd(), given) : answerIndexDataDir(env)
}

export interface TopKIndexOptions {
  /** 자료 폴더. */
  dir: string
  /** 시험용: 지금 문서 단위·증상 주제·가이드·옛 답 해시를 바꿔 끼운다. */
  load?: Omit<AnswerIndexLoadOptions, "dir">
}

/** 런타임과 같은 경로로 자료를 읽고 색인을 만든다. */
export function buildTopKIndex(options: TopKIndexOptions): { data: LoadedAnswerIndexData; index: CompiledAnswerIndex } {
  const data = loadAnswerIndexData({ curatedTextHash, ...options.load, dir: options.dir })
  return { data, index: compileAnswerIndex(data) }
}

export interface TopKOptions {
  k?: number
  /** 옛 정규식 표를 넣는지(기본 true). */
  votes?: boolean
  /** 환경변수(문턱 하한·끈 카드·범위 관문). 기본 process.env. */
  env?: Env
}

/** 질문 하나의 상위 k 카드·공백 후보·결정. */
export function topKForQuestion(index: CompiledAnswerIndex, question: TopKQuestion, options: TopKOptions = {}): TopKRow {
  const env = options.env ?? process.env
  const k = options.k ?? TOPK_DEFAULT_K
  const text = question.q.replace(/\s+/g, " ").trim()
  const votes = options.votes === false ? [] : collectLegacyVotes(text, null, index.legacyAlias)
  const { decision, analysis } = decideWithAnalysis(index, text, { votes, env })
  const { ranked, confs } = analysis.whole
  const disabled = disabledCardIds(env)

  const top: TopKCard[] = []
  for (let at = 0; at < ranked.length && top.length < k; at += 1) {
    const candidate = ranked[at]
    if (candidate.card < 0) continue
    const compiled = index.cards[candidate.card]
    const card = compiled.card
    top.push({
      rank: top.length + 1,
      id: compiled.id,
      kind: compiled.kind,
      area: compiled.area,
      topic: compiled.topic,
      covers: typeof card.covers === "string" ? card.covers : null,
      notCovers: Array.isArray(card.notCovers) ? card.notCovers : [],
      answerPreview: cardAnswerPreview(card, index.currentUnits),
      s: round3(candidate.s),
      conf: round3(confs[at] ?? 0),
    })
  }

  const absent: TopKAbsent[] = []
  const seen = new Set<string>()
  for (const match of analysis.whole.query.absent) {
    if (seen.has(match.id)) continue
    seen.add(match.id)
    const concept = index.absent.byId.get(match.id)
    const gapId = concept?.gapCard ?? null
    const gapIndex = gapId ? index.cardById.get(gapId) : undefined
    const gapCard = gapIndex !== undefined ? index.cards[gapIndex].card : null
    absent.push({
      id: match.id,
      form: match.form,
      label: concept?.label ?? null,
      gapCard: gapId,
      // decide 와 같은 기준: 색인에 있고 환경변수로 끄지 않은 공백 카드만 gap 으로 간다.
      inIndex: gapCard !== null && !disabled.has(gapCard.id),
      topic: gapCard?.topic ?? null,
      answerPreview: gapCard ? cardAnswerPreview(gapCard, index.currentUnits) : null,
    })
  }

  return {
    id: question.id,
    q: question.q,
    scope: isCompiledScope(text, env) ? "in" : "out",
    decision: {
      kind: decision.kind,
      card: decision.card,
      conf: round3(decision.conf),
      partial: Boolean(decision.partial),
      absentHit: decision.absentHit,
      absentTail: decision.absentTail,
      abstainReason: decision.abstainReason ?? null,
      segments: decision.segments ? decision.segments.map((segment) => ({ ...segment, conf: round3(segment.conf) })) : null,
    },
    votes,
    top,
    absent,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * 입력 질문 파일: [{ id, q }] 배열, 우주 샤드([{ id, q, p, m, label, … }]), 측정 입력([{ id, question }]),
 * 또는 그것을 담은 { items | questions | cases: [...] }(보정 묶음·평가셋 꼴). id·q(또는 question)가 없는 항목은 오류다.
 */
export function readTopKQuestions(raw: unknown): TopKQuestion[] {
  const container = isRecord(raw) ? raw : null
  const list = Array.isArray(raw) ? raw : [container?.items, container?.questions, container?.cases].find(Array.isArray)
  if (!Array.isArray(list)) throw new Error("질문 파일은 [{ id, q }] 배열(또는 { items | questions | cases: [...] })이어야 합니다.")
  const seen = new Set<string>()
  return list.map((item, index) => {
    const record = isRecord(item) ? item : {}
    const id = typeof record.id === "string" && record.id ? record.id : null
    const q = typeof record.q === "string" ? record.q : typeof record.question === "string" ? record.question : null
    if (!id || !q || !q.trim()) throw new Error(`질문 ${index + 1}번째에 id 와 q(또는 question)가 없습니다.`)
    if (seen.has(id)) throw new Error(`질문 id 가 겹칩니다: ${id}`)
    seen.add(id)
    return { id, q }
  })
}
