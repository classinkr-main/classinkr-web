import "server-only"

// "누구에게 물어야 하나" 결정형 답(모델 없음, 2026-11 B2 — 사용자 요구: 한국 팀·고객사 담당 매칭).
//
// resolveContact(question, deps) 는 화면·채널과 무관하다. 어드민 내부 CS 화면, 나중의 갈매봇·위컴 방 응답이
// 같은 함수를 부르고, 자료는 deps 로 주입한다(서버 연결은 contact-deps.ts, 시험은 가짜 deps).
//
// 순서:
//  ① 질문에 고객사(또는 열려 있는 고객)가 있으면 그 고객사의 담당 매니저와 근거(담당 지정·딜·결제·문제 이력·최근 연락)
//  ② 한국 지사 업무 낱말(견적·계약·입금·세금계산서·출고·설치·AS 접수·마케팅·홈페이지·어드민 권한)이면 한국 담당표
//     — R20: 한국 내부 문맥은 본사보다 먼저 본다("견적서 문자로"가 본사 SMS 로 가던 오분류)
//  ③ 본사 기술 문제면 HQ 도메인(escalation-routing 의 점수식)
//  ④ 모르면 이름을 지어내지 않고 "담당표에 없음 — 누구에게 물어 채울지" 기본 답
//
// 사람 이름은 이 파일에 쓰지 않는다. 한국 담당표는 DB(internal_team_contacts — 설정 › 담당자 표, 2026-11-26)에서
// 사람이 채우고, 서버 연결(contact-deps.ts)이 deps.loadKrContacts 로 넘긴다. 코드의 KR_CONTACT_ROWS 는 여전히 빈 표다
// (양식: 업무 영역별 1차 담당·대리·연락 방법·준비물·어드민 링크·확인일). 값이 없으면 역할 이름과
// 어드민 계정의 역할·권한(deps.listStaff)으로만 답한다. 표를 읽지 못하면 빈 표로 답하고 카드에 실패를 적는다.
//
// deps.roleOnly — 답이 여러 사람에게 보이는 곳(위컴 단체방): 한국 지사·모름 카드에 사람 이름(담당표·어드민 계정)을 싣지 않고
// 역할만 싣는다(namesHidden). 본사 카드는 문서의 본사 담당 표(HQ_DOMAINS) 그대로다.

import { classifyHqDomain, HQ_DOMAINS } from "./escalation-routing"
import type { EscalationCandidate } from "./escalation-types"

/** 고객 매칭이 쓰는 정규화(공백 제거·소문자)와 같은 기준으로 같은 이름인지 본다. */
function isSameCustomerName(a: string, b: string) {
  const norm = (value: string) => value.replace(/\s+/g, "").toLowerCase()
  return norm(a ?? "") === norm(b ?? "")
}

export type ContactKind = "customer_owner" | "hq" | "kr" | "unknown"

export type ContactEvidenceKind =
  | "owner_assignment"
  | "deal"
  | "order"
  | "payment"
  | "issue"
  | "contact_history"
  | "consultation"
  | "kr_table"
  | "staff_role"
  | "document"

export interface ContactEvidence {
  kind: ContactEvidenceKind
  label: string
  /** 건수. 세지 못했으면 null(0 과 다르다). */
  count: number | null
  /** 어드민 화면 링크(상대 경로). */
  href: string | null
}

export interface ContactChannel {
  label: string
  href: string | null
}

export interface ContactCard {
  kind: ContactKind
  /** 역할과 표시 이름. 이름을 모르면 역할만. */
  who: string
  backup: string | null
  /** 물어보러 갈 때 준비해 갈 것. */
  prepare: string[]
  channel: ContactChannel
  evidence: ContactEvidence[]
  /** 담당 정보의 기준일(표의 확인일·문서 기준일·자료 조립 시각). 모르면 null. */
  verifiedAt: string | null
  /** 이 답을 고른 이유(한 줄). */
  reason: string
  /** 분류가 애매할 때의 후보(HQ 도메인 2개 또는 고객 여러 곳). */
  alternatives: string[]
  /** 담당표·자료에 빈칸이 있어 사람이 채워야 할 것. */
  gaps: string[]
  /** deps.roleOnly 로 만든 카드 — 사람 이름 없이 역할만 실었다. 그 밖의 카드에는 이 칸이 없다. */
  namesHidden?: true
}

// ── 한국 담당표 ─────────────────────────────────────────────────────────────────────────

export type KrTopicKey =
  | "quote"
  | "contract"
  | "payment"
  | "tax_invoice"
  | "hw_shipping"
  | "hw_approval"
  | "install"
  | "as"
  | "cs_first"
  | "hq_escalation"
  | "marketing"
  | "website_error"
  | "admin_access"
  | "showroom"

/** 담당을 찾는 규칙(사람 이름 없이). 어드민 계정의 역할·권한·팀 역할로 사람을 찾는다. */
export type KrRoleResolver =
  | { by: "capability"; value: string }
  | { by: "admin_role"; value: string }
  | { by: "team_role"; value: string }

