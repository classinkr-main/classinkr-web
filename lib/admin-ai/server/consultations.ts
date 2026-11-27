// 갈매봇 "상담 내역 찾기" — 화면·채널과 무관한 함수 findConsultations(question, deps, options).
//
// 매니저가 "○○학원 지난달에 뭐 문의했지?", "녹화 안 된다는 상담 최근에 있었나?", "이 고객 최근 상담 보여 줘"를 물으면
// 맞는 상담을 최신순 5건까지 목록(날짜·누가·한 줄 요지·상태)과 그 상담으로 가는 링크로 준다.
//
// 모델 없이 돈다(결정형):
//  - 고객 일치: 질문 속 고객(CRM 통합 고객 이름) 또는 열린 화면의 고객("이 고객" 또는 낱말이 없을 때). 채널톡 상담의
//    연결 리드 id·기관 이름·고객 이름, 내부 CS 대화 제목에 그 이름이 있으면 맞는다.
//  - 낱말 일치: 묻는 꼴·조사·기간 말을 덜어 낸 낱말이 모두 상담 글(첫 질문·마지막 글·태그·제목)에 있어야 한다.
//    저장소에 낱말 검색 함수가 없어 최근 N건(scanLimit)을 읽어 여기서 거른다 — 다 차면 "최근 N건 안에서"라고 밝힌다.
//  - 기간 말: tools.ts 의 periodOf(KST 달력). 해석하지 못하면 기간 없이 찾고 그렇다고 밝힌다.
//  - 임베딩 검색(semantic)은 주입할 수 있는 선택 부품이다 — 모델 연결이 설정됐을 때만 서버 연결이 넘긴다.
// 권한·개인정보:
//  - 상담 글을 볼 수 있는 역할(canReadContent — 내부 CS 코파일럿 역할 상수)만 목록(누가·요지)을 받는다. 아니면 건수만.
//  - 요지는 가림(redactInternalCsValue)을 거친 한 줄이다. 가림이 못 하는 사람 이름은 목록에 그대로 남을 수 있다 — 화면은 사내 전용.
//  - 이 파일은 로그를 남기지 않는다. 모델 입력으로 보내지 않는다(조율기가 모델에 넘기는 것은 갈래 후보 판정뿐이다).
// 자료는 deps 로 받는다(서버 연결은 deps.ts, 시험은 가짜). 이 파일은 I/O 를 하지 않는다.
import type { CustomerRef } from "@/lib/internal-cs-chat/contact"
import { redactInternalCsValue } from "@/lib/internal-cs-chat/redact"

import { buildDeepLink, getLinkById, type DeepLinkKind } from "../links"
import type { AiBlock, ConsultationListItem, ConsultationSource, ConsultationsCard } from "../types"
import { isConsultationAsk } from "./router"
import { periodOf, type Period } from "./tools"

/** 저장소 한 줄을 고른 꼴 — 출처마다 서버 연결이 이 꼴로 바꿔 넘긴다. */
export interface ConsultationRecord {
  id: string
  source: ConsultationSource
  /** 마지막 메시지 시각(ISO). */
  at: string | null
  /** 기관 이름(채널톡 연결 리드의 기관). */
  org: string | null
  /** 고객 표시 이름(채널톡 고객 이름). */
  person: string | null
  /** 연결된 CRM 리드 id. */
  leadId: string | null
  /** 요지가 될 글 — 채널톡 첫 질문(없으면 마지막 글), 내부 CS 대화 제목. */
  subject: string
  /** 낱말 맞춤에만 쓰는 글(마지막 글 등) — 화면에 내지 않는다. */
  extra?: string
  tags: string[]
  /** 저장소의 상태 값. */
  status: string
}

export interface ConsultationSemanticHit {
  id: string
  source: ConsultationSource
}

/** 출처 한 곳에서 읽은 최근 상담. limit 은 실제로 청한 건수(저장소 상한으로 줄었을 수 있다) — 다 차면 "최근 N건 안에서". */
export interface ConsultationBatch {
  records: ConsultationRecord[]
  limit: number
}

