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
  /** 단계 뒤에 붙는 짧은 분기 안내(모호한 주제용). */
  branches?: string[]
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
  overridesKnownIntent: boolean
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
  /안\s*(?:돼|되|됨|됩|와|왔|오|옴|떠|뜨|뜸|뜬|보|켜|나|들|열|먹|올라|붙|잡|가져|갔|간|가요|넘어|움직|눌|생겨|만들|바뀌|맞|써|쓰|적|그려|그어|잡혀)|검은\s*화면|까만\s*화면|까맣|검게\s*(?:나|보)|못\s*(?:하|해|보|봐|들|받|찾|열|올|넣|쓰|써)|(?:지|진|되|돼|켜|보|나|열|들)\s*않|않(?:아요|아서|습니다|네요|음|는데|아)|멈춰|멈췄|멈춤|멈추|멈춥|먹통|튕|끊|꺼져|꺼짐|꺼지|꺼졌|오류|에러|error|버그|실패|반려|거절|막혀|막힘|막혔|막아|이상해|이상하|이상한|이상함|느려|느림|느리|깨져|깨짐|깨지|사라졌|사라져|사라짐|없어졌|없어져|없다고|없대|없어요|없습니다|없네|없음|안돼|안되|안됨|안나|안들|안보|안떠|안뜨|안켜|안와|문제\s*(?:가|있|생|발생)/

// 대상 없는 오류·불만 표현.
const GENERIC_ERROR_RE = /오류|에러|error|버그|bug|문제|이상|고장|먹통|작동|동작|안\s*(?:돼|되|됨)|안돼|안되|안됨|실행\s*(?:이|가)?\s*안/

// "끊김 없는 수업 가능해요?", "무료 체험판 있나요?"처럼 증상이 아니라 기능·가능 여부를 묻는 질문.
const CAPABILITY_QUESTION_RE =
  /(?:없는|없이).{0,12}(?:가능|되나|돼나|될까|할\s*수|있나|있을까)|가능(?:한가요|해요|할까요|한지|하나요|한가)|(?:되나요|돼나요|될까요|있나요|있을까요|있어요|지원(?:하나요|되나요|돼요|되나))\s*$/
// 기능 질문이라도 이런 표현이 있으면 실제 증상으로 본다.
const EXPLICIT_SYMPTOM_RE =
  /안\s*(?:돼|되|됨|됩|와|떠|뜨|보|켜|나|들|열|써)|안돼|안되|안됨|못\s*\S|오류|에러|실패|멈춰|멈췄|멈춤|튕겨|튕기|튕김|끊겨|끊겼|끊기고|끊어져|먹통|꺼져|꺼짐|반려/