export interface KrTopic {
  key: KrTopicKey
  area: string
  match: RegExp
  /** 문서·코드에 적힌 담당 역할. 없으면 null. */
  role: string | null
  roleSource: string | null
  resolver: KrRoleResolver | null
  prepare: string[]
  adminLink: string | null
}

/** 사용자가 채우는 한국 담당표 한 행. 이름·연락 방법은 저장소 밖 자료라 기본값은 비어 있다. */
export interface KrContactRow {
  topic: KrTopicKey
  /** 1차 담당 역할(양식의 "1차 담당 역할"). 비면 KR_TOPICS 의 역할을 쓴다. */
  role?: string | null
  primaryName: string | null
  backupName: string | null
  /** 위컴 방·멘션 등. 웹훅 주소·키는 넣지 않는다. */
  channel: string | null
  prepare: string[]
  adminLink: string | null
  /** 사람이 확인한 날(YYYY-MM-DD). */
  verifiedAt: string | null
  note: string | null
}

const PLAYBOOK = "docs/active/team-operations-playbook-2026-07-03.md"

/**
 * 업무 영역(양식 kr-team-contacts 의 13행 + 쇼룸). 역할은 문서·코드에 있는 것만 적는다.
 * 순서가 우선순위다(위가 먼저) — 예: "하드웨어 출고 승인"은 hw_approval 보다 hw_shipping 이 먼저 맞지 않게 승인을 위에 둔다.
 */
