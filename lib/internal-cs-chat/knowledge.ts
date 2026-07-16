import type { InternalCsSourceRef } from "@/lib/internal-cs-chat/gemini"

export type InternalCsKnowledgeStatus =
  | "confirmed"
  | "conditional"
  | "conflicting_sources"
  | "hq_confirmation_required"

export type InternalCsExternalUse =
  | "reviewed_summary_allowed"
  | "internal_only"
  | "confirmation_required"

export interface InternalCsCuratedKnowledgeEntry {
  id: string
  title: string
  status: InternalCsKnowledgeStatus
  externalUse: InternalCsExternalUse
  summary: string
  handling: readonly string[]
  keywords: readonly string[]
  recommendedTags: readonly string[]
  sourceRefs: readonly InternalCsSourceRef[]
  alwaysInclude?: boolean
}

export interface InternalCsKnowledgeSelection {
  entries: InternalCsCuratedKnowledgeEntry[]
  internalContext: string
  sourceRefs: InternalCsSourceRef[]
  recommendedTags: string[]
}

const SOURCE_PRECEDENCE: InternalCsCuratedKnowledgeEntry = {
  id: "source-precedence",
  title: "정본 우선순위와 ZIP 반영 경계",
  status: "confirmed",
  externalUse: "internal_only",
  summary:
    "현재 저장소의 명시적 SSOT를 우선하고, 이번 ZIP은 상세 후보·현장 메모·카피 풀로 사용한다. 날짜·모델·세대·시장 범위가 다른 자료는 자동 병합하지 않는다.",
  handling: [
    "우선순위는 현재 저장소 SSOT → 적용 범위가 확인된 최신 공식 원문 → 한국어 정리본 → 현장 검증 메모 → ZIP 후보 순서다.",
    "충돌 시 하나를 임의 선택하지 말고 모델·세대·시장·앱 버전·효력일·문서 버전을 확인한다.",
    "ZIP의 TODO·추정·글로벌 정책은 한국 고객에게 확정 사실로 전달하지 않는다.",
  ],
  keywords: [],
  recommendedTags: ["evidence:conditional"],
  sourceRefs: [
    {
      id: "docs/active/brand-canon/README.md",
      label: "브랜드·제품 SSOT 인덱스",
    },
    {
      id: "docs/active/internal-cs-content-arrangement-2026-07-15.md",
      label: "내부 CS 콘텐츠 병합·적용 기준",
    },
  ],
  alwaysInclude: true,
}

const SUPPORT_TONE: InternalCsCuratedKnowledgeEntry = {
  id: "support-tone",
  title: "마케팅 카피와 CS 응대 톤 분리",
  status: "confirmed",
  externalUse: "internal_only",
  summary:
    "ZIP의 페인포인트·시대 선언·CTA 5단 구조는 마케팅용이다. CS 답변은 짧은 공감 뒤 확인된 기준, 조건, 다음 행동과 회신 시점을 안내한다.",
  handling: [
    "‘아직도’, ‘시대는 끝났습니다’, ‘200%’, 구매 CTA 같은 표현을 고객 지원 기본 문안에 넣지 않는다.",
    "지원·문서·챗봇 표면에서는 불안을 키우지 않고 사용자가 바로 할 수 있는 확인 순서를 준다.",
    "승인·전송·확정이 끝났다고 표현하지 말고 항상 CS 담당자의 검토 상태를 표시한다.",
  ],
  keywords: ["카피", "문구", "말투", "톤", "고객 답변", "응대", "안내문"],
  recommendedTags: ["intent:howto"],
  sourceRefs: [
    {
      id: "docs/active/brand-canon/voice-charter.md",
      label: "Classin 보이스 헌장",
    },
    {
      id: "docs/active/docs-center-content-guidelines.md",
      label: "문서·지원 콘텐츠 가이드",
    },
  ],
  alwaysInclude: true,
}