export function normalizeTriageText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 증상 주제 목록. 위에서부터 먼저 맞는 주제를 쓴다(좁은 주제 → 넓은 주제 순).
export const SYMPTOM_TOPICS: SymptomTopic[] = [
  // ─── 기관(계정) 인증 ────────────────────────────────────────────
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
    steps: [{ heading: "인증이 반려되거나 늦어지는 경우", take: 4 }],
    intro:
      "기관 등록(계정 인증)이 끝나지 않았다면 아래부터 확인해 주세요. 인증은 메인 관리자 계정으로 [계정 정보] > [인증 자료]에서 하고, 처리는 보통 며칠 걸립니다.",
    branches: [
      "교사나 학생을 기관에 등록하는 게 안 된다면, 그 사람이 먼저 클래스인에 가입했는지와 국가번호(+82)를 확인해 주세요.",
      "첫 수업이 코앞이라면 자료를 올린 뒤 상담 채널이나 담당 매니저에게 빠른 처리를 요청하세요.",
    ],
    contactHeading: "",
    suggestedQuestions: ["교사 추가가 안 돼요", "학생 추가가 안 돼요", "유료 계정 전환은 어떻게 하나요?"],
    menuLine: "기관 등록(계정 인증)이 안 될 때: 메인 관리자 계정으로 [인증 자료]의 빠진 칸과 서류 형식(JPG·PNG, 5MB 이하)을 확인합니다.",
  },

  // ─── 로그인·가입 ─────────────────────────────────────────────
  {
    id: "login-code",
    subject: /인증\s*(?:번호|코드|문자)|otp/,
    category: "troubleshooting",
    doc: { category: "start", slug: "login-troubleshooting" },
    steps: [{ heading: "인증코드가 오지 않을 때", take: 5 }],
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
    exclude: /학생\s*추가|교사\s*추가|등록하려/,
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
    subject: /로그인\s*버튼|로그인\s*(?:이|가)?\s*(?:안\s*눌|눌러도)|버튼\s*(?:이|가)?\s*회색/,
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
    exclude: /코스\s*(?:에\s*)?가입|반\s*가입|클래스\s*가입|가입\s*허용|qr|큐알|초대/,
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
    subject: /녹화.{0,16}(?:끊|멈|나뉘|나눠|쪼개|여러\s*개|중간|중단|짧|초반)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "teacher", slug: "recording-troubleshooting" },
    steps: [{ heading: "녹화가 중간에 끊기거나 여러 개로 나뉠 때", take: 5 }],
    intro: "녹화는 강사 계정에 붙어 진행돼서, 아래 경우에 멈추거나 여러 개로 나뉩니다.",
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
    subject: /(?:예전|이전|지난|옛날|오래된)\s*녹화|녹화(?:본|\s*영상|\s*파일)?.{0,10}(?:사라|지워|삭제)/,
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
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "내려받기가 안 될 때", take: 4 }],
    intro: "녹화본 내려받기가 안 되면 아래 방법으로 다시 받아 보세요.",
    suggestedQuestions: ["녹화본이 안 보여요", "예전 녹화본이 사라졌어요", "녹화가 안 돼요"],
  },
  {
    id: "recording-file-missing",
    subject: /녹화본|녹화\s*(?:파일|영상|데이터|본)|녹화된\s*(?:영상|수업)/,
    symptom: /안\s*(?:보|떠|뜨|나)|안보|안떠|안뜨|없|못\s*찾|사라|안\s*올라|안\s*생/,
    category: "troubleshooting",
    doc: { category: "admin", slug: "recording-file-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
    intro: "녹화본이 안 보이면 그 수업이 실제로 녹화됐는지부터 확인해 주세요.",
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
    id: "replay-period",
    subject: /(?:다시\s*보기|다시보기|리플레이|플레이백|복습\s*영상).{0,16}(?:기간|횟수|만료|지났|끝났)/,
    requireSymptom: false,
    category: "troubleshooting",
    doc: { category: "admin", slug: "replay-troubleshooting" },
    steps: [{ heading: "코스 설정에서 기간이나 횟수가 막혀 있을 때", take: 5 }],
    intro: "다시보기는 코스 설정의 유효 기간과 시청 횟수 제한 안에서만 열립니다.",
    suggestedQuestions: ["학생이 다시보기를 못 봐요", "녹화본이 안 보여요", "예전 녹화본이 사라졌어요"],
  },
  {
    id: "replay-missing",
    subject: /다시\s*보기|다시보기|리플레이|플레이백|복습\s*영상|지난\s*수업\s*영상/,
    exclude: /웹\s*라이브|생방송/,
    category: "troubleshooting",
    doc: { category: "admin", slug: "replay-troubleshooting" },
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
    intro: "학생에게 다시보기가 안 보이면 녹화 여부, 학생이 코스에 들어온 시점, 로그인한 아이디를 차례로 확인해 주세요.",
    branches: [
      "수업이 끝난 뒤 코스에 들어온 학생이라면, 관리자가 일반 설정의 [수업 다시보기]에서 새로 가입한 학생의 이전 수업 시청을 허용해야 합니다.",
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
    suggestedQuestions: ["기관 인증이 안 돼요", "웹 라이브 채팅이 학생에게 안 보여요", "녹화가 안 돼요"],
  },

  // ─── 전자칠판(화면·전원은 기존 하드웨어 점검 경로가 맡는다) ─────────────
  {
    id: "board-mirroring",
    subject: /미러링|캐스트|무선\s*(?:연결|화면)|화면\s*미러/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "무선 미러링으로 기기 화면 띄우기", take: 4 }],
    intro: "미러링이 안 되면 보드와 기기가 같은 Wi-Fi에 연결돼 있는지부터 확인해 주세요.",
    suggestedQuestions: ["HDMI 연결했는데 화면이 안 나와요", "전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-hdmi",
    subject: /hdmi|외부\s*입력|입력\s*소스|노트북\s*연결/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-basic-operation" },
    steps: [{ heading: "HDMI 입력으로 전환하기", take: 5 }],
    intro: "외부 기기 화면이 안 나오면 HDMI 케이블과 입력 소스를 차례로 확인해 주세요.",
    suggestedQuestions: ["미러링이 안 돼요", "전자칠판 터치가 안 돼요", "전자칠판 화면이 안 켜져요"],
  },
  {
    id: "board-touch",
    subject: /터치|(?:펜|필기|판서|글씨)\s*(?:가|이)?\s*(?:안\s*(?:써|쓰|돼|되|나|그|적|먹)|안써|안돼|안되|안먹)|(?:글씨|글자)\s*(?:가|이)?\s*안\s*(?:써|쓰|적|그려)/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|튀|인식|먹|반응|밀려|어긋`),
    exclude: /스펙|사양|몇\s*점/,
    category: "hardware",
    doc: { category: "hardware", slug: "board-writing-touch" },
    steps: [{ heading: "터치가 튀거나 안 먹힐 때", take: 5 }],
    intro: "터치가 튀거나 안 먹으면 화면 테두리(베젤)부터 확인해 주세요. 적외선 터치라 테두리가 가려지면 인식이 흔들립니다.",
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
    exclude: /녹화|학생.{0,10}(?:목소리|소리|마이크)|hdmi/,
    category: "troubleshooting",
    doc: { category: "start", slug: "camera-mic-troubleshooting" },
    steps: [{ heading: "선생님 목소리나 수업 소리가 안 들릴 때", take: 4 }],
    intro: "소리가 안 들리면 내 기기에서만 그런지 먼저 가려 주세요. 다른 사람은 잘 들린다면 내 기기의 소리 출력 문제일 가능성이 큽니다.",
    suggestedQuestions: ["마이크가 안 돼요", "학생 목소리가 안 들려요", "소리가 울리고 하울링이 나요"],
    menuLine: "카메라·마이크·소리가 안 될 때: 기기 설정에서 클래스인의 카메라·마이크 권한을 허용했는지, 교실에서 쓸 장치를 골랐는지 봅니다.",
  },
  {
    id: "mic-fail",
    subject: /마이크|내\s*목소리|제\s*목소리|목소리\s*(?:가|이)?\s*안\s*(?:가|전달|들)/,
    exclude: /녹화/,
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
    intro: "카메라가 안 켜지면 권한과 다른 화상 프로그램부터 확인하고, 교실에서 카메라를 다시 골라 주세요.",
    suggestedQuestions: ["마이크가 안 돼요", "소리가 안 나요", "전자칠판 카메라가 안 켜져요"],
  },

  // ─── 수업 입장·끊김 ──────────────────────────────────────────────
  {
    id: "class-enter-fail",
    subject:
      /(?:수업|교실|강의|라이브).{0,16}(?:입장|참여|참가|접속|들어가|들어오|못\s*들어)|교실\s*입장|입장\s*버튼|(?:수업|교실|강의)\s*(?:이|가)?\s*(?:안\s*(?:보|떠|뜨|나)|안보|안떠|없어|없다|사라)/,
    exclude: /다시\s*보기|다시보기|녹화|웹\s*라이브|생방송/,
    symptom: new RegExp(`${SYMPTOM_RE.source}|없|안\\s*눌|회색`),
    category: "troubleshooting",
    doc: { category: "student", slug: "class-join-replay" },
    steps: [{ heading: "수업이 안 보이거나 입장이 안 될 때", take: 4 }],
    intro: "수업에 들어가지지 않거나 수업이 안 보이면 입장 시간과 로그인한 아이디부터 확인해 주세요.",
    contactHeading: "학원이나 상담 채널에 알릴 때",
    suggestedQuestions: ["로그인은 되는데 수업이 안 보여요", "코스 가입이 안 돼요", "수업 중에 계속 튕겨요"],
  },
  {
    id: "app-crash",
    subject:
      /(?:앱|어플|프로그램|클래스인|classin|pc\s*버전|pc\s*프로그램)\s*(?:이|가|은|는)?\s*(?:계속|자꾸|갑자기|자주|또)?\s*(?:튕|꺼|종료|강제\s*종료|닫혀|닫힘|crash|크래시)/,
    requireSymptom: false,
    exclude: /수업\s*중|교실|수업에서|녹화/,
    category: "troubleshooting",
    doc: { category: "start", slug: "app-update-cache-reinstall" },
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
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
    subject: /튕|끊기|끊겨|끊김|끊어|끊겼|끊긴|끊어져|나가져|나가집|(?:계속|자꾸|혼자|갑자기)\s*나가|나가요|나갑니다|강제\s*(?:로\s*)?(?:퇴장|종료)|연결\s*(?:이|가)?\s*(?:불안|끊|안)|접속\s*(?:이|가)?\s*(?:불안|끊)/,
    requireSymptom: false,
    exclude: /녹화|미러링|무선\s*키보드|마우스/,
    category: "troubleshooting",
    doc: { category: "start", slug: "class-connection-troubleshooting" },
    steps: [{ heading: "자꾸 끊기거나 교실에서 튕길 때", take: 5 }],
    intro: "수업이 끊기거나 튕기면 네트워크와 로그인 기기부터 확인해 주세요. 수업 중이라 급하다면 휴대폰 핫스팟이나 모바일 데이터로 바꿔 다시 들어가세요.",
    suggestedQuestions: ["수업 화면이 느리고 버벅여요", "학생 목소리가 안 들려요", "업데이트가 안 돼요"],
    menuLine: "수업 중 끊기거나 튕길 때: 공유기를 껐다 켜거나 휴대폰 핫스팟으로 바꿔 다시 들어가고, 한 계정은 기기 1대로만 들어갑니다.",
  },

  // ─── 코스 참여·구성원 ────────────────────────────────────────────
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
    branches: ["아직 클래스인에 가입하지 않은 학생이 섞여 있다면, 그 학생은 한 명씩 추가하거나 텍스트로 가져올 때 [학생 대리 등록]을 체크해 주세요."],
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
    branches: ["[학생 대리 등록]이 안 보이면 기관 인증을 마쳤는지 먼저 확인해 주세요."],
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
    id: "homework-photo",
    subject: /(?:숙제|과제).{0,12}(?:사진|파일|첨부|이미지|업로드|올라|올리|붙)|(?:사진|파일|첨부|이미지).{0,12}(?:숙제|과제)|사진\s*(?:이|가)?\s*(?:안\s*(?:붙|올라)|올라가지|붙지)/,
    category: "troubleshooting",
    doc: { category: "student", slug: "homework-submit-troubleshooting" },
    steps: [{ heading: "사진이 안 붙거나 올라가지 않을 때", take: 4 }],
    intro: "숙제 사진이 안 붙거나 올라가지 않으면 앱의 사진·카메라 접근 권한부터 확인해 주세요.",
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
    suggestedQuestions: ["숙제 사진이 안 올라가요", "숙제 다시 냈더니 점수가 사라졌어요", "앱이 자꾸 멈춰요"],
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
    steps: [{ heading: "먼저 확인할 것", take: 4 }],
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
    branches: ["모바일은 비밀번호 칸 아래 [약관 동의]에 체크해야 로그인됩니다."],
    suggestedQuestions: ["인증번호가 안 와요", "비밀번호를 잊어버렸어요", "계정이 없다고 떠요"],
    menuLine: "로그인이 안 될 때: 홈페이지가 아니라 설치한 앱에서 로그인하고, 휴대폰 번호는 +82를 고른 뒤 10부터 입력합니다.",
  },
]

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
  /^(?:안녕하세요|안녕|안녕하십니까|선생님|쌤|상담사님|담당자님|매니저님|관리자님|저기요|저|제가|저희|혹시|그|여기|네|아|음|클래스인|클래스|classin|class|in|앱|어플|어플리케이션|프로그램|이거|그거|저거|이게|그게|저게|여기|거기|뭔가|무언가|뭐|뭐가|왜|지금|계속|자꾸|자꾸만|갑자기|또|또다시|다시|자주|좀|너무|진짜|정말|완전|오늘|방금|아까|요즘|에러|오류|error|버그|bug|문제|이상|고장|작동|동작|먹통|안|못|잘|코드|메시지|메세지|창|알림|팝업|화면에|해결|도와|도와주세요|도와줘|부탁|부탁해요|부탁드려요|어떻게|해야|하나요|할까요|되나요|돼요|되요|돼|됨|됩니다|되네요|돼서|되서|안돼|안돼요|안됨|안되요|안되네요|안되는데|떠요|떠|뜸|뜨네요|떴어요|나요|나와요|나네요|납니다|났어요|났습니다|생겨요|생겼어요|생깁니다|발생|발생해요|발생했어요|있어요|있습니다|있음|있네요|있는데|해요|하네요|합니다|했어요|요|ㅠ|ㅠㅠ|ㅜ|ㅜㅜ|ㅠㅠㅠ|헬프|help|급해요|급합니다|확인|부탁드립니다|봐주세요|들어가지지|들어가지지가|들어가져요|들어가요|들어가|안들어가져요|않아요|않습니다|않네요|않음|않고)$/

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

export function findSymptomTopic(question: string): SymptomTopic | null {
  const text = normalizeTriageText(question)
  if (!text) return null
  if (CAPABILITY_QUESTION_RE.test(text) && !EXPLICIT_SYMPTOM_RE.test(text)) return null

  for (const topic of SYMPTOM_TOPICS) {
    if (!topic.subject.test(text)) continue
    if (topic.exclude?.test(text)) continue
    if (topic.requireSymptom !== false && !(topic.symptom ?? SYMPTOM_RE).test(text)) continue
    return topic
  }
  return null
}

// ─── 답변 조립 ────────────────────────────────────────────────────

function findDoc(topic: SymptomTopic) {
  return listDocs().find(
    (doc) => doc.category === topic.doc.category && doc.slug === topic.doc.slug
  )
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

function collectSteps(doc: DocArticle, topic: SymptomTopic) {
  const lines: string[] = []
  for (const stepSource of topic.steps) {
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

export function buildSymptomTopicAnswer(topic: SymptomTopic): SymptomTriageResult | null {
  const doc = findDoc(topic)
  if (!doc) return null
  const steps = collectSteps(doc, topic)
  if (steps.length === 0) return null

  const contactItems = collectContactItems(doc, topic)
  const closing =
    contactItems.length > 0
      ? `그래도 안 되면 담당자 상담으로 이어 드릴게요. 상담할 때 이 정보를 함께 알려 주시면 더 빨리 확인합니다: ${contactItems.join(", ")}.`
      : "그래도 안 되면 담당자 상담으로 이어 드릴게요."

  const stepBlock = steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
  const answer = [topic.intro, stepBlock, ...(topic.branches ?? []), closing].filter(Boolean).join("\n\n")
  const sourceHeading = topic.heading ?? topic.steps[0]?.heading ?? "요약"
  const sourceSection = findSection(doc, sourceHeading)

  return {
    kind: "topic",
    topicId: topic.id,
    overridesKnownIntent: topic.overridesKnownIntent === true,
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

export function buildVagueErrorAnswer(): SymptomTriageResult {
  const menuLines = VAGUE_MENU_TOPIC_IDS.map((id) => SYMPTOM_TOPICS.find((topic) => topic.id === id)?.menuLine)
    .filter((line): line is string => Boolean(line))
    .map((line) => `- ${line}`)

  return {
    kind: "vague",
    topicId: "vague-error",
    overridesKnownIntent: false,
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
export function resolveSymptomTriage(question: string): SymptomTriageResult | null {
  const topic = findSymptomTopic(question)
  if (topic) return buildSymptomTopicAnswer(topic)
  if (isVagueErrorQuestion(question)) return buildVagueErrorAnswer()
  return null
}