export interface ConsultationDeps {
  /** 최근 채널톡 상담(최신순) 최대 limit 건. null 이면 이 출처가 설정되지 않았다(실패가 아니다). */
  channelTalk?: (limit: number) => Promise<ConsultationBatch | null>
  /** 최근 내부 CS 대화(최신순) 최대 limit 건. null 이면 설정되지 않았다. */
  internalCs?: (limit: number) => Promise<ConsultationBatch | null>
  /** 질문 글 속 고객(CRM 통합 고객). */
  findCustomersInText?: (question: string) => Promise<CustomerRef[]>
  /** 선택 — 임베딩 검색(모델 연결이 설정됐을 때만). 읽은 최근 N건 안의 상담만 받아들인다. */
  semantic?: (question: string, limit: number) => Promise<ConsultationSemanticHit[]>
  /** 출처마다 읽을 최근 건수. 기본 300. */
  scanLimit?: number
}

export interface ConsultationViewer {
  /** 상담 글(누가·요지)을 볼 수 있는가 — 내부 CS 코파일럿 역할(CS_COPILOT_API_ROLES). */
  canReadContent: boolean
}

export interface FindConsultationsOptions {
  openCustomer?: CustomerRef | null
  actor: ConsultationViewer
  now: number
}

export interface ConsultationResultItem extends ConsultationListItem {
  linkKind: DeepLinkKind
}

export interface ConsultationSearchResult {
  /** 최신순 상위 MAX_ITEMS 건. 상담 글을 볼 수 없는 역할이면 빈 목록(건수만). */
  items: ConsultationResultItem[]
  total: number
  more: number
  period: Period | null
  /** 기간 말이 있었는데 해석하지 못했다. */
  periodUnsupported: boolean
  basis: {
    customer: string | null
    /** 고객을 어디서 잡았나 — 질문 글 / 열린 화면. */
    customerFrom: "question" | "page" | null
    keywords: string[]
    /** 출처마다 읽은 건수와 상한 — 상한까지 읽었으면(capped) "최근 N건 안에서"다. */
    scanned: Array<{ source: ConsultationSource; read: number; limit: number; capped: boolean }>
    /** 한 출처라도 상한까지 읽었다. */
    capped: boolean
    /**
     * 상한까지 읽은 출처가 거슬러 간 가장 이른 날짜(KST, 출처가 여럿이면 그중 늦은 쪽) — 그 이전 상담은 읽지 못했다.
     * 상한에 걸리지 않았으면 null.
     */
    coverageFrom: string | null
    semantic: boolean
  }
  restricted: boolean
  /** 상한 때문에 읽지 못한 기간이 묻는 기간에 걸친다 — 건수는 "최소 n건", 없음은 "그 이전은 확인하지 못했습니다". */
  partial: boolean
  /** 읽지 못한 출처. */
  failed: ConsultationSource[]
}

export const MAX_CONSULTATION_ITEMS = 5
export const DEFAULT_SCAN_LIMIT = 300
const SUMMARY_MAX_CHARS = 60
const KST_MS = 9 * 60 * 60 * 1000

export const SOURCE_LABEL: Record<ConsultationSource, string> = { channel_talk: "채널톡", internal_cs: "내부 CS" }

const STATUS_LABEL: Record<string, string> = {
  opened: "진행 중",
  snoozed: "보류",
  closed: "종료",
  unknown: "상태 모름",
  queue: "대기",
  active: "진행 중",
  waiting_review: "검토 대기",
  resolved: "해결",
  archived: "보관",
}

const LINK_KIND: Record<ConsultationSource, DeepLinkKind> = {
  channel_talk: "channel_talk_conversation",
  internal_cs: "internal_cs_conversation",
}

/** 상담 목록 화면 — 못 찾았을 때·권한이 없을 때 여는 곳. */
export const CONSULTATION_INBOX_LINK_ID = "admin:channel-talk"