const KNOWLEDGE_ENTRIES: readonly InternalCsCuratedKnowledgeEntry[] = [
  SOURCE_PRECEDENCE,
  SUPPORT_TONE,
  {
    id: "brand-positioning",
    title: "한국 시장 포지셔닝",
    status: "confirmed",
    externalUse: "reviewed_summary_allowed",
    summary:
      "한국 1차 카테고리명은 ‘수업 시스템 OS’다. ‘가장 교실다운 AI 교육 플랫폼’은 캠페인·마케팅 슬로건 후보이며 제품 범주를 대체하지 않는다.",
    handling: [
      "기능 나열보다 수업 전 준비 → 판서 → 녹화 → 복습 → LMS → 관리자 데이터의 운영 흐름으로 설명한다.",
      "AI는 최종 판단자가 아니라 교사·운영자를 돕는 보조 기능으로 표현한다.",
    ],
    keywords: ["클래스인이란", "회사 소개", "포지셔닝", "슬로건", "카테고리", "수업 시스템", "ai 교육 플랫폼"],
    recommendedTags: ["area:software", "intent:howto"],
    sourceRefs: [
      {
        id: "docs/active/brand-canon/what-is-classin.md",
        label: "클래스인 이해 기준",
      },
      {
        id: "docs/active/classin-korea-positioning-guidelines.md",
        label: "한국 포지셔닝 가이드",
      },
    ],
  },
  {
    id: "company-facts",
    title: "회사·글로벌 수치·파트너 사실",
    status: "conflicting_sources",
    externalUse: "confirmation_required",
    summary:
      "현재 회사 SSOT는 EEO 공식 기준 5,000만+ 교육자·학습자, 160+개국, 6만+ 기관, 누적 2억+ 세션이다. ZIP의 8만+ 기관, 30억 USD 가치평가, 일부 기술 파트너 확정 표현은 사용하지 않는다.",
    handling: [
      "글로벌 수치에는 ‘전 세계 누적·EEO 공식 소개 기준’ 출처 캡션을 붙인다.",
      "국내 도입 기관 수와 사례 성과는 공개 동의·원자료 확인 전 단정하지 않는다.",
      "Google·Microsoft·Canvas·Moodle 파트너십은 현 SSOT에서 미확인이므로 확정 표현을 피한다.",
    ],
    keywords: ["회사", "eeo", "본사", "글로벌", "기관 수", "사용자", "파트너", "투자", "밸류", "법인", "주소", "대표", "연혁"],
    recommendedTags: ["area:company", "evidence:conflict", "intent:hq_confirmation"],
    sourceRefs: [
      {
        id: "docs/active/brand-canon/company-facts.md",
        label: "EEO·ClassIn 회사 팩트 SSOT",
      },
    ],
  },
  {
    id: "software-current-scope",
    title: "소프트웨어 기능의 현행 범위",
    status: "conditional",
    externalUse: "reviewed_summary_allowed",
    summary:
      "현행 정본은 EDB 교안, 50페이지 칠판, 30+ 교실 도구, 녹화→복습→LMS 흐름과 일반 LMS 활동 9종을 기준으로 한다. ZIP의 20개 도구·LMS 8종·항상 다운로드 차단 표현은 구버전 또는 조건 누락이다.",
    handling: [
      "녹화 다운로드·워터마크·권한은 관리자 설정과 계약 범위에 따라 달라질 수 있다고 안내한다.",
      "제품군은 ClassIn·ClassIn X·NOBOOK·TeacherIn·FlowIn 5개이며 한국 실판매 범위와 구분한다.",
    ],
    keywords: ["소프트웨어", "sw", "lms", "edb", "녹화", "복습", "다운로드", "워터마크", "도구", "활동", "ai 기능", "classin 6", "flowin", "teacherin", "nobook"],
    recommendedTags: ["area:software", "evidence:conditional"],
    sourceRefs: [
      {
        id: "docs/active/classin-software-feature-inventory.md",
        label: "ClassIn 기능·제품 인벤토리",
      },
    ],
  },
  {
    id: "software-capacity-and-ai-claims",
    title: "소프트웨어 용량·성능·AI 제공 범위",
    status: "hq_confirmation_required",
    externalUse: "confirmation_required",
    summary:
      "2,000명·동시 카메라 49개·50ms, RAG 기반 기관 AI, AI 음성 어시스턴트와 AI 문서·수식·그림은 버전·계약·한국 제공 범위를 확인해야 한다.",
    handling: [
      "수치에는 적용 플랜·앱 버전·단일 수업 또는 기관 한도·측정 조건을 요청한다.",
      "AI 기능은 개인정보 처리, 입력 데이터 범위, 담당자 검토 여부를 함께 확인한다.",
      "확인 전에는 기능 제공을 약속하지 않고 본사 확인 질문과 고객 임시 안내를 분리한다.",
    ],
    keywords: ["2000명", "2,000명", "49개", "50ms", "rag", "음성 어시스턴트", "ai 문서", "ai 수식", "ai 그림", "ai 에이전트", "실시간 피드백", "최대 동시"],
    recommendedTags: ["area:software", "intent:hq_confirmation", "evidence:hq_pending"],
    sourceRefs: [
      {
        id: "docs/active/classin-software-feature-inventory.md",
        label: "ClassIn 기능·제품 인벤토리",
      },
      {
        id: "docs/active/internal-cs-content-arrangement-2026-07-15.md#소프트웨어",
        label: "SW 성능·AI 확인 경계",
      },
    ],
  },
  {
    id: "board-generations",
    title: "보드 라인업·세대·사양 충돌",
    status: "conflicting_sources",
    externalUse: "confirmation_required",
    summary:
      "한국 현행 라인업은 S65·S75·S86·S98 Pro·S110 5개다. 2.0은 S65/S75/S86/S110, 3.0은 S65/S75/S86/S98 Pro이며, ZIP의 4모델 표와 일부 S75/S86 수치는 구세대 기준이다.",
    handling: [
      "S75·S86 답변에는 모델명과 2.0/3.0 세대를 먼저 확인한다. 3.0 정본은 S86 BS86C·390W·69.5kg, S75/S86 OPS i5-13420H다.",
      "S65는 현행 정본에서 규격서 미확보 상태이므로 ZIP 수치만으로 확정하지 않는다.",
      "S110 RAM·마이크 구성과 설치 패키지는 최신 견적·공식 규격서·현장 조건을 확인한다.",
    ],
    keywords: ["전자칠판", "보드", "board", "s65", "s75", "s86", "s98", "s110", "bs86", "ops", "인치", "소비전력", "중량", "nfc", "스펙", "사양"],
    recommendedTags: ["area:board", "evidence:conflict", "intent:hq_confirmation"],
    sourceRefs: [
      {
        id: "docs/active/classin-software-feature-inventory.md#8-하드웨어-사양-검증된-원본-기준",
        label: "검증된 보드 사양·세대",
      },
      {
        id: "docs/active/classin-board-s-series-safe-manual-guidelines.md",
        label: "보드 안전 사용 기본 지침",
      },
    ],
  },
  {
    id: "board-install-safety",
    title: "보드 설치·안전 확인",
    status: "conditional",
    externalUse: "reviewed_summary_allowed",
    summary:
      "설치 전 벽면 강도, 전원·접지, LAN, 천장과 시야, 환기, 직사광선, 이동 동선을 확인한다. 설치 인원·시간·벽걸이 가능 여부는 모델과 현장 조건 확인 전 약속하지 않는다.",
    handling: [
      "이상한 소리·냄새·연기·액체 유입 시 즉시 전원을 끄고 플러그를 분리한 뒤 A/S로 연결한다.",
      "이동·설치는 안전 캐논의 보수적 기준을 우선하고, ZIP의 ‘2명·반나절’을 표준 SLA처럼 말하지 않는다.",
      "정확한 설치 가능 여부와 비용은 설치 담당자 현장 확인 뒤 확정한다.",
    ],
    keywords: ["설치", "이동", "벽걸이", "스탠드", "전원", "접지", "환기", "직사광", "청소", "안전", "냄새", "연기", "액체", "lan", "콘센트"],
    recommendedTags: ["area:board", "intent:install", "evidence:conditional"],
    sourceRefs: [
      {
        id: "docs/active/classin-board-s-series-safe-manual-guidelines.md",
        label: "보드 설치·안전 SSOT",
      },
    ],
  },
  {
    id: "camera-lines-and-poe",
    title: "카메라 라인 구분과 PoE 확인",
    status: "hq_confirmation_required",
    externalUse: "confirmation_required",
    summary:
      "T1/S1은 고정형 4K 추적 카메라, OT1/OS1은 20배 광학줌 PTZ 별도 라인이다. OT1의 802.3af는 본사 확인됐지만 OS1은 PoE 단독 현장 동작만 확인되어 정확한 802.3af 지원은 본사 확인이 필요하다.",
    handling: [
      "OT1/OS1과 T1/S1을 같은 모델군으로 섞지 않는다.",
      "T1/S1 렌즈·화각·크기는 규격서와 설명서가 충돌하므로 공개 답변은 현행 규격서 값과 적용 모델을 재확인한다.",
      "PoE 안내에는 사용 장비 규격, Cat5e 이상 케이블, 거리, 현장 스위치·인젝터를 함께 기록한다.",
    ],
    keywords: ["카메라", "camera", "t1", "s1", "ot1", "os1", "ptz", "poe", "802.3af", "추적", "광학줌", "화각"],
    recommendedTags: ["area:camera", "topic:audio_video", "intent:hq_confirmation", "evidence:hq_pending"],
    sourceRefs: [
      {
        id: "docs/active/classin-software-feature-inventory.md#주변기기-classin-cam-t1s1-추적-카메라",
        label: "T1·S1 검증 사양과 충돌 메모",
      },
      {
        id: "docs/active/internal-cs-content-arrangement-2026-07-15.md#카메라와-poe",
        label: "OT1·OS1 보강·확인 경계",
      },
    ],
  },
  {
    id: "microphone-generation",
    title: "마이크 세대와 S110 구성",
    status: "conflicting_sources",
    externalUse: "confirmation_required",
    summary:
      "현재 액세서리 정본은 ClassIn Mic DT2 Pro(MS21A)다. ZIP의 DT1(MS10A) 상세는 레거시·특정 패키지 참고이며, S110에 DT1이 필수라는 문장은 현행 구성으로 자동 적용하지 않는다.",
    handling: [
      "대형 교실 오디오 구성은 보드 모델, 마이크 SKU, 교실 면적·형태, 설치 높이와 소음 조건을 확인한다.",
      "S110 내장 마이크 유무와 필수 SKU는 최신 규격서·견적·본사 회신으로 확인한다.",
    ],
    keywords: ["마이크", "mic", "dt1", "dt2", "ms10a", "ms21a", "수음", "빔포밍", "오디오", "s110 마이크"],
    recommendedTags: ["area:mic", "topic:audio_video", "evidence:conflict", "intent:hq_confirmation"],
    sourceRefs: [
      {
        id: "docs/active/classin-software-feature-inventory.md#주변기기-classin-mic-dt2-pro-천장-마이크-ms21a",
        label: "DT2 Pro 현행 사양",
      },
    ],
  },
  {
    id: "pricing-contract-refund",
    title: "가격·계약·환불의 한국 적용 범위",
    status: "hq_confirmation_required",
    externalUse: "confirmation_required",
    summary:
      "ZIP의 글로벌 최소 결제 주기, 할인, 선불·환불 불가 문구는 한국 계약 정본이 아니다. 주문·계약·프로모션·결제 내역을 확인한 뒤 담당자가 안내한다.",
    handling: [
      "환불 가능 여부와 처리일을 현재 정보만으로 확정하지 않는다.",
      "고객에게는 확인 중인 항목, 담당자, 다음 회신 시점을 먼저 안내한다.",
      "가격은 모델·설치·소프트웨어·온보딩 범위를 확인하고 최종 견적으로 확정한다.",
    ],
    keywords: ["가격", "요금", "결제", "계약", "환불", "할인", "프로모션", "보증", "warranty", "a/s", "as 기간", "출장", "구독", "개월"],
    recommendedTags: ["area:billing", "intent:policy", "intent:hq_confirmation", "evidence:hq_pending"],
    sourceRefs: [
      {
        id: "docs/active/classin-pre-adoption-question-matrix-2026-06-18.md",
        label: "도입 전 계약·가격 확인 단계",
      },
      {
        id: "docs/active/classin-operating-canon-2026-07-02.md",
        label: "Classin 운영 정본",
      },
    ],
  },
  {
    id: "asset-evidence-governance",
    title: "캡처·사진·본사 원문 증거 관리",
    status: "confirmed",
    externalUse: "internal_only",
    summary:
      "한국어 정리본을 활성 지식으로 쓰고 원어 원본은 검증용으로 보존한다. 이미지·로그는 개인정보를 제거하고, 원본 외부 전송은 담당자의 명시적 확인 뒤에만 한다.",
    handling: [
      "정리본에 출처일·문서 버전·모델 코드·세대·한국 적용 범위와 원문 위치를 남긴다.",
      "숫자·모델 코드는 번역하거나 임의 보정하지 않는다.",
      "학생·고객 얼굴, 계정, 연락처, 결제·계약 정보가 있는 캡처는 동의 범위와 민감정보 경고를 기록한다.",
    ],
    keywords: ["캡처", "사진", "이미지", "스크린샷", "첨부", "원본", "중국어", "wecom", "drive", "자산", "문서 버전", "개인정보"],
    recommendedTags: ["evidence:conditional", "intent:hq_confirmation"],
    sourceRefs: [
      {
        id: "docs/active/internal-cs-ai-bridge.md",
        label: "내부 CS 이미지·AI 브리지 운영 기준",
      },
      {
        id: "docs/active/internal-cs-content-arrangement-2026-07-15.md#원문과-자산-운영",
        label: "본사 원문·자산 반영 원칙",
      },
    ],
  },
  {
    id: "hq-communication",
    title: "본사 확인 요청 구성",
    status: "confirmed",
    externalUse: "internal_only",
    summary:
      "본사 요청은 짧은 채팅형 제목 뒤 Case, Impact, Reproduction, Korea checks, Evidence, Request, Reply needed를 고정하고 질문을 1~3개로 제한한다.",
    handling: [
      "제목은 [KR-CS][우선순위][제품 영역][케이스 ID] 한 줄 요약으로 쓴다.",
      "회신에는 적용 시장·모델·세대·효력일·근거 문서 버전을 포함해 달라고 요청한다.",
      "본사 원문과 한국어 요약을 함께 보존하고 고객 전달 문안과 섞지 않는다.",
    ],
    keywords: ["본사", "hq", "wecom", "에스컬레이션", "확인 요청", "문의 템플릿", "소통", "회신"],
    recommendedTags: ["intent:hq_confirmation", "evidence:hq_pending"],
    sourceRefs: [
      {
        id: "docs/active/internal-cs-content-arrangement-2026-07-15.md#소통-템플릿",
        label: "내부·고객·본사 소통 템플릿",
      },
    ],
  },
]

