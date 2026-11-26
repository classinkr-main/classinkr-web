// 갈매봇 결정형 갈래 — 모델 없이 도는 기본 판정(갱신 구조 router-fallback).
//
// 원칙
//  1. 한 메시지를 질문 조각으로 나눈다. "A 는 어떻게 하고, B 는 누구한테 물어?" → 조각 둘, 답도 둘.
//     묻지도 시키지도 않는 서술 조각("입금 들어왔어", "왜냐면 …")은 이웃 조각의 맥락으로 붙인다.
//  2. 낱말 하나로 갈래를 정하지 않는다. 묻는 대상(무엇을: 재고·견적·담당·링크…)과 묻는 꼴(누구·어디·얼마·방법·해 줘)을
//     함께 점수로 본다. "문자가 깨져요"의 문자는 발송이 아니고, "환불 규정"의 환불은 결제 오더가 아니다.
//  3. 쓰기(오더)는 시키는 꼴이 문장 끝에 분명할 때만이다. 의문 표지가 있으면 쓰기로 가지 않는다(시안 점검 R4·F1 과 같은 판정,
//     시험 표: tests/admin-ai/fixtures/intent-table.ts).
//  4. 1·2위 점수가 가까우면 되묻는다(후보 2개 카드). 모델 어댑터가 있으면 그 둘 중에서만 고르게 한다.
// 순수 모듈이다(I/O·server-only 없음) — 시험과 이후 위컴 방 어댑터가 그대로 부른다.

export type AskBranch = "knowledge" | "contact" | "link" | "read" | "consultations"
export type Branch = AskBranch | "write" | "unknown"

/** 조회 도구(lib/ops-tools 레지스트리의 R0, mcpName). screen 은 도구가 없는 조회 — 화면 링크로 안내한다. */
export type ReadTarget =
  | { kind: "tool"; tool: "hw_stock" | "hw_movements" | "hw_sales" | "deals_list" | "quotes_list" | "site_traffic" }
  | { kind: "screen"; topic: "payment" | "messaging" | "task" | "activity" | "lead" | "showroom"; query: string }

/** 시키는 일의 종류. quote_draft·hw_plan 만 레지스트리 쓰기 도구가 있다(나머지는 "아직 준비 중" 카드). */
export type WriteKind =
  | "quote_draft"
  | "hw_plan"
  | "send"
  | "pay"
  | "ship"
  | "amount"
  | "lead"
  | "task"
  | "note"
  | "delete"
  | "showroom"
  | "other"

export type SentenceForm = "question" | "command" | "statement"

export interface RouteDecision {
  text: string
  form: SentenceForm
  branch: Branch
  scores: Record<AskBranch, number>
  read?: ReadTarget
  write?: WriteKind
  /** 1·2위가 가까워 되물어야 하는 두 갈래(점수 순). */
  clarify?: [AskBranch, AskBranch]
}

// ── 조각 나누기 ──────────────────────────────────────────────────────────────────────────

const SENTENCE_BREAK = /(?<=[?？!])\s*|(?<=[가-힣A-Za-z0-9)])[.。]\s+|[.。]$|\n+/
// 늘 끊는 이음 — "…하고, …" "…이고, …" "…며, …"(쉼표가 붙은 이음 어미)와 "그리고"·"또". 앞 조각에 이음 어미를 남겨 원형으로 되돌린다.
const ALWAYS_BREAK = /(?<=[가-힣](?:고|며|면서|구))\s*,\s*|\s*,?\s*그리고\s+|\s+또\s+(?=[가-힣])/
// 묻는 어미 + 쉼표 — "가나학원 지난달 문의 뭐였지, 재고는 몇 대 남았어?"(앞 갈래 답이 사라지지 않게). 늘 끊지 않고
// 뒤 조각이 제 대상을 묻는 질문일 때만 끊는다(acceptQuestionCommaSplit) — "환불 규정이 뭐야, 알려줘"·"이거 뭐야, 담당자 알려줘"
// (뒤가 청하는 말)와 "라이선스 있어, 연결이 안 돼요"(뒤가 서술)는 한 조각 그대로다.
const QUESTION_COMMA =
  /(?<=(?:였지|었지|았지|했지|뭐지|뭐야|이야|거야|있어|있나|었나|았나|였나|했나|했어|됐어|됐나))\s*,\s*/g
