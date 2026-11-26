/**
 * 답 글 문체 점검(R2 B1): 첫 줄 결론 규칙·줄바꿈 0 비율·긴 줄·경로 붙음·목록 섞임·끝맺음 두 줄·말투 혼재·표기 흔들림을 센다.
 * 글을 고치지 않고 판정만 한다. 모델·네트워크·데이터베이스를 부르지 않는다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/style-audit.ts [--cards] [--shape] [--no-conclusion] [--answers <결과.jsonl|목록.json>]... [--data-dir <자료 폴더>] [--out <요약.json>] [--examples N] [--shape-report <파일.json>]
 *
 * - --shape: 카드 답을 respond.ts 와 같은 순서(리드 붙이기 → shape.ts 다듬기)로 그려 점검한다(없으면 다듬지 않은 글). 다듬을 때는 글자 보존도 같이 검사한다:
 *   공백·줄바꿈·표기 기호·목록 표시를 뺀 글자열이 전후로 같아야 한다(뺀 빈 리드·겹친 끝맺음은 목록으로 따로 대조). 어긋난 카드는 --shape-report 로 쓴다.
 * - --no-conclusion: doc 카드의 first(결론 문장)를 쓰지 않고 그린다(전후 비교용). 기본은 쓴다(런타임 respond.ts 와 같다).
 * - --headline: doc 카드의 headline(결론 한 줄)을 그린다(런타임 CHATBOT_COMPILED_HEADLINE=on 과 같다 — 근거가 첫 문단에 있으면 그리지 않는다). 기본은 끔.
 * - 다듬을 때 사람이 쓴 글(policy·fixed)·공백 답은 끝맺음을 지우지 않는다(shapeOptionsFor). 지운 끝맺음은 끝맺음 틀 줄이어야 하고(아니면 removedNonTemplate),
 *   글자 보존 대조는 틀 줄·빈 리드만 빼고 한다.
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
import { contentSignature, findWidgetBreaks, isClosingTemplate, shapeAnswer, shapeOptionsFor } from "../../lib/chatbot/answer-index/shape"

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
  /** 점검한 글(--list 가 보여 준다). */
  text?: string
}

interface ShapeReport {
  cards: number
  changed: number
  reverted: string[]
  /** 글자 보존이 어긋난 카드(전후 글자열이 다름 — 지운 줄은 빈 리드·끝맺음 틀 줄만 빼고 대조한다). */
  mismatched: { id: string; kind: string }[]
  /** 위젯이 깨뜨려 그리는 덩이가 있는 카드(번호 줄이 다른 줄과 섞임). */
  widgetBroken: { id: string; kind: string }[]
  /** 다듬기 전 글에서 같은 판정으로 센 카드 수(비교용). */
  widgetBrokenBefore: number
  removedLeads: Record<string, number>
  removedClosings: { id: string; text: string }[]
  /** 끝맺음 틀(CLOSING_TEMPLATE_LINES)이 아닌데 지운 줄 — 0 이어야 한다(R2 검토 회귀-3). */
  removedNonTemplate: { id: string; text: string }[]
}

