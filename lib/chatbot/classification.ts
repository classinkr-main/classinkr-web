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
  | "self_knowledge"
  | "docs_lookup"
  | "emotional_consulting"
  | "event_inquiry"
  | "event_apply_assist"
  | "tutor_pricing_recommend"
  | "feature_limit_consulting"

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
  if (/결제|요금|가격|견적|영수증|세금|세금계산서|입금|청구|구독|환불|정산|수납|납부|원비|수강료|수업료|학원비|카드\s*결제|pg/.test(text)) {
    return "billing"
  }
  if (/소프트웨어만|프로그램만|앱만|하드웨어\s*없이|전자칠판\s*없이|보드\s*없이|계정당|계정\s*당|플랜|구독형|충전형|충전제|subscription|consumption|사용량\s*기준/.test(text)) {
    return "billing"
  }
  if (/무료\s*체험|체험판|무료\s*사용|trial|파일럿|pilot|데모.{0,12}(무료|체험)|먼저\s*써/.test(text)) {
    return "onboarding"
  }
  if (/관리자|어드민|관리자\s*콘솔|대시보드|학교\s*관리자|네트워크|특이사항|스토리지|저장\s*(공간|용량)|녹화\s*(저장|용량)|기관\s*설정|기관\s*관리|관리자\s*기능|계정\s*정보|결제\s*개요|주문\s*세부정보|영수증\s*관리|api\s*도킹|자체\s*관리\s*시스템|브랜딩|웹\s*라이브|라이브\s*&\s*플레이백|통계\s*다운로드|콘텐츠\s*소유권|저작권|개인정보.*(처리|보관|관리|방침|보호|유출|보안|통제)|데이터\s*(처리|보관|지역|보안|유출)|서버(?:는|가|의)?\s*(위치|지역|어디)|메인\s*서버(?:는|가|의)?\s*(위치|지역|어디)?/.test(text)) {
    return "admin"
  }
  if (/학부모.{0,18}(알림|문자|메시지|푸시|리포트|보고서|상담|피드백)|(?:알림|문자|메시지|푸시|리포트|보고서|상담|피드백).{0,18}학부모/.test(text)) {
    return "admin"
  }
  if (/사이트.{0,20}(입장|버튼|적용|연동)|입장\s*버튼.{0,20}(classin|클래스인|수업)|자사\s*사이트|홈페이지.{0,20}(수업|입장|연동)/.test(text)) {
    return "admin"
  }
  if (/구글\s*클래스룸|google\s*classroom|수업반\s*생성|반\s*(생성|개설).{0,12}(100|백|대형)|100\s*개.{0,8}반|자료\s*업로드|과제\s*점수|과제\s*체크/.test(text)) {
    return "classroom"
  }
  if (/회원\s*가입|가입.*(전화번호|이메일|메일|휴대폰|핸드폰|인증)|학생.*(초대|추가|등록)|초대.*학생/.test(text)) {
    return "onboarding"
  }
  if (/새\s*코스|코스.*(만드|생성|개설)|ai\s*(자동\s*)?(채점|출제|평가)|자동\s*채점/.test(text)) {
    return "classroom"
  }
  if (/수업\s*중.*(화면\s*공유|끊겨|끊김)|수업.*(나가|나감|튕김|튕겨|끊겨|끊김|입장\s*안|접속\s*안)|화면\s*공유.*(끊겨|끊김|오류|에러)|카메라.{0,18}(안\s*켜|꺼|꺼져|권한|한\s*명|한명|1명|문제|오류)|마이크.{0,18}(안\s*됨|안\s*돼|권한|문제|오류|에러)|소리.{0,18}(안\s*들|끊겨|끊김|문제|오류)|끊겨|끊겨요/.test(text)) {
    return "troubleshooting"
  }
  if (/온스테이지|스테이지|하이브리드|개인\s*칠판|현장\s*(녹화|카메라)|수업\s*녹화|녹화\s*수업|트래킹\s*뷰|byod|omr|오엠알|학습\s*자료|일일\s*과제|ai\s*(출제|채점)|문제\s*은행|플레이바|시청\s*(가능\s*)?횟수|저작권\s*보호|scorm|따라읽기|받아쓰기|외워말하기|edb|이디비|edx|칠판\s*파일/.test(text)) {
    return "classroom"
  }
  if (/학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|기존\s*전자칠판|일반\s*전자칠판|넥소|nexo|뷰소닉|viewsonic|삼성\s*플립|프로메테안|맥스허브|maxhub|시중\s*(전자\s*)?칠판|타사\s*(전자\s*)?칠판|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|classin.*(차이|비교|다른|차별|장점)|클래스인.*(차이|비교|다른|차별|장점)/.test(text)) {
    return "onboarding"
  }
  if (/하드웨어|전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|보드|칠판|모델|라인업|사이즈|인치|카메라|마이크|스피커|\bops\b|스탠드|벽걸이|설치|납품|배송|펜\s*팁|전용\s*펜|소모품|\bas\b|a\/s|수리|고장|파손|s\d{2,3}\s*pro|s\s*(?:65|75|86|98|110)\b/.test(text)) {
    return "hardware"
  }
  if (/접속|로그인|계정|비밀번호|소리|오류|에러|안됨|안 돼|안 되|권한|장애|끊김|로딩/.test(text)) {
    return "troubleshooting"
  }
  // API/연동 의도가 섞인 정체성 질문(예: "API 연동으로 클래스인이 뭐 하는지")은 정체성/온보딩보다
  // API·연동(어드민) 경로를 우선한다. service.ts isApiIntegrationQuestion 및 큐레이션 가드와 일치시킨다.
  if (/api|sdk|연동|데이터\s*구독|가상계정|수업\s*중계|코스\s*정보|수업\s*정보|crm|lms/.test(text)) {
    return "admin"
  }
  if (/(classin|클래스인).*(뭐야|뭐예요|뭐에요|무엇|뭔가요|뭔데|뭐임|뭐\s*하는|어떤\s*(서비스|제품|솔루션|도구|플랫폼)|소개|설명)|(뭐야|뭐예요|뭐에요|무엇|뭔가요|뭔데|뭐임|뭐\s*하는|어떤\s*(서비스|제품|솔루션|도구|플랫폼)|소개|설명).*(classin|클래스인)/.test(text)) {
    return "onboarding"
  }
  if (/데모|시연|컨설팅|연락|미팅|제안|상담사|담당자|도입\s*(상담|문의|검토)|구매\s*상담|상담\s*신청/.test(text)) {
    return "consultation"
  }
  if (/도입|시작|초기|세팅|설정|초대|온보딩|첫 수업|준비|교육|전환|사용\s*기간|계약\s*기간|언제까지\s*(사용|쓸)|학원\s*시스템|시스템\s*os|수업\s*os|운영\s*os|zoom|줌|화상회의|뭐가\s*(달라|다른)|무엇이\s*다르|어떻게\s*다른|다른\s*(점|가요|건가요|거|것|부분|서비스)|차이|비교|차별|차별점|장점|왜\s*(써|쓰|필요|도입)|비싸|가격\s*부담/.test(text)) {
    return "onboarding"
  }
  if (/수업|edb|이\s*디\s*비|칠판\s*파일|출결|출석|보강|교사|학생|학부모|집중|운영|관리|리포트|숙제|과제|복습|녹화|lms|온스테이지|스테이지|하이브리드|개인\s*칠판|현장\s*녹화|수업\s*녹화|다시보기|트래킹\s*뷰|byod/.test(text)) {
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

export function detectChatbotIntent(category: ChatbotCategory | string, question: string = ""): ChatbotIntent {
  const text = question.toLowerCase()
  if (category === "event" && /신청이\s*안|모르겠|헤매|도와줘|대신\s*신청|대리\s*신청|신청해\s*주|직접\s*해\s*주|신청해줘|접수해줘|대신\s*접수/.test(text)) {
    return "event_apply_assist"
  }
  if (
    /(?:결제|수납|정산|출석|출결|등원|성적표|리포트).*(?:안\s*돼|안됨|불가능|없나요|지원이\s*안|지원하지|한계|단점|자체|기능|방법)/i.test(text) ||
    /지문\s*인식|출석\s*체크\s*기|오프라인\s*출석|등원\s*카드/i.test(text)
  ) {
    return "feature_limit_consulting"
  }
  if (
    /개인\s*강사|과외|공부방|소규모\s*수업|1:1|프리랜서|개인\s*과외/i.test(text) &&
    /요금|가격|구독|플랜|비용|비싸|얼마|추천/i.test(text)
  ) {
    return "tutor_pricing_recommend"
  }
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
    case "concern":
      return "emotional_consulting"
    case "event":
      return "event_inquiry"
    default:
      return "docs_lookup"
  }
}

export function classifyChatbotQuestion(question: string, sourceCategories: string[] = []) {
  const category = detectChatbotCategory(question, sourceCategories)

  return {
    category,
    intent: detectChatbotIntent(category, question),
    handoffIntent: detectChatbotHandoffIntent(question, category),
  }
}