/** 청하는 꼬리로 끝나는 말 — 앞 질문을 다시 청하는 것이라 따로 묻는 조각이 아니다("…뭐야, 알려줘"). */
const REQUEST_END = /(?:알려|보여|찾아|설명해|정리해|확인해|뽑아|조회해|말해)\s*(?:줘|주세요|줄래|주라|봐|봐요)\s*[?？.!]*$/
// 쉼표 없는 이음(검토 동작-2) — 청하거나 시키는 동사 + 고. "환불 규정 알려 주고 담당자도 알려 줘", "출고 예정 등록하고 견적 초안도 만들어 줘".
// 끊은 뒤 양쪽 꼴을 보고 받아들인다(acceptVerbSplit). "바꾸고 내가 맡을게"·"만들고 나서 …"는 끊지 않는다.
const VERB_JOINT =
  /(?<=(?:(?:알려|보여|찾아|설명해|정리해|확인해|만들어|보내|넣어|잡아|등록해|뽑아|링크|주소)\s*주|(?:등록|작성|추가|생성|확인|조회|정리|설명)\s*하|만들|보내|넣|잡)(?:고|구))\s+(?!나서|나면|난\s|있|싶|다시|나니)/g
// 명사 이음 — "견적 목록이랑 딜 목록 보여 줘". 양쪽에 서로 다른 조회 대상이 있을 때만 끊는다.
const NOUN_JOINT = /(?<=[가-힣A-Za-z0-9])(?:이랑|랑|하고|과|와)\s+/g
/** 오른쪽 조각의 청하는 꼬리 — 명사로 끝난 왼쪽 조각이 빌려 쓴다("견적 목록" + "보여 줘"). */
const ASK_TAIL = /(?:보여|알려|찾아|정리해|확인해|뽑아|조회해)\s*(?:줘|주세요|줄래|주라)?\s*[?？.!]*$|[?？]$/
const VERBISH_END = /(?:줘|주세요|해|하|요|야|니|냐|까|어|지)\s*[?？.!]*$/

const CONNECTIVE_HEAD = /^(?:왜냐(?:면|하면)|그러니까|그러니|그래서|그런데|근데|참고로|아\s|어\s)/

/**
 * 이음 어미로 끝난 앞 조각을 원형 꼬리로 되돌린다 — "설명해 주고" → "설명해 줘", "등록하고"(뒤가 시키는 말) → "등록해 줘".
 * 되돌린 꼴이 시키는 말인데 뒤 조각이 시키는 말이 아니면 되돌리지 않는다(끼인 동사로 오더를 만들지 않는다).
 */
function restoreJoint(piece: string, nextForm: SentenceForm | null): string {
  const command = nextForm === "command"
  let restored: string | null = null
  if (/주(?:고|구)$/.test(piece)) restored = piece.replace(/주(?:고|구)$/, "줘")
  else if (/하(?:고|구)$/.test(piece)) restored = piece.replace(/하(?:고|구)$/, command ? "해 줘" : "해")
  else {
    const stem = piece.match(/(만들|보내|넣|잡)(?:고|구)$/)
    if (stem) {
      const base = { 만들: "만들어", 보내: "보내", 넣: "넣어", 잡: "잡아" }[stem[1] as "만들" | "보내" | "넣" | "잡"]
      restored = `${piece.slice(0, piece.length - stem[0].length)}${base}${command ? " 줘" : ""}`
    }
  }
  if (!restored) return piece
  if (detectForm(restored) === "command" && !command) return piece
  return restored
}

function readToolOf(text: string): string | undefined {
  return READ_TOOLS.find((entry) => entry.match.test(text))?.tool
}

/** 명사 이음을 끊을 조회 대상 — 조회 도구, 또는 상담 이력·내역·기록("가나학원 상담 이력이랑 견적 목록 보여 줘"). */
function jointTargetOf(text: string): string | undefined {
  return readToolOf(text) ?? (CONSULT_OBJ.test(text) && CONSULT_RECORD.test(text) ? "consultations" : undefined)
}

