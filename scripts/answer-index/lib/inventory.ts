/**
 * 기존 정해 둔 답 목록(inventory.json) 만들기 — 답변 사항 점검(D3)의 입력. 런타임은 읽지 않는다.
 *
 * 대상(§7.1): quick-answers-field(field:*), quick-answers-basics(basics:*), 증상 주제(symptom:*, symptom-topics-field +
 * symptom-triage 기본 주제 + 대상 없는 오류 되묻기), service.ts 안 고정 답(svc:* — buildServiceQuickAnswer 의 답과
 * buildPolicyGuardResponse 의 관문 대상 답), 분류별·제목 틀 답(template:*), 자기소개(self:*), 공개 화면 가이드(guide:*).
 * 보안·범죄·토큰 낭비 거절 답, 영어 안내, 즉시 상담 연결 같은 compiled 앞단에 그대로 남는 답(§3.2 ①~④)은 넣지 않는다.
 *
 * 걸림 수는 질문 글 없이 숫자만 남긴다. 판별식은 모듈이 받는 글로 돌린다(field·basics: 소문자·공백 접기,
 * 증상: normalizeTriageText, 자기소개·가이드: 원문). svc 는 service.ts 조건식 가운데 정규식 부분만 계산한다(모르는 식이면 셈에서 뺌).
 */
import { join } from "node:path"
import { answerTextHash } from "@/lib/chatbot/answer-index/hash"
import {
  ANSWER_INDEX_AREAS,
  type AnswerIndexArea,
  type AnswerIndexInventoryFile,
  type InventoryEntry,
  type InventoryEvalSetInfo,
  type InventoryHitCounts,
  type InventoryModule,
} from "@/lib/chatbot/answer-index/types"
import type { DocArticle } from "@/lib/docs"
import { areaForAnswerId, areaForDocSection, areaForGuide, SELF_AREA } from "./areas"
import { loadRepoEvalSets, repoRoot, type QuestionSet, type RepoEvalSetKey } from "./common"
import { bigramSet, jaccard } from "./similarity"
import {
  ABSENCE_CLAIM_RE,
  findSafetyViolations,
  NO_PROMISE_RE,
  perishableKinds,
  screenNamesOf,
} from "./text-rules"
import {
  evaluateGuards,
  extractArrayEntrySources,
  extractPolicyGuardAnswers,
  extractServiceQuickAnswers,
  extractTemplateAnswers,
  parseModule,
} from "./ts-extract"

export const INVENTORY_SOURCE_FILES = {
  field: "lib/chatbot/quick-answers-field.ts",
  basics: "lib/chatbot/quick-answers-basics.ts",
  symptomField: "lib/chatbot/symptom-topics-field.ts",
  symptomBase: "lib/chatbot/symptom-triage.ts",
  service: "lib/chatbot/service.ts",
  self: "lib/chatbot/self-knowledge.ts",
  guidesCurated: "lib/cs-figma-guides.ts",
  guidesGenerated: "lib/cs-figma-guides.generated.ts",
} as const

export interface FailureLog {
  name: string
  sha: string
  records: { text: string; hijack: boolean }[]
}

export interface InventoryOptions {
  root?: string
  /** 저장소 밖 개발용 묶음(dev5·holdout1·371 등). 확정용 묶음은 넣지 않는다. */
  devSets?: QuestionSet[]
  failureLogs?: FailureLog[]
  /** false 면 걸림 수를 세지 않는다(verify 가 답 글 해시만 볼 때). */
  computeHits?: boolean
}

interface Matcher {
  /** 판별식에 걸리는지. 셀 수 없으면 null. */
  hit: (q: PreparedQuestion) => boolean | null
}

interface PreparedQuestion {
  raw: string
  lower: string
  triage: string
  /** 질문마다 한 번만 계산하는 모듈 판정(가이드는 키워드 점수로 고르므로 비싸다). */
  guideSlug: string | null
  vague: boolean
}