// ── 질문 낱말 ────────────────────────────────────────────────────────────────────────────

/** 기간 말 — 낱말에서 뺀다(기간은 따로 거른다). */
const PERIOD_WORDS =
  /(?:최근|지난)\s*\d{1,3}\s*일(?:간|동안)?|오늘|어제|이번\s*주|지난\s*주|이번\s*달|지난\s*달|올해|작년|지난\s*해|\d{4}\s*년|\d{1,2}\s*월|상반기|하반기|\d\s*분기|분기/g
/** 열린 화면 고객을 가리키는 말. */
const DEICTIC = /(?:^|\s)(?:이|해당)\s*(?:고객|학원|기관|곳|업체|회사|분)|(?:^|\s)(?:여기|이곳)/
const PARTICLE = /(?:에서는|에서|에게|한테|으로|로|은|는|이|가|을|를|의|도|만|부터|까지|이랑|랑|하고|과|와|에|께서)$/
/** 상담을 가리키는 말·묻는 꼴·흔한 동사 조각 — 찾는 낱말이 아니다. */
const STOP =
  /^(?:상담|상담건|상담글|문의|문의건|채팅|채널톡|대화|이력|기록|내역|건|거|것|게|뭐|뭐야|뭐였지|뭐였어|무슨|어떤|어느|언제|언제야|있어|있나|있었나|있었어|있었지|있는지|있었는지|없어|없나|들어온|들어왔|들어왔어|들어왔나|들어온지|온|왔|왔어|왔나|했지|했나|했어|했던|했는지|한|하던|된|된다|된다는|된대|되는|돼|돼요|안|안됨|안돼|못|보여|보여줘|보여주세요|찾아|찾아줘|찾아봐|알려|알려줘|줘|주세요|좀|최근|요즘|지난|그|저|이|우리|고객|고객사|기관|학원|관련|관한|대한|대해|들|목록|전부|모두|다|혹시|혹은|또는|및|있다는|했다는|라는|이라는|다는|방법|어떻게|절차|설명|설명해|가능|가능해|되나|되는지|하는|하려면|하면|할|수|왜|켜|켜는|클래스인|classin|수업|교실|학생|교사|선생님|기능|해당|내용|몇|건수|원장님|그때|전에|예전|요새|최근에)$/
const SYNONYMS: readonly (readonly string[])[] = [
  ["환불", "반환"],
  ["오류", "에러", "실패"],
  ["녹화", "녹화본", "녹화영상"],
  ["결제", "카드결제", "입금"],
  ["로그인", "접속"],
]

const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase()
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim()

export interface KeywordToken {
  word: string
  variants: string[]
}

/** 묻는 꼴의 앞머리 — "언제였지", "뭐였더라", "있었나요", "했었어", "많아", "달라는". */
const PREDICATE_HEAD = /^(?:언제|뭐|무엇|무슨|어디|있|없|했|많|달라|됐|될|그랬|어땠)/
/** 묻는 꼴·서술의 꼬리 — "있었나요", "뭐였더라", "건이야", "들어왔어". */
const PREDICATE_TAIL =
  /(?:했지|했나|했어|했던|했는지|한다는|된다는|됐나|됐어|었나|었지|었어|았나|았지|았어|였나|였지|였어|인가|는지|던가|더라|더라고|나요|가요|어요|아요|에요|예요|해요|이야|거야|건가|래요|대요)$/
/** 호칭·사람을 가리키는 말 — "원장님", "담당자", "선생님". 찾는 주제가 아니다. */
const PERSON_WORD = /님$|^(?:담당자?|직원|매니저|학부모|학생들?|선생|원장|실장|대표)$/
/** 띄어 쓴 기관 이름을 한 낱말로 — "가나 학원" → "가나학원"(두 글자 "가나"가 "…가 나요"에 맞지 않게). */
const SPACED_ORG = /([가-힣A-Za-z0-9]{2,})\s+(학원|어학원|에듀|교육|스쿨|아카데미|교습소)(?=$|[\s?？!.,]|[이가은는을를의에도랑와과])/g
const NOT_ORG_HEAD = /^(?:해당|우리|저희|다른|모든|어느|어떤|이번|지난|그|이|저)$/