const STATUS_LABELS: Record<InternalCsKnowledgeStatus, string> = {
  confirmed: "확정",
  conditional: "조건부",
  conflicting_sources: "자료 충돌",
  hq_confirmation_required: "본사 확인 필요",
}

const EXTERNAL_USE_LABELS: Record<InternalCsExternalUse, string> = {
  reviewed_summary_allowed: "담당자 검토 후 고객 안내 가능",
  internal_only: "내부 전용",
  confirmation_required: "확인 전 외부 단정 금지",
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim()
}

function scoreEntry(entry: InternalCsCuratedKnowledgeEntry, haystack: string) {
  if (entry.alwaysInclude) return Number.MAX_SAFE_INTEGER
  return entry.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalize(keyword)
    if (!normalizedKeyword || !haystack.includes(normalizedKeyword)) return score
    return score + Math.max(1, Math.min(4, normalizedKeyword.length))
  }, 0)
}

function dedupeSourceRefs(entries: InternalCsCuratedKnowledgeEntry[]) {
  const refs: InternalCsSourceRef[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    for (const ref of entry.sourceRefs) {
      if (seen.has(ref.id)) continue
      seen.add(ref.id)
      refs.push({
        ...ref,
        kind: "curated_knowledge",
        verificationStatus: entry.status,
        externalUse: entry.externalUse,
      })
    }
  }
  return refs
}