export const KR_TOPICS: KrTopic[] = [
  {
    key: "hw_approval",
    area: "하드웨어 오더 승인",
    match: /하드웨어[^\n]{0,12}(?:오더|주문)?[^\n]{0,6}승인|오더\s*승인/,
    role: "지사장 또는 hardware.finalize 권한 보유자",
    roleSource: "docs/active/hardware-order-revenue-link-plan-2026-10-22.md:22 · lib/admin-capabilities.ts",
    resolver: { by: "capability", value: "hardware.finalize" },
    prepare: ["오더 번호", "고객사", "품목·수량", "요청 출고일"],
    adminLink: "/admin/branch/ledger",
  },
  {
    key: "hw_shipping",
    area: "하드웨어 출고",
    match: /출고|납품|배송/,
    role: "hardware.finalize 권한 보유자(출고 확정)",
    roleSource: "docs/active/hardware-order-revenue-link-plan-2026-10-22.md · lib/admin-capabilities.ts",
    resolver: { by: "capability", value: "hardware.finalize" },
    prepare: ["오더 번호", "고객사", "품목·수량", "희망 출고일·주소 확인 여부"],
    adminLink: "/admin/branch/ledger",
  },
  {
    key: "tax_invoice",
    area: "세금계산서",
    match: /세금\s*계산서|계산서\s*발행|전자\s*세금/,
    role: null,
    roleSource: null,
    resolver: null,
    prepare: ["고객사·사업자 정보 확인 여부", "계약·오더 번호", "발행 금액·일자"],
    adminLink: "/admin/branch/ledger",
  },
  {
    key: "payment",
    area: "결제 수납",
    // '미수신'·'미수강'·'미수령' 은 수납이 아니다('미수'만 낱말로 본다).
    match: /입금|수납|미수(?!신|강|령)|(?:대금|잔금|수업료|수강료|금액|납부금|결제금)\s*미수령|결제\s*(?:확인|내역|반영|기록|이력)/,
    role: null,
    roleSource: null,
    resolver: null,
    prepare: ["고객사", "입금자명·입금일", "계약·오더 번호", "금액"],
    adminLink: "/admin/branch/ledger",
  },
  {
    key: "quote",
    area: "견적",
    match: /견적/,
    role: "BD 팀 (리드→상담→견적→계약 클로징)",
    roleSource: `lib/branch/current-organization.ts · ${PLAYBOOK}`,
    resolver: null,
    prepare: ["고객사", "품목·수량", "희망 납기", "기존 견적 번호(있으면)"],
    adminLink: "/admin/quotes",
  },
  {
    key: "contract",
    area: "계약",
    // 계약 업무 말이 붙을 때만(계약 기간이 끝나 로그인이 막힘 같은 기술 문의는 본사·일반으로 — 검토 동작-3).
    match: /계약(?:금|서|\s*조건|\s*(?:갱신|연장|해지|체결|문의|담당))/,
    role: "BD 팀 (리드→상담→견적→계약 클로징)",
    roleSource: `lib/branch/current-organization.ts · ${PLAYBOOK}`,
    resolver: null,
    prepare: ["고객사", "견적 번호", "계약 조건(기간·금액)"],
    adminLink: "/admin/contracts",
  },
  {
    key: "install",
    area: "설치",
    match: /설치\s*(?:일정|기사|예약|담당)|현장\s*설치/,
    role: null,
    roleSource: null,
    resolver: null,
    prepare: ["고객사·주소", "품목·수량", "희망 일정", "현장 담당자 연락 가능 여부"],
    adminLink: null,
  },
  {
    key: "as",
    area: "A/S 접수",
    match: /A\/S\s*접수|AS\s*접수|수리\s*접수/,
    role: null,
    roleSource: null,
    resolver: null,
    prepare: ["고객사", "기기 모델·시리얼", "증상 사진·영상", "구입 시기(보증 판단용)"],
    adminLink: null,
  },
  {
    key: "showroom",
    area: "쇼룸 예약",
    match: /쇼룸/,
    role: null,
    roleSource: null,
    resolver: null,
    prepare: ["방문 희망 일시", "방문 인원", "관심 제품"],
    adminLink: null,
  },
  {
    key: "marketing",
    area: "마케팅 캠페인",
    match: /마케팅|캠페인|광고(?!\s*차단)|리드\s*유입/,
    role: "MKT 팀 (리드 발굴·양성)",
    roleSource: `lib/branch/current-organization.ts · ${PLAYBOOK}`,
    resolver: null,
    prepare: ["캠페인·채널 이름", "기간", "보고 싶은 지표"],
    adminLink: "/admin/marketing",
  },
  // admin_access 가 website_error 보다 앞: '홈페이지 어드민 계정'은 홈페이지 오류가 아니라 계정 권한 문의다.
  {
    key: "admin_access",
    area: "어드민 계정 권한",
    // 우리 어드민만. '기관 관리자 계정'은 ClassIn 기관 관리 화면이라 본사 쪽이다.
    match: /어드민\s*(?:계정|권한|로그인)|(?:사이트|홈페이지|CRM)\s*관리자\s*(?:계정|권한)/,
    role: "SUPER_ADMIN (슈퍼 어드민)",
    roleSource: "docs/active/admin-os-operating-decisions-2026-07-11.md §1",
    resolver: { by: "admin_role", value: "SUPER_ADMIN" },
    prepare: ["계정 이메일(본인 확인)", "필요한 화면·권한", "사유"],
    adminLink: "/admin/users",
  },
  {
    key: "website_error",
    area: "홈페이지 오류",
    // 우리 사이트만. 학교·학원·기관 홈페이지 이야기는 고객 쪽 문제다.
    match: /(?<!(?:학교|학원|기관|고객사?)\s*)(?:홈페이지|웹사이트)|사이트\s*오류|랜딩\s*페이지/,
    role: null,
    roleSource: null,
    resolver: null,
    prepare: ["페이지 주소", "기기·브라우저", "화면 캡처", "발생 시각"],
    adminLink: null,
  },
  {
    key: "cs_first",
    area: "CS 1차",
    match: /고객\s*문의\s*(?:1차|분류)|CS\s*1차/,
    role: "CS 매니저 및 담당자",
    roleSource: "docs/active/cs-ops-standard-runbook-2026-08.md",
    resolver: null,
    prepare: ["문의 원문", "고객사", "받은 채널"],
    adminLink: "/admin/cs-chatbot",
  },
  {
    key: "hq_escalation",
    area: "본사 에스컬레이션",
    match: /본사\s*(?:에\s*)?(?:문의|에스컬|보고|전달)/,
    role: "본사 담당 표(업무규칙 §7)의 영역별 담당",
    roleSource: "docs/active/cs-error-cases-workflow-rules-2026-10-02.md §7",
    resolver: null,
    prepare: ["증상 한 줄", "계정 ID(1:1 전달)", "기관", "발생 시각", "기기·버전"],
    adminLink: "/admin/cs-chatbot",
  },
]

/** 한국 담당표. 비어 있다 — 사용자가 업무 영역별로 채운다(readKrContacts 의 CSV 양식). */
export const KR_CONTACT_ROWS: KrContactRow[] = []

const KR_TOPIC_KEYS = new Set<string>(KR_TOPICS.map((topic) => topic.key))
const KR_AREA_TO_KEY = new Map(KR_TOPICS.map((topic) => [topic.area, topic.key]))
// 양식의 영역 이름 표기 차이를 받는다.
KR_AREA_TO_KEY.set("AS", "as")
KR_AREA_TO_KEY.set("A/S", "as")

/**
 * CSV 글을 행·칸으로 나눈다. 따옴표 안의 쉼표·줄바꿈·두 겹 따옴표("")를 받는다(구글 시트 내보내기 꼴).
 * 각 행은 [시작 줄 번호, 칸 목록] — 줄 번호는 미리보기에서 "몇째 줄"을 알릴 때 쓴다.
 */
