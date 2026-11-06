/**
 * 증상형 CS 질문 트리아지.
 *
 * "기관 등록 안됨", "녹화 안 돼요", "에러나요"처럼 짧은 증상 질문을 공개 문제 해결 문서의
 * 해당 섹션으로 바로 잇는다. 답변 단계는 문서 섹션(steps/body)에서 그대로 뽑아 만들므로,
 * 문서(lib/docs-troubleshooting, lib/docs.ts)를 고치면 챗봇 답도 같이 바뀐다.
 *
 * - 근거는 공개 문서(Figma CS 안내 화면 모음 + 공식 도움말을 다시 쓴 것)만 쓴다.
 *   내부 트러블슈팅 지식(docs/active/cs-troubleshooting)은 공개 답변에 쓰지 않는다.
 * - 대상이 없는 오류 질문("에러나요", "안 돼요")은 자주 있는 오류 메뉴와 함께
 *   오류 문구·화면·기기를 되묻는다.
 * - 결정형 답변이라 Gemini 재작성 없이 그대로 내보낸다(stream/non-stream 동일).
 */

import type { ChatbotCategory, ChatbotIntent } from "@/lib/chatbot/classification"
import { FIELD_SYMPTOM_TOPICS } from "@/lib/chatbot/symptom-topics-field"
import { getDocPath, listDocs, type DocArticle } from "@/lib/docs"

export const SYMPTOM_TRIAGE_SOURCE_SCORE = 400

type DocCategory = DocArticle["category"]

interface SymptomStepSource {
  heading: string
  take?: number
  /** 섹션 steps 중 쓸 단계의 위치(0부터). take 보다 우선한다. */
  pick?: number[]
}

export interface SymptomTopic {
  id: string
  /** 증상의 대상(무엇이 안 되는지). */
  subject: RegExp
  /** 대상 regex 가 이미 증상을 담고 있으면 false(예: 튕김, 하울링). 기본 true. */
  requireSymptom?: boolean
  /** 주제 전용 증상 패턴. 없으면 공통 SYMPTOM_RE. */
  symptom?: RegExp
  exclude?: RegExp
  category: ChatbotCategory
  doc: { category: DocCategory; slug: string }
  /** 출처로 보여 줄 섹션. 첫 steps 섹션과 같으면 생략한다. */
  heading?: string
  /** 답변 단계를 뽑을 섹션(순서대로 이어 붙인다). */
  steps: SymptomStepSource[]
  /** 첫 문단. 문서 내용에서 벗어나지 않는 한두 문장. */
  intro: string
  /** 단계 뒤에 붙는 짧은 분기 안내. when 이 있으면 질문이 맞을 때만, unless 가 맞으면 빼고 붙인다. */
  branches?: (string | { text: string; when?: RegExp; unless?: RegExp })[]
  /** 질문이 when 에 맞으면 기본 doc/steps 대신 쓴다(예: 태블릿·학생 관점). 위에서부터 첫 번째를 쓴다. */
  variants?: { when: RegExp; doc?: { category: DocCategory; slug: string }; heading?: string; steps: SymptomStepSource[]; intro?: string }[]
  /** 영어로 물었을 때 첫 줄에 붙일 한 문장 요약. */
  en?: string
  /** 공개 문서로 끝까지 풀 수 없는 주제(네트워크 설정 등)면 상담 연결 버튼을 바로 띄운다. */
  handoff?: boolean
  /** 증상이 아닌 사용법 주제(기능 문의 꼴 질문도 받는다). */
  howto?: boolean
  /** 문의 정보 섹션을 직접 지정할 때. 없으면 문서의 '문의/그래도 안 되면' 섹션을 찾는다. */
  contactHeading?: string
  suggestedQuestions: string[]
  /** 대상 없는 오류 질문에 보여 줄 한 줄 응급 조치. */
  menuLine?: string
  /** Figma 가이드의 알려진 의도(사용법)보다 이 증상 답이 더 구체적일 때 true. */
  overridesKnownIntent?: boolean
}

export interface SymptomTriageResult {
  kind: "topic" | "vague"
  topicId: string
  /** 사용법·점검표 주제(화난 말투여도 상담 연결부터 밀지 않는다). */
  howto?: boolean
  overridesKnownIntent: boolean
  englishSummary?: string
  needsHandoff: boolean
  answer: string
  answerMode: "direct_answer" | "clarifying_question"
  confidence: number
  category: ChatbotCategory
  intent: ChatbotIntent
  source: {
    title: string
    heading: string
    urlPath: string
    category: ChatbotCategory
    excerpt: string
    score: number
  } | null
  suggestedQuestions: string[]
}

// 공통 증상 표현. 질문은 normalizeTriageText 를 거친 소문자·공백 정리본이다.
const SYMPTOM_RE =
  /안\s*(?:돼|되|된|됨|됩|됐|됬|와|왔|오|옴|떠|뜨|뜸|뜬|보|켜|나|들|열|먹|올라|붙|잡|가져|갔|간|가요|넘어|움직|눌|생겨|만들|바뀌|맞|써|쓰|적|그려|그어|잡혀)|검은\s*화면|까만\s*화면|까맣|검게\s*(?:나|보)|못\s*(?:하|해|보|봐|들|받|찾|열|올|넣|쓰|써)|(?:지|진|되|돼|켜|보|나|열|들)\s*않|않(?:아요|아서|습니다|네요|음|는데|아)|멈춰|멈췄|멈춤|멈추|멈춥|멈춘|먹통|튕|끊|꺼져|꺼짐|꺼지|꺼졌|오류|에러|error|버그|실패|반려|거절|막혀|막힘|막혔|막아|이상해|이상하|이상한|이상함|느려|느림|느리|깨져|깨짐|깨지|사라졌|사라져|사라짐|없어졌|없어져|없다고|없대|없어요|없습니다|없네|없음|안돼|안되|안된|안됨|안나|안들|안보|안떠|안뜨|안켜|안와|문제\s*(?:가|있|생|발생)/

// 대상 없는 오류·불만 표현.
const GENERIC_ERROR_RE = /오류|에러|error|버그|bug|문제|이상|고장|먹통|작동|동작|안\s*(?:돼|되|됨)|안돼|안되|안됨|실행\s*(?:이|가)?\s*안/

// "끊김 없는 수업 가능해요?", "무료 체험판 있나요?"처럼 증상이 아니라 기능·가능 여부를 묻는 질문.
const CAPABILITY_QUESTION_RE =
  /(?:없는|없이).{0,12}(?:가능|되나|돼나|될까|할\s*수|있나|있을까)|가능(?:한가요|해요|할까요|한지|하나요|한가)|(?:되나요|돼나요|될까요|있나요|있을까요|있어요|지원(?:하나요|되나요|돼요|되나))\s*$/
// 기능 질문이라도 이런 표현이 있으면 실제 증상으로 본다.
const EXPLICIT_SYMPTOM_RE =
  /안\s*(?:돼|되|됨|됩|됐|와|떠|뜨|보|켜|나|들|열|써)|안돼|안되|안됨|못\s*\S|오류|에러|실패|멈춰|멈췄|멈춤|멈춥|멈춘|튕겨|튕기|튕김|끊겨|끊겼|끊기고|끊깁|끊어져|먹통|꺼져|꺼짐|반려/