/** 쉼표 없는 동사 이음을 받아들일지 — 양쪽이 묻거나 시키는 꼴이고, 시키는 앞 조각은 뒤도 시키는 말일 때만. */
function acceptVerbSplit(left: string, right: string): string | null {
  const rightForm = detectForm(right)
  if (rightForm === "statement") return null
  const restored = restoreJoint(left, rightForm)
  if (restored === left) return null
  const leftForm = detectForm(restored)
  if (leftForm === "statement") return null
  if (leftForm === "command" && rightForm !== "command") return null
  return restored
}

function splitAt(piece: string, joint: RegExp, accept: (left: string, right: string) => string | null): string[] {
  const out: string[] = []
  let rest = piece
  for (;;) {
    joint.lastIndex = 0
    let taken = false
    for (const match of rest.matchAll(joint)) {
      const at = match.index ?? 0
      const left = rest.slice(0, at).trim()
      const right = rest.slice(at + match[0].length).trim()
      if (!left || !right) continue
      const leftText = accept(left, right)
      if (leftText == null) continue
      out.push(leftText)
      rest = right
      taken = true
      break
    }
    if (!taken) break
  }
  out.push(rest)
  return out
}

function acceptQuestionCommaSplit(left: string, right: string): string | null {
  if (detectForm(right) !== "question" || REQUEST_END.test(right)) return null
  return left
}

function acceptNounSplit(left: string, right: string): string | null {
  if (left.length > 20 || VERBISH_END.test(left)) return null
  const leftTool = jointTargetOf(left)
  const rightTool = jointTargetOf(right)
  if (!leftTool || !rightTool || leftTool === rightTool) return null
  const tail = right.match(ASK_TAIL)?.[0].trim()
  return tail ? `${left} ${tail}` : left
}

export function splitPieces(text: string): string[] {
  const sentences = text.split(SENTENCE_BREAK).map((piece) => (piece ?? "").trim()).filter(Boolean)
  const out: string[] = []
  for (const sentence of sentences) {
    const clauses = sentence
      .split(ALWAYS_BREAK)
      .map((piece) => (piece ?? "").trim())
      .filter(Boolean)
      .flatMap((piece) => splitAt(piece, QUESTION_COMMA, acceptQuestionCommaSplit))
    clauses.forEach((clause, index) => {
      const next = clauses[index + 1]
      const restored = next ? restoreJoint(clause, detectForm(next)) : clause
      for (const verbPiece of splitAt(restored, VERB_JOINT, acceptVerbSplit)) {
        out.push(...splitAt(verbPiece, NOUN_JOINT, acceptNounSplit))
      }
    })
  }
  return out
}

export interface SegmentPart {
  /** 조각 전체 글(붙은 서술·이음말 포함) — 무엇을 묻는지(대상)는 이 글로 본다. */
  text: string
  /** 꼴을 정한 중심 조각 — 묻는지 시키는지는 이 글로 본다(붙은 "왜냐면 …"이 꼴을 바꾸지 않게). */
  core: string
}

const BARE_COMMAND = /^(?:확정|등록|처리|진행|해|부탁)\S{0,4}[.!]*$/

/** 한 턴에 답하는 조각 수의 상한 — 넘는 조각은 답하지 않고 "다시 물어봐 주세요"로 알린다(dropped). */
export const MAX_SEGMENTS = 4

/**
 * 질문 조각. 서술 조각은 다음 조각(없으면 앞 조각)에 붙인다. 이음말로 시작하는 조각과 대상 없는 짧은 지시("확정해.")는
 * 앞 조각에 붙인다. 조각은 최대 max 개 — 넘는 조각은 dropped 로 돌려준다(말없이 합치거나 버리지 않는다).
 */
export function splitSegmentPartsDetailed(text: string, max = MAX_SEGMENTS): { parts: SegmentPart[]; dropped: string[] } {
  const pieces = splitPieces(text.replace(/\s+/g, " ").trim())
  const out: SegmentPart[] = []
  let carry = ""
  for (const piece of pieces) {
    const last = out[out.length - 1]
    if (last && !carry && (CONNECTIVE_HEAD.test(piece) || BARE_COMMAND.test(piece))) {
      last.text = `${last.text} ${piece}`
      continue
    }
    if (detectForm(piece) === "statement") {
      carry = carry ? `${carry} ${piece}` : piece
      continue
    }
    out.push({ text: carry ? `${carry} ${piece}` : piece, core: piece })
    carry = ""
  }
  if (carry) {
    const last = out[out.length - 1]
    if (last) last.text = `${last.text} ${carry}`
    else out.push({ text: carry, core: carry })
  }
  return { parts: out.slice(0, max), dropped: out.slice(max).map((part) => part.text) }
}

