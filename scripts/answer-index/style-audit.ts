/**
 * 답 글 문체 점검(R2 B1): 첫 줄 결론 규칙·줄바꿈 0 비율·긴 줄·경로 붙음·목록 섞임·끝맺음 두 줄·말투 혼재·표기 흔들림을 센다.
 * 글을 고치지 않고 판정만 한다. 모델·네트워크·데이터베이스를 부르지 않는다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/style-audit.ts [--cards] [--answers <결과.jsonl|목록.json>]... [--data-dir <자료 폴더>] [--out <요약.json>] [--examples N]
 *
 * - --cards: 자료 폴더(--data-dir > ANSWER_INDEX_DATA_DIR > data/answer-index)의 모든 카드를 답으로 그려 점검한다(종류별 요약).
 *   doc 카드는 문장 묶기·리드를 런타임과 같은 함수로 그린다. 상담 안내·끝맺음은 카드 밖(respond.ts)이라 여기에는 없다.
 * - --answers: 실제 답. chatbot-live-eval 결과 줄({answer, decidedBy})이나 [{text|answer, kind?}] 배열. 종류는 decidedBy 앞 토큰이다.
 *   파일마다 따로 요약한다(이름은 파일 이름).
 * - --examples N: 첫 줄 규칙을 못 지킨 글을 종류마다 N 개까지 화면에 보여 준다(기본 0). 요약 JSON 에는 글을 싣지 않는다.
 * - 판정 정의: scripts/answer-index/lib/style-audit-core.ts.
 */
import Module from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { argValues, hasFlag } from "./lib/common"
import { analyzeStyle, summarizeStyle, type StyleRecord } from "./lib/style-audit-core"

// server-only 가 걸린 모듈을 CLI 에서 불러오기 위한 가림(scripts/chatbot-live-eval.ts 와 같은 방식).
type RequireFn = (this: unknown, id: string) => unknown
const moduleProto = (Module as unknown as { prototype: { require: RequireFn } }).prototype
const originalRequire = moduleProto.require
moduleProto.require = function (this: unknown, id: string) {
  if (id === "server-only") return {}
  return originalRequire.call(this, id)
}

function usage(message?: string): never {
  if (message) console.error(message)
  console.error("사용법: npx tsx scripts/answer-index/style-audit.ts [--cards] [--answers <파일>]... [--data-dir <폴더>] [--out <요약.json>] [--examples N]")
  process.exit(2)
}

interface Audited {
  kind: string
  id: string
  record: StyleRecord
}

type SentenceItem = { group: string; id: number; text: string }

async function auditCards(dir: string | undefined): Promise<Audited[]> {
  const { loadAnswerIndexData, answerIndexDataDir } = await import("@/lib/chatbot/answer-index/load")
  const { curatedLegacyText, curatedTextHash, symptomTopicById, findPublicGuide } = await import("@/lib/chatbot/answer-index/curated")
  const { groupSentenceParagraphs } = await import("@/lib/chatbot/answer-index/paragraphs")
  const { LEAD_TEXT, gapLeadLine, GAP_RELATED_INTRO } = await import("@/lib/chatbot/answer-index/respond")
  const { buildSymptomTopicAnswer, buildVagueErrorAnswer } = await import("@/lib/chatbot/symptom-triage")
  const { formatCsFigmaGuideAnswer } = await import("@/lib/cs-figma-guides")
  const data = loadAnswerIndexData({ curatedTextHash, dir: dir ?? answerIndexDataDir(process.env) })
  console.error(`카드 ${data.cards.length}(뺀 카드 ${data.excluded.length}) · 읽기 문제 ${data.problems.length}`)
  const out: Audited[] = []
  // 카드 종류마다 answer 의 꼴이 달라 칸을 느슨하게 읽는다(그리기 실패는 아래에서 잡는다).
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
        text = groupSentenceParagraphs(items).join("\n\n")
        lead = card.answer.lead && card.answer.lead !== "none" ? ((LEAD_TEXT as Record<string, string>)[card.answer.lead] ?? null) : null
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
      console.error(`그리기 실패 ${card.id}: ${(error as Error).message}`)
    }
    if (!text) continue
    out.push({ kind: card.kind, id: card.id, record: analyzeStyle({ text, lead, asks: card.kind === "gap" ? null : card.asks }) })
  }
  return out
}