function splitCsvRecords(text: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = []
  let cells: string[] = []
  let current = ""
  let quoted = false
  let line = 1
  let recordLine = 1
  const pushRecord = () => {
    cells.push(current)
    if (cells.some((cell) => cell.trim())) records.push({ line: recordLine, cells: cells.map((cell) => cell.trim()) })
    cells = []
    current = ""
  }
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        current += '"'
        index += 1
      } else if (char === '"') quoted = false
      else {
        if (char === "\n") line += 1
        current += char
      }
    } else if (char === '"') quoted = true
    else if (char === ",") {
      cells.push(current)
      current = ""
    } else if (char === "\r" && text[index + 1] === "\n") {
      // \r\n 은 다음 글자(\n)에서 행을 끝낸다.
    } else if (char === "\n" || char === "\r") {
      pushRecord()
      line += 1
      recordLine = line
    } else current += char
  }
  pushRecord()
  return records
}

/** 미리보기용 — 건너뛴 행과 이유. 줄 번호는 CSV 글의 줄(머리 줄이 1). */
export interface KrContactsCsvSkip {
  line: number
  area: string | null
  reason: string
}

/** 미리보기용 — 넣기는 하지만 값 일부를 비운 행(형식이 맞지 않는 확인일·어드민 링크). */
export interface KrContactsCsvNote {
  line: number
  topic: KrTopicKey
  message: string
}

export interface KrContactsCsvParse {
  rows: KrContactRow[]
  /** rows[i] 가 CSV 의 몇째 줄에서 왔는지(rows 와 같은 순서). */
  lines: number[]
  skipped: KrContactsCsvSkip[]
  notes: KrContactsCsvNote[]
  /** 꼭 있어야 하는 머리 칸(업무 영역·1차 담당자) 중 없는 것. 있으면 rows 는 비어 있다. */
  missingColumns: string[]
}

const REQUIRED_CSV_COLUMNS = ["업무 영역", "1차 담당자"] as const

/**
 * 한국 담당표 CSV(양식: 업무 영역, 예시 질문, 1차 담당 역할, 1차 담당자, 대리 담당자, 연락 방법, 준비해 갈 것,
 * 관련 어드민 화면 링크, 비고[, 확인일])를 읽고, 건너뛴 행의 이유까지 돌려준다(담당자 표 화면의 CSV 가져오기 미리보기).
 * 담당자 칸이 빈 행·모르는 영역·같은 영역이 앞에 있는 행은 건너뛴다.
 */
export function parseKrContactsCsv(csv: string): KrContactsCsvParse {
  const records = splitCsvRecords(csv.replace(/^\uFEFF/, ""))
  const empty: KrContactsCsvParse = { rows: [], lines: [], skipped: [], notes: [], missingColumns: [] }
  if (records.length === 0) return { ...empty, missingColumns: [...REQUIRED_CSV_COLUMNS] }
  const header = records[0].cells
  const col = (name: string) => header.findIndex((cell) => cell.replace(/\s/g, "").includes(name.replace(/\s/g, "")))
  const areaCol = col("업무영역")
  const roleCol = col("1차담당역할")
  const primaryCol = col("1차담당자")
  const backupCol = col("대리담당자")
  const channelCol = col("연락방법")
  const prepareCol = col("준비해갈것")
  const linkCol = col("관련어드민")
  const noteCol = col("비고")
  const verifiedCol = col("확인일")
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((name) => col(name) < 0)
  if (missingColumns.length > 0) return { ...empty, missingColumns }

  const result: KrContactsCsvParse = { ...empty }
  const seen = new Set<KrTopicKey>()
  for (const { line, cells } of records.slice(1)) {
    const cell = (index: number) => (index >= 0 ? cells[index]?.trim() || null : null)
    const area = cell(areaCol)
    const topic = area ? KR_AREA_TO_KEY.get(area) ?? (KR_TOPIC_KEYS.has(area) ? (area as KrTopicKey) : null) : null
    const primaryName = cell(primaryCol)
    if (!area) {
      result.skipped.push({ line, area: null, reason: "업무 영역이 비었습니다." })
      continue
    }
    if (!topic) {
      result.skipped.push({ line, area, reason: `모르는 업무 영역입니다("${area}").` })
      continue
    }
    if (!primaryName) {
      result.skipped.push({ line, area, reason: "1차 담당자가 비어 있습니다(양식 행)." })
      continue
    }
    if (seen.has(topic)) {
      result.skipped.push({ line, area, reason: "같은 업무 영역이 앞 줄에 있습니다 — 앞 줄만 씁니다." })
      continue
    }
    seen.add(topic)
    const verifiedAt = cell(verifiedCol)
    const link = cell(linkCol)
    if (verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) {
      result.notes.push({ line, topic, message: `확인일 "${verifiedAt}"이 YYYY-MM-DD 가 아니라 비웠습니다.` })
    }
    if (link && !link.startsWith("/admin")) {
      result.notes.push({ line, topic, message: "관련 어드민 화면 링크가 /admin 으로 시작하지 않아 비웠습니다." })
    }
    result.rows.push({
      topic,
      role: cell(roleCol),
      primaryName,
      backupName: cell(backupCol),
      channel: cell(channelCol),
      prepare: (cell(prepareCol) ?? "").split(/[·;|\n]/).map((item) => item.trim()).filter(Boolean),
      adminLink: link?.startsWith("/admin") ? link : null,
      verifiedAt: verifiedAt && /^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) ? verifiedAt : null,
      note: cell(noteCol),
    })
    result.lines.push(line)
  }
  return result
}