export function splitSegmentParts(text: string, max = MAX_SEGMENTS): SegmentPart[] {
  return splitSegmentPartsDetailed(text, max).parts
}

export function splitSegments(text: string, max = MAX_SEGMENTS): string[] {
  return splitSegmentParts(text, max).map((part) => part.text)
}

// ── 문장 꼴 ──────────────────────────────────────────────────────────────────────────────

const CMD_VERBS =
  "만들어|만들|생성해|생성|등록해|등록|잡아|보내|발송해|발송|확정해|확정|바꿔|바꾸어|변경해|깎아|할인해|지워|삭제해|삭제|취소해|남겨|기록해|예약해|추가해|넣어|배정해|맡을게|맡아|올려|작성해"
const CMD_TAIL = new RegExp(`(?:${CMD_VERBS})\\s*(?:줘|주세요|줄래|주라|라|요|놔|둬|놔\\s*줘|둬\\s*줘)?\\s*[.!~]*$`)
/** 받는 사람에게 알리라는 말 — "도담영어 원장님한테 … 알려 줘". "누구한테"·"나한테"는 아니다. */
const SEND_TO = /(?<!누구|나|저|본사|담당자?)(?:한테|에게|께)\s.*(?:알려|안내해|보내|전달해)\s*(?:줘|주세요|라)?\s*[.!]*$/
/** 출고가 끝났다는 보고 — "출고 예정 3대 오늘 나갔어"(확정 오더). */
const SHIP_REPORT = /(?:출고|배송)[^?？]*나갔(?:어|다|습니다|어요)\s*[.!]*$/
/** 꼬리에 이런 말이 있으면 시키는 말이 아니라 묻는 말이다. */
const HEDGE_TAIL = /수\s*있|가능|방법|어떻게|되나|되는지|할까|하나요|하면|어디서|누구|누가|언제|얼마|몇/

const QUESTION_ANY =
  /[?？]|누구|누가|어디|언제|얼마|몇|뭐|무엇|무슨|어떻게|어떤|왜|방법|절차|가능|되나|되는지|는지|인지|나요|(?:니|냐|까|까요|래|임)\s*[.!]*$|수\s*있|알려|보여|설명|정리해|찾아|확인해|봐\s*줘|비교|링크|주소|있어\s*[.!]*$|었나|았나|였나|했나|됐나|있나|없나|던가|었지|았지|였지|줄래|규정|정책|규칙|현황|목록|내역|이력|기록\s*(?:좀)?\s*[.!]*$/

function tailOf(text: string, size = 14) {
  return text.slice(Math.max(0, text.length - size))
}

export function detectForm(text: string): SentenceForm {
  const t = text.trim()
  if (!/[?？]/.test(t)) {
    const tail = tailOf(t)
    const commanded = CMD_TAIL.test(t) || SEND_TO.test(t) || SHIP_REPORT.test(t)
    if (commanded && !HEDGE_TAIL.test(tail)) return "command"
  }
  return QUESTION_ANY.test(t) ? "question" : "statement"
}

// ── 쓰기 종류 ────────────────────────────────────────────────────────────────────────────

export function classifyWrite(text: string): WriteKind {
  if (/삭제|지워/.test(text)) return "delete"
  if (/깎|할인|금액\s*(?:바꿔|변경|수정)/.test(text)) return "amount"
  if (SEND_TO.test(text) || /문자|알림톡|메시지|발송|보내/.test(text)) return "send"
  if (/쇼룸/.test(text) && /예약/.test(text)) return "showroom"
  if (/견적/.test(text) && /초안|만들|작성|생성|등록/.test(text)) return "quote_draft"
  if (/(?:출고|배송)\s*예정/.test(text) && /등록|잡아|넣어|만들|추가/.test(text) && !/확정|나갔/.test(text)) return "hw_plan"
  if (/결제|입금|수금/.test(text) && /확정|처리/.test(text)) return "pay"
  if (/(?:출고|배송)/.test(text) && /확정|나갔/.test(text)) return "ship"
  if (/상태|담당|맡/.test(text) && /바꿔|변경|맡/.test(text)) return "lead"
  if (/할\s*일|일정|후속|리마인드/.test(text)) return "task"
  if (/기록|메모|남겨|통화/.test(text)) return "note"
  return "other"
}