function auditAnswers(path: string): Audited[] {
  const raw = readFileSync(resolve(process.cwd(), path), "utf8")
  const rows: Array<Record<string, unknown>> = path.endsWith(".jsonl")
    ? raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
    : (JSON.parse(raw) as Array<Record<string, unknown>>)
  const out: Audited[] = []
  rows.forEach((row, index) => {
    const text = typeof row.answer === "string" ? row.answer : typeof row.text === "string" ? row.text : null
    if (!text) return
    const decidedBy = typeof row.decidedBy === "string" ? row.decidedBy.split(":")[0] : typeof row.kind === "string" ? row.kind : "answer"
    out.push({ kind: decidedBy, id: typeof row.id === "string" ? row.id : String(index), record: analyzeStyle({ text }) })
  })
  return out
}

function groupSummary(items: Audited[]) {
  const byKind: Record<string, Audited[]> = { ALL: items }
  for (const item of items) (byKind[item.kind] ??= []).push(item)
  return Object.fromEntries(Object.entries(byKind).map(([kind, list]) => [kind, summarizeStyle(list.map((item) => item.record))]))
}

function printSummary(title: string, summary: ReturnType<typeof groupSummary>) {
  console.log(`## ${title}`)
  for (const [kind, s] of Object.entries(summary)) {
    const firstLine = Object.entries(s.firstLine)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ")
    console.log(
      `${kind.padEnd(10)} n=${s.n} · 첫 줄 결론 ${s.firstLineConclusionRatio}% (${firstLine}) · 줄바꿈 0 ${s.noNewline} (${s.noNewlineRatio}%) · 한 줄>120자 ${s.longLine120} · >60자 ${s.longLine60}` +
        ` · 경로 붙음 ${s.pathStuck} · 목록 섞임 ${s.listMix} · 번호 항목 3문장+ ${s.longNumberedItem} · 끝맺음 2줄+ ${s.closingTwoPlus} · 니다/요 혼재 ${s.toneMixed}` +
        ` · 길이 중앙 ${s.chars.median}/p90 ${s.chars.p90}`
    )
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const answerFiles = argValues(argv, "--answers")
  const wantCards = hasFlag(argv, "--cards")
  if (!wantCards && answerFiles.length === 0) usage("--cards 나 --answers 가 필요합니다.")
  const examples = Number(argValues(argv, "--examples")[0] ?? 0)
  const dirArg = argValues(argv, "--data-dir")[0]
  const result: Record<string, unknown> = {}
  const report = (title: string, items: Audited[]) => {
    const summary = groupSummary(items)
    result[title] = summary
    printSummary(title, summary)
    if (examples > 0) {
      const shown: Record<string, number> = {}
      for (const item of items) {
        if (item.record.firstLine === "conclusion") continue
        shown[item.kind] = (shown[item.kind] ?? 0) + 1
        if (shown[item.kind] <= examples) console.log(`  [${item.kind}] ${item.id} ${item.record.firstLine}: ${item.record.firstSentence.slice(0, 70)}`)
      }
    }
  }
  if (wantCards) report("cards", await auditCards(dirArg ? resolve(process.cwd(), dirArg) : undefined))
  for (const file of answerFiles) report(`answers:${basename(file)}`, auditAnswers(file))
  const out = argValues(argv, "--out")[0]
  if (out) {
    mkdirSync(dirname(resolve(process.cwd(), out)), { recursive: true })
    writeFileSync(resolve(process.cwd(), out), `${JSON.stringify(result, null, 2)}\n`)
    console.error(`요약: ${resolve(process.cwd(), out)}`)
  }
}

main().catch((error) => {
  console.error("문체 점검 실패:", error)
  process.exit(1)
})