/**
 * 한국 담당표 CSV 를 읽는다(parseKrContactsCsv 의 행만). 담당자 칸이 빈 행은 건너뛴다. 모르는 영역 이름도 건너뛴다.
 * 인자가 없으면 코드의 KR_CONTACT_ROWS(기본 빈 표)를 돌려준다.
 */
export function readKrContacts(csv?: string | null): KrContactRow[] {
  if (!csv) return [...KR_CONTACT_ROWS]
  return parseKrContactsCsv(csv).rows
}

// ── 주입 자료 ──────────────────────────────────────────────────────────────────────────

export interface CustomerRef {
  /** 통합 고객 키(lead:… / neo:…). */
  key: string
  name: string
  /** 어드민 고객 화면 링크. */
  href: string
}

export interface CustomerOwnerEvidence {
  ownerName: string | null
  /** 담당 지정 근거(예: "NEO 계정 담당", "리드 담당"). */
  ownerSource: string | null
  deals: { total: number | null; open: number | null; ownerNames: string[] }
  orders: number | null
  collections: number | null
  /** 문제 이력(위험 사유·서비스 위험 사유). */
  issues: string[]
  activityTotal: number | null
  lastContactAt: string | null
  lastContactActor: string | null
  generatedAt: string | null
  /** 자료 일부를 읽지 못했다는 경고. */
  warnings: string[]
}

export interface StaffMember {
  displayName: string
  role: string
  teamRole: string | null
  capabilities: string[]
  active: boolean
}

export interface ConsultationHit {
  /** 상담 건 id(채널 상담). */
  conversationId: string
  occurredAt: string | null
}

export interface ResolveContactDeps {
  /** 질문 글에 나오는 고객사를 찾는다(이름 일치). 없으면 빈 배열. */
  findCustomersInText?: (question: string) => Promise<CustomerRef[]>
  /** 고객 한 곳의 담당·딜·결제·문제 이력. */
  loadCustomerEvidence?: (customer: CustomerRef) => Promise<CustomerOwnerEvidence | null>
  /** 그 고객사의 과거 채널 상담(선택 — 임베딩 검색이라 기본 연결에서는 끈다). */
  searchConsultations?: (question: string, customer: CustomerRef) => Promise<ConsultationHit[]>
  /** 어드민 계정의 역할·권한(사람을 역할로 찾는다). */
  listStaff?: () => Promise<StaffMember[]>
  /** 한국 담당표(고정 값 — 시험·스크립트용). 있으면 loadKrContacts 보다 먼저 쓴다. */
  krContacts?: KrContactRow[]
  /**
   * 한국 담당표 읽기(서버 연결: DB internal_team_contacts, 짧은 캐시). 한국 지사 업무 갈래에서만 부른다.
   * 실패(던짐 또는 failed:true)면 빈 표로 답하고 카드 gaps 맨 앞에 실패를 적는다. 둘 다 없으면 readKrContacts()(기본 빈 표).
   */
  loadKrContacts?: () => Promise<KrContactTable>
  /** 답이 여러 사람에게 보이는 곳(위컴 단체방) — 한국 지사·모름 카드에 사람 이름 없이 역할만 싣는다. */
  roleOnly?: boolean
}

/** 한국 담당표 읽기 결과. failed 면 rows 는 빈 배열이고 warning 이 이유(표 미적용 등)다. */
export interface KrContactTable {
  rows: KrContactRow[]
  failed: boolean
  warning: string | null
}

export interface ResolveContactOptions {
  /** 지금 열려 있는 고객(예: CS 대화의 customer_context 고객). 질문에 고객사가 없을 때 쓴다. */
  openCustomer?: CustomerRef | null
  tags?: string[]
}

// ── 조립 ───────────────────────────────────────────────────────────────────────────────

const HQ_PREPARE = [
  "증상 한 줄(언제부터·몇 대·재현 여부)",
  "기관명",
  "계정 ID — 단체방이 아니라 담당자에게 1:1",
  "수업 ID",
  "발생 시각(북경 시각 = 한국 -1시간)",
  "기기·OS·ClassIn 버전",
  "오류 코드·화면 캡처",
]

const UNKNOWN_DEFAULT_ASK = "지사장(branch_director)"
const KR_TABLE_FAILED_GAP = "한국 담당자 표를 읽지 못해 기본 경로(역할·계정 권한)로 안내합니다 — 설정 › 담당자 표를 확인하세요."
const NAME_IN_PRIVATE = "이름은 갈매봇 1:1 로 물어봐 주세요"

async function safe<T>(task: (() => Promise<T>) | undefined, fallback: T): Promise<{ value: T; failed: boolean }> {
  if (!task) return { value: fallback, failed: false }
  try {
    return { value: await task(), failed: false }
  } catch {
    return { value: fallback, failed: true }
  }
}