// ── 묻기 갈래 점수 ───────────────────────────────────────────────────────────────────────

const WHO =
  /누구(?!나|든|라도|에게나)|누가|담당자\s*(?:가|는|좀)?\s*(?:누|어디|알려)|담당(?:자)?\s*(?:연락처|이름)|어디(?:에|로)?\s*물어|문의처|연락처는?\s*(?:어디|누구)|누구한테|누구에게|누구랑/
/** "누가 수업에 들어왔는지"처럼 누가가 간접 의문 안에 있으면 담당자를 묻는 말이 아니다. */
const INDIRECT_WHO = /누가[^?？.]*?(?:는지|었는지|았는지|했는지|인지|던지)/g
const WHO_SOFT = /담당|본사|물어|문의/
const LINK_OBJ = /링크|주소|url|바로\s*가기/i
const LINK_FORM = /(?:화면|페이지|메뉴|탭)\s*(?:은|는|이|가)?\s*(?:어디|어딨)|어디서\s*(?:해|하|봐|보|열|등록|확정|만들)|어디에\s*있|어디\s*있/
/** 링크 낱말이 있어도 증상·사용법이면 링크 찾기가 아니다("수업 링크로 입장이 안 돼요"). */
const SYMPTOM = /안\s*(?:돼|되|열|와|들어|보여|나와)|입장|접속|오류|에러|깨져|깨지|끊겨|느려|먹통|실패/
const KNOWLEDGE_FORM =
  /방법|어떻게|절차|정책|규정|규칙|가능|되나|되는지|돼\s*[?？]|수\s*있|설명|왜|뜻|의미|차이|기준|조건|하려면|하면|되면|되나요|나요|(?:하는|만드는|쓰는|보내는|넣는|여는|거는|올리는|받는|켜는|끄는)\s*법/
const PRODUCT = /클래스인|classin|수업|녹화|카메라|화면|학생|교사|선생님|계정|앱|설치|요금|가격|환불|결제\s*수단|교실|칠판|강의|숙제|출석|알림/i

const READ_FORM =
  /보여|목록|현황|몇\s*(?:대|개|건|번|명)|얼마|조회|내역|이력|남았|남아|있어\s*[?？.!]*$|상태|버전|기록|됐(?:니|나|어\s*[?？]|는지|었지)|했(?:니|나|어\s*[?？]|던가)|했어\s*[?？]|들어왔|나갔(?:니|나)|언제|확인해|봐\s*줘|비교|뭐임|뭐야|알려|(?:재고|품목|현황|목록|내역|합계|단계)(?:은|는|도|이|가)?\s*[?？.!]*$/
/** 화면·페이지가 어디 있는지 묻는 말 — 조회가 아니라 링크다("리드 목록 페이지 어디 있어?"). */
const SCREEN_WHERE = /(?:화면|페이지|메뉴|탭)\s*(?:은|는|이|가)?\s*(?:어디|어딨)/

// 상담 내역 찾기 — 묻는 대상(상담·문의·채팅·채널톡)과 묻는 꼴(찾아·있었나·보여·뭐였지·언제·최근) 또는 고객(기관 이름·"이 고객")이
// 함께일 때만. "상담 연결 방법은?" 같은 정보 질문, 담당자·화면 위치를 묻는 말, 응대 방법을 묻는 말은 이 갈래가 아니다.
const CONSULT_OBJ = /상담(?!원)|문의(?!처)|채팅(?!창)|채널톡|cs\s*(?:대화|건|내역)/i
const CONSULT_RECORD = /이력|기록|내역/
const CONSULT_FORM =
  /찾아|있었|있어|있나|있는지|들어온|들어왔|(?:왔|온)\s*(?:거|게|건|어|나|었)|보여|뭐였|뭐\s*(?:문의|상담|물어)|무슨\s*(?:문의|상담)|언제|최근|요즘|지난|이번\s*(?:주|달)|했(?:지|나|던|었|어\s*[?？])|목록|몇\s*건/
