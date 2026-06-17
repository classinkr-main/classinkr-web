export type ChatbotCategory =
  | "billing"
  | "hardware"
  | "troubleshooting"
  | "onboarding"
  | "admin"
  | "classroom"
  | "consultation"
  | "general"

export type ChatbotIntent =
  | "billing_support"
  | "hardware_support"
  | "troubleshooting"
  | "onboarding"
  | "admin_operations"
  | "classroom_consulting"
  | "sales_consulting"
  | "docs_lookup"

export type HandoffIntent = "demo" | "support"

function normalizedText(question: string, sourceCategories: string[] = []) {
  return `${question} ${sourceCategories.join(" ")}`.toLowerCase()
}

export function detectChatbotCategory(
  question: string,
  sourceCategories: string[] = []
): ChatbotCategory {
  const text = normalizedText(question, sourceCategories)

  if (/^(안녕|안녕하세요|하이|hello|hi)[.!?\s]*$/i.test(question.trim())) {
    return "general"
  }
  if (/결제|요금|가격|견적|영수증|세금|세금계산서|입금|청구|구독|환불|정산/.test(text)) {
    return "billing"
  }
  if (/관리자|어드민|관리자\s*콘솔|대시보드|학교\s*관리자|네트워크|특이사항|스토리지|저장\s*(공간|용량)|녹화\s*(저장|용량)|기관\s*설정|기관\s*관리|코스\s*관리|수업\s*관리|교사\s*관리|학생\s*관리|학습\s*관리|관리자\s*기능|계정\s*정보|결제\s*개요|주문\s*세부정보|영수증\s*관리|api\s*도킹|자체\s*관리\s*시스템|브랜딩|웹\s*라이브|라이브\s*&\s*플레이백|통계\s*다운로드/.test(text)) {
    return "admin"
  }
  if (/학생.*(초대|추가|등록)|초대.*학생/.test(text)) {
    return "onboarding"
  }
  if (/새\s*코스|코스.*(만드|생성|개설)|ai\s*(자동\s*)?(채점|출제|평가)|자동\s*채점/.test(text)) {
    return "classroom"
  }
  if (/수업\s*중.*(화면\s*공유|끊겨|끊김)|화면\s*공유.*(끊겨|끊김|오류|에러)|끊겨|끊겨요/.test(text)) {
    return "troubleshooting"
  }
  if (/학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|기존\s*전자칠판|일반\s*전자칠판|classin.*(차이|비교)|클래스인.*(차이|비교)/.test(text)) {
    return "onboarding"
  }
  if (/온스테이지|스테이지|하이브리드|개인\s*칠판|현장\s*(녹화|카메라)|수업\s*녹화|녹화\s*수업|트래킹\s*뷰|byod|omr|오엠알|학습\s*자료|일일\s*과제|ai\s*(출제|채점)|문제\s*은행|플레이바|시청\s*(가능\s*)?횟수|저작권\s*보호|scorm|따라읽기|받아쓰기|외워말하기/.test(text)) {
    return "classroom"
  }
  if (/하드웨어|전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|카메라|마이크|스피커|\bops\b|스탠드|벽걸이|설치|납품|배송|\bas\b|a\/s|수리|고장|파손|s\d{2,3}\s*pro/.test(text)) {
    return "hardware"
  }
  if (/접속|로그인|계정|비밀번호|소리|오류|에러|안됨|안 돼|안 되|권한|장애|끊김|로딩/.test(text)) {
    return "troubleshooting"
  }
  if (/데모|시연|컨설팅|연락|미팅|제안|상담사|담당자|도입\s*(상담|문의|검토)|구매\s*상담|상담\s*신청/.test(text)) {
    return "consultation"
  }
  if (/도입|시작|초기|세팅|설정|초대|온보딩|첫 수업|준비|교육|전환|학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|뭐가\s*달라|차이|비교|비싸|가격\s*부담/.test(text)) {
    return "onboarding"
  }
  if (/api|sdk|연동|데이터\s*구독|가상계정|수업\s*중계|코스\s*정보|수업\s*정보/.test(text)) {
    return "admin"
  }
  if (/수업|edb|칠판\s*파일|출결|출석|보강|교사|학생|학부모|집중|운영|관리|리포트|숙제|과제|복습|녹화|lms|온스테이지|스테이지|하이브리드|개인\s*칠판|현장\s*녹화|수업\s*녹화|다시보기|트래킹\s*뷰|byod/.test(text)) {
    return "classroom"
  }
  if (/상담|문의|데모|시연|컨설팅|연락|미팅|제안|상담사|담당자/.test(text)) {
    return "consultation"
  }

  if (
    sourceCategories.includes("software") ||
    sourceCategories.includes("teacher") ||
    sourceCategories.includes("student") ||
    sourceCategories.includes("classroom")
  ) {
    return "classroom"
  }
  if (sourceCategories.includes("admin")) return "admin"
  if (sourceCategories.includes("hardware") || sourceCategories.includes("board")) return "hardware"
  if (sourceCategories.includes("onboarding") || sourceCategories.includes("start")) return "onboarding"

  return "general"
}

export function detectChatbotHandoffIntent(
  question: string,
  category: ChatbotCategory | string
): HandoffIntent {
  const text = question.toLowerCase()

  if (
    /컴플레인|불만|환불|취소|짜증|최악|별로|안됨|안 됨|안 되|장애|오류|에러|버그|끊김|느려|느리|기술\s*지원|이슈|고장|파손|계정|로그인|접속|소리|마이크|\bas\b|a\/s|수리/.test(
      text
    )
  ) {
    return "support"
  }

  if (
    /데모|시연|도입\s*문의|도입\s*상담|도입\s*검토|견적|요금|비용|플랜|가격\s*문의|영업|구매\s*상담|체험|사용해\s*보고|연락|미팅|제안/.test(
      text
    )
  ) {
    return "demo"
  }

  if (category === "billing" || category === "hardware" || category === "troubleshooting") {
    return "support"
  }

  return "demo"
}

export function detectChatbotIntent(category: ChatbotCategory | string): ChatbotIntent {
  switch (category) {
    case "billing":
      return "billing_support"
    case "hardware":
      return "hardware_support"
    case "troubleshooting":
      return "troubleshooting"
    case "onboarding":
      return "onboarding"
    case "admin":
      return "admin_operations"
    case "classroom":
      return "classroom_consulting"
    case "consultation":
      return "sales_consulting"
    default:
      return "docs_lookup"
  }
}

export function classifyChatbotQuestion(question: string, sourceCategories: string[] = []) {
  const category = detectChatbotCategory(question, sourceCategories)

  return {
    category,
    intent: detectChatbotIntent(category),
    handoffIntent: detectChatbotHandoffIntent(question, category),
  }
}