function formatEntries(entries: InternalCsCuratedKnowledgeEntry[]) {
  return [
    "[정리된 내부 CS 지식]",
    "아래 항목은 기존 정본과 제공 ZIP을 대조해 재배열한 내부 기준이다. 상태·외부 사용 경계를 유지한다.",
    ...entries.map((entry, index) => [
      `${index + 1}. ${entry.title}`,
      `   상태: ${STATUS_LABELS[entry.status]} / 외부 사용: ${EXTERNAL_USE_LABELS[entry.externalUse]}`,
      `   기준: ${entry.summary}`,
      ...entry.handling.map((item) => `   - ${item}`),
    ].join("\n")),
  ].join("\n")
}

export function selectInternalCsKnowledge(
  question: string,
  queueTags: readonly string[] = [],
  limit = 5
): InternalCsKnowledgeSelection {
  const haystack = normalize([question, ...queueTags].join(" "))
  const mandatory = KNOWLEDGE_ENTRIES.filter((entry) => entry.alwaysInclude)
  const matched = KNOWLEDGE_ENTRIES
    .filter((entry) => !entry.alwaysInclude)
    .map((entry) => ({ entry, score: scoreEntry(entry, haystack) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "ko"))
    .slice(0, Math.max(0, limit - mandatory.length))
    .map(({ entry }) => entry)

  const entries = [...mandatory, ...matched]
  const recommendedTags = Array.from(new Set(matched.flatMap((entry) => entry.recommendedTags)))

  return {
    entries,
    internalContext: formatEntries(entries),
    sourceRefs: dedupeSourceRefs(entries),
    recommendedTags,
  }
}

export function getInternalCsKnowledgeEntries() {
  return KNOWLEDGE_ENTRIES.map((entry) => ({ ...entry }))
}