const CONSULT_CUSTOMER = /[가-힣A-Za-z0-9]{2,}(?:학원|어학원|에듀|교육|스쿨|센터|학교|아카데미|교습소)|(?:^|\s)(?:이|해당)\s*(?:고객|학원|기관|곳)/
const CONSULT_NOT = /방법|어떻게|절차|정책|규정|규칙|하려면|(?:하는|거는|여는|받는|남기는)\s*법|연결\s*(?:하|해|방법|은|는)|신청|답해|답하|응대|뜻|의미|기능|설정|버튼|가능/
/**
 * 상담이 CRM 단계·일정·다른 조회 대상의 이름으로 쓰인 말 — "상담 단계 리드", "상담 일정 언제야", "문의 유입 몇 건", "상담 메모".
 * 이때는 상담 내역 갈래가 아니다(옛 판정 — 조회·정보 — 그대로). 시험: router.test.ts "CRM 상담 단계·일정 문장".
 */
const CONSULT_CRM =
  /단계|리드|딜|영업\s*기회|파이프라인|유입|트래픽|방문(?:자|수)|일정|스케줄|잡혀\s*있|(?:상담|문의|채팅)\s*(?:가능\s*)?시간|(?:상담|문의)\s*메모|주제|유형|순위/

/** 상담 내역을 찾는 말인가 — 시험: tests/admin-ai/fixtures/intent-table.ts CONSULTATION_ASKS·CONSULTATION_NOT. */
export function isConsultationAsk(text: string): boolean {
  if (!CONSULT_OBJ.test(text) || CONSULT_NOT.test(text) || CONSULT_CRM.test(text)) return false
  if (WHO.test(text.replace(INDIRECT_WHO, " ")) || LINK_FORM.test(text)) return false
  return CONSULT_FORM.test(text) || CONSULT_CUSTOMER.test(text) || CONSULT_RECORD.test(text)
}

const READ_TOOLS: Array<{ match: RegExp; tool: Extract<ReadTarget, { kind: "tool" }>["tool"] }> = [
  { match: /재고|가용|남은\s*수량|몇\s*대\s*(?:남|있)|주문\s*권장/, tool: "hw_stock" },
  {
    match: /입출고|(?:출고|입고|배송)\s*(?:기록|내역|현황|이력|예정\s*건)|최근\s*출고|출고\s*(?:언제|됐|몇)|(?:출고|입고)(?:됐|된)|출고\s*언제/,
    tool: "hw_movements",
  },
  { match: /판매\s*(?:량|집계|현황|대수)|팔렸|팔린|몇\s*대\s*팔/, tool: "hw_sales" },
  { match: /딜|영업\s*기회/, tool: "deals_list" },
  { match: /견적/, tool: "quotes_list" },
  { match: /방문(?:자|수)|유입|트래픽|페이지\s*뷰/, tool: "site_traffic" },
]

const READ_SCREENS: Array<{ match: RegExp; topic: Extract<ReadTarget, { kind: "screen" }>["topic"]; query: string }> = [
  { match: /결제|입금|수금/, topic: "payment", query: "수금" },
  { match: /문자|알림톡|메시지/, topic: "messaging", query: "캠페인" },
  { match: /할\s*일|후속조치|연락할\s*곳/, topic: "task", query: "리드" },
  { match: /통화|컨택|활동/, topic: "activity", query: "활동" },
  { match: /리드|담당\s*바뀌|상태/, topic: "lead", query: "리드" },
  { match: /쇼룸/, topic: "showroom", query: "쇼룸" },
]

function matchRead(text: string): ReadTarget | undefined {
  const tool = READ_TOOLS.find((entry) => entry.match.test(text))
  if (tool) return { kind: "tool", tool: tool.tool }
  const screen = READ_SCREENS.find((entry) => entry.match.test(text))
  if (screen) return { kind: "screen", topic: screen.topic, query: screen.query }
  return undefined
}