function staffFor(resolver: KrRoleResolver | null, staff: StaffMember[]) {
  if (!resolver) return []
  return staff.filter((member) => {
    if (!member.active) return false
    if (resolver.by === "capability") return member.capabilities.includes(resolver.value)
    if (resolver.by === "admin_role") return member.role === resolver.value
    return member.teamRole === resolver.value
  })
}

function branchDirectors(staff: StaffMember[]) {
  return staffFor({ by: "team_role", value: "branch_director" }, staff)
}

function joinNames(members: StaffMember[]) {
  return members.map((member) => member.displayName).join(", ")
}

async function customerCard(
  question: string,
  customer: CustomerRef,
  others: CustomerRef[],
  deps: ResolveContactDeps,
  extraAlternatives: string[] = []
): Promise<ContactCard> {
  const [evidenceResult, consultationResult] = await Promise.all([
    safe(deps.loadCustomerEvidence ? () => deps.loadCustomerEvidence!(customer) : undefined, null),
    safe(deps.searchConsultations ? () => deps.searchConsultations!(question, customer) : undefined, [] as ConsultationHit[]),
  ])
  const data = evidenceResult.value
  const gaps: string[] = []
  const evidence: ContactEvidence[] = []
  if (evidenceResult.failed || !data) gaps.push("고객 자료를 읽지 못했습니다 — 고객 화면에서 담당을 직접 확인하세요.")

  if (data) {
    evidence.push({
      kind: "owner_assignment",
      label: data.ownerName ? `담당 지정: ${data.ownerName}${data.ownerSource ? ` (${data.ownerSource})` : ""}` : "담당 지정 없음",
      count: data.ownerName ? 1 : 0,
      href: customer.href,
    })
    evidence.push({
      kind: "deal",
      label: `딜 ${data.deals.total ?? "?"}건(진행 ${data.deals.open ?? "?"})${data.deals.ownerNames.length ? ` — 딜 담당 ${data.deals.ownerNames.join(", ")}` : ""}`,
      count: data.deals.total,
      href: "/admin/crm/deals",
    })
    evidence.push({ kind: "order", label: `수주·주문 ${data.orders ?? "?"}건`, count: data.orders, href: customer.href })
    evidence.push({ kind: "payment", label: `수금·결제 ${data.collections ?? "?"}건`, count: data.collections, href: customer.href })
    evidence.push({
      kind: "issue",
      label: data.issues.length ? `문제 이력: ${data.issues.join(" · ")}` : "문제 이력 없음",
      count: data.issues.length,
      href: customer.href,
    })
    evidence.push({
      kind: "contact_history",
      label: data.lastContactAt
        ? `최근 연락 ${data.lastContactAt.slice(0, 10)}${data.lastContactActor ? ` (${data.lastContactActor})` : ""}, 활동 ${data.activityTotal ?? "?"}건`
        : `활동 ${data.activityTotal ?? "?"}건, 최근 연락 기록 없음`,
      count: data.activityTotal,
      href: customer.href,
    })
    for (const warning of data.warnings) gaps.push(warning)
  }
  if (deps.searchConsultations) {
    evidence.push({
      kind: "consultation",
      label: consultationResult.failed ? "과거 상담 검색 실패" : `과거 채널 상담 ${consultationResult.value.length}건`,
      count: consultationResult.failed ? null : consultationResult.value.length,
      href: "/admin/channel-talk",
    })
  }
  const sameName = others.filter((other) => isSameCustomerName(other.name, customer.name))
  if (sameName.length > 0) {
    gaps.unshift(`같은 이름의 고객이 ${sameName.length + 1}명입니다(${customer.key} 외 ${sameName.map((other) => other.key).join(", ")}) — 고객 화면에서 맞는 고객인지 확인하세요.`)
  }
  // 견적 작성자·사내 CS 상담 배정은 고객 단위로 묶는 조회가 아직 없다(주입 자료 없음).
  gaps.push("견적 작성자·사내 CS 상담 배정은 고객 단위 조회가 없어 근거에 넣지 못했습니다.")

  const owner = data?.ownerName ?? null
  const dealOwners = (data?.deals.ownerNames ?? []).filter((name) => name !== owner)
  return {
    kind: "customer_owner",
    who: owner ? `담당 매니저 — ${owner}` : "담당 매니저 미지정(CRM 에 담당 없음)",
    backup: dealOwners.length ? `딜 담당 — ${dealOwners.join(", ")}` : data?.lastContactActor && data.lastContactActor !== owner ? `최근 연락 — ${data.lastContactActor}` : null,
    prepare: ["고객사 이름", "물어볼 내용(결제·견적·문제 이력 중 무엇)", "관련 견적·오더 번호(있으면)"],
    channel: {
      label: "고객 화면에서 담당을 확인하고 담당 매니저에게 직접(어드민 계정↔위컴 매핑 없음)",
      href: customer.href,
    },
    evidence,
    verifiedAt: data?.generatedAt ?? null,
    reason: `질문 또는 열린 대화의 고객사 "${customer.name}"`,
    alternatives: [...others.map((other) => (isSameCustomerName(other.name, customer.name) ? `${other.name} (${other.key})` : other.name)), ...extraAlternatives],
    gaps,
  }
}