interface Draft extends Omit<InventoryEntry, "area" | "textHash" | "hits" | "wins" | "flags" | "nearDuplicates" | "screenNames" | "screenNamePeers" | "screenNamePeerCount" | "hijackMentions"> {
  area: AnswerIndexArea
  matcher: Matcher | null
  /** 실패 기록에서 찾을 이름(모듈 안 id, 정규식 상수 이름, 함수 이름). */
  mentionKeys: string[]
}

function lowerForMatch(question: string) {
  return question.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase()
}

function lineOfText(fileText: string, needle: string) {
  const index = fileText.indexOf(needle)
  return index < 0 ? 0 : fileText.slice(0, index).split("\n").length
}

function emptyCounts(dev: boolean): InventoryHitCounts {
  return { firstContact: 0, fresh: 0, golden: 0, csSymptom: 0, persona: 0, dev: dev ? 0 : null }
}

export async function buildInventory(options: InventoryOptions = {}): Promise<AnswerIndexInventoryFile> {
  const root = options.root ?? repoRoot()
  const [
    fieldModule,
    basicsModule,
    triageModule,
    symptomFieldModule,
    selfModule,
    guidesModule,
    docsModule,
  ] = await Promise.all([
    import("@/lib/chatbot/quick-answers-field"),
    import("@/lib/chatbot/quick-answers-basics"),
    import("@/lib/chatbot/symptom-triage"),
    import("@/lib/chatbot/symptom-topics-field"),
    import("@/lib/chatbot/self-knowledge"),
    import("@/lib/cs-figma-guides"),
    import("@/lib/docs"),
  ])
  const { readFileSync } = await import("node:fs")
  const read = (rel: string) => readFileSync(join(root, rel), "utf8")

  const docs: DocArticle[] = docsModule.listDocs()
  const docByPath = new Map(docs.map((doc) => [`/docs/${doc.category}/${doc.slug}`, doc]))
  const areaForPath = (path: string | null, heading: string | null): AnswerIndexArea | null => {
    if (!path) return null
    const doc = docByPath.get(path)
    if (!doc) return null
    const sectionIndex = heading ? doc.sections.findIndex((section) => section.heading === heading) : -1
    return areaForDocSection(doc.category, doc.slug, sectionIndex >= 0 ? sectionIndex : null, sectionIndex >= 0 ? heading : null)
  }

  const drafts: Draft[] = []

  // ── field ──
  const fieldSources = extractArrayEntrySources(parseModule(join(root, INVENTORY_SOURCE_FILES.field)), "FIELD_QUICK_ANSWERS")
  for (const entry of fieldModule.FIELD_QUICK_ANSWERS) {
    const source = fieldSources.get(entry.id)
    drafts.push({
      id: `field:${entry.id}`,
      module: "field",
      sourceId: entry.id,
      gateOriginal: `field:${entry.id}`,
      gateExempt: false,
      area: areaForAnswerId(entry.id, entry.category),
      category: entry.category,
      handoff: entry.handoff ?? null,
      docPath: null,
      docHeading: null,
      text: entry.answer.join("\n\n"),
      textAlternatives: [],
      suggestedQuestions: entry.suggestedQuestions,
      englishSummary: entry.en ?? null,
      match: { kind: "function", source: source?.matchSource ?? null, regexes: source?.regexes ?? [] },
      matcher: { hit: (q) => entry.match(q.lower) },
      sourceFile: INVENTORY_SOURCE_FILES.field,
      sourceLine: source?.line ?? 0,
      problems: source ? [] : ["match 원문을 찾지 못함"],
      mentionKeys: [entry.id],
    })
  }

  // ── basics ──
  const basicsSources = extractArrayEntrySources(parseModule(join(root, INVENTORY_SOURCE_FILES.basics)), "BASIC_QUICK_ANSWERS")
  for (const entry of basicsModule.BASIC_QUICK_ANSWERS) {
    const source = basicsSources.get(entry.id)
    const docArea = areaForPath(entry.docPath, entry.docHeading ?? null)
    drafts.push({
      id: `basics:${entry.id}`,
      module: "basics",
      sourceId: entry.id,
      gateOriginal: `basics:${entry.id}`,
      gateExempt: false,
      area: docArea ?? areaForAnswerId(entry.id.replace(/^basics-/, ""), entry.category),
      category: entry.category,
      handoff: entry.handoff ?? null,
      docPath: entry.docPath,
      docHeading: entry.docHeading ?? null,
      text: entry.answer.join("\n\n"),
      textAlternatives: [],
      suggestedQuestions: entry.suggestedQuestions,
      englishSummary: entry.en ?? null,
      match: { kind: "function", source: source?.matchSource ?? null, regexes: source?.regexes ?? [] },
      matcher: { hit: (q) => entry.match(q.lower) },
      sourceFile: INVENTORY_SOURCE_FILES.basics,
      sourceLine: source?.line ?? 0,
      problems: [
        ...(source ? [] : ["match 원문을 찾지 못함"]),
        ...(entry.docPath && !docByPath.has(entry.docPath) ? [`근거 문서 없음: ${entry.docPath}`] : []),
      ],
      mentionKeys: [entry.id],
    })
  }

  // ── 증상 주제 ──
  const symptomFieldIds = new Set(symptomFieldModule.FIELD_SYMPTOM_TOPICS.map((topic) => topic.id))
  const symptomFieldText = read(INVENTORY_SOURCE_FILES.symptomField)
  const symptomBaseText = read(INVENTORY_SOURCE_FILES.symptomBase)
  for (const topic of triageModule.SYMPTOM_TOPICS) {
    const built = triageModule.buildSymptomTopicAnswer(topic, { question: "" })
    const variantTexts = (topic.variants ?? [])
      .map((variant) =>
        triageModule.buildSymptomTopicAnswer(
          { ...topic, doc: variant.doc ?? topic.doc, steps: variant.steps, intro: variant.intro ?? topic.intro, heading: variant.heading, variants: undefined },
          { question: "" }
        )?.answer ?? null
      )
      .filter((text): text is string => Boolean(text))
    const conditionalBranches = (topic.branches ?? [])
      .filter((branch): branch is { text: string; when?: RegExp; unless?: RegExp } => typeof branch !== "string" && Boolean(branch.when))
      .map((branch) => branch.text)
    const docPath = `/docs/${topic.doc.category}/${topic.doc.slug}`
    const heading = topic.heading ?? topic.steps[0]?.heading ?? null
    const isField = symptomFieldIds.has(topic.id)
    const fileText = isField ? symptomFieldText : symptomBaseText
    const regexes = [
      topic.subject.toString(),
      ...(topic.exclude ? [topic.exclude.toString()] : []),
      ...(topic.symptom ? [topic.symptom.toString()] : []),
      ...(topic.variants ?? []).map((variant) => variant.when.toString()),
    ]
    drafts.push({
      id: `symptom:${topic.id}`,
      module: "symptom",
      sourceId: topic.id,
      gateOriginal: `symptom:${topic.id}`,
      gateExempt: false,
      area: areaForPath(docPath, heading) ?? areaForAnswerId(topic.id, topic.category),
      category: topic.category,
      handoff: topic.handoff ? "support" : null,
      docPath,
      docHeading: heading,
      text: built?.answer ?? "",
      textAlternatives: Array.from(new Set([...variantTexts, ...conditionalBranches])),
      suggestedQuestions: topic.suggestedQuestions,
      englishSummary: topic.en ?? null,
      match: {
        kind: "regex",
        source: [
          `subject: ${topic.subject.toString()}`,
          topic.exclude ? `exclude: ${topic.exclude.toString()}` : null,
          topic.symptom ? `symptom: ${topic.symptom.toString()}` : null,
          topic.requireSymptom === false ? "requireSymptom: false" : null,
          topic.howto ? "howto: true" : null,
        ]
          .filter(Boolean)
          .join("; "),
        regexes,
      },
      matcher: {
        hit: (q) => topic.subject.test(q.triage) && !(topic.exclude?.test(q.triage) ?? false),
      },
      sourceFile: isField ? INVENTORY_SOURCE_FILES.symptomField : INVENTORY_SOURCE_FILES.symptomBase,
      sourceLine: lineOfText(fileText, `id: "${topic.id}"`),
      problems: built ? [] : ["답을 만들 수 없음(문서·절을 찾지 못함)"],
      mentionKeys: [topic.id],
    })
  }
  {
    const vague = triageModule.buildVagueErrorAnswer()
    const compact = triageModule.buildVagueErrorAnswer({ compact: true })
    drafts.push({
      id: "symptom:vague-error",
      module: "symptom",
      sourceId: "vague-error",
      gateOriginal: "symptom:vague-error",
      gateExempt: false,
      area: "support",
      category: vague.category,
      handoff: null,
      docPath: null,
      docHeading: null,
      text: vague.answer,
      textAlternatives: compact.answer !== vague.answer ? [compact.answer] : [],
      suggestedQuestions: vague.suggestedQuestions,
      englishSummary: vague.englishSummary ?? null,
      match: { kind: "function", source: "isVagueErrorQuestion(question)", regexes: [] },
      matcher: { hit: (q) => q.vague },
      sourceFile: INVENTORY_SOURCE_FILES.symptomBase,
      sourceLine: lineOfText(symptomBaseText, "export function buildVagueErrorAnswer"),
      problems: [],
      mentionKeys: ["vague-error", "buildVagueErrorAnswer"],
    })
  }

  // ── service.ts ──
  const serviceModule = parseModule(join(root, INVENTORY_SOURCE_FILES.service))
  for (const entry of [...extractServiceQuickAnswers(serviceModule), ...extractPolicyGuardAnswers(serviceModule)]) {
    drafts.push({
      id: `svc:${entry.name}`,
      module: "svc",
      sourceId: entry.name,
      gateOriginal: entry.gateOriginal,
      gateExempt: entry.gateExempt,
      area: areaForAnswerId(entry.name, entry.category),
      category: entry.category,
      handoff: entry.handoff,
      docPath: null,
      docHeading: null,
      text: entry.text,
      textAlternatives: entry.alternatives,
      suggestedQuestions: entry.suggestedQuestions,
      englishSummary: entry.englishSummary,
      match: { kind: "condition", source: entry.conditionSource, regexes: entry.regexes },
      matcher: { hit: (q) => evaluateGuards(entry.guards, serviceModule, q.lower) },
      sourceFile: INVENTORY_SOURCE_FILES.service,
      sourceLine: entry.line,
      problems: entry.text.includes("{") ? ["질문에 따라 바뀌는 식이 글에 남음({…})"] : [],
      mentionKeys: [...entry.regexNames, ...(entry.gateOriginal && entry.gateOriginal !== "service" ? [entry.gateOriginal] : [])],
    })
  }
  const templates = extractTemplateAnswers(serviceModule)
  const keyCounts = new Map<string, number>()
  for (const entry of templates) keyCounts.set(entry.key, (keyCounts.get(entry.key) ?? 0) + 1)
  for (const entry of templates) {
    const unique = (keyCounts.get(entry.key) ?? 0) === 1
    const id = unique ? `template:${entry.key}` : `template:${entry.key}#${entry.fnName}`
    const docArea =
      entry.keyKind === "path"
        ? areaForPath(entry.key, null)
        : (() => {
            for (const doc of docs) {
              const index = doc.sections.findIndex((section) => section.heading === entry.key)
              if (index >= 0) return areaForDocSection(doc.category, doc.slug, index, entry.key)
            }
            return null
          })()
    drafts.push({
      id,
      module: "template",
      sourceId: unique ? entry.key : `${entry.key}#${entry.fnName}`,
      gateOriginal: entry.keyKind === "heading" ? `template:${entry.key}` : null,
      gateExempt: false,
      area: docArea ?? areaForAnswerId(entry.fnName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(), null),
      category: null,
      handoff: null,
      docPath: entry.keyKind === "path" ? entry.key : null,
      docHeading: entry.keyKind === "heading" ? entry.key : null,
      text: entry.text,
      textAlternatives: entry.alternatives,
      suggestedQuestions: [],
      englishSummary: null,
      match: { kind: "search-heading", source: entry.conditionSource, regexes: entry.regexes },
      matcher: null,
      sourceFile: INVENTORY_SOURCE_FILES.service,
      sourceLine: entry.line,
      problems: entry.text.includes("{") ? ["질문에 따라 바뀌는 식이 글에 남음({…})"] : [],
      mentionKeys: [entry.fnName],
    })
  }

  // ── 자기소개 ──
  const selfText = read(INVENTORY_SOURCE_FILES.self)
  const selfSeen = new Map<string, number>()
  for (const entry of selfModule.CHATBOT_SELF_KNOWLEDGE_ENTRIES) {
    const count = (selfSeen.get(entry.key) ?? 0) + 1
    selfSeen.set(entry.key, count)
    const sourceId = count === 1 ? entry.key : `${entry.key}-${count}`
    const exempt = entry.key === "model_boundary" || selfModule.CONVERSATIONAL_SELF_KNOWLEDGE_KEYS.has(entry.key)
    drafts.push({
      id: `self:${sourceId}`,
      module: "self",
      sourceId,
      gateOriginal: entry.key === "model_boundary" ? null : `self:${entry.key}`,
      gateExempt: exempt,
      area: SELF_AREA[entry.key] ?? "support",
      category: null,
      handoff: null,
      docPath: null,
      docHeading: null,
      text: entry.answer.join("\n\n"),
      textAlternatives: [],
      suggestedQuestions: entry.suggestedQuestions,
      englishSummary: null,
      match: { kind: "regex", source: entry.match.toString(), regexes: [entry.match.toString()] },
      matcher: { hit: (q) => entry.match.test(q.raw) },
      sourceFile: INVENTORY_SOURCE_FILES.self,
      sourceLine: lineOfText(selfText, `key: "${entry.key}"`),
      problems: [],
      mentionKeys: [entry.key],
    })
  }

  // ── 공개 화면 가이드 ──
  const curatedGuideText = read(INVENTORY_SOURCE_FILES.guidesCurated)
  const generatedGuideText = read(INVENTORY_SOURCE_FILES.guidesGenerated)
  for (const guide of guidesModule.CS_FIGMA_GUIDES) {
    if (guidesModule.INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(guide.docSlug)) continue
    const needle = `slug: "${guide.slug}"`
    const inCurated = curatedGuideText.includes(needle)
    drafts.push({
      id: `guide:${guide.slug}`,
      module: "guide",
      sourceId: guide.slug,
      gateOriginal: `guide:${guide.slug}`,
      gateExempt: false,
      area: areaForGuide(guide.title, guide.category),
      category: guide.category,
      handoff: null,
      docPath: guidesModule.getCsFigmaGuideDocPath(guide),
      docHeading: null,
      text: guidesModule.formatCsFigmaGuideAnswer(guide),
      textAlternatives: [],
      suggestedQuestions: guidesModule.buildCsFigmaGuideSuggestedQuestions(guide),
      englishSummary: null,
      match: { kind: "keywords", source: guide.keywords.join(", "), regexes: [] },
      matcher: { hit: (q) => q.guideSlug === guide.slug },
      sourceFile: inCurated ? INVENTORY_SOURCE_FILES.guidesCurated : INVENTORY_SOURCE_FILES.guidesGenerated,
      sourceLine: lineOfText(inCurated ? curatedGuideText : generatedGuideText, needle),
      problems: [],
      mentionKeys: [guide.slug],
    })
  }

  // ── 걸림 수·뽑힘 수 ──
  const computeHits = options.computeHits !== false
  const repoSets = computeHits ? loadRepoEvalSets(root) : []
  const devSets = options.devSets ?? []
  const hasDev = devSets.length > 0
  const hits = new Map<string, InventoryHitCounts>()
  const wins = new Map<string, InventoryHitCounts>()
  const evalSets: InventoryEvalSetInfo[] = []
  if (computeHits) {
    for (const draft of drafts) {
      if (draft.matcher) {
        hits.set(draft.id, emptyCounts(hasDev))
        wins.set(draft.id, emptyCounts(hasDev))
      }
    }
    const tally = (key: RepoEvalSetKey | "dev", questions: string[]) => {
      for (const raw of questions) {
        const q: PreparedQuestion = {
          raw,
          lower: lowerForMatch(raw),
          triage: triageModule.normalizeTriageText(raw),
          guideSlug: guidesModule.findCsFigmaGuideForQuestion(raw)?.slug ?? null,
          vague: triageModule.isVagueErrorQuestion(raw),
        }
        for (const draft of drafts) {
          if (!draft.matcher) continue
          if (draft.matcher.hit(q) === true) {
            const counts = hits.get(draft.id)!
            counts[key] = (counts[key] ?? 0) + 1
          }
        }
        const field = fieldModule.findFieldQuickAnswer(q.lower)
        const basics = basicsModule.findBasicQuickAnswers(q.lower)[0]
        const symptom = triageModule.findSymptomTopic(raw)
        const self = selfModule.findChatbotSelfKnowledgeEntry(raw)
        const winners = [
          field ? `field:${field.id}` : null,
          basics ? `basics:${basics.id}` : null,
          symptom ? `symptom:${symptom.id}` : null,
          self ? `self:${self.key}` : null,
          q.guideSlug ? `guide:${q.guideSlug}` : null,
          q.vague ? "symptom:vague-error" : null,
        ]
        for (const winner of winners) {
          if (!winner) continue
          const counts = wins.get(winner)
          if (counts) counts[key] = (counts[key] ?? 0) + 1
        }
      }
    }
    for (const { key, set } of repoSets) {
      tally(key, set.questions)
      evalSets.push({ key, name: set.name, questions: set.questions.length, sha: set.sha })
    }
    for (const set of devSets) {
      tally("dev", set.questions)
      evalSets.push({ key: "dev", name: set.name, questions: set.questions.length, sha: set.sha })
    }
  }

  // ── 비슷한 답 쌍·화면 이름 ──
  const prepared = drafts.map((draft) => {
    const collapsed = draft.text.replace(/\s+/g, " ").trim()
    return { id: draft.id, head: collapsed.slice(0, 40), grams: bigramSet(collapsed), screen: screenNamesOf(draft.text) }
  })
  const near = new Map<string, string[]>(drafts.map((draft) => [draft.id, []]))
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i]
      const b = prepared[j]
      if (!a.head || !b.head) continue
      const sizeRatio = Math.min(a.grams.size, b.grams.size) / Math.max(a.grams.size, b.grams.size, 1)
      if (a.head === b.head || (sizeRatio >= 0.8 && jaccard(a.grams, b.grams) >= 0.8)) {
        near.get(a.id)!.push(b.id)
        near.get(b.id)!.push(a.id)
      }
    }
  }
  const byScreenName = new Map<string, number[]>()
  prepared.forEach((item, index) => {
    for (const name of item.screen) {
      const list = byScreenName.get(name) ?? []
      list.push(index)
      byScreenName.set(name, list)
    }
  })
  const peerCounts = prepared.map(() => new Map<number, number>())
  for (const list of byScreenName.values()) {
    for (const a of list) for (const b of list) if (a !== b) peerCounts[a].set(b, (peerCounts[a].get(b) ?? 0) + 1)
  }

  // ── 실패 기록 ──
  const failureLogs = options.failureLogs ?? null
  const mentionCount = (keys: string[]) => {
    if (!failureLogs) return null
    let count = 0
    const patterns = keys.filter((key) => key.length >= 4).map((key) => new RegExp(`(?<![A-Za-z0-9_-])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_-])`))
    for (const log of failureLogs) for (const record of log.records) if (record.hijack && patterns.some((pattern) => pattern.test(record.text))) count += 1
    return count
  }

  const entries: InventoryEntry[] = drafts.map((draft, index) => {
    const peers = Array.from(peerCounts[index].entries())
      .filter(([, shared]) => shared >= 2)
      .map(([peer]) => drafts[peer].id)
      .sort()
    const allText = [draft.text, ...draft.textAlternatives].join("\n")
    return {
      id: draft.id,
      module: draft.module,
      sourceId: draft.sourceId,
      gateOriginal: draft.gateOriginal,
      gateExempt: draft.gateExempt,
      area: draft.area,
      category: draft.category,
      handoff: draft.handoff,
      docPath: draft.docPath,
      docHeading: draft.docHeading,
      text: draft.text,
      textHash: answerTextHash(draft.text),
      textAlternatives: draft.textAlternatives,
      suggestedQuestions: draft.suggestedQuestions,
      englishSummary: draft.englishSummary,
      match: draft.match,
      hits: hits.get(draft.id) ?? null,
      wins: wins.get(draft.id) ?? null,
      flags: {
        perishable: perishableKinds(allText),
        absenceClaim: ABSENCE_CLAIM_RE.test(allText),
        noPromise: NO_PROMISE_RE.test(allText),
        safety: findSafetyViolations(allText).map((rule) => rule.key),
      },
      nearDuplicates: near.get(draft.id) ?? [],
      screenNames: prepared[index].screen,
      screenNamePeers: peers.slice(0, 50),
      screenNamePeerCount: peers.length,
      hijackMentions: mentionCount(draft.mentionKeys),
      sourceFile: draft.sourceFile,
      sourceLine: draft.sourceLine,
      problems: draft.problems,
    }
  })

  const ids = new Set<string>()
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`inventory id 중복: ${entry.id}`)
    ids.add(entry.id)
  }

  const byModule = { field: 0, basics: 0, symptom: 0, svc: 0, template: 0, self: 0, guide: 0 } as Record<InventoryModule, number>
  const byArea = Object.fromEntries(ANSWER_INDEX_AREAS.map((area) => [area, 0])) as Record<AnswerIndexArea, number>
  for (const entry of entries) {
    byModule[entry.module] += 1
    byArea[entry.area] += 1
  }
  const { sha16 } = await import("@/lib/chatbot/answer-index/hash")
  return {
    version: `inventory-${sha16(JSON.stringify(entries.map((entry) => [entry.id, entry.textHash]))).slice(0, 12)}`,
    counts: { entries: entries.length, byModule, byArea },
    evalSets,
    failureLogs: failureLogs ? failureLogs.map((log) => ({ name: log.name, records: log.records.length, sha: log.sha })) : null,
    entries,
  }
}

/** 실패 기록 파일(JSON 배열: rootCause·whereInCode·fixHint 를 본다). 질문·답 글은 읽어 들이지 않는다. */
export function loadFailureLog(name: string, sha: string, parsed: unknown): FailureLog {
  const list = Array.isArray(parsed) ? parsed : []
  return {
    name,
    sha,
    records: list.map((record) => {
      const r = (record ?? {}) as Record<string, unknown>
      const text = [r.rootCause, r.whereInCode, r.fixHint].filter((value) => typeof value === "string").join(" ")
      return { text, hijack: /hijack|가로채|가로챈|가로챔|gate_missed/.test(text) }
    }),
  }
}