export function scoreBranches(text: string): { scores: Record<AskBranch, number>; read?: ReadTarget } {
  const scores: Record<AskBranch, number> = { knowledge: 1, contact: 0, link: 0, read: 0, consultations: 0 }
  const symptom = SYMPTOM.test(text)
  const knowledgeForm = KNOWLEDGE_FORM.test(text)

  if (WHO.test(text.replace(INDIRECT_WHO, " "))) scores.contact += 5
  else if (WHO_SOFT.test(text) && /알려|찾아|어디/.test(text) && !knowledgeForm) scores.contact += 2

  if (LINK_OBJ.test(text)) scores.link += 2
  if (LINK_FORM.test(text)) scores.link += 3
  if (scores.link > 0 && /알려|줘|복사|보내|좀|어디/.test(text)) scores.link += 1
  if (symptom) scores.link = Math.min(scores.link, 1)

  const read = symptom || SCREEN_WHERE.test(text) ? undefined : matchRead(text)
  if (read && READ_FORM.test(text)) {
    scores.read += 4
    if (read.kind === "tool" && read.tool === "quotes_list" && !/목록|얼마|금액|몇\s*번|버전|비교|내역|상태|현황|보여|뭐\s*있|합계/.test(text)) {
      scores.read -= 2
    }
    if (knowledgeForm) scores.read -= 3
  }

  if (isConsultationAsk(text)) scores.consultations += CONSULT_RECORD.test(text) ? 8 : 7

  if (knowledgeForm) scores.knowledge += 2
  if (PRODUCT.test(text)) scores.knowledge += 1
  if (symptom) scores.knowledge += 2
  return { scores, read: scores.read > 0 ? read : undefined }
}

const CONTENTLESS = /^(?:안녕|하이|hi|hello|고마워|감사|ㅎㅎ|ㅋㅋ|네|응|ㅇㅇ|테스트)[!.~?\s]*$/i

/** 한 조각의 갈래. 결정형이고 같은 글이면 늘 같은 답이다. */
export function routeSegment(text: string, core: string = text): RouteDecision {
  const trimmed = text.trim()
  const form = detectForm(core.trim())
  const { scores, read } = scoreBranches(trimmed)

  if (form === "command") {
    return { text: trimmed, form, branch: "write", scores, write: classifyWrite(trimmed) }
  }
  if (trimmed.length < 2 || CONTENTLESS.test(trimmed)) {
    return { text: trimmed, form, branch: "unknown", scores }
  }

  // 점수가 같으면 지식(기본 갈래)이 앞서지만, 링크·주소·바로가기를 분명히 청했으면 링크가 앞선다.
  const linkAsked = LINK_OBJ.test(trimmed)
  const tieRank = (branch: AskBranch) => (linkAsked && branch === "link" ? -1 : 0)
  const ranked = (Object.entries(scores) as Array<[AskBranch, number]>).sort((a, b) => b[1] - a[1] || tieRank(a[0]) - tieRank(b[0]))
  const [first, second] = ranked
  const decision: RouteDecision = { text: trimmed, form, branch: first[0], scores, ...(first[0] === "read" && read ? { read } : {}) }
  // 분명한 요청 갈래(담당자·링크·조회) 둘이 3점 이상이고 1점 안쪽으로 붙으면 되묻는다. 지식은 기본 갈래라 되묻기 후보가 아니다.
  if (first[0] !== "knowledge" && second[0] !== "knowledge" && second[1] >= 3 && first[1] - second[1] <= 1) {
    decision.clarify = [first[0], second[0]]
  }
  return decision
}

export function routeMessage(text: string): RouteDecision[] {
  return routeMessageDetailed(text).decisions
}

/** 조각별 갈래와, 상한을 넘어 이번 턴에 답하지 않는 조각(dropped). */
export function routeMessageDetailed(text: string): { decisions: RouteDecision[]; dropped: string[] } {
  const { parts, dropped } = splitSegmentPartsDetailed(text)
  return { decisions: parts.map((part) => routeSegment(part.text, part.core)), dropped }
}

export const BRANCH_LABEL: Record<AskBranch, string> = {
  knowledge: "클래스인 정보 답",
  contact: "담당자 찾기",
  link: "화면·주소 링크",
  read: "데이터 조회",
  consultations: "상담 내역 찾기",
}