interface KrCardOptions {
  alternatives?: string[]
  /** 사람 이름 없이 역할만(위컴 단체방). */
  roleOnly?: boolean
  /** 한국 담당표를 읽지 못했다(빈 표로 답한다). */
  tableFailed?: boolean
  tableWarning?: string | null
}

/**
 * 역할만 싣는 카드에서 — 사람 이름이 든 글(역할·연락 방법·준비물 칸에 이름을 적은 경우)은 싣지 않는다.
 * 아는 이름(그 행의 1차·대리, 어드민 계정 이름)만 거른다. 표에도 계정에도 없는 사람 이름은 글만으로 가려낼 수 없다 —
 * 그래서 담당자 표 화면은 역할·연락 방법 칸에 이름 대신 역할·방 이름만 적게 안내한다(TeamContactsPanel).
 */
function mentionsAny(text: string, names: string[]) {
  return names.some((name) => text.includes(name))
}

function krCard(
  topic: KrTopic,
  rows: KrContactRow[],
  staff: StaffMember[],
  staffFailed: boolean,
  options: KrCardOptions = {}
): ContactCard {
  const roleOnly = options.roleOnly === true
  const row = rows.find((item) => item.topic === topic.key) ?? null
  const byRole = staffFor(topic.resolver, staff)
  const directors = branchDirectors(staff)
  const gaps: string[] = []
  const evidence: ContactEvidence[] = []
  const knownNames = [row?.primaryName, row?.backupName, ...staff.map((member) => member.displayName)]
    .map((name) => name?.trim() ?? "")
    .filter((name) => name.length >= 2)
  // 역할 칸은 자유 글(80자)이다 — 단체방에서는 이름이 든 역할 글 대신 문서의 역할(KR_TOPICS)을 쓴다.
  const rowRole = row?.role?.trim() || null
  const roleLabel = rowRole && !(roleOnly && mentionsAny(rowRole, knownNames)) ? rowRole : topic.role
  let who: string
  if (row?.primaryName) {
    who = roleOnly ? `${roleLabel ?? `${topic.area} 담당`} — ${NAME_IN_PRIVATE}` : `${roleLabel ?? topic.area} — ${row.primaryName}`
    evidence.push({ kind: "kr_table", label: `한국 담당표: ${topic.area}`, count: 1, href: row.adminLink ?? topic.adminLink })
  } else if (byRole.length > 0) {
    who = roleOnly ? `${roleLabel} — ${NAME_IN_PRIVATE}` : `${roleLabel} — ${joinNames(byRole)}`
    evidence.push({ kind: "staff_role", label: `어드민 계정 역할·권한 기준(${topic.resolver?.value})`, count: byRole.length, href: "/admin/users" })
    gaps.push(`한국 담당표의 "${topic.area}" 행이 비어 있어 계정 권한으로 찾았습니다.`)
  } else {
    who = roleLabel ? `${roleLabel} (담당자 이름은 담당표에 없음)` : `담당표에 없음 — ${topic.area}`
    gaps.push(`한국 담당표의 "${topic.area}" 행을 채워 주세요(1차·대리 담당, 연락 방법).`)
  }
  if (options.tableFailed) gaps.unshift(options.tableWarning?.trim() || KR_TABLE_FAILED_GAP)
  if (staffFailed) gaps.push("어드민 계정 목록을 읽지 못했습니다.")
  if (topic.roleSource) evidence.push({ kind: "document", label: `역할 근거: ${topic.roleSource}`, count: null, href: null })

  let backup: string
  if (roleOnly) backup = row?.backupName ? `대리 담당 — ${NAME_IN_PRIVATE}` : "지사장(기본 경로)"
  else if (row?.backupName) backup = row.backupName
  else backup = directors.length > 0 ? `지사장 — ${joinNames(directors)}` : "지사장(담당표가 비어 있을 때의 기본 경로)"
  const channelLabel = row?.channel && !(roleOnly && mentionsAny(row.channel, knownNames)) ? row.channel : null
  const prepareSource = row?.prepare.length ? row.prepare : topic.prepare
  const prepare = roleOnly ? prepareSource.filter((item) => !mentionsAny(item, knownNames)) : prepareSource
  return {
    kind: "kr",
    who,
    backup,
    prepare: prepare.length ? prepare : topic.prepare,
    channel: { label: channelLabel ?? "한국 팀 사내 메신저(담당표에 연락 방법 없음)", href: row?.adminLink ?? topic.adminLink },
    evidence,
    verifiedAt: row?.verifiedAt ?? null,
    reason: `한국 지사 업무: ${topic.area}`,
    alternatives: options.alternatives ?? [],
    gaps,
    ...(roleOnly ? { namesHidden: true as const } : {}),
  }
}