export function normalizeTriageText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 증상 주제 목록. 위에서부터 먼저 맞는 주제를 쓴다(좁은 주제 → 넓은 주제 순).
const BASE_SYMPTOM_TOPICS: SymptomTopic[] = [
  // ─── 기관(계정) 인증 ────────────────────────────────────────────
  {
    id: "proxy-registration-password",
    subject: /대리\s*등록.{0,30}(?:비밀번호|비번|로그인|모른|모르)|(?:비밀번호|비번).{0,20}대리\s*등록/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "student-onboarding" },
    steps: [
      { heading: "가입 전인 학생은 대리 등록으로", pick: [0] },
      { heading: "대리 등록했는데 문자가 안 갈 때", take: 3 },
    ],
    intro: "대리 등록한 학생은 따로 비밀번호를 정해 주지 않아도 돼요. 공통 기본 비밀번호는 없고, 임시 비밀번호가 학생에게 문자나 이메일로 갑니다.",
    branches: ["학생에게는 홈페이지가 아니라 설치한 앱에서, 등록한 휴대폰 번호(또는 이메일)와 임시 비밀번호로 로그인하라고 알려 주세요."],
    contactHeading: "",
    suggestedQuestions: ["대리 등록했는데 문자가 안 가요", "학생 대리 등록 메뉴가 안 보여요", "학생이 로그인을 못 해요"],
  },
  {
    id: "proxy-registration-hidden",
    subject: /대리\s*등록/,
    symptom: /안\s*(?:보|떠|뜨|나|돼|되)|안보|안떠|안뜨|안돼|안되|없|사라|못\s*찾|비활성|회색|막혀/,
    category: "admin",
    doc: { category: "admin", slug: "account-verification" },
    heading: "인증 전에는 녹화와 웹 라이브가 막혀 있습니다",
    steps: [{ heading: "인증 절차", take: 4 }],
    intro:
      "[학생 대리 등록]은 기관(계정) 인증을 마친 뒤에 보입니다. 학생 추가 창에 이 옵션이 없다면 인증부터 확인해 주세요.",
    suggestedQuestions: ["기관 인증이 안 돼요", "학생 추가가 안 돼요", "대리 등록했는데 문자가 안 가요"],
  },
  {
    id: "institution-verification",
    subject:
      /(?:기관|학원|계정|사업자|교습소)\s*(?:인증|등록|심사|승인)|인증\s*(?:자료|서류|신청|심사|승인|처리|대기|상태|반려|절차)|인증\s*(?:하라|해\s*달라|해\s*주세요라|을\s*하라|요청\s*(?:메시지|알림|창))|사업자\s*등록증/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|대기|언제|얼마나|며칠|처리\\s*(?:안|중|돼|되|됨)|승인\\s*(?:안|이)|늦|그대로|어떻게\\s*(?:돼|되)|진행|(?:메시지|알림|팝업|창).{0,8}(?:떠|뜨|나와|나오)`),
    exclude: /인증\s*(?:번호|코드|문자)|원격|교육청|교육지원청|대리\s*등록/,
    category: "admin",
    doc: { category: "admin", slug: "account-verification" },
    steps: [
      { heading: "인증이 반려되거나 늦어지는 경우", pick: [0, 1, 2] },
      { heading: "인증 절차", pick: [4] },
    ],
    intro:
      "기관 등록(계정 인증)이 끝나지 않았다면 아래부터 확인해 주세요. 인증은 메인 관리자 계정으로 [계정 정보] > [인증 자료]에서 하고, 처리는 보통 며칠 걸립니다.",
    branches: [
      {
        text: "교사나 학생을 기관에 등록하는 게 안 된다면, 그 사람이 먼저 클래스인에 가입했는지와 국가번호(+82)를 확인해 주세요.",
        when: /(?:기관|학원)\s*등록/,
        unless: /인증|승인|서류|사업자/,
      },
      {
        text: "급하시면 자료를 올린 뒤 상담 채널(홈페이지 하단 채팅)이나 담당 매니저에게 빠른 처리를 요청하세요. 확인하는 대로 처리해 드립니다.",
        when: /급|첫\s*수업|언제|빨리|며칠|일째|주일|대기|그대로|승인/,
      },
    ],
    contactHeading: "",
    suggestedQuestions: ["교사 추가가 안 돼요", "학생 추가가 안 돼요", "유료 계정 전환은 어떻게 하나요?"],
    menuLine: "기관 등록(계정 인증)이 안 될 때: 메인 관리자 계정으로 [인증 자료]의 빠진 칸과 서류 형식(JPG·PNG, 5MB 이하)을 확인합니다.",
  },

  // ─── 로그인·가입 ─────────────────────────────────────────────
  {
    id: "class-not-exist",
    subject: /수업\s*(?:이|가)?\s*존재하지\s*않|존재하지\s*않는\s*수업|수업\s*(?:이|가)?\s*없다고\s*(?:떠|나와|뜸)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", pick: [1, 2, 4] }],
    intro: "'수업이 존재하지 않습니다'가 뜨면 대개 학원에 등록된 아이디가 아닌 다른 계정으로 들어갔거나, 그 수업이 바뀐 경우예요. 아래부터 확인해 주세요.",
    branches: ["어제는 됐는데 오늘 갑자기 그렇다면 선생님께 오늘 수업이 그대로 열려 있는지(시간 변경·새로 만든 수업인지) 확인해 주세요."],
    contactHeading: "학원이나 상담 채널에 알릴 때",
    suggestedQuestions: ["로그인은 되는데 수업이 안 보여요", "수업 입장이 안 돼요", "코스 가입이 안 돼요"],
  },
  {
    id: "paid-not-reflected",
    subject: /(?:결제|유료\s*전환|구매).{0,20}(?:무료|체험판?|반영|그대로|안\s*바뀌|안\s*됐|안\s*돼)/,
    requireSymptom: false,
    exclude: /환불|세금|영수증|계좌|카드\s*말고/,
    category: "billing",
    doc: { category: "admin", slug: "billing-upgrade" },
    steps: [{ heading: "자주 하는 실수", pick: [1, 0] }],
    intro: "결제했는데 아직 무료 계정으로 보이면, 결제한 아이디와 지금 로그인한 아이디가 같은지부터 확인해 주세요. 결제는 메인 관리자로 쓸 아이디로 한 것이 학원 계정에 반영됩니다.",
    branches: ["같은 계정인데도 무료로 보이면 로그아웃 뒤 다시 로그인해 보세요. 그래도 같으면 아래 [실시간 상담 연결]로 결제 반영 확인을 요청해 주세요. 상담원이 결제 내역을 확인해 드려요."],
    handoff: true,
    suggestedQuestions: ["기관 인증이 안 돼요", "세금계산서 발행 어떻게 받아요", "유료 계정 전환은 어떻게 하나요?"],
  },
  {
    id: "login-code",
    subject: /인증\s*(?:번호|코드|문자)|otp/,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "인증코드가 오지 않을 때", pick: [1, 3, 4, 2, 0] }],
    intro: "인증코드가 오지 않으면 번호 형식과 문자 차단부터 확인해 주세요.",
    suggestedQuestions: ["로그인이 안 돼요", "회원가입이 안 돼요", "비밀번호를 잊어버렸어요"],
  },
  {
    id: "login-trial-screen",
    subject: /체험판\s*(?:선택|고르|골라|화면|창|페이지)|체험판\s*(?:이|으로|만)\s*(?:떠|뜨|나와|나오|잡|돼|되)|체험판\s*사용자로/,
    exclude: /가격|요금|기간|얼마/,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "홈페이지에서 로그인했더니 체험판 선택 화면이 뜰 때", take: 3 }],
    intro: "홈페이지 로그인은 학원 관리자용이라, 학생·강사가 홈페이지에서 로그인하면 체험판 선택 화면이 뜰 수 있습니다.",
    requireSymptom: false,
    suggestedQuestions: ["로그인이 안 돼요", "클래스인 다운로드 어디서 해요", "계정이 없다고 떠요"],
  },
  {
    id: "login-no-account",
    subject: /계정\s*(?:이|은)?\s*없|없는\s*계정|아이디\s*(?:가|는)?\s*없|가입\s*(?:이)?\s*안\s*된\s*계정|존재하지\s*않/,
    exclude: /학생\s*추가|교사\s*추가|등록하려|수업|코스|강의/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "계정이 없다고 나올 때", take: 4 }],
    intro: "계정이 없다고 나오면 가입이 인증코드 단계에서 멈췄거나, 다른 아이디로 가입했을 수 있습니다.",
    suggestedQuestions: ["인증번호가 안 와요", "비밀번호를 잊어버렸어요", "회원가입이 안 돼요"],
  },
  {
    id: "login-forgot-password",
    subject: /(?:비밀번호|비번|패스워드).{0,8}(?:기억|까먹|잊|모르|분실)|(?:기억|까먹|잊|모르).{0,8}(?:비밀번호|비번|패스워드)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "비밀번호가 기억나지 않을 때" }],
    intro: "비밀번호는 로그인 화면에서 바로 새로 정할 수 있습니다.",
    suggestedQuestions: ["인증번호가 안 와요", "로그인이 안 돼요", "계정이 없다고 떠요"],
  },
  {
    id: "login-wrong-password",
    subject: /비밀번호|비번|패스워드|잘못된\s*계정/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|틀|잘못|맞지|일치`),
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "잘못된 계정 또는 비밀번호라고 나올 때", take: 4 }],
    intro: "잘못된 계정이나 비밀번호라고 나오면 아이디 입력 형식부터 확인해 주세요.",
    suggestedQuestions: ["비밀번호를 잊어버렸어요", "계정이 없다고 떠요", "인증번호가 안 와요"],
  },
  {
    id: "login-button",
    subject: /로그인\s*버튼|로그인\s*(?:이|가)?\s*(?:안\s*눌|눌러도)|로그인.{0,10}버튼\s*(?:이|가)?\s*회색/,
    requireSymptom: false,
    exclude: /수업|교실|입장|인증\s*코드|인증코드/,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "로그인 버튼을 눌러도 들어가지지 않을 때" }],
    intro: "로그인 버튼을 눌러도 들어가지지 않으면 약관 동의와 입력 칸부터 확인해 주세요.",
    suggestedQuestions: ["로그인이 안 돼요", "인증번호가 안 와요", "비밀번호를 잊어버렸어요"],
  },
  {
    id: "signup-fail",
    subject: /회원\s*가입|가입/,
    exclude: /코스\s*(?:에\s*)?가입|반\s*가입|클래스\s*가입|가입\s*허용|qr|큐알|초대|가입\s*(?:했|한|된|은\s*(?:했|됐))|로그인/,
    category: "troubleshooting",
    doc: { category: "start", slug: "signup" },
    steps: [{ heading: "가입이 막힐 때", take: 5 }],
    intro: "가입은 공식 홈페이지가 아니라 설치한 앱이나 PC 프로그램에서 합니다. 가입이 막히면 아래를 확인해 주세요.",
    suggestedQuestions: ["인증번호가 안 와요", "계정이 없다고 떠요", "로그인이 안 돼요"],
  },
  {
    id: "class-not-visible-after-login",
    subject: /로그인.{0,12}(?:수업|코스|반(?!려))|(?:수업|코스|반(?!려)).{0,12}로그인/,
    symptom: /안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|없|사라|보이지\s*않|뜨지\s*않|나오지\s*않/,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "로그인은 되는데 수업이나 코스가 보이지 않을 때", take: 4 }],
    intro: "로그인은 되는데 수업이나 코스가 안 보이면, 학원이 등록한 아이디로 들어왔는지부터 봐 주세요.",
    suggestedQuestions: ["수업 입장이 안 돼요", "코스 가입이 안 돼요", "로그인이 안 돼요"],
  },

  // ─── 녹화·다시보기 ───────────────────────────────────────────
  {
    id: "recording-camera-missing",
    subject:
      /현장\s*녹화.{0,40}(?:카메라|웹캠|영상|얼굴|교실|강사|선생님).{0,16}(?:없|안|빠|만\s*있)|칠판\s*화면만|화면만\s*녹화|(?:카메라|웹캠).{0,12}(?:영상|화면).{0,10}(?:녹화|녹화본).{0,8}(?:없|안|빠)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [
      { heading: "수업 녹화와 현장 녹화", pick: [2, 3] },
      { heading: "처음 세팅할 때의 기본값", pick: [2] },
    ],
    intro: "수업 녹화는 칠판·자료가 보이는 교실 화면을, 현장 녹화는 카메라가 찍는 교실 모습을 따로 녹화해요. 칠판 화면만 남았다면 현장 녹화 카메라가 제대로 골라졌는지부터 봐 주세요.",
    branches: ["두 녹화를 모두 켰다면 학생은 다시보기에서 '수업화면 녹화'와 '라이브 현장녹화' 중 골라 봅니다. 현장녹화 영상을 따로 찾아보세요."],
    contactHeading: "",
    suggestedQuestions: ["현장 녹화 카메라 설정 어떻게 해요?", "녹화본에 소리가 없어요", "녹화본이 안 보여요"],
  },
  {
    id: "recording-howto",
    subject:
      /(?:녹화|녹음).{0,20}(?:하는\s*법|하는\s*방법|방법|어떻게|하고\s*싶|해서\s*(?:보내|공유)|보내|공유|켜|시작)|(?:어떻게|방법).{0,12}(?:녹화|녹음)/,
    requireSymptom: false,
    exclude: /다운|내려받|현장\s*녹화\s*카메라|카메라\s*설정|안\s*(?:돼|되|됨|됐)|안돼|안되|안됨|끊|사라|없어|권한|누가|저장\s*관리|용량|차이|뭐가\s*달라/,
    category: "classroom",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    heading: "녹화 옵션이 꺼져 있었을 때",
    steps: [
      { heading: "녹화 옵션이 꺼져 있었을 때", pick: [0, 1, 2] },
      { heading: "녹화 아이콘이 초록색으로 바뀌지 않을 때", pick: [2, 3] },
    ],
    intro: "수업 녹화는 수업을 만들 때 켭니다. 녹화를 켠 수업은 끝난 뒤 코스에 등록된 학생이 다시보기로 볼 수 있어요.",
    branches: [
      {
        text: "못 온 학생도 코스에 등록돼 있으면 다시보기로 보면 돼요. 파일로 보내야 하면 관리자 대시보드 [수업 녹화 데이터]에서 내려받아 공유합니다.",
        when: /보내|공유|못\s*온|결석|학생/,
      },
    ],
    contactHeading: "",
    en: "Turn on [ClassIn 수업 녹화] when you create the lesson and press [즉시 녹화] in class; after class, enrolled students can watch the replay.",
    suggestedQuestions: ["녹화본 다운로드 방법 알려줘", "현장 녹화 카메라 설정 어떻게 해요?", "학생이 다시보기를 못 봐요"],
  },
  {
    id: "prevent-download",
    subject: /(?:다운|내려받|저장|퍼가).{0,12}(?:못\s*(?:받|하)게|막|차단|금지|안\s*되게|못\s*하도록|못하게)|(?:다운로드|내려받기)\s*(?:막기|금지|차단)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "replay-troubleshooting" },
    steps: [{ heading: "코스 설정에서 기간이나 횟수가 막혀 있을 때", pick: [0, 1, 2, 4] }],
    intro: "학생은 녹화본 파일이 아니라 코스 안 다시보기로 영상을 봐요. 녹화본 파일은 관리자 대시보드에서 내려받는 것이라, 학생 시청 범위는 코스 설정의 다시보기 기간과 횟수로 정합니다.",
    branches: [
      "녹화본을 따로 보낼 때는 조심해 주세요. 재생 화면 링크는 로그인 없이 열리니 보낼 사람을 먼저 정해 두세요.",
      "학생이 다운로드를 하는 다른 경로가 보인다면 화면을 캡처해 상담 채널로 알려 주세요. 담당자가 확인해 드려요.",
    ],
    contactHeading: "",
    suggestedQuestions: ["다시보기 기간 설정 방법 알려줘", "녹화본 다운로드 방법 알려줘", "학생이 다시보기를 못 봐요"],
  },
  {
    id: "recording-no-audio",
    subject: /녹화.{0,12}(?:소리|음성|오디오|목소리)|(?:소리|음성|오디오|목소리).{0,12}녹화/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|없|안\\s*담|안담|무음`),
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "녹화본에 소리가 없을 때", take: 4 }],
    intro: "녹화본에 소리가 없다면 대개 녹화할 때 마이크가 '사용 안 함'으로 잡혀 있던 경우입니다.",
    suggestedQuestions: ["녹화가 중간에 끊겼어요", "녹화본이 안 보여요", "마이크가 안 돼요"],
  },
  {
    id: "recording-split",
    subject: /녹화.{0,16}(?:끊|멈|나뉘|나눠|쪼개|여러\s*개|중간|중단|짧|초반|회색|앞\s*(?:\d+\s*분|부분)|처음\s*(?:\d+\s*분|부분))/,
    requireSymptom: false,
    exclude: /다운|내려받/,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "녹화가 중간에 끊기거나 여러 개로 나뉠 때", take: 5 }],
    intro: "녹화는 강사 계정에 붙어 진행돼서, 아래 경우에 멈추거나 여러 개로 나뉩니다.",
    branches: [
      "끊기기 전까지 녹화된 부분은 따로 남을 수 있어요. 관리자 대시보드 [수업 녹화 데이터]에서 클립이 여러 개로 나뉘어 있는지 확인해 주세요.",
      { text: "녹화를 처음부터 켰는데 앞부분이 비어 있다면 담당자가 그 수업 기록을 확인해 드려요. 수업 이름과 날짜를 상담 채널에 남겨 주세요.", when: /앞|처음|초반|분명/ },
    ],
    suggestedQuestions: ["녹화본에 소리가 없어요", "녹화가 안 돼요", "녹화본이 안 보여요"],
  },
  {
    id: "recording-icon",
    subject: /녹화\s*(?:아이콘|표시)|초록(?:색)?\s*(?:아이콘|불)|캠코더\s*아이콘/,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "녹화 아이콘이 초록색으로 바뀌지 않을 때", take: 5 }],
    intro: "녹화 아이콘이 초록색이 아니면 아직 녹화가 시작되지 않은 상태입니다.",
    suggestedQuestions: ["현장 녹화 카메라 설정 어떻게 해요?", "녹화가 중간에 끊겼어요", "녹화본에 소리가 없어요"],
  },
  {
    id: "recording-option-missing",
    subject: /녹화\s*(?:옵션|버튼|토글|메뉴|기능)/,
    symptom: /안\s*(?:보|떠|뜨|나|켜|돼|되)|안보|안떠|안뜨|안켜|안돼|안되|없|사라|비활성|회색|막혀|막힘|못\s*(?:켜|찾)/,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "녹화 옵션이 꺼져 있었을 때", take: 5 }],
    intro: "녹화 옵션은 수업을 만들 때 켭니다. 옵션이 아예 보이지 않으면 계정 인증 상태를 확인해야 합니다.",
    branches: [
      {
        text: "녹화는 유료 요금제를 결제하고 계정 인증까지 마친 학원에서, 학원에 교사로 등록된 계정만 켤 수 있어요. 결제했는데도 선생님 화면에 녹화가 없으면 ① 그 선생님이 교사로 등록돼 있는지 ② 학원 계정 인증이 끝났는지 ③ 앱이 최신 버전인지(업데이트 뒤 다시 로그인) 순서로 봐 주세요. 요금제에 들어 있는 기능 범위는 담당자가 계약 기준으로 확인해 드려요.",
        when: /돈|결제|유료|요금|선생님들|강사들|교사들/,
      },
    ],
    suggestedQuestions: ["기관 인증이 안 돼요", "녹화가 안 돼요", "현장 녹화 카메라 설정 어떻게 해요?"],
  },
  {
    id: "recording-local-file",
    subject: /로컬\s*녹화/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|파일|어디|못\\s*찾|저장`),
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "전자칠판 로컬 녹화 파일을 찾을 수 없을 때", take: 5 }],
    intro: "전자칠판 로컬 녹화 파일은 대시보드가 아니라 녹화를 시작할 때 고른 저장 경로에 남습니다.",
    overridesKnownIntent: true,
    suggestedQuestions: ["녹화본이 안 보여요", "녹화가 안 돼요", "녹화 다운로드가 안 돼요"],
  },
  {
    id: "recording-old-deleted",
    subject: /(?:예전|이전|지난달|옛날|오래된|몇\s*달)\s*녹화|녹화(?:본|\s*영상|\s*파일)?.{0,10}(?:지워|삭제|자동\s*삭제)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "예전 녹화본이 사라졌을 때", take: 3 }],
    intro: "예전 녹화본이 사라졌다면 자동 삭제 설정이나 다른 관리자의 삭제를 먼저 확인해 주세요. 지운 녹화본은 복구되지 않습니다.",
    suggestedQuestions: ["녹화본이 안 보여요", "학생이 다시보기를 못 봐요", "녹화 다운로드가 안 돼요"],
  },
  {
    id: "recording-download",
    subject: /(?:녹화|영상|동영상).{0,12}(?:다운|내려받|저장|받기)|(?:다운|내려받).{0,12}(?:녹화|영상|동영상)/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|회색|비활성|눌리지|안\\s*눌`),
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "내려받기가 안 될 때", take: 4 }],
    intro: "녹화본 내려받기가 안 되면 아래 방법으로 다시 받아 보세요.",
    suggestedQuestions: ["녹화본이 안 보여요", "예전 녹화본이 사라졌어요", "녹화가 안 돼요"],
  },
  {
    id: "recording-file-missing",
    subject: /녹화본|녹화\s*(?:파일|영상|데이터|본)|녹화된\s*(?:영상|수업)|녹화\s*(?:가|이)?.{0,10}(?:사라|없어|안\s*보|못\s*찾)/,
    symptom: /안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|없|못\s*찾|사라|안\s*올라|안\s*생/,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
    intro: "녹화본이 안 보이면 그 수업이 실제로 녹화됐는지부터 확인해 주세요.",
    branches: [
      {
        text: "예전에 있던 녹화본이 사라졌다면 [일반 설정] > [저장 설정]의 자동 삭제 기간과, 다른 관리자가 [수업 리소스]에서 지웠는지도 확인해 주세요. 지운 녹화본은 복구되지 않습니다.",
        when: /사라|없어졌|지워/,
      },
    ],
    suggestedQuestions: ["녹화 다운로드가 안 돼요", "예전 녹화본이 사라졌어요", "학생이 다시보기를 못 봐요"],
  },
  {
    id: "replay-student-video",
    subject: /(?:학생|아이|수강생).{0,12}(?:녹화|영상|동영상).{0,12}(?:못\s*(?:보|봐|본)|안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨)/,
    requireSymptom: false,
    exclude: /다운|내려받/,
    category: "troubleshooting",
    doc: { category: "admin", slug: "replay-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
    intro: "학생이 녹화 영상(다시보기)을 못 보면 녹화 여부, 학생이 코스에 들어온 시점, 로그인한 아이디를 차례로 확인해 주세요.",
    suggestedQuestions: ["다시보기 기간이 지났대요", "녹화본이 안 보여요", "수업 끝나고 코스에 가입한 학생이 이전 강의를 못 봐요"],
  },
  {
    id: "replay-speed",
    subject: /배속|재생\s*속도|빨리\s*감기|\d(?:\.\d)?\s*배\s*(?:속|로)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "software", slug: "lesson-activities" },
    steps: [{ heading: "실시간 수업과 녹화 수업", pick: [2] }],
    intro: "녹화 수업(학습 활동)은 강사가 고급 설정에서 재생 속도 조절을 켜 두면 배속으로 볼 수 있어요.",
    branches: [
      "지금 보는 영상에 배속 메뉴가 없으면 선생님이 재생 속도 조절을 꺼 둔 것일 수 있으니 선생님께 물어보세요.",
      { text: "2배속에서 목소리가 어색하게 들리면 1.5배속 정도로 낮춰 보세요.", when: /소리|목소리|이상/ },
      { text: "다시보기 영상에 자막을 붙이는 기능은 공개 안내에 없어요. 6.0.9부터 수업 중 실시간 자막 번역이 있지만 기본으로 꺼져 있어 학원이 켜야 합니다.", when: /자막/ },
    ],
    contactHeading: "",
    suggestedQuestions: ["다시보기가 안 떠요", "다시보기 기간이 지났대요", "숙제는 어떻게 내요?"],
  },
  {
    id: "replay-howto",
    subject:
      /(?:다시\s*보기|다시보기|복습\s*영상|지난\s*수업|놓친\s*수업|끝난\s*수업).{0,24}(?:어디|어떻게|보는\s*(?:법|방법|곳)|방법|볼\s*수)|(?:어디서|어떻게).{0,12}(?:다시\s*보기|다시보기)/,
    requireSymptom: false,
    howto: true,
    exclude: /기간|횟수|설정|관리자|대시보드|안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|못\s*(?:보|봐)|웹\s*라이브/,
    category: "classroom",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "끝난 수업 다시 보기" }],
    intro: "녹화가 켜진 수업은 끝난 뒤 코스에서 다시 볼 수 있어요.",
    branches: ["다시보기가 안 보이면 그 수업이 녹화됐는지, 학원이 정한 다시보기 기간이 지나지 않았는지 학원에 물어보세요."],
    contactHeading: "",
    en: "If the class was recorded, open the course (or the calendar) and tap the finished class to watch the replay.",
    suggestedQuestions: ["다시보기가 안 떠요", "다시보기 기간이 지났대요", "숙제는 어떻게 내요?"],
  },
  {
    id: "replay-period",
    subject: /(?:다시\s*보기|다시보기|리플레이|플레이백|복습\s*영상).{0,16}(?:기간|횟수|만료|지났|끝났)|(?:다시\s*보기|다시보기|다시\s*보는).{0,40}(?:어제까지는?\s*(?:됐|되|보였)|목록에서\s*(?:아예\s*)?(?:사라|없어))|시청\s*횟수|횟수\s*(?:를|가)?\s*초과|시청\s*(?:가능\s*)?기간/,
    requireSymptom: false,
    exclude: /막|못\s*받게|제한하고\s*싶|설정하고\s*싶|방법/,
    category: "troubleshooting",
    // 학생·학부모가 묻는 경우가 기본이다. 관리자·설정을 말할 때만 대시보드 설정 단계를 준다.
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "다시보기가 안 보일 때", pick: [1, 0, 3] }],
    intro: "다시보기는 학원이 코스에 정한 다시보기 기간과 시청 횟수 안에서만 열려요.",
    variants: [
      {
        when: /관리자|대시보드|설정에서|코스\s*설정|우리\s*학생|학생(?:이|들이|들한테|에게)\s/,
        doc: { category: "admin", slug: "replay-troubleshooting" },
        steps: [{ heading: "코스 설정에서 기간이나 횟수가 막혀 있을 때", take: 5 }],
        intro: "다시보기는 코스 설정의 유효 기간과 시청 횟수 제한 안에서만 열립니다.",
      },
      {
        when: /시청\s*횟수|횟수\s*(?:를|가)?\s*초과|기간\s*만료/,
        doc: { category: "student", slug: "class-join-replay" },
        steps: [{ heading: "다시보기가 안 보일 때", pick: [1, 0, 3] }],
        intro: "'시청 횟수 초과'나 '기간 만료'가 뜨면, 학원이 코스에 다시보기 시청 횟수나 기간을 정해 둔 경우예요. 횟수를 어떻게 세는지는 공개 안내에 따로 나와 있지 않아, 남은 횟수가 걱정되시면 학원에 먼저 물어봐 주세요.",
      },
    ],
    branches: [
      { text: "더 보고 싶으시면 학원(선생님)에 시청 횟수나 기간을 늘려 줄 수 있는지 물어보세요. 설정은 학원 관리자가 코스 설정에서 바꿉니다.", unless: /관리자|대시보드/ },
    ],
    suggestedQuestions: ["학생이 다시보기를 못 봐요", "녹화본이 안 보여요", "예전 녹화본이 사라졌어요"],
  },
  {
    id: "replay-missing",
    subject: /다시\s*보기|다시보기|리플레이|플레이백|복습\s*영상|지난\s*수업\s*영상/,
    exclude: /웹\s*라이브|생방송/,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "다시보기가 안 보일 때", take: 4 }],
    intro: "다시보기가 안 보이면 그 수업이 녹화됐는지, 학원이 정한 다시보기 기간이 남았는지부터 확인해 주세요.",
    variants: [
      {
        when: /관리자|대시보드|설정|우리\s*학생|학생(?:이|들이|한테|에게)/,
        doc: { category: "admin", slug: "replay-troubleshooting" },
        steps: [{ heading: "먼저 확인할 것", take: 4 }],
        intro: "학생에게 다시보기가 안 보이면 녹화 여부, 학생이 코스에 들어온 시점, 로그인한 아이디를 차례로 확인해 주세요.",
      },
    ],
    branches: [
      "수업이 끝난 뒤 코스에 들어온 학생이라면, 학원 관리자가 [일반 설정] > [수업 다시보기]에서 새로 가입한 학생의 이전 수업 시청을 허용해야 합니다.",
      { text: "그래도 안 보이면 선생님이나 학원에 다시보기 기간이 남았는지 물어보세요.", unless: /관리자|대시보드|설정/ },
      {
        text: "녹화도 됐고 학생 계정도 맞다면, 관리자 대시보드 [기관 관리] > [코스 관리] > 그 코스의 [설정] 탭에서 [다시 보기 유효 기간]과 [시청 횟수 제한]이 막고 있지 않은지 봐 주세요.",
        when: /관리자|대시보드|설정|우리\s*학생|학생(?:이|들이|한테|에게)/,
      },
    ],
    suggestedQuestions: ["녹화본이 안 보여요", "다시보기 기간이 지났대요", "수업 끝나고 코스에 가입한 학생이 이전 강의를 못 봐요"],
    menuLine: "다시보기가 안 보일 때: 그 수업이 녹화됐는지, 학생이 학원에 등록된 아이디로 로그인했는지 봅니다.",
  },
  {
    id: "recording-fail",
    subject: /녹화|레코딩/,
    exclude: /하울링/,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 5 }],
    intro: "녹화가 안 됐다면 아래 순서로 확인해 주세요.",
    branches: [
      {
        text: "이미 끝난 수업이라면 녹화본을 처리하는 데 시간이 걸릴 수 있으니 잠시 뒤 관리자 대시보드의 [수업 녹화 데이터]를 다시 보세요. 그래도 없으면 담당자가 그 수업 기록을 확인해 드려요.",
        when: /어제|지난|통째|날아|사라|끝나고|끝난/,
      },
    ],
    en: "Turn on the recording toggle when you create the lesson, then check that the recording icon turns green in class.",
    suggestedQuestions: ["녹화본에 소리가 없어요", "녹화가 중간에 끊겼어요", "녹화본이 안 보여요"],
    menuLine: "녹화가 안 될 때: 수업을 만들 때 녹화 토글을 켰는지, 교실에서 녹화 아이콘이 초록색인지 봅니다.",
  },

  {
    id: "web-live-fail",
    subject: /웹\s*라이브|웹라이브|생방송|라이브\s*링크|플레이백\s*링크|시청자/,
    exclude: /채팅|요금|가격|비용|요금제/,
    category: "troubleshooting",
    doc: { category: "admin", slug: "web-live-playback" },
    steps: [{ heading: "옵션이 안 보이거나 시청자가 못 들어올 때", take: 4 }],
    intro: "웹 라이브는 유료 전환과 계정 인증을 마친 학원에서 쓸 수 있고, 수업을 만들 때 녹화 옵션을 하나 이상 켜야 나타납니다.",
    variants: [
      {
        when: /시작되지\s*않|시작\s*안|방송\s*(?:이|전)|일부\s*(?:분|시청자|학부모)/,
        heading: "수업 당일 강사에게 알려 줄 것",
        steps: [{ heading: "수업 당일 강사에게 알려 줄 것" }],
        intro: "웹 라이브 송출은 강사가 교실에 들어가 [수업 녹화]를 누르는 순간 시작돼요. 그 전에 링크를 연 분은 '방송이 시작되지 않았다'는 안내를 보게 되니, 방송이 시작된 뒤 새로고침하라고 알려 주세요.",
      },
    ],
    suggestedQuestions: ["기관 인증이 안 돼요", "웹 라이브 채팅이 학생에게 안 보여요", "녹화가 안 돼요"],
  },

  // ─── 전자칠판(화면·전원은 기존 하드웨어 점검 경로가 맡는다) ─────────────
  {
    id: "board-mirroring",
    subject:
      /미러링|캐스트|무선\s*(?:연결|화면|으로\s*(?:띄우|띄워|연결))|화면\s*미러|(?:핸드폰|휴대폰|폰)\s*(?:거|화면)?\s*(?:를|을)?\s*(?:칠판에\s*)?(?:띄우|띄워)|(?:휴대폰|폰|노트북|태블릿|아이패드).{0,10}화면.{0,14}(?:칠판|티비|tv|보드|전자칠판).{0,10}(?:띄우|띄워|연결|안\s*나|안\s*떠)|(?:칠판|티비|tv).{0,10}(?:에\s*)?(?:띄우|띄워)|연결할\s*(?:기계|기기)\s*목록/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "무선 미러링으로 기기 화면 띄우기", take: 4 }],
    intro: "미러링이 안 되면 보드와 기기가 같은 Wi-Fi에 연결돼 있는지부터 확인해 주세요.",
    branches: [
      {
        text: "띄웠다 사라졌다를 반복하면 무선 신호가 약할 가능성이 커요. 휴대폰을 보드와 공유기 가까이 두고 다시 연결해 보세요. 수업 중 끊기면 안 되는 자료는 HDMI 선으로 연결해 띄우는 게 가장 안정적이에요.",
        when: /끊|사라|자꾸|띄웠다|됐다\s*안/,
      },
    ],
    suggestedQuestions: ["HDMI 연결했는데 화면이 안 나와요", "전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-hdmi",
    subject: /hdmi|외부\s*입력|입력\s*소스|노트북\s*연결|(?:노트북|컴퓨터|pc).{0,14}(?:선|케이블)\s*(?:으로|로)?\s*(?:연결|꽂)|선으로\s*연결|어떤\s*선/,
    requireSymptom: false,
    exclude: /몇\s*개|스펙|사양|규격|포트\s*수/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "HDMI 입력으로 전환하기", take: 5 }],
    intro: "외부 기기 화면이 안 나오면 HDMI 케이블과 입력 소스를 차례로 확인해 주세요.",
    suggestedQuestions: ["미러링이 안 돼요", "전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-touch",
    subject: /터치|(?:칠판|티비|tv|보드|화면).{0,24}(?:눌러도|만져도|손으로\s*(?:눌|만))|(?:펜|필기|판서|글씨)\s*(?:가|이)?\s*(?:안\s*(?:써|쓰|돼|되|나|그|적|먹)|안써|안돼|안되|안먹)|(?:글씨|글자)\s*(?:가|이)?\s*안\s*(?:써|쓰|적|그려)|(?:글씨|판서|필기).{0,24}(?:옆에\s*(?:써|그려|찍)|어긋|밀려|빗나|위치)|(?:칠판|티비|보드).{0,20}(?:펜|글씨|판서|필기).{0,20}(?:늦게|지연|따라)/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|튀|인식|먹|반응|밀려|어긋|옆에\\s*(?:써|그려|찍)|빗나|위치|늦게|지연|따라와|따라오`),
    exclude: /스펙|사양|몇\s*점/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-writing-touch" },
    steps: [{ heading: "터치가 튀거나 안 먹힐 때", take: 5 }],
    intro: "터치가 튀거나 안 먹으면 화면 테두리(베젤)부터 확인해 주세요. 적외선 터치라 테두리가 가려지면 인식이 흔들립니다.",
    branches: [
      {
        text: "위쪽이나 한쪽처럼 같은 자리만 계속 반응이 없으면, 그쪽 테두리를 닦고 보드를 껐다 켜 보세요. 그래도 같으면 증상을 영상으로 찍어 A/S로 접수해 주세요. 보드를 직접 열거나 분해하지는 마세요.",
        when: /위쪽|아래쪽|한쪽|일부|부분|가장자리|모서리|윗부분|아랫부분/,
      },
    ],
    contactHeading: "",
    suggestedQuestions: ["미러링이 안 돼요", "전자칠판 화면이 안 켜져요", "HDMI 연결했는데 화면이 안 나와요"],
  },

  {
    id: "security-block",
    subject: /보안\s*(?:프로그램|앱)|백신|drm|저작권\s*보호|인강\s*(?:플레이어|재생)|(?:카메라|마이크).{0,8}(?:막혀|막힘|막혔|차단)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "PC에서 앱이 안 켜지거나 카메라·마이크가 막힐 때", take: 4 }],
    intro: "PC에 깔린 보안 프로그램이나 인강용 저작권 보호(DRM) 플레이어가 클래스인 실행이나 카메라·마이크 사용을 막는 경우가 있습니다.",
    suggestedQuestions: ["카메라가 안 켜져요", "설치했는데 클래스인이 안 켜져요", "마이크가 안 돼요"],
  },
  // ─── 카메라·마이크·소리 ──────────────────────────────────────────
  {
    id: "my-voice-not-heard",
    subject:
      /(?:선생님|강사|상대|친구들?)\s*(?:이|가|께서)?.{0,14}(?:제|내|아이|우리\s*애|자녀)\s*(?:의\s*)?(?:목소리|소리|말).{0,10}(?:안\s*들|못\s*들|안들)|(?:제|내|아이|우리\s*애|자녀)\s*(?:의\s*)?(?:목소리|말|소리).{0,16}(?:안\s*들|못\s*들|안들|안\s*간|전달\s*(?:이\s*)?안)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "선생님이 내 목소리가 안 들린다고 할 때", pick: [0, 1, 5, 2] }],
    intro: "학생 마이크는 스테이지에 올라가 있고 선생님이 마이크 권한을 줘야 켜져요. 마이크가 켜져 보여도 이 두 가지가 빠지면 선생님께 소리가 가지 않습니다.",
    variants: [
      {
        when: /학생들(?:한테|에게|이)|원격\s*학생|강사인데|수업하는데/,
        doc: { category: "start", slug: "camera-mic-troubleshooting" },
        steps: [
          { heading: "PC 교실에서 마이크·카메라 다시 고르기", pick: [0, 2] },
          { heading: "마이크가 꺼져 있다는 알림이 뜰 때", pick: [0, 1] },
        ],
        intro: "학생들에게 내 목소리가 안 들리면, 교실에서 실제로 쓰는 마이크가 골라져 있는지부터 봐 주세요.",
      },
    ],
    en: "For students: you must be on stage and the teacher must give you mic permission; then check the mic isn't set to '사용 안 함'.",
    suggestedQuestions: ["학생 목소리가 안 들려요", "마이크가 안 돼요", "카메라가 안 켜져요"],
  },
  {
    id: "ceiling-mic",
    subject: /천장\s*(?:에\s*)?(?:단|다는|달린|형)?\s*마이크|dt2|dt\s*2/,
    requireSymptom: false,
    category: "hardware",
    doc: { category: "hardware", slug: "mic-dt2-pro" },
    steps: [{ heading: "설치 후 세팅 순서", pick: [0, 1, 2, 3] }],
    intro: "천장 마이크로 뒤쪽 학생 소리가 약하게 들어오면, 교실에 맞는 음장 방안과 볼륨부터 다시 맞춰 주세요.",
    branches: ["그래도 뒤쪽이 안 잡히면 마이크 위치와 대수가 교실 크기에 맞는지 설치 담당자에게 점검을 요청해 주세요."],
    contactHeading: "",
    suggestedQuestions: ["소리가 울리고 하울링이 나요", "학생 목소리가 안 들려요", "전자칠판 카메라가 안 켜져요"],
  },
  {
    id: "audio-quality",
    subject: /로봇|기계음|기계\s*소리|찢어지|지지직|목소리.{0,8}끊겨|소리.{0,8}끊겨\s*들|뭉개|울렁/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "소리가 작거나 웅웅거릴 때", pick: [0, 1, 3] }],
    variants: [
      {
        // 듣는 쪽(학생·학부모): 선생님 말이 끊기거나 지지직거린다.
        when: /(?:애|아이|자녀|학생).{0,30}(?:듣|수업)|선생님\s*(?:말|목소리|소리)|들리|들려/,
        doc: { category: "student", slug: "class-join-replay" },
        steps: [{ heading: "수업 중에 튕기거나 끊길 때", pick: [0, 1, 3] }],
        intro:
          "신경 쓰이셨죠. 듣는 쪽에서 지지직거리거나 선생님 말이 뚝뚝 끊기면, 아이 쪽 인터넷이 불안정한 경우가 가장 흔해요. 아래 순서로 봐 주세요.",
      },
    ],
    branches: [
      {
        text: "마이크를 바꿔도 같다면 다른 인터넷이나 휴대폰 핫스팟으로 바꿔 다시 들어가 보세요. 바꾼 뒤 괜찮다면 원래 쓰던 네트워크가 원인입니다.",
        unless: /(?:애|아이|자녀|학생).{0,30}(?:듣|수업)|선생님\s*(?:말|목소리|소리)|들리|들려/,
      },
      {
        text: "이어폰을 끼고 들으면 주변 소리와 섞이지 않아 더 또렷하게 들려요. 아이 기기의 클래스인도 최신 버전인지 확인해 주세요.",
        when: /(?:애|아이|자녀|학생).{0,30}(?:듣|수업)|선생님\s*(?:말|목소리|소리)|들리|들려/,
      },
    ],
    intro: "목소리가 로봇처럼 들리거나 깨지면 마이크 설정과 네트워크를 함께 봐야 해요. 마이크를 바꿔도 같다면 네트워크 쪽일 가능성이 큽니다.",
    contactHeading: "그래도 안 되면 문의할 때 알려 줄 정보",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "소리가 울리고 하울링이 나요", "마이크가 안 돼요"],
  },
  {
    id: "mute-on-entry",
    subject:
      /(?:입장|들어오|시작).{0,20}(?:마이크|음소거).{0,12}(?:꺼|끄|off|꺼진|끈)|전체\s*음소거|학생.{0,12}마이크.{0,12}(?:꺼진\s*상태|끈\s*상태|끄고|꺼\s*놓|꺼\s*두|기본으로\s*꺼)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [
      { heading: "온스테이지와 스테이지 표시", pick: [1, 2] },
      { heading: "옵션이 안 보이거나 녹화가 안 될 때", pick: [0] },
    ],
    intro: "학생 마이크는 스테이지에 올라온 뒤에도 강사나 조교가 마이크 권한을 줘야 켜져요. 처음부터 조용히 시작하려면 수업을 만들 때 스테이지 옵션을 아래처럼 정하세요.",
    branches: ["수업 옵션의 [전체 음소거]도 함께 확인해 보세요. 이 옵션은 [기본으로 스테이지 표시]를 켜야 선택됩니다."],
    contactHeading: "",
    suggestedQuestions: ["학생 목소리가 안 들려요", "소리가 울리고 하울링이 나요", "온스테이지랑 학생 자동 온스테이지가 뭔가요?"],
  },
  {
    id: "audio-echo",
    subject: /하울링|웅웅|울려|울림|에코|잡음|소리\s*(?:가|이)?\s*작|소음|지지직/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "소리가 작거나 웅웅거릴 때", take: 4 }],
    intro: "소리가 작거나 울리면 마이크 장치와 소음 설정을 먼저 바꿔 보세요.",
    suggestedQuestions: ["마이크가 안 돼요", "학생 목소리가 안 들려요", "소리가 안 나요"],
  },
  {
    id: "audio-student-voice",
    subject: /학생.{0,10}(?:목소리|소리|마이크|말)/,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "학생 목소리만 안 들릴 때 (강사용)", take: 3 }],
    intro: "학생이 장비 테스트에서는 괜찮았는데 수업에서만 안 들린다면 교실 설정을 먼저 봐 주세요.",
    suggestedQuestions: ["선생님 목소리가 안 들려요", "마이크가 안 돼요", "소리가 울리고 하울링이 나요"],
  },
  {
    id: "board-mic-camera",
    subject: /(?:전자칠판|(?<!대시\s?)보드|칠판).{0,12}(?:마이크|카메라)|(?:마이크|카메라).{0,12}(?:전자칠판|(?<!대시\s?)보드)/,
    exclude: /한\s*명|한명|1명|두\s*명|두명/,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "전자칠판에서 마이크·카메라 켜기", take: 3 }],
    variants: [
      {
        when: /카메라/,
        doc: { category: "hardware", slug: "board-ai-camera-mic" },
        steps: [{ heading: "카메라가 안 잡히거나 화면이 이상할 때", pick: [0, 1, 2] }],
        intro: "전자칠판 카메라 화면이 원격 학생에게 안 보이면, 클래스인 카메라 목록에 그 카메라가 잡혀 있는지부터 봐 주세요. 교실 화면을 보내려면 교실에서 그 카메라를 골라야 합니다.",
      },
    ],
    intro: "전자칠판 교실에서는 화면 아래 독에서 마이크와 카메라 상태를 봅니다. 아이콘에 사선이 있으면 꺼진 상태입니다.",
    suggestedQuestions: ["마이크가 안 돼요", "현장 녹화 카메라 설정 어떻게 해요?", "소리가 울리고 하울링이 나요"],
  },
  {
    id: "mic-off-notice",
    subject: /마이크.{0,10}(?:꺼져\s*있|사용\s*안\s*함|비활성)|사용\s*안\s*함/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "마이크가 꺼져 있다는 알림이 뜰 때", take: 3 }],
    intro: "마이크가 '사용 안 함'으로 잡혀 있으면 내 목소리가 전달되지 않고 녹화에도 소리가 담기지 않을 수 있습니다.",
    suggestedQuestions: ["마이크가 안 돼요", "녹화본에 소리가 없어요", "카메라가 안 켜져요"],
  },
  {
    id: "audio-cant-hear",
    subject:
      /(?:선생님|강사|교사|상대|수업|영상|자료|교재|음원).{0,10}(?:목소리|소리|음성)|소리\s*(?:가|이)?\s*안|소리가\s*없|안\s*들려|안들려|안\s*들리|스피커|이어폰|헤드셋|볼륨/,
    exclude: /녹화|학생.{0,10}(?:목소리|소리|마이크)|hdmi|(?:아이|제|내|우리\s*애|자녀)\s*(?:의\s*)?(?:목소리|소리|말)|(?:제|내)\s*목소리/,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "선생님 목소리나 수업 소리가 안 들릴 때", take: 4 }],
    intro: "소리가 안 들리면 내 기기에서만 그런지 먼저 가려 주세요. 다른 사람은 잘 들린다면 내 기기의 소리 출력 문제일 가능성이 큽니다.",
    variants: [
      {
        when: /태블릿|패드|아이패드|갤럭시\s*탭|휴대폰|핸드폰|폰으로|모바일|아이폰/,
        doc: { category: "student", slug: "class-join-replay" },
        heading: "들어가기 전에 카메라·마이크·스피커 고르기",
        steps: [
          { heading: "들어가기 전에 카메라·마이크·스피커 고르기", pick: [2, 3] },
        ],
        intro:
          "태블릿·휴대폰에서 선생님 소리만 안 들리면, 기기 볼륨보다 클래스인 안에서 소리가 나올 장치(스피커)가 맞게 골라졌는지부터 봐 주세요.",
      },
    ],
    branches: [
      "블루투스 이어폰을 쓰고 있다면 연결을 끊었다가 다시 연결하거나, 빼고 기기 스피커로 들어 보세요.",
      "같은 수업의 다른 학생도 안 들린다면 선생님 쪽 마이크 문제일 수 있으니 선생님께 알려 주세요.",
    ],
    en: "Check the speaker selected inside ClassIn (gear icon or the pre-class device test) and your device volume, and reconnect Bluetooth earphones.",
    suggestedQuestions: ["마이크가 안 돼요", "학생 목소리가 안 들려요", "소리가 울리고 하울링이 나요"],
    menuLine: "카메라·마이크·소리가 안 될 때: 기기 설정에서 클래스인의 카메라·마이크 권한을 허용했는지, 교실에서 쓸 장치를 골랐는지 봅니다.",
  },
  {
    id: "mic-fail",
    subject: /마이크|내\s*목소리|제\s*목소리|목소리\s*(?:가|이)?\s*안\s*(?:가|전달|들)/,
    exclude: /녹화/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|레벨\\s*(?:이|가)?\\s*0|입력\\s*(?:이|가)?\\s*0|막대\\s*(?:가)?\\s*(?:안|움직이지)|인식은\\s*(?:되|돼)`),
    variants: [
      {
        when: /레벨|입력|윈도우|windows|막대/,
        steps: [
          { heading: "PC 교실에서 마이크·카메라 다시 고르기", pick: [0, 1, 2] },
          { heading: "소리가 작거나 웅웅거릴 때", pick: [0] },
        ],
        intro: "마이크가 인식은 되는데 입력이 0이면, 교실에서 다른 장치가 잡혀 있거나 입력 볼륨이 내려가 있는 경우가 많아요. 클래스인 안에서 마이크를 다시 고르고 볼륨을 맞춰 주세요.",
      },
    ],
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [
      { heading: "먼저 확인할 것", take: 2 },
      { heading: "PC 교실에서 마이크·카메라 다시 고르기", take: 1 },
      { heading: "마이크가 꺼져 있다는 알림이 뜰 때", take: 2 },
    ],
    intro: "마이크가 안 되면 장치 연결과 권한을 확인한 뒤, 교실에서 쓸 마이크를 다시 골라 주세요.",
    suggestedQuestions: ["카메라가 안 켜져요", "선생님 목소리가 안 들려요", "소리가 울리고 하울링이 나요"],
  },
  {
    id: "camera-fail",
    subject: /카메라|웹캠|캠\s*(?:이|가)?\s*안|내\s*얼굴|제\s*얼굴|얼굴\s*(?:이|가)?\s*안/,
    exclude: /한\s*명|한명|1명|두\s*명|두명|둘\s*중|현장\s*녹화|녹화\s*카메라|t1|s1|추적|cms|ip\s*카메라/,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [
      { heading: "먼저 확인할 것", pick: [1, 2] },
      { heading: "PC 교실에서 마이크·카메라 다시 고르기", pick: [0, 1, 3] },
    ],
    symptom: new RegExp(`${SYMPTOM_RE.source}|검은색|까만색|검정|빨간\\s*(?:줄|선)|사선`),
    intro: "카메라가 안 켜지면 권한과 다른 화상 프로그램부터 확인하고, 교실에서 카메라를 다시 골라 주세요.",
    branches: [
      {
        text: "카메라 아이콘에 빨간 줄(사선)이 있으면 꺼진 상태예요. 아이콘을 한 번 눌러 켜고, 그래도 선생님 화면에 안 보이면 학생이 스테이지에 올라와 있는지 선생님께 확인해 달라고 하세요.",
        when: /빨간|사선|줄이|선생님.{0,10}(?:안\s*보|못\s*보)/,
      },
    ],
    en: "Allow camera access for ClassIn in your device settings, close other video apps (Zoom etc.), then pick your camera in the classroom settings (gear icon).",
    suggestedQuestions: ["마이크가 안 돼요", "소리가 안 나요", "전자칠판 카메라가 안 켜져요"],
  },

  // ─── 수업 입장·끊김 ──────────────────────────────────────────────
  {
    id: "onstage-drop",
    subject: /(?:온\s*스테이지|스테이지).{0,30}(?:내려가|내려와|내려감|다시\s*내려|바로\s*내려|떨어져|사라져)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [
      { heading: "온스테이지와 스테이지 표시", pick: [3] },
      { heading: "처음 세팅할 때의 기본값", pick: [3] },
    ],
    intro: "학생을 올리자마자 다시 내려간다면, 수업의 온스테이지 인원수가 꽉 찬 경우가 가장 흔해요. 정한 인원을 넘겨 올리면 먼저 올라간 학생부터 내려옵니다.",
    branches: ["이미 만든 수업의 인원수는 수업이 시작되기 전에 관리자 대시보드 [코스 관리]에서 그 수업의 [조작] > [수업 편집]으로 고칩니다."],
    contactHeading: "",
    suggestedQuestions: ["학생 목소리가 안 들려요", "온스테이지랑 학생 자동 온스테이지가 뭔가요?", "수업 중에 계속 튕겨요"],
  },
  {
    id: "shared-device",
    subject:
      /(?:제|내|부모|엄마|아빠|학부모)\s*(?:의\s*)?(?:휴대폰|폰|핸드폰|태블릿|노트북).{0,24}(?:아이|자녀|애)|(?:아이|자녀)\s*계정.{0,20}(?:제|내|부모|엄마|아빠)\s*(?:휴대폰|폰|핸드폰)|계정\s*(?:이랑|과|이)?\s*섞/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "로그인은 되는데 수업이나 코스가 보이지 않을 때", pick: [0, 1] }],
    intro: "부모님 휴대폰으로도 아이 수업을 들을 수 있어요. 앱에서 학원에 등록된 아이의 아이디로 로그인하면 되고, 부모님 계정과 섞이지 않게 쓸 때마다 지금 로그인한 아이디를 확인하면 됩니다.",
    branches: ["한 계정은 수업에 기기 1대로만 들어갑니다. 같은 아이디로 두 기기에 함께 들어가 있으면 한쪽은 나와요."],
    contactHeading: "",
    suggestedQuestions: ["로그인이 안 돼요", "수업 입장이 안 돼요", "로그인은 되는데 수업이 안 보여요"],
  },
  {
    id: "class-enter-loading",
    subject: /(?:입장|교실|수업).{0,16}(?:로딩|빙글|무한|계속\s*돌|하얀\s*화면|안\s*넘어)|로딩.{0,10}(?:입장|교실|수업)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [
      { heading: "수업 중이라 급하다면 이것부터", take: 2 },
      { heading: "오래된 버전이 원인일 때", pick: [0, 2] },
    ],
    intro: "교실 입장 화면에서 로딩만 돈다면 대부분 네트워크나 앱 상태 문제예요. 앱을 완전히 종료했다가 다시 켜고, 아래 순서로 해 보세요.",
    branches: [
      { text: "수업을 놓치게 되더라도 녹화가 켜진 수업은 끝난 뒤 다시보기로 볼 수 있어요.", when: /지났|늦|놓치|시작했|어떡/ },
    ],
    en: "If the classroom keeps loading, fully quit and reopen ClassIn, switch to a phone hotspot, and update the app.",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "업데이트가 안 돼요", "로그인은 되는데 수업이 안 보여요"],
  },
  {
    id: "class-enter-fail",
    subject:
      /(?:수업|교실|강의|라이브).{0,16}(?:입장|참여|참가|접속|들어가|들어오|못\s*들어)|교실\s*입장|입장\s*버튼|(?:수업|교실|강의)\s*(?:이|가)?\s*(?:안\s*(?:보|떠|뜨|나)|안보|안떠|없어|없다|사라)/,
    exclude: /다시\s*보기|다시보기|녹화|웹\s*라이브|생방송|튕|끊|꺼져|꺼지|꺼짐|강제\s*종료/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|없|안\\s*눌|회색`),
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", take: 4 }],
    intro: "수업에 들어가지지 않거나 수업이 안 보이면 입장 시간과 로그인한 아이디부터 확인해 주세요.",
    contactHeading: "학원이나 상담 채널에 알릴 때",
    suggestedQuestions: ["로그인은 되는데 수업이 안 보여요", "코스 가입이 안 돼요", "수업 중에 계속 튕겨요"],
  },
  {
    id: "update-then-wont-open",
    subject: /(?:업데이트|업그레이드).{0,16}(?:안\s*켜|안켜|실행\s*(?:이\s*)?안|안\s*열|꺼져|꺼지|안\s*들어가|멈)|(?:업데이트|업그레이드)\s*(?:후|하고|했는데|하래서|한\s*뒤).{0,14}(?:안|못|오류|에러)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "그래도 안 되면 지우고 다시 설치하기", pick: [0, 1, 3, 4] }],
    intro: "업데이트한 뒤 클래스인이 안 켜지면, 먼저 기기를 재시작해 보고 그래도 같으면 앱을 지우고 최신 버전으로 다시 설치해 주세요.",
    en: "If ClassIn won't open after an update, restart the device; if it still won't open, uninstall and reinstall the latest version.",
    suggestedQuestions: ["설치가 안 돼요", "앱이 자꾸 멈춰요", "캐시 삭제는 어떻게 해요?"],
  },
  {
    id: "app-crash",
    subject:
      /(?:앱|어플|프로그램|클래스인|classin|pc\s*버전|pc\s*프로그램)\s*(?:이|가|은|는)?\s*(?:계속|자꾸|갑자기|자주|또)?\s*(?:튕|꺼|종료|강제\s*종료|닫혀|닫힘|crash|크래시)/,
    requireSymptom: false,
    exclude: /녹화/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 3, 1, 2] }],
    intro: "클래스인 앱이 튕기거나 저절로 꺼지면 아래 순서로 해 보고, 해결되면 거기서 멈추세요.",
    suggestedQuestions: ["업데이트가 안 돼요", "캐시 삭제는 어떻게 해요?", "수업 중에 계속 튕겨요"],
  },
  {
    id: "mobile-buttons-missing",
    subject: /(?:휴대폰|핸드폰|폰|태블릿|아이패드|갤럭시\s*탭|모바일).{0,16}(?:버튼|메뉴|도구|기능)/,
    symptom: /안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|없|사라|보이지\s*않/,
    category: "troubleshooting",
    doc: { category: "start", slug: "mobile-install" },
    steps: [{ heading: "휴대폰·태블릿에서 일부 버튼이 안 보일 때" }],
    intro: "휴대폰·태블릿은 기기 종류와 화면 크기에 따라 쓸 수 있는 기능과 버튼 위치가 PC와 다를 수 있습니다.",
    contactHeading: "",
    suggestedQuestions: ["휴대폰 앱 업데이트가 안 돼요", "수업 알림이 안 와요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "network-environment",
    subject: /네트워크\s*오류|network\s*error|프록시|proxy|방화벽|firewall|포트\s*(?:번호|열|허용|목록)|열어야\s*할|화이트\s*리스트|whitelist|도메인.{0,8}(?:허용|목록|화이트|열어)|웹\s*필터|필터링\s*(?:솔루션|장비|프로그램)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [
      { heading: "자꾸 끊기거나 교실에서 튕길 때", pick: [2] },
      { heading: "오래된 버전이 원인일 때", pick: [0] },
    ],
    intro: "같은 기기가 휴대폰 핫스팟에서는 되고 학원 네트워크에서만 안 된다면, 학원 네트워크(방화벽·프록시)가 원인일 가능성이 큽니다.",
    branches: [
      "열어야 할 주소·포트 목록은 공개 문서에 없어서, 기술지원이 학원 네트워크 환경을 보고 안내드려요. 아래 [실시간 상담 연결]로 네트워크 구성(프록시·방화벽 사용 여부)과 화면에 뜬 오류 문구를 남겨 주세요.",
    ],
    handoff: true,
    en: "If it works on a phone hotspot but not on your academy network, the firewall/proxy is likely blocking ClassIn; our tech support will tell you what to allow.",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "로그인이 안 돼요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "screen-share",
    subject: /화면\s*공유/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|검은|까만|검게|못\s*봐|안\s*보인대`),
    exclude: /끊|튕/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 1] }],
    intro: "화면 공유가 학생에게 안 보이거나 검은 화면으로 보이면, 먼저 클래스인을 완전히 종료했다 다시 켜고 최신 버전인지 확인해 주세요.",
    branches: [
      "그래도 같다면 기기·운영체제 버전과 공유하려던 화면(전체 화면·특정 창)을 상담 채널에 남겨 주세요. 기술지원이 확인합니다.",
    ],
    handoff: true,
    en: "If students can't see your shared screen (or it's black), fully quit and reopen ClassIn and update it; if it continues, our tech support will check your device.",
    suggestedQuestions: ["업데이트가 안 돼요", "앱이 자꾸 멈춰요", "카메라가 안 켜져요"],
  },
  {
    id: "error-code",
    subject: /(?:오류|에러|error)\s*(?:코드|번호|code)\s*[:：]?\s*-?\d{2,}|코드\s*-?\d{2,}|-\d{3,}|(?:오류|에러)\s*코드.{0,20}(?:의미|뜻|무슨|뭔가요|뭐예요|뭔지)/,
    requireSymptom: false,
    exclude: /인증\s*(?:코드|번호)|인증코드/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 3] }],
    intro: "오류 코드별 의미는 공개 문서에 정리돼 있지 않아서, 채팅에서 그 코드의 뜻을 확정해 드리기는 어려워요. 먼저 아래 기본 조치를 해 보고, 같은 코드가 나오면 기술지원이 확인해 드립니다.",
    branches: [
      {
        text: "PC에서만 IPv6가 켜져 있는 게 차이라면, IPv6를 잠시 끄고 같은 증상이 나는지 비교해 보는 건 원인을 좁히는 테스트로 해 볼 만해요. 다만 이것이 원인이라고 확인된 공개 안내는 없어요.",
        when: /ipv6/,
      },
      "아래 [실시간 상담 연결]로 오류 코드, 앱 버전, 문제가 생긴 시각, 오류 화면 스크린샷을 남겨 주세요. 기술지원이 로그와 함께 확인합니다.",
    ],
    handoff: true,
    en: "Error code meanings aren't in our public docs; restart and update the app, then send the code, app version, time and a screenshot to support.",
    suggestedQuestions: ["앱이 자꾸 멈춰요", "업데이트가 안 돼요", "수업 입장이 안 돼요"],
  },
  {
    id: "mass-install",
    subject: /무인\s*설치|silent\s*install|\bmsi\b|일괄\s*(?:설치|배포)|여러\s*대.{0,10}(?:설치|배포)|배포\s*(?:패키지|파일)/,
    requireSymptom: false,
    howto: true,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 2, 3] }],
    intro: "무인 설치나 MSI 같은 일괄 배포 방식은 공개 문서에 안내가 없어요. 일반 설치 기준은 아래와 같고, 여러 대에 한꺼번에 까는 방법은 기술지원이 학원 환경을 보고 안내드려요.",
    branches: ["아래 [실시간 상담 연결]로 설치할 PC 대수와 운영체제, 관리 방식(도메인·백신 정책 등)을 남겨 주세요."],
    handoff: true,
    suggestedQuestions: ["설치가 안 돼요", "업데이트가 안 돼요", "PC에 클래스인 설치가 안 될 때"],
  },
  {
    id: "ppt-share",
    subject: /ppt|파워포인트|애니메이션|슬라이드\s*(?:쇼|넘김)/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|안\\s*움직|멈춰\\s*있|그대로`),
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 3] }],
    intro: "PPT 애니메이션이나 슬라이드가 어떻게 보이는지는 공개 문서에 정리돼 있지 않아 채팅에서 확정해 드리기 어려워요. 먼저 앱을 최신 상태로 맞춰 보고, 같으면 기술지원이 파일과 함께 확인해 드려요.",
    branches: ["아래 [실시간 상담 연결]로 PPT를 띄운 방법(자료 업로드·화면 공유)과 쓰는 기기를 남겨 주세요."],
    handoff: true,
    en: "How PPT animations play in class isn't covered in our public docs; update the app first, then our support team can check your file.",
    suggestedQuestions: ["화면 공유가 학생에게 안 보여요", "업데이트가 안 돼요", "자료 업로드가 안 돼요"],
  },
  {
    id: "class-slow",
    subject: /(?:화면|수업|교실|영상).{0,10}(?:느려|느림|느리|버벅|렉|깨져|깨짐|깨지|지연|딜레이)|렉\s*(?:이|가)?\s*(?:걸|심)|버벅/,
    requireSymptom: false,
    exclude: /녹화|전자칠판\s*화면\s*(?:이|가)?\s*안/,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "화면이 깨지거나 느릴 때", take: 4 }],
    intro: "수업 화면이 느리거나 깨지면 기기에 켜 둔 다른 프로그램부터 정리해 주세요.",
    suggestedQuestions: ["수업 중에 계속 튕겨요", "업데이트가 안 돼요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "class-disconnect",
    subject: /튕|끊(?:기|겨|김|어|겼|긴|깁|길)|나가져|나가집|(?:계속|자꾸|혼자|갑자기)\s*나가|나가요|나갑니다|강제\s*(?:로\s*)?(?:퇴장|종료)|연결\s*(?:이|가)?\s*(?:불안|끊|안)|접속\s*(?:이|가)?\s*(?:불안|끊)/,
    requireSymptom: false,
    exclude: /녹화|미러링|무선\s*키보드|마우스/,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "자꾸 끊기거나 교실에서 튕길 때", pick: [0, 1, 3, 2, 4] }],
    intro: "수업이 끊기거나 튕기면 네트워크와 로그인 기기부터 확인해 주세요. 수업 중이라 급하다면 휴대폰 핫스팟이나 모바일 데이터로 바꿔 다시 들어가세요.",
    branches: [
      {
        text: "여러 학생이 한꺼번에 튕긴다면 강사 쪽 네트워크와 서비스 상태를 함께 봐야 해요. 수업 이름과 시각을 상담 채널에 남겨 주시면 상담원이 그 수업 기록으로 확인합니다.",
        when: /절반|여러\s*명|다들|전부|모두|학생들|다\s*같이|저만/,
      },
      "앱이 계속 무겁다면 캐시를 지우고 기기 저장 공간을 정리해 보세요. 캐시는 PC 앱 프로필 > [계정 및 설정] > [파일 전송]의 [캐시 파일]에서 지웁니다.",
      {
        text: "같은 시간대마다 반복된다면 수업 이름, 문제가 생긴 시각, 쓰는 기기를 상담 채널에 남겨 주세요. 상담원이 그 수업 기록으로 원인을 확인합니다.",
        when: /마다|반복|매번|번째|계속|자꾸/,
      },
    ],
    en: "Restart your router or switch to a phone hotspot, use only one device per account, and update ClassIn to the latest version.",
    suggestedQuestions: ["수업 화면이 느리고 버벅여요", "학생 목소리가 안 들려요", "업데이트가 안 돼요"],
    menuLine: "수업 중 끊기거나 튕길 때: 공유기를 껐다 켜거나 휴대폰 핫스팟으로 바꿔 다시 들어가고, 한 계정은 기기 1대로만 들어갑니다.",
  },

  // ─── 코스 참여·구성원 ────────────────────────────────────────────
  {
    id: "invite-howto",
    subject:
      /(?:학생|구성원|조교).{0,12}초대\s*(?:하|방법|어떻게|는)|초대.{0,10}(?:방법|어떻게|하는\s*법|하나요)|(?:링크|qr).{0,10}(?:보내|공유).{0,14}(?:되나요|돼요|하면|방법)/,
    requireSymptom: false,
    howto: true,
    exclude: /안\s*(?:돼|되|들어|열)|못\s*(?:들어|와)|초대했|보냈는데/,
    category: "onboarding",
    doc: { category: "teacher", slug: "course-members" },
    steps: [{ heading: "구성원 초대하기", take: 4 }],
    intro: "학생은 코스 오른쪽 위 [구성원] > [구성원 초대]에서 연락처, 링크, QR 코드로 초대해요. 링크를 보내도 됩니다.",
    branches: ["학생이 클래스인에 가입돼 있어야 코스에 들어와요. 링크나 QR로 들어오게 하려면 코스 설정 > [코스 관리]의 '코스 가입 허용'을 켜 두세요."],
    contactHeading: "",
    en: "Open the course → [구성원] → [구성원 초대] and invite by contact, link, or QR code. Students must already have a ClassIn account, and '코스 가입 허용' must be on for link/QR joins.",
    suggestedQuestions: ["초대했는데 학생이 못 들어와요", "코스 가입이 안 돼요", "학생 추가가 안 돼요"],
  },
  {
    id: "invite-not-joining",
    subject: /초대(?:를|했|해|한|하|링크|\s*링크|\s*보냈)|링크\s*(?:를|로)?\s*보냈|qr.{0,8}(?:보냈|줬|드렸)/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|못\\s*들어|안\\s*들어|못\\s*와|안\\s*와`),
    category: "troubleshooting",
    doc: { category: "teacher", slug: "course-members" },
    steps: [{ heading: "초대했는데 학생이 못 들어올 때", take: 5 }],
    intro: "초대했는데 학생이 못 들어오면, 가장 흔한 원인은 학원이 알려 준 계정이 아닌 다른 아이디로 로그인해 있는 경우입니다.",
    contactHeading: "",
    suggestedQuestions: ["코스 가입이 안 돼요", "학생 추가가 안 돼요", "로그인은 되는데 수업이 안 보여요"],
  },
  {
    id: "course-join-fail",
    subject: /코스\s*(?:에\s*)?(?:가입|참여|참가|입장|들어)|(?:반|클래스)\s*(?:에\s*)?(?:가입|참여|들어)|qr|큐알|코스\s*id|코스\s*(?:가|이)?\s*안\s*(?:보|떠)|초대\s*링크/,
    exclude: /카메라|마이크|소리|목소리/,
    category: "troubleshooting",
    doc: { category: "student", slug: "course-join" },
    steps: [{ heading: "들어가지지 않을 때", take: 4 }],
    intro: "코스에 들어가지지 않으면 로그인한 아이디와 초대 수락 여부부터 확인해 주세요.",
    contactHeading: "",
    suggestedQuestions: ["초대했는데 학생이 못 들어와요", "로그인은 되는데 수업이 안 보여요", "수업 입장이 안 돼요"],
  },
  {
    id: "course-close-recovery",
    subject:
      /(?:코스|반|클래스).{0,16}(?:삭제|지웠|지워|종료|없어|폐강).{0,24}(?:복구|되돌|살릴|돌려|없어진|사라진|없어졌|날아)|실수로.{0,12}(?:코스|반|클래스).{0,10}(?:삭제|지웠|지워|종료|폐강)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "teacher", slug: "course-create" },
    steps: [{ heading: "코스 삭제(폐강)하기" }],
    intro: "종료한 코스는 되살릴 수 없어요. 다만 학원에서 자동 삭제를 설정하지 않았다면 코스를 끝내도 판서, 스크린샷, 녹화 파일은 지워지지 않습니다.",
    branches: ["녹화본이 남아 있는지는 관리자 대시보드 [스토리지] > [수업 리소스]에서 확인해 주세요. 실수로 종료했다면 아래 [실시간 상담 연결]로 코스 이름과 종료한 시각을 알려 주시면 담당자가 상태를 확인해 드려요."],
    handoff: true,
    suggestedQuestions: ["녹화본이 안 보여요", "예전 녹화본이 사라졌어요", "새 코스 만들고 종료하는 방법 알려줘"],
  },
  {
    id: "teacher-leave",
    subject:
      /(?:그만둔|그만두는|퇴사|퇴직|나간|관둔|떠난)\s*(?:선생님|강사|교사|선생)|(?:선생님|강사|교사|선생).{0,12}(?:그만|퇴사|퇴직|비활성|계정\s*(?:을\s*)?(?:빼|삭제|지우|없애|정리))/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "강사가 그만둘 때", take: 4 }],
    intro: "그만둔 강사는 계정을 지우는 대신 맡던 코스를 다른 강사에게 넘기고 비활성화해요. 이 순서를 지키면 반 운영이 끊기지 않습니다.",
    branches: [
      {
        text: "그 반의 녹화와 숙제가 그대로 남는지는 공개 안내에 명확히 나와 있지 않아 단정하지 않을게요. 걱정되시면 정리 전에 꼭 남길 녹화본을 관리자 대시보드에서 내려받고, [스토리지]에서 보호 잠금을 걸어 두세요.",
        when: /날아|지워|없어|남아|사라|보존|백업/,
      },
    ],
    contactHeading: "",
    suggestedQuestions: ["코스 담당 교사를 바꾸고 싶어요", "교사 추가가 안 돼요", "하위 계정 설정 방법 알려줘"],
  },
  {
    id: "teacher-not-seeing-academy",
    subject:
      /(?:선생님|강사|교사).{0,16}(?:앱|화면|계정|쪽).{0,16}(?:학원|코스|수업|반).{0,10}(?:안\s*(?:떠|뜨|보|나)|안떠|안보|없|보이지)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "담당 코스에 배정하기", take: 3 }],
    intro: "교사로 추가만 하고 코스에 배정하지 않으면 강사 앱에 수업이 보이지 않아요. 코스에 교사로 배정했는지, 강사가 등록한 아이디로 로그인했는지 확인해 주세요.",
    branches: ["강사가 다른 아이디(예전 이메일 등)로 로그인해 있으면 학원 코스가 안 보입니다. 로그아웃한 뒤 학원에 등록한 휴대폰 번호나 이메일로 다시 로그인하게 해 주세요."],
    contactHeading: "",
    suggestedQuestions: ["교사 추가가 안 돼요", "로그인은 되는데 수업이 안 보여요", "코스 담당 교사를 바꾸고 싶어요"],
  },
  {
    id: "teacher-other-institution",
    subject: /다른\s*(?:기관|학원)\s*(?:소속|에\s*(?:등록|소속)|으로\s*등록)|이미\s*다른\s*(?:기관|학원)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "강사 가입부터 확인하기", take: 2 }],
    intro: "'이미 다른 기관 소속'이라고 나오면 그 강사 계정이 다른 학원(기관)에 교사로 등록돼 있을 수 있어요. 강사에게 가입한 아이디를 직접 받아 그대로 넣었는지부터 확인해 주세요.",
    branches: ["입력한 값이 맞는데도 같은 문구가 나오면, 이전 학원에서 빠져야 하는지 등 계정 상태를 담당자가 확인해 드려요. 아래 [실시간 상담 연결]로 화면 문구를 남겨 주세요."],
    handoff: true,
    suggestedQuestions: ["교사 추가가 안 돼요", "그만둔 선생님 계정 빼는 법 알려줘요", "학생 추가가 안 돼요"],
  },
  {
    id: "teacher-recording-access",
    subject: /(?:선생님|강사|교사).{0,14}(?:녹화본|녹화|다시보기|녹화\s*영상).{0,14}(?:못\s*(?:보|봐)|안\s*(?:보|떠|뜨)|안보|안떠|안뜬|없다)/,
    requireSymptom: false,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "담당 코스에 배정하기", take: 2 }],
    intro: "관리자에게는 보이는데 선생님에게 녹화본이 안 보인다면, 그 선생님이 그 코스의 교사로 배정돼 있는지부터 확인해 주세요. 앱에서는 배정된 코스의 녹화를 봅니다.",
    branches: ["선생님이 관리자 대시보드에서 녹화본을 내려받아야 한다면, [계정 정보] > [권한 관리]의 하위 계정 권한에 [스토리지] > [수업 리소스]를 포함해 주세요."],
    contactHeading: "",
    suggestedQuestions: ["하위 계정 설정 방법 알려줘", "녹화본 다운로드 방법 알려줘", "코스 담당 교사를 바꾸고 싶어요"],
  },
  {
    id: "teacher-add-fail",
    subject: /(?:교사|강사|선생님|선생).{0,10}(?:추가|등록|초대|배정)/,
    exclude: /학생.{0,6}(?:추가|등록)|목소리|소리/,
    category: "admin",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "강사 등록에서 자주 하는 실수", take: 4 }],
    intro: "교사 추가가 안 되면 대부분 강사의 가입 여부나 입력한 아이디가 원인입니다.",
    contactHeading: "",
    suggestedQuestions: ["학생 추가가 안 돼요", "기관 인증이 안 돼요", "코스 담당 교사를 바꾸고 싶어요"],
  },
  {
    id: "student-proxy-sms",
    subject: /(?:대리\s*등록|임시\s*비밀번호|초기\s*비밀번호).{0,16}(?:문자|메일|안내)|(?:문자|메일).{0,12}(?:임시\s*비밀번호|초기\s*비밀번호)/,
    symptom: /안\s*(?:와|왔|오|가|갔|간|감|옴)|안와|안왔|안가|안갔|못\s*받|안\s*받|없/,
    category: "admin",
    doc: { category: "admin", slug: "student-onboarding" },
    steps: [{ heading: "대리 등록했는데 문자가 안 갈 때", take: 4 }],
    intro: "대리 등록한 학생에게 임시 비밀번호 문자가 안 가면 스팸함과 번호 형식부터 확인해 주세요.",
    contactHeading: "",
    suggestedQuestions: ["학생 추가가 안 돼요", "학생 대리 등록 메뉴가 안 보여요", "인증번호가 안 와요"],
  },
  {
    id: "student-add-excel",
    subject: /엑셀|excel|xlsx|xls/,
    exclude: /통계|다운로드\s*(?:해|받)|성적|출결/,
    category: "admin",
    doc: { category: "admin", slug: "student-onboarding" },
    steps: [{ heading: "Excel로 한 번에 300명까지", take: 5 }],
    intro: "Excel 등록이 안 되면 받은 양식을 그대로 쓰고 있는지부터 확인해 주세요. 한 번에 300명까지 올라갑니다.",
    branches: [
      "휴대폰 번호 칸은 국가번호가 한국(+82)인지, 번호가 빈 줄이나 같은 번호가 두 번 들어가 있지 않은지 확인해 주세요.",
      "아직 클래스인에 가입하지 않은 학생이 섞여 있다면, 그 학생은 한 명씩 추가하거나 텍스트로 가져올 때 [학생 대리 등록]을 체크해 주세요.",
    ],
    contactHeading: "",
    suggestedQuestions: ["학생 추가가 안 돼요", "학생 대리 등록 메뉴가 안 보여요", "대리 등록했는데 문자가 안 가요"],
  },
  {
    id: "student-add-fail",
    subject: /학생\s*(?:을|를|이|가)?\s*(?:추가|등록|가져오기|일괄|엑셀|excel|명단)|(?:엑셀|excel|텍스트)\s*(?:로|에서)?\s*(?:가져오기|등록|업로드)/,
    category: "admin",
    doc: { category: "admin", slug: "student-onboarding" },
    heading: "등록 방법 고르기",
    steps: [{ heading: "한 명씩 추가하기", take: 3 }],
    intro:
      "코스에 넣을 수 있는 학생은 학원 대시보드에 등록된 학생뿐입니다. 학생이 아직 클래스인에 가입하지 않았다면 그냥 추가되지 않으니 [학생 대리 등록]을 함께 체크해 주세요.",
    variants: [
      {
        when: /이미\s*(?:등록|가입|존재|있는|사용)/,
        steps: [{ heading: "한 명씩 추가하기", take: 3 }],
        intro:
          "'이미 등록된 사용자'라고 나오면 그 번호로 클래스인 계정이 이미 있다는 뜻이에요. 대리 등록은 가입하지 않은 학생에게만 쓰니, 그 번호를 그대로 학생 추가에 넣고 학원 [학생] 목록에 이미 있는지도 검색해 보세요.",
      },
    ],
    branches: [{ text: "[학생 대리 등록]이 안 보이면 기관 인증을 마쳤는지 먼저 확인해 주세요.", unless: /이미\s*(?:등록|가입|존재|있는|사용)/ }],
    contactHeading: "",
    suggestedQuestions: ["학생 대리 등록 메뉴가 안 보여요", "대리 등록했는데 문자가 안 가요", "초대했는데 학생이 못 들어와요"],
  },

  // ─── 일정·알림·성적·AI·자료 ──────────────────────────────────────
  {
    id: "class-notification",
    subject: /(?:수업|앱|푸시|클래스인)?\s*알림/,
    symptom: /안\s*(?:와|왔|오|옴|떠|뜨|울)|안와|안옴|안떠|안뜨|오지\s*않|뜨지\s*않|못\s*받|없/,
    exclude: /학부모|문자\s*알림|sms|알림톡|카카오|인증|마이크/,
    category: "troubleshooting",
    doc: { category: "student", slug: "todo-calendar" },
    steps: [{ heading: "수업 알림이 안 올 때", take: 4 }],
    intro: "수업 알림이 오지 않으면 휴대폰의 알림 설정부터 확인해 주세요.",
    contactHeading: "",
    suggestedQuestions: ["찾는 일정이 안 보여요", "앱이 자꾸 멈춰요", "수업 입장이 안 돼요"],
  },
  {
    id: "schedule-missing",
    subject: /일정|캘린더|할\s*일\s*(?:에|목록|탭)?/,
    symptom: /안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|없|사라|보이지\s*않|안\s*올라/,
    exclude: /수업\s*일정\s*(?:을|를)?\s*(?:어떻게|정하|바꾸|변경)|도입\s*일정|설치\s*일정/,
    category: "troubleshooting",
    doc: { category: "student", slug: "todo-calendar" },
    steps: [{ heading: "찾는 일정이 안 보일 때", take: 4 }],
    intro: "찾는 일정이 안 보이면 화면 위쪽 필터와 코스 참여 여부부터 확인해 주세요.",
    contactHeading: "",
    suggestedQuestions: ["수업 알림이 안 와요", "로그인은 되는데 수업이 안 보여요", "코스 가입이 안 돼요"],
  },
  {
    id: "grades-missing",
    subject: /점수|성적|채점\s*결과|평균/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|없|반영|틀려|틀렸|다르`),
    exclude: /요금|가격|분석\s*기능|리포트\s*기능|사라|지워|다시\s*(?:냈|제출|내)/,
    category: "troubleshooting",
    doc: { category: "student", slug: "course-grades" },
    steps: [{ heading: "점수가 안 보이거나 이상할 때", take: 5 }],
    intro: "점수가 안 보이거나 이상하면 채점이 끝났는지부터 확인해 주세요. 평균에는 채점이 끝난 활동만 들어갑니다.",
    contactHeading: "",
    suggestedQuestions: ["숙제 다시 냈더니 점수가 사라졌어요", "숙제 제출이 안 돼요", "찾는 일정이 안 보여요"],
  },
  {
    id: "ai-tab-missing",
    subject: /ai\s*(?:탭|기능|튜터|버튼|메뉴|평가|칠판)|에이아이/,
    symptom: /안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|없|사라|보이지\s*않|안\s*돼|안돼|안되/,
    exclude: /끄|비활성|요금|가격|있나요|되나요/,
    category: "troubleshooting",
    doc: { category: "student", slug: "ai-features" },
    steps: [{ heading: "AI 탭이 안 보일 때", take: 2 }],
    intro: "AI 기능이 보이는지는 학원의 계약, 계정 권한, 관리자 설정에 따라 다릅니다.",
    branches: ["학원 관리자는 관리자 대시보드 일반 설정의 [부가가치 서비스]에서 AI 기능을 켜고 끕니다."],
    contactHeading: "",
    suggestedQuestions: ["점수가 안 보여요", "앱이 자꾸 멈춰요", "업데이트가 안 돼요"],
  },
  {
    id: "nickname-mismatch",
    subject:
      /(?:코스|반)\s*마다.{0,8}(?:이름|닉네임)|(?:예전|이전|옛날)\s*(?:이름|닉네임)|(?:이름|닉네임)\s*(?:이|가|을|를)?\s*(?:다르게|안\s*바뀌|바뀌지|바꿨는데|바꿔도)/,
    requireSymptom: false,
    exclude: /전화번호|휴대폰\s*번호/,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "teacher-profile" },
    steps: [{ heading: "코스마다 다른 이름이 보일 때" }],
    intro: "계정 닉네임과 별도로 코스마다 '코스 내 나의 닉네임'이 따로 있습니다.",
    contactHeading: "",
    suggestedQuestions: ["학생 이름 대신 전화번호가 보여요", "코스 닉네임 변경 옵션 어디서 켜요", "로그인은 되는데 수업이 안 보여요"],
  },
  {
    id: "name-shows-phone",
    subject: /(?:이름|닉네임).{0,12}(?:전화번호|휴대폰\s*번호|번호)|(?:전화번호|휴대폰\s*번호)\s*(?:가|로|만)\s*(?:보|나|떠|표시)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "course-members" },
    steps: [{ heading: "학생 이름이 전화번호로 보일 때" }],
    intro: "학생 이름 대신 전화번호가 보이면 기관의 코스 닉네임 동기화 설정을 확인해야 합니다.",
    contactHeading: "",
    suggestedQuestions: ["코스마다 다른 이름이 보여요", "학생 닉네임 동기화 방법 알려줘", "학생 추가가 안 돼요"],
  },

  // ─── 숙제 ──────────────────────────────────────────────────────
  {
    id: "activity-not-visible",
    subject: /(?:숙제|과제|시험|활동).{0,24}(?:학생|몇\s*명|일부).{0,16}(?:안\s*(?:보|떠|뜨)|안보|안떠|안뜬|없다|보이지)|(?:학생|몇\s*명|일부).{0,16}(?:숙제|과제|시험|활동).{0,16}(?:안\s*(?:보|떠|뜨)|안보|안떠|없다|보이지)/,
    requireSymptom: false,
    category: "classroom",
    doc: { category: "software", slug: "lesson-activities" },
    steps: [{ heading: "활동을 만들기 전에 정할 것", take: 4 }],
    intro: "숙제가 일부 학생에게만 안 보이면 그 활동의 게시 대상과, 학생이 코스에 들어온 시점을 먼저 확인해 주세요.",
    branches: [
      "활동 편집에서 게시 대상에 그 학생들이 들어 있는지, 학생들이 같은 코스에 들어와 있는지 확인해 주세요.",
      "그래도 안 보이면 코스 이름과 활동 이름, 안 보이는 학생 수를 상담 채널에 남겨 주세요. 담당자가 확인합니다.",
    ],
    contactHeading: "",
    suggestedQuestions: ["숙제 제출이 안 돼요", "학생 추가가 안 돼요", "초대했는데 학생이 못 들어와요"],
  },
  {
    id: "homework-photo",
    subject: /(?:숙제|과제).{0,12}(?:사진|파일|첨부|이미지|업로드|올라|올리|붙)|(?:사진|파일|첨부|이미지).{0,12}(?:숙제|과제)|사진\s*(?:이|가)?\s*(?:안\s*(?:붙|올라)|올라가지|붙지)/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|누워|돌아가|돌아갔|회전|옆으로|뒤집|거꾸로`),
    category: "troubleshooting",
    doc: { category: "student", slug: "homework-submit-troubleshooting" },
    steps: [{ heading: "사진이 안 붙거나 올라가지 않을 때", take: 4 }],
    intro: "숙제 사진이 안 붙거나 올라가지 않으면 앱의 사진·카메라 접근 권한부터 확인해 주세요.",
    variants: [
      {
        when: /누워|돌아가|돌아갔|회전|옆으로|뒤집|거꾸로/,
        doc: { category: "student", slug: "course-submit-activity" },
        steps: [{ heading: "휴대폰으로 숙제 사진 올리기", pick: [3, 4] }],
        intro:
          "사진이 옆으로 누워 있으면 휴대폰 사진 앱(갤러리)에서 먼저 똑바로 돌려 저장한 뒤 다시 붙여 주세요. 이미 냈다면 고쳐서 다시 내면 되는데, 다시 내면 선생님이 준 점수와 피드백은 지워져요.",
      },
    ],
    branches: [
      { text: "업로드가 계속 돌기만 하면 클래스인을 완전히 종료했다가 다시 열어 제출해 보세요.", when: /업로드\s*중|계속\s*돌|로딩|안\s*넘어/ },
      { text: "마감이 걱정되면 지금 상황을 선생님께 먼저 알려 두세요.", when: /마감|오늘|밤|늦|불안|걱정/ },
    ],
    suggestedQuestions: ["숙제 제출이 안 돼요", "숙제 다시 냈더니 점수가 사라졌어요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "homework-score-lost",
    subject: /(?:숙제|과제).{0,16}(?:점수|피드백|채점).{0,10}(?:사라|없어|지워)|(?:점수|피드백).{0,10}(?:사라|없어|지워)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "student", slug: "homework-submit-troubleshooting" },
    steps: [{ heading: "다시 냈더니 점수나 피드백이 사라졌을 때" }],
    intro: "낸 숙제를 고치면 선생님이 준 점수와 피드백이 지워집니다.",
    suggestedQuestions: ["숙제 제출이 안 돼요", "숙제 사진이 안 올라가요", "선생님이 숙제 미제출이래요"],
  },
  {
    id: "homework-submit",
    subject: /숙제|과제/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|미제출|제출\\s*(?:이|가)?\\s*안|안\\s*냈|못\\s*냈`),
    category: "troubleshooting",
    doc: { category: "student", slug: "homework-submit-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 5 }],
    intro: "숙제 제출이 안 되면 아래를 차례로 확인해 주세요. [초안 저장]은 제출이 아닙니다.",
    branches: [
      {
        text: "사진을 붙인 뒤 마지막 [숙제 제출]까지 눌러야 제출돼요. [초안 저장]만 된 상태면 선생님 화면에는 미제출로 보입니다. 숙제 화면에 초록색 [제출하기] 버튼이 그대로 있으면 아직 제출 전이에요. 확인한 화면을 찍어 선생님께 상황을 함께 알려 주세요.",
        when: /안\s*냈다|미제출|혼났|분명|올렸는데|냈는데|낸\s*줄/,
      },
    ],
    suggestedQuestions: ["숙제 사진이 안 올라가요", "숙제 다시 냈더니 점수가 사라졌어요", "앱이 자꾸 멈춰요"],
  },

  {
    id: "storage-full",
    subject: /(?:스토리지|저장\s*공간|용량).{0,16}(?:다\s*찼|가득|부족|꽉|초과|거의|넘)|용량\s*(?:알림|경고)/,
    requireSymptom: false,
    howto: true,
    category: "admin",
    doc: { category: "admin", slug: "storage-management" },
    heading: "수업 데이터 지우기",
    steps: [{ heading: "수업 데이터 지우기", pick: [0, 1, 2, 3] }],
    intro: "학원 스토리지에는 학습 활동 파일, 수업이 끝난 뒤 생기는 녹화본·스크린샷·칠판 파일, 공유 드라이브 자료가 함께 쌓여요. 대개 녹화본과 수업 캡처가 가장 많이 차지합니다. 사용량은 [스토리지] > [데이터 개요]에서 봅니다.",
    branches: ["앞으로 자동으로 정리하려면 [일반 설정] > [저장 설정]에서 리소스 자동 삭제 기간을 정해 두세요. 남길 수업에는 보호 잠금을 걸면 자동 삭제에서 빠집니다."],
    contactHeading: "",
    suggestedQuestions: ["예전 녹화본이 사라졌어요", "녹화본 다운로드 방법 알려줘", "클래스인 스토리지 삭제 방법 알려줘"],
  },
  {
    id: "participation-monitoring",
    subject: /(?:집중|딴짓|딴\s*짓|수업\s*태도|참여\s*(?:도|정도)).{0,24}(?:알\s*수|보이|확인|체크|보나|볼\s*수)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "student", slug: "class-report" },
    steps: [{ heading: "학습 보고서에 들어 있는 것", pick: [0, 3, 4] }],
    intro: "수업이 끝나면 학습 보고서가 자동으로 만들어져요. 선생님과 학생이 수업 화면 캡처, 출석, 스테이지에 오른 시간·말한 시간 같은 참여 정도를 볼 수 있습니다.",
    branches: ["수업 중 아이 모습이 걱정되시면 선생님께 수업 태도 상담을 따로 요청해 보세요. 보고서만으로는 알 수 없는 부분을 알려 주실 수 있어요."],
    contactHeading: "",
    suggestedQuestions: ["다시보기가 안 떠요", "숙제는 어떻게 내요?", "점수가 안 보여요"],
  },
  {
    id: "training-materials",
    subject: /(?:교육|매뉴얼|사용\s*설명서|설명서|튜토리얼|강의\s*영상|교육\s*영상|사용법\s*(?:자료|영상|교육)).{0,20}(?:있|받|어디|요청|필요|주세요|될까)/,
    requireSymptom: false,
    howto: true,
    exclude: /교육청|교육지원청|교육비/,
    category: "onboarding",
    doc: { category: "admin", slug: "teacher-onboarding" },
    steps: [{ heading: "첫 수업 전에 강사와 같이 볼 것", pick: [4] }],
    intro: "관리자 대시보드와 수업 도구 사용법은 녹화 강의로 볼 수 있어요. 클래스인 상담 채널(홈페이지 하단 채팅)에 기관 교육 코스 초대를 요청하면, 초대받은 뒤 PC나 모바일에서 봅니다.",
    branches: ["전자칠판 사용 매뉴얼(전원, 편집 도구, 제스처, 녹화, 수업 종료)도 상담 채널에 요청하면 보내 드려요. 홈페이지 문서센터의 관리자 가이드에서도 메뉴별 순서를 볼 수 있습니다."],
    contactHeading: "",
    suggestedQuestions: ["새 코스 만들고 종료하는 방법 알려줘", "학생 추가가 안 돼요", "교사 추가가 안 돼요"],
  },
  {
    id: "board-power-off",
    subject: /(?:전자칠판|칠판|티비|tv|(?<!대시\s?)보드).{0,20}(?:끄|끌|꺼도|종료|전원\s*끄)|(?:코드|플러그)\s*(?:를|만)?\s*(?:그냥\s*)?(?:빼|뽑)/,
    requireSymptom: false,
    howto: true,
    exclude: /안\s*꺼|꺼져|꺼짐|꺼지|안\s*켜|자꾸/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "버튼은 화면 오른쪽 사이드 하단에 있습니다", pick: [0, 1] }],
    intro: "전자칠판은 코드를 바로 빼기보다 오른쪽 측면 아래 전원 버튼으로 끄는 게 기본이에요.",
    branches: ["번개가 치거나 오래 쓰지 않을 때는 전원을 끈 뒤 전원 플러그와 네트워크 케이블을 뽑아 둡니다."],
    contactHeading: "",
    suggestedQuestions: ["전자칠판 화면이 안 켜져요", "미러링이 안 돼요", "전자칠판 터치가 안 돼요"],
  },
  {
    id: "hybrid-equipment",
    subject: /하이브리드.{0,30}(?:장비|노트북|필요|최소|준비|카메라)|노트북\s*만으로.{0,20}(?:수업|하이브리드)/,
    requireSymptom: false,
    howto: true,
    category: "classroom",
    doc: { category: "teacher", slug: "lesson-option-concepts" },
    steps: [{ heading: "하이브리드 수업 토글" }],
    intro: "교실 학생과 원격 학생이 같이 듣는 하이브리드 수업은 수업 옵션만 켠다고 끝나지 않고, 교실을 비출 카메라와 원격 학생과 주고받을 소리 장비를 함께 준비해야 해요.",
    branches: ["전자칠판 없이 노트북으로 할 때도 노트북 카메라·마이크로 시작할 수 있지만, 교실 전체를 비추고 뒤쪽 학생 소리까지 잡으려면 외장 카메라·마이크를 검토합니다. 구성은 교실 크기에 따라 달라 도입 상담에서 맞춰 드려요."],
    contactHeading: "",
    suggestedQuestions: ["하이브리드 수업 토글은 언제 켜야 하나요?", "현장 녹화 카메라 설정 어떻게 해요?", "도입 상담을 받아보고 싶습니다"],
  },
  {
    id: "drive-upload",
    subject:
      /(?:자료|파일|드라이브|클라우드|pdf|ppt|hwp|한글\s*파일|edb|교안|문서|영상).{0,12}(?:업로드|올리|올라|안\s*올)|업로드/,
    exclude: /숙제|과제|사진|녹화|설치/,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "drive-materials" },
    steps: [{ heading: "업로드가 안 될 때", take: 4 }],
    intro: "자료가 올라가지 않으면 파일 형식과 크기, 공유 드라이브 권한부터 확인해 주세요.",
    contactHeading: "",
    suggestedQuestions: ["숙제 사진이 안 올라가요", "공유 드라이브 권한 설정 방법 알려줘", "앱이 자꾸 멈춰요"],
  },

  // ─── 앱 설치·실행·업데이트 ───────────────────────────────────────
  {
    id: "install-mac",
    subject: /(?:맥|mac|맥북|macbook|아이맥|애플\s*실리콘|m1|m2|m3).{0,16}(?:설치|깔|다운|실행|열)|(?:설치|깔|다운).{0,12}(?:맥|mac|맥북)/,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install-troubleshooting" },
    steps: [{ heading: "맥에서 설치가 안 될 때", take: 3 }],
    intro: "맥은 칩 종류(Apple Silicon·인텔)에 맞는 파일을 받아야 설치됩니다.",
    suggestedQuestions: ["설치했는데 클래스인이 안 켜져요", "업데이트가 안 돼요", "로그인이 안 돼요"],
  },
  {
    id: "install-file-missing",
    subject: /설치\s*파일|다운(?:로드)?\s*(?:한|받은|된)\s*파일|받은\s*파일/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|어디|못\\s*찾|없`),
    exclude: /녹화|숙제|과제|pdf|자료/,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install-troubleshooting" },
    steps: [{ heading: "다운로드한 설치 파일이 안 보일 때", take: 4 }],
    intro: "설치 파일을 받았는데 안 보이면 브라우저 다운로드 목록과 [다운로드] 폴더부터 확인해 주세요.",
    suggestedQuestions: ["설치가 중간에 멈춰요", "설치했는데 클래스인이 안 켜져요", "맥북에 클래스인 설치가 안 돼요"],
  },
  {
    id: "install-stuck",
    subject: /설치.{0,12}(?:멈|안\s*넘어|진행\s*(?:이|가)?\s*안|그대로|오래|안\s*끝|무한|0\s*%|퍼센트)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install-troubleshooting" },
    steps: [{ heading: "설치가 멈춘 것 같을 때", take: 3 }],
    intro: "설치 진행률 숫자가 올라가는 동안에는 창을 닫지 말고 기다려 주세요.",
    suggestedQuestions: ["설치 파일이 안 보여요", "설치했는데 클래스인이 안 켜져요", "업데이트가 안 돼요"],
  },
  {
    id: "install-then-wont-open",
    subject: /설치\s*(?:했|한|하고|후|는\s*했|는\s*됐|는\s*됐는데|됐는데|는\s*됐어).{0,20}(?:안\s*(?:켜|열|돼|되)|안켜|안열|실행|켜지|꺼져|꺼지|꺼짐)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install-troubleshooting" },
    steps: [{ heading: "설치했는데 켜지지 않을 때" }],
    intro: "설치는 끝났는데 켜지지 않으면 기기에 맞는 파일인지, 보안 프로그램이 막고 있지 않은지 확인해 주세요.",
    suggestedQuestions: ["앱이 자꾸 멈춰요", "업데이트가 안 돼요", "맥북에 클래스인 설치가 안 돼요"],
  },
  {
    id: "install-fail",
    subject: /설치|깔(?:았|아|기|리|려|고|면|렸|립|수)|인스톨|다운로드\s*(?:가|이)?\s*안|설치\s*파일/,
    exclude: /전자칠판\s*설치|보드\s*설치|벽걸이|스탠드|거치|설치\s*(?:기사|일정|비용|가능|환경|위치)|녹화|카메라\s*설치/,
    category: "troubleshooting",
    doc: { category: "start", slug: "pc-install-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
    intro: "PC에 클래스인이 설치되지 않으면 아래부터 확인해 주세요. 설치 파일은 공식 홈페이지 [다운로드] 페이지에서만 받습니다.",
    suggestedQuestions: ["맥북에 클래스인 설치가 안 돼요", "설치했는데 클래스인이 안 켜져요", "업데이트가 안 돼요"],
  },
  {
    id: "cache-clear",
    subject: /캐시/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "PC: 캐시 파일 지우기", take: 5 }],
    intro: "캐시 파일을 지우면 화면이 이상하거나 멈추는 문제가 풀리는 경우가 많습니다. [데이터 파일]과 헷갈리지 마세요.",
    suggestedQuestions: ["업데이트가 안 돼요", "앱이 자꾸 멈춰요", "휴대폰 앱 캐시 삭제는 어떻게 해요?"],
  },
  {
    id: "update-mobile",
    subject:
      /(?:휴대폰|핸드폰|폰|아이폰|안드로이드|갤럭시|태블릿|아이패드|패드|모바일).{0,16}(?:업데이트|업그레이드|버전)|(?:업데이트|업그레이드|버전).{0,16}(?:휴대폰|핸드폰|아이폰|안드로이드|갤럭시|태블릿|아이패드|모바일)/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [
      { heading: "휴대폰·태블릿: 스토어에서 업데이트하기", take: 4 },
      { heading: "휴대폰·태블릿: 버전 확인과 캐시 삭제", take: 2 },
    ],
    intro: "휴대폰·태블릿 앱은 스토어에서 업데이트합니다.",
    suggestedQuestions: ["PC 업데이트가 안 돼요", "앱이 자꾸 멈춰요", "캐시 삭제는 어떻게 해요?"],
  },
  {
    id: "update-board",
    subject: /(?:전자칠판|(?<!대시\s?)보드|칠판|classin\s*x|클래스인\s*x).{0,16}(?:업데이트|업그레이드|버전)/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "전자칠판: 업데이트하기", take: 4 }],
    intro: "전자칠판의 클래스인은 화면 아래 톱니바퀴의 소프트웨어 정보에서 업데이트합니다.",
    suggestedQuestions: ["전자칠판 터치가 안 돼요", "미러링이 안 돼요", "앱이 자꾸 멈춰요"],
  },
  {
    id: "update-pc",
    subject: /업데이트|업그레이드|최신\s*버전|구버전|버전/,
    exclude: /6\s*0\s*[79]|릴리즈|새\s*기능|뭐가\s*바뀌|업데이트\s*내용|업데이트\s*안내/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "PC: 최신 버전으로 업데이트하기", take: 4 }],
    intro: "PC 앱은 프로필의 [소프트웨어 정보]에서 최신 버전으로 올립니다.",
    branches: ["휴대폰·태블릿은 Play 스토어나 App Store에서 ClassIn을 검색해 [업데이트]를 누릅니다."],
    suggestedQuestions: ["캐시 삭제는 어떻게 해요?", "앱이 자꾸 멈춰요", "휴대폰 앱 업데이트가 안 돼요"],
  },
  {
    id: "app-frozen",
    subject:
      /(?:앱|어플|프로그램|클래스인|classin|pc|컴퓨터|노트북|화면|창)\s*(?:이|가|은|는)?\s*(?:계속|자꾸|갑자기|자주|또)?\s*(?:안\s*(?:켜|열|떠|들어가)|안켜|안열|실행\s*(?:이|가)?\s*안|켜지지|열리지|꺼져|꺼짐|꺼지|꺼졌|멈|먹통|튕|하얗|까맣|검게|검은|흰|이상|깨져|깨짐|안\s*나와|안\s*나옴|로딩)|멈춰|멈췄|멈춤|먹통|로딩\s*(?:만|이|중)|글자\s*(?:가|이)?\s*깨|하얀\s*화면|흰\s*화면|검은\s*화면|응답\s*없음|응답하지\s*않|프리징|얼어/,
    requireSymptom: false,
    exclude: /전자칠판|(?<!대시\s?)보드|칠판|녹화|수업\s*중|교실에서/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", pick: [0, 3, 1, 2] }],
    intro: "클래스인이 멈추거나 화면이 이상하면 아래 순서로 해 보고, 해결되면 거기서 멈추세요.",
    suggestedQuestions: ["업데이트가 안 돼요", "캐시 삭제는 어떻게 해요?", "설치했는데 클래스인이 안 켜져요"],
    menuLine: "앱이 멈추거나 화면이 이상할 때: 클래스인을 완전히 종료했다 다시 켜고, 최신 버전으로 업데이트한 뒤 캐시를 지웁니다.",
  },

  // ─── 로그인(넓은 주제) ─────────────────────────────────────────
  {
    id: "login-fail",
    subject: /로그인|로그\s*인|아이디|접속\s*(?:이|가)?\s*안/,
    exclude: /수업|교실|코스|강의|로그인은\s*(?:되|돼)/,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "잘못된 계정 또는 비밀번호라고 나올 때", take: 4 }],
    intro:
      "로그인이 안 되면 먼저 공식 홈페이지가 아니라 설치한 앱이나 PC 프로그램에서 로그인하는지 확인해 주세요. 홈페이지 로그인은 학원 관리자용입니다.",
    branches: [
      "비밀번호가 기억나지 않으면 로그인 화면에서 PC는 [비밀번호 변경], 모바일은 [비밀번호를 잊으셨나요?]를 눌러 새로 정합니다.",
      "모바일은 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다.",
      { text: "이메일로 가입했다면 로그인 화면에서 휴대폰 번호 대신 이메일 로그인으로 바꿔 넣어 주세요.", when: /이메일|email|메일/ },
      { text: "앱에 '네트워크 오류'가 뜬다면 다른 인터넷이나 휴대폰 핫스팟으로 바꿔 다시 로그인해 보세요.", when: /네트워크|network|프록시|proxy/ },
    ],
    en: "Log in with the installed ClassIn app, not the website. For a phone ID choose +82 and enter your number starting with 10 (drop the first 0); if you signed up with email, switch to email login.",
    suggestedQuestions: ["인증번호가 안 와요", "비밀번호를 잊어버렸어요", "계정이 없다고 떠요"],
    menuLine: "로그인이 안 될 때: 홈페이지가 아니라 설치한 앱에서 로그인하고, 휴대폰 번호는 +82를 고른 뒤 10부터 입력합니다.",
  },
]

// 페르소나 평가에서 나온 좁은 현장 주제를 먼저 본다(위에서부터 먼저 맞는 주제를 쓴다).
export const SYMPTOM_TOPICS: SymptomTopic[] = [...FIELD_SYMPTOM_TOPICS, ...BASE_SYMPTOM_TOPICS]

const VAGUE_MENU_TOPIC_IDS = [
  "login-fail",
  "app-frozen",
  "class-disconnect",
  "audio-cant-hear",
  "recording-fail",
  "institution-verification",
]

// 대상 없는 오류 질문을 가리기 위한 '의미 없는 토큰'. 조사·어미를 뗀 뒤 비교한다.
const GENERIC_TOKEN_RE =
  /^(?:안녕하세요|안녕|안녕하십니까|선생님|쌤|상담사님|담당자님|매니저님|관리자님|저기요|저|제가|저희|혹시|그|여기|네|아|음|클래스인|클래스|classin|class|in|앱|어플|어플리케이션|프로그램|이거|그거|저거|이게|그게|저게|여기|거기|뭔가|무언가|뭐|뭐가|왜|지금|계속|자꾸|자꾸만|갑자기|또|또다시|다시|자주|좀|너무|진짜|정말|완전|오늘|방금|아까|요즘|에러|오류|error|버그|bug|문제|이상|고장|작동|동작|먹통|안|못|잘|코드|메시지|메세지|창|알림|팝업|화면에|해결|도와|도와주세요|도와줘|부탁|부탁해요|부탁드려요|어떻게|해야|하나요|할까요|되나요|돼요|되요|돼|됨|됩니다|되네요|돼서|되서|안돼|안돼요|안됨|안되요|안되네요|안되는데|떠요|떠|뜸|뜨네요|떴어요|나요|나와요|나네요|납니다|났어요|났습니다|생겨요|생겼어요|생깁니다|발생|발생해요|발생했어요|있어요|있습니다|있음|있네요|있는데|해요|하네요|합니다|했어요|요|ㅠ|ㅠㅠ|ㅜ|ㅜㅜ|ㅠㅠㅠ|헬프|help|급해요|급합니다|확인|부탁드립니다|짜증|짜증나|짜증나요|짜증나네|진짜로|다|전부|하나도|다안돼|다안되|다안됨|봐주세요|들어가지지|들어가지지가|들어가져요|들어가요|들어가|안들어가져요|않아요|않습니다|않네요|않음|않고)$/

const GENERIC_TOKEN_PREFIX_RE = /^(?:에러|오류|버그|문제|이상|고장|먹통|작동|동작|안돼|안되|안됨)/

const TOKEN_JOSA_RE =
  /(?:으로|에서|에게|한테|까지|부터|이나|이랑|처럼|만큼|은|는|이|가|을|를|와|과|의|도|만|로|나|랑|에)$/

function stripJosa(token: string) {
  const stripped = token.replace(TOKEN_JOSA_RE, "")
  return stripped.length >= 1 ? stripped : token
}

function isGenericToken(token: string) {
  if (/^\d+$/.test(token)) return true
  if (GENERIC_TOKEN_RE.test(token)) return true
  const stripped = stripJosa(token)
  if (GENERIC_TOKEN_RE.test(stripped)) return true
  return GENERIC_TOKEN_PREFIX_RE.test(token)
}

export function isVagueErrorQuestion(question: string) {
  const text = normalizeTriageText(question)
  if (!text) return false
  if (!GENERIC_ERROR_RE.test(text) && !SYMPTOM_RE.test(text)) return false
  const tokens = text.split(" ").filter(Boolean)
  if (tokens.length > 8) return false
  return tokens.every(isGenericToken)
}

// "또 날아가면 안 되니까 저장해 두겠다", "보이지 않게 하려면"처럼 금지·목적을 말하는 표현은 증상이 아니다.
const NON_SYMPTOM_NEGATION_RE =
  /(?:면|으면)\s*안\s*(?:돼|되)\S*|안\s*(?:되|돼)\s*(?:게|도록)|(?:지|보이지|들리지)\s*않\s*(?:게|도록)|\S*(?:지|진)\s*않(?:나요|을까요|을까|겠죠|겠지요|나|죠)/g
// 공손한 요청 어미("알 수 있을까요", "여쭤봐도 될까요")는 기능·가능 여부 질문이 아니다.
const POLITE_REQUEST_RE =
  /(?:여쭤|물어)\s*봐도\s*될까요|알려\s*주실\s*수\s*있(?:나요|을까요|으실까요)|알\s*수\s*있(?:을까요|나요|을지)|확인할\s*수\s*있(?:을까요|나요)|도와\s*주실\s*수\s*있(?:나요|을까요)/g

export function findSymptomTopic(question: string): SymptomTopic | null {
  const text = normalizeTriageText(question)
  if (!text) return null
  const symptomText = text.replace(NON_SYMPTOM_NEGATION_RE, " ")
  const capabilityForm =
    CAPABILITY_QUESTION_RE.test(text.replace(POLITE_REQUEST_RE, " ").trim()) && !EXPLICIT_SYMPTOM_RE.test(symptomText)

  for (const topic of SYMPTOM_TOPICS) {
    // 기능 문의 꼴("~되나요?")은 사용법 주제만 받는다("끊김 없는 수업 가능해요?"가 끊김 조치로 새지 않게).
    if (capabilityForm && !topic.howto) continue
    if (!topic.subject.test(text)) continue
    if (topic.exclude?.test(text)) continue
    if (topic.requireSymptom !== false && !(topic.symptom ?? SYMPTOM_RE).test(symptomText)) continue
    return topic
  }
  return null
}

// ─── 답변 조립 ────────────────────────────────────────────────────

function findDocByRef(ref: { category: DocCategory; slug: string }) {
  return listDocs().find((doc) => doc.category === ref.category && doc.slug === ref.slug)
}

function findSection(doc: DocArticle, heading: string) {
  return doc.sections.find((section) => section.heading === heading)
}

// 문서 본문의 마크다운 링크는 "'제목' 문서"로, 남은 URL·강조 기호는 지운다.
function toPlainStep(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\((?:\/docs\/[^)]+)\)/g, "'$1' 문서")
    .replace(/\[([^\]]+)]\((?:https?:\/\/|\/)[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*>\s*/gm, "")
    .replace(/\s*(?:자세한\s*)?(?:방법|순서|확인\s*방법|조치)은\s*(?:아래|위)\s*'[^']+'(?:에)?\s*있습니다\.?/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function bodyParagraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !paragraph.startsWith(">") && !paragraph.startsWith("- "))
    .map(toPlainStep)
}

function collectSteps(doc: DocArticle, stepSources: SymptomStepSource[]) {
  const lines: string[] = []
  for (const stepSource of stepSources) {
    const section = findSection(doc, stepSource.heading)
    if (!section) continue
    const steps = section.steps && section.steps.length > 0 ? section.steps : bodyParagraphs(section.body)
    const chosen = stepSource.pick
      ? stepSource.pick.map((index) => steps[index]).filter((step): step is string => Boolean(step))
      : steps.slice(0, stepSource.take ?? steps.length)
    for (const step of chosen) {
      const plain = toPlainStep(step)
      if (plain && !lines.includes(plain)) lines.push(plain)
    }
  }
  return lines
}

const CONTACT_HEADING_RE = /문의|그래도\s*(?:안\s*되면|반복되면)|알릴\s*때|접수할\s*때/
// 아이디·연락처·시리얼처럼 사람·기기를 특정하는 값은 채팅으로 받지 않는다(상담 채널에서 받는다).
const CONTACT_IDENTIFIER_RE = /아이디|계정|연락처|전화|휴대폰\s*번호|이메일|비밀번호|인증\s*코드|시리얼|이름\s*\(|학원\s*\(?고객사/

// 문서의 '문의할 때 알려 줄 정보' 섹션에서 항목 이름만 뽑는다(> 라벨: 형식 또는 steps).
function collectContactItems(doc: DocArticle, topic: SymptomTopic) {
  if (topic.contactHeading === "") return []
  const section = topic.contactHeading
    ? findSection(doc, topic.contactHeading)
    : [...doc.sections].reverse().find((candidate) => CONTACT_HEADING_RE.test(candidate.heading))
  if (!section) return []

  const quoteLabels = section.body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(">"))
    .map((line) => line.replace(/^>\s*/, "").split(/[:：]/)[0]?.trim() ?? "")
    .filter((label) => label.length > 0 && label.length <= 40)

  const stepLabels = (section.steps ?? []).map((step) =>
    toPlainStep(step)
      .replace(/\([^)]*\)/g, "")
      .replace(/\s*(?:을|를)\s*적습니다\.?$|\s*을\s*함께\s*보냅니다\.?$|\s*적습니다\.?$/, "")
      .replace(/[.。]$/, "")
      .trim()
  )

  return [...quoteLabels, ...stepLabels]
    .filter((label) => label.length > 0 && label.length <= 48 && !/^(?:위|아래)\s/.test(label))
    .filter((label) => !CONTACT_IDENTIFIER_RE.test(label))
    .slice(0, 4)
}

function compactExcerpt(value: string, maxLength = 220) {
  const compacted = value.replace(/\s+/g, " ").trim()
  if (compacted.length <= maxLength) return compacted
  return `${compacted.slice(0, maxLength).trim()}...`
}

function intentForCategory(category: ChatbotCategory): ChatbotIntent {
  switch (category) {
    case "admin":
      return "admin_operations"
    case "hardware":
      return "hardware_support"
    case "classroom":
      return "classroom_consulting"
    case "onboarding":
      return "onboarding"
    default:
      return "troubleshooting"
  }
}

export interface SymptomAnswerOptions {
  /** 짧게 묻는 사람(학생·급한 사용자)에게는 단계 3개와 짧은 맺음말만. */
  compact?: boolean
  /** 화난 사람: 대상 없는 오류 질문에 긴 메뉴 대신 한 가지만 묻는다. */
  upset?: boolean
  /** 원 질문(조건부 분기·변형 선택용). */
  question?: string
}

function pickBranches(topic: SymptomTopic, text: string) {
  return (topic.branches ?? [])
    .map((branch) => (typeof branch === "string" ? { text: branch } : branch))
    .filter((branch) => (!branch.when || branch.when.test(text)) && !(branch.unless && branch.unless.test(text)))
    .map((branch) => branch.text)
}

export function buildSymptomTopicAnswer(
  topic: SymptomTopic,
  options: SymptomAnswerOptions = {}
): SymptomTriageResult | null {
  const text = normalizeTriageText(options.question ?? "")
  const variant = topic.variants?.find((candidate) => candidate.when.test(text))
  const doc = findDocByRef(variant?.doc ?? topic.doc)
  if (!doc) return null
  const stepSources = variant?.steps ?? topic.steps
  const allSteps = collectSteps(doc, stepSources)
  if (allSteps.length === 0) return null
  const steps = options.compact ? allSteps.slice(0, 3) : allSteps

  const contactItems = options.compact ? [] : collectContactItems(doc, topic)
  const closing = topic.handoff
    ? ""
    : topic.howto && contactItems.length === 0
      ? "따라 하다 막히는 부분이 있으면 담당자 상담으로 이어 드릴게요."
      : contactItems.length > 0
      ? `그래도 안 되면 담당자 상담으로 이어 드릴게요. 상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인합니다: ${contactItems.join(", ")}.`
      : "그래도 안 되면 담당자 상담으로 이어 드릴게요."

  // 문서에서 중간 단계를 첫 단계로 가져오면 "그래도 끊기면"처럼 앞 단계를 가리키는 말을 뗀다.
  const stepBlock = steps
    .map((step, index) => (index === 0 ? step.replace(/^그래도\s+\S+(?:면|으면),?\s+/, "") : step))
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n")
  const branches = pickBranches(topic, text)
  const answer = [variant?.intro ?? topic.intro, stepBlock, ...(options.compact ? branches.slice(0, 2) : branches), closing]
    .filter(Boolean)
    .join("\n\n")
  const sourceHeading = variant?.heading ?? (variant ? variant.steps[0]?.heading : undefined) ?? topic.heading ?? topic.steps[0]?.heading ?? "요약"
  const sourceSection = findSection(doc, sourceHeading)

  return {
    kind: "topic",
    topicId: topic.id,
    howto: topic.howto === true,
    overridesKnownIntent: topic.overridesKnownIntent === true,
    englishSummary: topic.en,
    needsHandoff: topic.handoff === true,
    answer,
    answerMode: "direct_answer",
    confidence: 0.86,
    category: topic.category,
    intent: intentForCategory(topic.category),
    source: {
      title: doc.title,
      heading: sourceHeading,
      urlPath: getDocPath(doc),
      category: topic.category,
      excerpt: compactExcerpt(
        sourceSection
          ? [toPlainStep(sourceSection.body), ...(sourceSection.steps ?? []).map(toPlainStep)].join(" ")
          : doc.chatbotSummary ?? doc.description
      ),
      score: SYMPTOM_TRIAGE_SOURCE_SCORE,
    },
    suggestedQuestions: topic.suggestedQuestions.slice(0, 3),
  }
}

export function buildVagueErrorAnswer(options: { compact?: boolean } = {}): SymptomTriageResult {
  if (options.compact) {
    // 화가 나 짧게 말한 사람에게는 긴 메뉴 대신 한 가지만 묻는다.
    return {
      kind: "vague",
      topicId: "vague-error",
      overridesKnownIntent: false,
      englishSummary: "Tell me one thing that isn't working (login, joining class, sound/camera, recording), or tap 상담원 연결 to talk to a person.",
      needsHandoff: true,
      answer: [
        "어떤 게 안 되는지 하나만 알려 주시면 바로 그것부터 볼게요. 로그인, 수업 입장, 소리·카메라, 녹화 중 어디가 막혔나요?",
        "바로 사람과 얘기하고 싶으시면 아래 [실시간 상담 연결]을 눌러 주세요.",
      ].join("\n\n"),
      answerMode: "clarifying_question",
      confidence: 0.5,
      category: "troubleshooting",
      intent: "troubleshooting",
      source: null,
      suggestedQuestions: ["로그인이 안 돼요", "수업 중에 계속 튕겨요", "담당자 상담으로 이어주세요"],
    }
  }
  const menuLines = VAGUE_MENU_TOPIC_IDS.map((id) => SYMPTOM_TOPICS.find((topic) => topic.id === id)?.menuLine)
    .filter((line): line is string => Boolean(line))
    .map((line) => `- ${line}`)

  return {
    kind: "vague",
    topicId: "vague-error",
    overridesKnownIntent: false,
    englishSummary:
      "Tell me what you were doing and the exact error text (or code), and which device you use. Common fixes: log in with the installed app, fully restart and update the app, or switch to a phone hotspot if class keeps dropping.",
    needsHandoff: false,
    answer: [
      "어떤 오류인지 조금만 알려 주시면 바로 좁혀 드릴게요. 화면에 뜬 오류 문구(오류 코드가 있으면 숫자까지)와 무엇을 하다가 생겼는지, 쓰는 기기(PC·휴대폰·전자칠판)를 적어 주세요.",
      `자주 있는 경우는 먼저 이렇게 해 보세요.\n${menuLines.join("\n")}`,
      "위에 없거나 수업 중이라 급하면 담당자 상담으로 바로 이어 드릴게요.",
    ].join("\n\n"),
    answerMode: "clarifying_question",
    confidence: 0.5,
    category: "troubleshooting",
    intent: "troubleshooting",
    source: null,
    suggestedQuestions: ["로그인이 안 돼요", "수업 중에 계속 튕겨요", "녹화가 안 돼요"],
  }
}

/**
 * 증상 질문이면 결정형 답변을, 아니면 null 을 돌려준다.
 * 호출부(service.ts)는 Figma 가이드의 알려진 의도(known intent)가 맞으면 그쪽을 먼저 쓴다.
 */
// "1) … 2) …", "…그리고 …도", "두 가지 여쭙니다"처럼 두 번째 질문이 분명한 경우만 둘째 주제를 찾는다.
const MULTI_QUESTION_RE =
  /(?:^|\s)(?:\(?2\s*\)|2\.|②)|두\s*(?:가지|건|개)|둘\s*다|하나\s*더|하나는|그리고|또한|아울러|추가로|거기다|게다가|이번엔|또\s|같이\s*(?:문의|여쭤)|있고\s/
const CLAUSE_SPLIT_RE = /\s*(?:\(?\d\s*\)|[①②③]|그리고|또한|아울러|추가로|거기다|게다가|이번엔|하나는|있고|[?？.。!！,，])\s*/

function findSecondaryTopic(question: string, primary: SymptomTopic): SymptomTopic | null {
  if (!MULTI_QUESTION_RE.test(question)) return null
  const clauses = question.split(CLAUSE_SPLIT_RE).map((clause) => clause.trim()).filter((clause) => clause.length >= 6)
  for (const clause of clauses) {
    const candidate = findSymptomTopic(clause)
    if (!candidate || candidate.id === primary.id) continue
    const sameSection =
      candidate.doc.slug === primary.doc.slug && candidate.steps[0]?.heading === primary.steps[0]?.heading
    const sameFamily = candidate.id.split("-")[0] === primary.id.split("-")[0]
    const crossDevice = primary.category === "hardware" && candidate.category !== "hardware"
    if (!sameSection && !sameFamily && !crossDevice) return candidate
  }
  return null
}

export function resolveSymptomTriage(
  question: string,
  options: Omit<SymptomAnswerOptions, "question"> = {}
): SymptomTriageResult | null {
  const topic = findSymptomTopic(question)
  if (topic) {
    const result = buildSymptomTopicAnswer(topic, { ...options, question })
    if (!result) return null
    const secondary = findSecondaryTopic(question, topic)
    if (!secondary) return result
    // 둘째 질문은 그 주제의 첫 문단과 첫 단계(문서 근거)만 짧게 붙이고, 자세한 단계는 추천 질문으로 이어 준다.
    const secondaryFollowUp = secondary.suggestedQuestions[0]
    const secondaryAnswer = buildSymptomTopicAnswer(secondary, { compact: true, question })
    const secondaryFirstStep = secondaryAnswer?.answer.match(/^1\. (.+)$/m)?.[1]
    const secondaryText = [
      `함께 물어보신 내용도 짧게 답드리면, ${secondary.intro}`,
      secondaryFirstStep && !secondary.intro.includes(secondaryFirstStep.slice(0, 20)) ? `- ${secondaryFirstStep}` : null,
    ]
      .filter(Boolean)
      .join("\n")
    return {
      ...result,
      needsHandoff: result.needsHandoff || secondary.handoff === true,
      answer: `${result.answer}\n\n${secondaryText}`,
      suggestedQuestions: [...new Set([secondaryFollowUp, ...result.suggestedQuestions].filter(Boolean))].slice(0, 3),
    }
  }
  if (isVagueErrorQuestion(question)) return buildVagueErrorAnswer({ compact: options.upset })
  return null
}