async function auditCards(dir: string | undefined, shape: boolean, report: ShapeReport, conclusion: boolean, headline: boolean): Promise<Audited[]> {
  const { renderCardTexts } = await import("./lib/card-texts")
  const rendered = await renderCardTexts({ dir, conclusion, headline, onError: (id, error) => console.error(`그리기 실패 ${id}: ${error.message}`) })
  console.error(`카드 ${rendered.total}(뺀 카드 ${rendered.excluded}) · 읽기 문제 ${rendered.problems}`)
  const out: Audited[] = []
  for (const card of rendered.cards) {
    // respond.ts 와 같은 순서: 리드를 첫 문단 앞에 붙인 뒤(다듬을 때는) shape 를 건다. 사람이 쓴 글·공백 답은 끝맺음을 지우지 않는다.
    const composed = card.lead ? `${card.lead} ${card.text}` : card.text
    let final = composed
    if (shape) {
      const result = shapeAnswer(composed, shapeOptionsFor(card.policyGoverned ? "policy" : card.kind))
      final = result.text
      report.cards += 1
      if (final !== composed) report.changed += 1
      if (result.reverted) report.reverted.push(card.id)
      for (const removed of result.removedLeads) report.removedLeads[removed] = (report.removedLeads[removed] ?? 0) + 1
      for (const removed of result.removedClosings) {
        report.removedClosings.push({ id: card.id, text: removed })
        if (!isClosingTemplate(removed)) report.removedNonTemplate.push({ id: card.id, text: removed })
      }
      let expected = contentSignature(composed)
      for (const removed of [...result.removedLeads, ...result.removedClosings.filter(isClosingTemplate)]) expected = expected.replace(contentSignature(removed), "")
      if (findWidgetBreaks(composed).length > 0) report.widgetBrokenBefore += 1
      if (findWidgetBreaks(final).length > 0) report.widgetBroken.push({ id: card.id, kind: card.kind })
      if (!result.reverted && expected !== contentSignature(final)) report.mismatched.push({ id: card.id, kind: card.kind })
    }
    out.push({ kind: card.kind, id: card.id, text: final, record: analyzeStyle({ text: final, asks: card.asks }) })
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
  const shape = hasFlag(argv, "--shape")
  const shapeReport: ShapeReport = { cards: 0, changed: 0, reverted: [], mismatched: [], widgetBroken: [], widgetBrokenBefore: 0, removedLeads: {}, removedClosings: [], removedNonTemplate: [] }
  const dirArg = argValues(argv, "--data-dir")[0]
  const result: Record<string, unknown> = {}
  const report = (title: string, items: Audited[]) => {
    const summary = groupSummary(items)
    result[title] = summary
    printSummary(title, summary)
    const listFlag = argValues(argv, "--list")[0]
    if (listFlag) {
      const [flag, kind] = listFlag.split(":")
      for (const item of items) {
        if (kind && item.kind !== kind) continue
        const record = item.record as unknown as Record<string, unknown>
        const hit =
          flag === "firstLine"
            ? item.record.firstLine !== "conclusion"
            : flag === "closingTwoPlus"
              ? item.record.closingLines >= 2
              : Boolean(record[flag]) && record[flag] !== 0
        if (hit) console.log(`--- [${item.kind}] ${item.id} ${flag}\n${(item.text ?? "").slice(0, 600)}`)
      }
    }
    if (examples > 0) {
      const shown: Record<string, number> = {}
      for (const item of items) {
        if (item.record.firstLine === "conclusion") continue
        shown[item.kind] = (shown[item.kind] ?? 0) + 1
        if (shown[item.kind] <= examples) console.log(`  [${item.kind}] ${item.id} ${item.record.firstLine}: ${item.record.firstSentence.slice(0, 70)}`)
      }
    }
  }
  if (wantCards) report("cards", await auditCards(dirArg ? resolve(process.cwd(), dirArg) : undefined, shape, shapeReport, !hasFlag(argv, "--no-conclusion"), hasFlag(argv, "--headline")))
  if (wantCards && shape) {
    console.log(
      `shape: 카드 ${shapeReport.cards} · 바뀐 카드 ${shapeReport.changed} · 안전 규칙으로 되돌림 ${shapeReport.reverted.length} · 글자 보존 어긋남 ${shapeReport.mismatched.length} · 위젯이 깨뜨려 그릴 덩이 ${shapeReport.widgetBroken.length}(다듬기 전 ${shapeReport.widgetBrokenBefore}장) · 뺀 빈 리드 ${Object.values(shapeReport.removedLeads).reduce((a, b) => a + b, 0)} · 뺀 끝맺음 ${shapeReport.removedClosings.length}(틀 아닌 줄 ${shapeReport.removedNonTemplate.length})`
    )
    const reportPath = argValues(argv, "--shape-report")[0]
    if (reportPath) {
      mkdirSync(dirname(resolve(process.cwd(), reportPath)), { recursive: true })
      writeFileSync(resolve(process.cwd(), reportPath), `${JSON.stringify(shapeReport, null, 2)}\n`)
    }
  }
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