function hqCard(domain: string, candidates: EscalationCandidate[]): ContactCard {
  const contact = HQ_DOMAINS[domain] ?? HQ_DOMAINS.general
  return {
    kind: "hq",
    who: `본사 ${contact.domainLabel} — ${contact.primaryContact}`,
    backup: contact.secondaryContact ?? contact.firstLineContact,
    prepare: HQ_PREPARE,
    channel: {
      label: `위컴 ${contact.wecomMention}${contact.channelNote ? ` · ${contact.channelNote}` : ""}`,
      href: "/admin/cs-chatbot",
    },
    evidence: [{ kind: "document", label: `담당 표 근거: ${contact.source}`, count: null, href: null }],
    verifiedAt: contact.verifiedAt,
    reason: `본사 기술 영역: ${contact.domainLabel}`,
    alternatives: candidates.filter((item) => item.domain !== domain).map((item) => item.domainLabel),
    gaps: [],
  }
}

function unknownCard(staff: StaffMember[], candidates: EscalationCandidate[], roleOnly = false): ContactCard {
  const directors = roleOnly ? [] : branchDirectors(staff)
  const ask = directors.length > 0 ? `${UNKNOWN_DEFAULT_ASK} — ${joinNames(directors)}` : UNKNOWN_DEFAULT_ASK
  return {
    kind: "unknown",
    who: "담당표에 없음",
    backup: null,
    prepare: ["질문 요지 한 줄", "관련 고객사(있으면)", "언제까지 답이 필요한지"],
    channel: { label: `${ask}에게 물어 담당표를 채운다`, href: null },
    evidence: [],
    verifiedAt: null,
    reason: "고객사·한국 업무·본사 기술 영역 어디에도 맞지 않습니다",
    alternatives: candidates.map((item) => item.domainLabel),
    gaps: ["이 질문 유형의 담당을 한국 담당표에 추가해 주세요."],
    ...(roleOnly ? { namesHidden: true as const } : {}),
  }
}

/** 한국 담당표 — 고정 값 > 서버 읽기(실패면 빈 표 + failed) > 코드의 기본 빈 표. */
async function readKrTable(deps: ResolveContactDeps): Promise<KrContactTable> {
  if (deps.krContacts) return { rows: deps.krContacts, failed: false, warning: null }
  if (deps.loadKrContacts) {
    try {
      const table = await deps.loadKrContacts()
      return table.failed ? { rows: [], failed: true, warning: table.warning } : table
    } catch {
      return { rows: [], failed: true, warning: null }
    }
  }
  return { rows: readKrContacts(), failed: false, warning: null }
}

/** 질문 하나에 대한 담당 카드. 결정형이고 모델을 부르지 않는다. 자료 조회가 실패해도 던지지 않는다. */
export async function resolveContact(
  question: string,
  deps: ResolveContactDeps = {},
  options: ResolveContactOptions = {}
): Promise<ContactCard> {
  const text = question.trim()

  // ① 고객사
  const found = await safe(deps.findCustomersInText ? () => deps.findCustomersInText!(text) : undefined, [] as CustomerRef[])
  const customers = found.value.length > 0 ? found.value : options.openCustomer ? [options.openCustomer] : []
  // 이긴 갈래 말고 다른 갈래 후보도 alternatives 로 보인다(검토 동작-3 — 고장 문의가 고객사·한국 갈래로 가도
  // 본사 영역을 함께 보이게).
  const topic = KR_TOPICS.find((item) => item.match.test(text))
  const classification = classifyHqDomain(text, options.tags ?? [])
  const hqAlternative = classification.domain !== "general" ? [`본사 ${HQ_DOMAINS[classification.domain]?.domainLabel ?? classification.domain}`] : []
  if (customers.length > 0) {
    const krAlternative = topic && topic.key !== "hq_escalation" ? [`한국 지사 ${topic.area}`] : []
    return customerCard(text, customers[0], customers.slice(1), deps, [...krAlternative, ...hqAlternative])
  }

  const staffResult = await safe(deps.listStaff, [] as StaffMember[])

  // ② 한국 지사 업무(R20: 본사보다 먼저)
  if (topic && topic.key !== "hq_escalation") {
    const table = await readKrTable(deps)
    return krCard(topic, table.rows, staffResult.value, staffResult.failed, {
      alternatives: hqAlternative,
      roleOnly: deps.roleOnly === true,
      tableFailed: table.failed,
      tableWarning: table.warning,
    })
  }

  // ③ 본사 기술
  if (classification.domain !== "general") return hqCard(classification.domain, classification.candidates)
  // "본사에 문의" 처럼 영역을 모르는 본사 요청은 1차 접점(小助手)으로.
  if (topic) return hqCard("general", classification.candidates)

  // ④ 모름
  return unknownCard(staffResult.value, classification.candidates, deps.roleOnly === true)
}