/** 받침 ㄴ 으로 끝나는 글자 + "다" — "잡힌다", "들린다"(서술형 동사). */
function endsWithNieunDa(token: string): boolean {
  if (token.length < 2 || !token.endsWith("다")) return false
  const code = token.charCodeAt(token.length - 2) - 0xac00
  return code >= 0 && code < 11172 && code % 28 === 4
}

function isPredicateToken(token: string): boolean {
  return PREDICATE_HEAD.test(token) || PREDICATE_TAIL.test(token) || endsWithNieunDa(token) || /^건(?:이|인)/.test(token)
}

/** 찾는 낱말 — 기간 말·고객 이름·상담을 가리키는 말·묻는 꼴·조사·호칭을 덜어 낸다. */
export function consultationKeywords(question: string, customerNames: readonly string[] = []): KeywordToken[] {
  let text = question.replace(PERIOD_WORDS, " ").replace(/몇\s*(?:건|번|개|명)\S*/g, " ")
  for (const name of customerNames) {
    if (name.trim()) text = text.split(name).join(" ")
  }
  text = text.replace(SPACED_ORG, (whole, head: string, suffix: string) => (NOT_ORG_HEAD.test(head) ? whole : `${head}${suffix}`))
  const out: KeywordToken[] = []
  const seen = new Set<string>()
  for (const raw of text.toLowerCase().replace(/[?？!.,~·…"'()“”‘’]/g, " ").split(/\s+/)) {
    let token = raw.trim()
    if (!token || STOP.test(token)) continue
    // "가나학원 화면에서" — 어디서 묻는지이지 찾는 주제가 아니다.
    if (/^(?:화면|페이지|여기|이곳)(?:에서|에서는|에선)$/.test(token)) continue
    token = token.replace(PARTICLE, "")
    if (!token || STOP.test(token)) continue
    // 묻는 꼴·서술 동사 조각("문의했지", "언제였지", "잡힌다", "있었나요")은 낱말이 아니다.
    if (isPredicateToken(token) || PERSON_WORD.test(token)) continue
    // "환불해" → "환불"(명사 + 해).
    token = token.replace(/^([가-힣]{2,})해(?:서|도)?$/, "$1")
    if (/^(?:상담|문의|채팅)/.test(token) && token.length <= 5) continue
    if (token.length < 2 || STOP.test(token) || seen.has(token)) continue
    seen.add(token)
    const variants = token.length >= 3 && /[가-힣]$/.test(token) ? [token, token.slice(0, -1)] : [token]
    const group = SYNONYMS.find((words) => words.some((word) => variants.includes(word)))
    if (group) variants.push(...group.filter((word) => !variants.includes(word)))
    out.push({ word: token, variants })
  }
  return out
}

/** 묻기 답의 관련 상담 줄에 쓰는 낱말(둘까지) — 추천 문장이 상담 내역 갈래로 가는 낱말만. 건수와 추천 문장이 같은 낱말을 쓴다. */
export function relatedConsultationWords(question: string): string[] {
  const words: string[] = []
  for (const keyword of consultationKeywords(question)) {
    if (words.length >= 2) break
    if (isConsultationAsk(relatedConsultationAsk([...words, keyword.word]))) words.push(keyword.word)
  }
  return words
}

/** 관련 상담 줄의 추천 문장 — 상담 내역 갈래로 가는 꼴. */
export function relatedConsultationAsk(words: readonly string[]): string {
  return words.length ? `${words.join(" ")} 상담 최근에 있었나?` : "관련 상담 최근에 있었나?"
}

// ── 맞춤 ─────────────────────────────────────────────────────────────────────────────────

function kstDate(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return new Date(ms + KST_MS).toISOString().slice(0, 10)
}

function haystackOf(record: ConsultationRecord): { joined: string; words: string[] } {
  const text = [record.subject, record.extra ?? "", record.tags.join(" "), record.org ?? "", record.person ?? ""].join(" ").toLowerCase()
  return { joined: normalize(text), words: text.split(/[\s,.!?？/()·]+/).filter(Boolean) }
}

/**
 * 낱말 하나가 상담 글에 있나. 두 글자 이하는 한 낱말 안에서만 맞춘다("가나"가 "…가 나요"의 띄어쓰기를 넘어 맞지 않게).
 * 세 글자 이상은 띄어쓰기를 지운 글에서도 맞춘다("화면공유" ↔ "화면 공유").
 */
function hasVariant(haystack: { joined: string; words: string[] }, variant: string): boolean {
  const needle = normalize(variant)
  if (!needle) return false
  if (haystack.words.some((word) => word.includes(needle))) return true
  return needle.length >= 3 && haystack.joined.includes(needle)
}

function matchesKeywords(record: ConsultationRecord, keywords: readonly KeywordToken[]): boolean {
  if (keywords.length === 0) return true
  const haystack = haystackOf(record)
  return keywords.every((keyword) => keyword.variants.some((variant) => hasVariant(haystack, variant)))
}

function leadIdOf(customer: CustomerRef): string | null {
  const match = customer.key.match(/^lead:(.+)$/)
  return match ? match[1] : null
}

function matchesCustomer(record: ConsultationRecord, customer: CustomerRef): boolean {
  const leadId = leadIdOf(customer)
  if (leadId && record.leadId === leadId) return true
  const name = normalize(customer.name)
  if (name.length < 2) return false
  return [record.org, record.person, record.subject].some((field) => Boolean(field) && normalize(field as string).includes(name))
}

function inPeriod(record: ConsultationRecord, period: Period | null): boolean {
  if (!period) return true
  const date = kstDate(record.at)
  return Boolean(date) && (date as string) >= period.from && (date as string) <= period.to
}

/** 비껴 쓴 이메일("sample @ example . com", "sample[at]example.com")을 가림이 알아보는 꼴로 되돌린다. */
const OBFUSCATED_EMAIL =
  /([A-Za-z0-9._%+-]+)\s*(?:@|＠|\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+)\s*([A-Za-z0-9-]+(?:\s*(?:\.|\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*[A-Za-z0-9-]+)+)/gi
/** 호칭 앞 이름 — "샘플이름 선생님께". 흔한 말(담당·담임·과목 등)은 이름이 아니다. */
const NAMED_TITLE = /(?<![가-힣])([가-힣]{2,4})(\s*)(선생님|원장님|실장님|대표님|팀장님|부장님|과장님|매니저님|씨)(?![가-힣]{2})/g
const NOT_NAME =
  /^(?:담당|담임|수학|영어|국어|과학|사회|원어민|학원|센터|우리|저희|해당|다른|모든|여러|부원장|본사|지사|원장|교사|강사|학부모|고객|상담|관리|운영|교무|행정)$/

/** 화면 한 줄 가림 — 비껴 쓴 이메일·호칭 앞 이름을 되돌려 가린 뒤 redactInternalCsValue. 고객 이력(customer-history.ts)도 쓴다. */
export function redactSummary(value: string): string {
  const unmasked = value.replace(OBFUSCATED_EMAIL, (_whole, local: string, domain: string) =>
    `${local}@${domain.replace(/\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+)\s*/gi, ".").replace(/\s*\.\s*/g, ".")}`
  )
  const named = unmasked.replace(NAMED_TITLE, (whole, name: string, gap: string, title: string) =>
    NOT_NAME.test(name) ? whole : `[name]${gap}${title}`
  )
  return redactInternalCsValue(named)
}

function summaryOf(record: ConsultationRecord): string {
  const line = oneLine(redactSummary(record.subject))
  if (!line) return "요지 없음"
  return line.length > SUMMARY_MAX_CHARS ? `${line.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…` : line
}

function whoOf(record: ConsultationRecord): string {
  const org = record.org?.trim()
  const person = record.person?.trim()
  if (record.source === "internal_cs") return org || "사내 CS 대화"
  if (org && person && normalize(org) !== normalize(person)) return `${org} · ${redactSummary(person)}`
  return org || (person ? redactSummary(person) : "이름 없는 고객")
}

async function settle<T>(task: (() => Promise<T>) | undefined): Promise<{ ok: true; value: T } | { ok: false } | null> {
  if (!task) return null
  try {
    return { ok: true, value: await task() }
  } catch {
    return { ok: false }
  }
}

/** 상담 내역 찾기. 결정형이고 같은 자료·같은 질문이면 늘 같은 결과다. 던지지 않는다(출처 실패는 failed 로). */
export async function findConsultations(question: string, deps: ConsultationDeps, options: FindConsultationsOptions): Promise<ConsultationSearchResult> {
  const scanLimit = Math.max(1, Math.min(1_000, Math.trunc(deps.scanLimit ?? DEFAULT_SCAN_LIMIT)))
  const periodRaw = periodOf(question, options.now)
  const period = periodRaw && periodRaw !== "unsupported" ? periodRaw : null

  const [found, channel, internal] = await Promise.all([
    settle(deps.findCustomersInText ? () => deps.findCustomersInText!(question) : undefined),
    settle(deps.channelTalk ? () => deps.channelTalk!(scanLimit) : undefined),
    settle(deps.internalCs ? () => deps.internalCs!(scanLimit) : undefined),
  ])
  const inText = found?.ok ? found.value : []
  const nameHint = inText.map((customer) => customer.name)
  const keywordsBeforePage = consultationKeywords(question, nameHint)

  let customer: CustomerRef | null = inText[0] ?? null
  let customerFrom: ConsultationSearchResult["basis"]["customerFrom"] = customer ? "question" : null
  if (!customer && options.openCustomer && (DEICTIC.test(question) || keywordsBeforePage.length === 0)) {
    customer = options.openCustomer
    customerFrom = "page"
  }
  const keywords = customer && customerFrom === "page" ? consultationKeywords(question, [customer.name]) : keywordsBeforePage

  const failed: ConsultationSource[] = []
  const records: ConsultationRecord[] = []
  const scanned: ConsultationSearchResult["basis"]["scanned"] = []
  for (const [source, result] of [["channel_talk", channel], ["internal_cs", internal]] as const) {
    if (!result) continue
    if (!result.ok) {
      failed.push(source)
      continue
    }
    if (!result.value) continue
    const batch = result.value.records.filter((record) => record && typeof record.id === "string" && record.source === source)
    const limit = Math.max(1, result.value.limit)
    scanned.push({ source, read: batch.length, limit, capped: batch.length >= limit })
    records.push(...batch)
  }
  const capped = scanned.some((entry) => entry.capped)
  // 상한까지 읽은 출처마다 거슬러 간 가장 이른 날짜 — 그중 늦은 쪽부터가 모든 출처를 다 읽은 범위다.
  let coverageFrom: string | null = null
  for (const entry of scanned) {
    if (!entry.capped) continue
    const dates = records
      .filter((record) => record.source === entry.source)
      .map((record) => kstDate(record.at))
      .filter((date): date is string => Boolean(date))
      .sort()
    const oldest = dates[0]
    if (oldest && (!coverageFrom || oldest > coverageFrom)) coverageFrom = oldest
  }
  const partial = capped && (!period || !coverageFrom || period.from < coverageFrom)

  const scoped = records.filter((record) => inPeriod(record, period) && (!customer || matchesCustomer(record, customer)))
  const matched = new Map<string, ConsultationRecord>()
  for (const record of scoped) if (matchesKeywords(record, keywords)) matched.set(`${record.source}:${record.id}`, record)

  let semanticUsed = false
  if (deps.semantic && keywords.length > 0) {
    const hits = await settle(() => deps.semantic!(question, 8))
    if (hits?.ok) {
      semanticUsed = true
      const byKey = new Map(scoped.map((record) => [`${record.source}:${record.id}`, record]))
      for (const hit of hits.value) {
        const record = byKey.get(`${hit.source}:${hit.id}`)
        if (record) matched.set(`${hit.source}:${hit.id}`, record)
      }
    }
  }

  const sorted = Array.from(matched.values()).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "") || a.id.localeCompare(b.id))
  const total = sorted.length
  const restricted = !options.actor.canReadContent
  const items: ConsultationResultItem[] = restricted
    ? []
    : sorted.slice(0, MAX_CONSULTATION_ITEMS).map((record) => {
        const linkKind = LINK_KIND[record.source]
        const href = buildDeepLink(linkKind, record.id)
        const date = kstDate(record.at)
        return {
          id: record.id,
          source: record.source,
          ...(date ? { date } : {}),
          who: whoOf(record),
          summary: summaryOf(record),
          status: STATUS_LABEL[record.status] ?? "상태 모름",
          ...(href ? { href } : {}),
          linkKind,
        }
      })

  return {
    items,
    total,
    more: Math.max(0, total - MAX_CONSULTATION_ITEMS),
    period,
    periodUnsupported: periodRaw === "unsupported",
    basis: {
      customer: customer?.name ?? null,
      customerFrom,
      keywords: keywords.map((k) => k.word),
      scanned,
      capped,
      coverageFrom,
      semantic: semanticUsed,
    },
    restricted,
    partial,
    failed,
  }
}

/** 질문 낱말과 맞는 상담 건수 — 묻기 답의 "관련 상담 n건" 줄(고객·기간 없이, 원문 없이). 낱말이 없으면 null. 상한에 걸리면 최소 건수다. */
export async function countRelatedConsultations(question: string, deps: ConsultationDeps): Promise<number | null> {
  // 추천 문장(relatedConsultationAsk)과 같은 낱말로 센다 — 추천대로 물으면 같은 건수가 나온다.
  const words = relatedConsultationWords(question)
  if (words.length === 0) return null
  const keywords = consultationKeywords(relatedConsultationAsk(words))
  if (keywords.length === 0) return null
  const scanLimit = Math.max(1, Math.min(1_000, Math.trunc(deps.scanLimit ?? DEFAULT_SCAN_LIMIT)))
  const [channel, internal] = await Promise.all([
    settle(deps.channelTalk ? () => deps.channelTalk!(scanLimit) : undefined),
    settle(deps.internalCs ? () => deps.internalCs!(scanLimit) : undefined),
  ])
  const batches = [channel, internal].flatMap((result) => (result?.ok && result.value ? [result.value] : []))
  if (batches.length === 0) return null
  const records = batches.flatMap((batch) => batch.records)
  return records.filter((record) => matchesKeywords(record, keywords)).length
}

// ── 카드 ─────────────────────────────────────────────────────────────────────────────────

/** "지난달(10월 1일~10월 31일)" → "지난달". */
function periodName(period: Period): string {
  return period.label.split("(")[0].trim()
}

function basisLine(result: ConsultationSearchResult): string {
  const parts: string[] = []
  if (result.basis.customer) parts.push(`고객 ${result.basis.customer}${result.basis.customerFrom === "page" ? "(열린 화면)" : ""}`)
  if (result.basis.keywords.length) parts.push(`낱말 ${result.basis.keywords.map((word) => `'${word}'`).join(" ")}`)
  if (result.period) parts.push(`기간 ${result.period.label}`)
  if (!result.basis.customer && !result.basis.keywords.length && !result.period) parts.push("조건 없음(최근 상담)")
  const scanned = result.basis.scanned.map((entry) => `${SOURCE_LABEL[entry.source]} ${entry.read}건`).join("·")
  if (scanned) {
    const since = result.basis.capped && result.basis.coverageFrom ? `, ${result.basis.coverageFrom} 이후` : ""
    parts.push(result.basis.capped ? `최근 상담 안에서(${scanned}${since})` : `읽은 상담 전부에서(${scanned})`)
  }
  if (result.basis.semantic) parts.push("비슷한 상담 검색 포함")
  return parts.join(" · ")
}

function subjectOf(result: ConsultationSearchResult): string {
  if (result.basis.customer) return `${result.basis.customer} `
  if (result.basis.keywords.length) return `${result.basis.keywords.map((word) => `'${word}'`).join(" ")} 관련 `
  return ""
}

/** 찾기 결과 → 상담 내역 카드. 결론 한 줄이 맨 위다(두괄식). */
export function consultationsBlock(result: ConsultationSearchResult): AiBlock {
  const periodTail = result.period ? `(${periodName(result.period)})` : ""
  const basis = basisLine(result)
  const notes: string[] = []
  if (result.periodUnsupported) notes.push("기간 말을 해석하지 못해 기간 없이 찾았습니다(오늘·어제·이번 주·지난주·이번 달·지난달·올해·최근 N일을 알아듣습니다).")
  if (result.failed.length) notes.push(`${result.failed.map((source) => SOURCE_LABEL[source]).join("·")} 상담을 읽지 못했습니다 — 화면에서 확인해 주세요.`)
  const openLinkId = getLinkById(CONSULTATION_INBOX_LINK_ID) ? CONSULTATION_INBOX_LINK_ID : undefined

  // 상한 때문에 묻는 기간을 다 읽지 못했으면 결론 줄에서 밝힌다 — "없음"·건수가 그 이전을 포함하지 않는다.
  const gap = result.partial ? (result.basis.coverageFrom ? `${result.basis.coverageFrom} 이전은 확인하지 못했습니다` : "오래된 상담은 확인하지 못했습니다") : ""
  const count = result.partial ? `최소 ${result.total}건` : `${result.total}건`
  let headline: string
  if (result.total === 0) headline = `찾지 못했습니다${gap ? `(${gap})` : ""} — 조건: ${basis}`
  else if (result.restricted) headline = `${subjectOf(result)}상담 ${count}이 있습니다${periodTail}.`
  else headline = `${subjectOf(result)}상담 ${count}을 찾았습니다${periodTail}.`
  if (result.total > 0 && gap) notes.push(`${gap} — 상담 화면에서 더 찾아 주세요.`)
  if (result.total === 0 && result.basis.keywords.length >= 2) {
    notes.push(`낱말 ${result.basis.keywords.map((word) => `'${word}'`).join("·")}이 모두 들어간 상담만 찾습니다 — 낱말을 줄여 다시 물어 주세요.`)
  }

  if (result.restricted && result.total > 0) notes.unshift("상담 글은 CS 담당 역할만 볼 수 있습니다 — 내용은 CS 담당에게 요청해 주세요.")
  if (result.more > 0) notes.push(`최신 ${MAX_CONSULTATION_ITEMS}건만 보였습니다. 나머지 ${result.more}건은 상담 화면에서 보세요.`)

  const card: ConsultationsCard = {
    title: "상담 내역",
    target: { label: result.basis.customer ?? (result.basis.keywords.join(" ") || "최근 상담"), meta: result.period ? result.period.label : `${result.total}건` },
    headline,
    items: result.items.map(({ linkKind, ...item }) => {
      void linkKind
      return item
    }),
    ...(result.more > 0 && !result.restricted ? { moreCount: result.more } : {}),
    basis,
    ...(result.restricted ? { restricted: true } : {}),
    ...(notes.length ? { note: notes.join(" ") } : {}),
    ...(openLinkId ? { openLinkId } : {}),
  }
  return { kind: "consultations", card }
}
