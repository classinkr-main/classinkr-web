// 내부 CS 에스컬레이션 라우팅 및 3-Way 스마트 소통 템플릿 엔진.
// 정본: docs/active/cs-error-cases-index-2026-10-02.md (부록 B 오류코드, 부록 C HQ 담당자 15개 도메인)
// 정본: docs/active/cs-error-cases-workflow-rules-2026-10-02.md (2장 지킬 규칙, 3장 HQ 보고 템플릿 v2)

export interface HqContactInfo {
  domain: string
  domainLabel: string
  primaryContact: string
  secondaryContact?: string
  firstLineContact: string
  remoteTool?: string
  wecomMention: string
  recommendedTag: string
  guidanceTip: string
}

export interface EscalationContext {
  domain: string
  contact: HqContactInfo
  institution: string | null
  accountId: string | null
  lessonId: string | null
  lessonName: string | null
  errorCode: string | null
  deviceModel: string | null
  appVersion: string | null
  kstTime: string | null
  beijingTime: string | null
  issueType: "bug" | "requirement" | "suspected_bug"
  issueTypeTag: "【缺陷】" | "【需求】" | "【疑似缺陷】"
  symptomSummary: string
  rawQuestion: string
  assigneeName: string | null
}

export const HQ_DOMAINS: Record<string, HqContactInfo> = {
  camera: {
    domain: "camera",
    domainLabel: "카메라·화질·T1",
    primaryContact: "张冰 (Zhang Bing, 硬件服务)",
    secondaryContact: "朱晨阳 (Zhu Chenyang, 원격+HW)",
    firstLineContact: "小助手 (兰兰, 宁华, 文娜, 沙桐)",
    remoteTool: "向日葵 (SunLogin / AweSun)",
    wecomMention: "@张冰 @朱晨阳",
    recommendedTag: "area:camera",
    guidanceTip: "실시간/녹화본 구분, 흰 바탕 과노출 여부 확인, T1 직결 및 CameraCMS 대역 점검",
  },
  board: {
    domain: "board",
    domainLabel: "전자칠판·터치·OPS",
    primaryContact: "Wang Lian / Tang Yilei (전자칠판 2세대/3세대)",
    secondaryContact: "朱晨阳 (Zhu Chenyang)",
    firstLineContact: "小助手 (兰兰, 宁华)",
    remoteTool: "RustDesk (지사) / 向日葵 (HQ)",
    wecomMention: "@Wang Lian @Tang Yilei @朱晨阳",
    recommendedTag: "area:board",
    guidanceTip: "1대 전원 차단 단일 변수 대조 테스트(고스트 터치), OPS 메모리/NTP 시계 확인",
  },
  hardware_as: {
    domain: "hardware_as",
    domainLabel: "하드웨어 A/S·패널·파손",
    primaryContact: "徐豫, 彭玉龙, Feng Junlong",
    secondaryContact: "朱晨阳 (Zhu Chenyang)",
    firstLineContact: "小助手 (宁华)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@徐豫 @彭玉龙 @Feng Junlong",
    recommendedTag: "area:hardware",
    guidanceTip: "외부 충격/파손 귀책 문제는 사전 고객 단정 금지, 정면 검정 화면 촬영 확보",
  },
  network: {
    domain: "network",
    domainLabel: "접속·네트워크·메모리",
    primaryContact: "于杰 (Yu Jie, 네트워크·접속)",
    secondaryContact: "Zhu Chenyang (메모리)",
    firstLineContact: "小助手 (文娜, 沙桐)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@于杰",
    recommendedTag: "area:network",
    guidanceTip: "퇴장 코드(54/56/57) 및 이탈 직후 신규 로그인 유무로 프로세스 종료 vs 회선 단절 판별",
  },
  recording: {
    domain: "recording",
    domainLabel: "교실/카메라 녹화·트랜스코딩",
    primaryContact: "宁华 (ClassIn 小助手)",
    secondaryContact: "于杰, 朱晨阳",
    firstLineContact: "小助手 (宁华, 兰兰)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@宁华 @于杰",
    recommendedTag: "area:recording",
    guidanceTip: "수업 생성 시 Recording Settings(Enable 여부) 및 시작 시 카메라 지정 여부 확인",
  },
  mirroring: {
    domain: "mirroring",
    domainLabel: "무선 미러링·화면공유",
    primaryContact: "刘颖 (Liu Ying, WeCom 1차)",
    secondaryContact: "朱晨阳 (Zhu Chenyang)",
    firstLineContact: "小助手 (兰兰, 沙桐)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@刘颖 @朱晨阳",
    recommendedTag: "area:mirroring",
    guidanceTip: "양방향 ping 및 AP 클라이언트 격리 여부 판별. 임시 핫스팟 우회책은 표준으로 고착 주의",
  },
  software_pen: {
    domain: "software_pen",
    domainLabel: "SW·판서·필기 보정",
    primaryContact: "Li Wei (SW·필기 보정)",
    firstLineContact: "小助手 (文娜)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@Li Wei",
    recommendedTag: "area:software",
    guidanceTip: "판서 좌표 오버레이 판정 및 최신 패치 적용 여부 확인",
  },
  ai_classroom: {
    domain: "ai_classroom",
    domainLabel: "AI 교실·강의평가·AI 녹화",
    primaryContact: "张雅茹 (Zhang Yaru, AI 교실)",
    secondaryContact: "贺睿 (라우팅), 许春生 (재요약)",
    firstLineContact: "小助手 (宁华)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@张雅茹 @贺睿 @许春生",
    recommendedTag: "area:ai",
    guidanceTip: "6.0.9 AI 평가 산출 여부, 스마트 칠판 및 학생 단말 버전 일치 여부 확인",
  },
  lms_agentin: {
    domain: "lms_agentin",
    domainLabel: "LMS·숙제·AgentIn",
    primaryContact: "余烨, 肖艳帅 (AI LMS PM)",
    secondaryContact: "刘颖 → 孟晓亮 (TAPD)",
    firstLineContact: "小助手 (沙桐)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@余烨 @肖艳帅",
    recommendedTag: "area:lms",
    guidanceTip: "채점 완료·공개 여부, 마감 경과 및 추가 제출 허용 옵션 확인",
  },
  ai_risk: {
    domain: "ai_risk",
    domainLabel: "AI 리스크 모니터",
    primaryContact: "Shelly (Wu Hongxiang), 张强 (PM)",
    firstLineContact: "小助手 (文娜)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@Shelly @张强",
    recommendedTag: "area:ai_risk",
    guidanceTip: "이상 감지 모니터링 룰셋 및 오탐 임계치 확인",
  },
  api: {
    domain: "api",
    domainLabel: "Open API·연동",
    primaryContact: "HQ 기술팀 (참조: An Vu / 베트남 소속 주의)",
    firstLineContact: "小助手 (文娜)",
    remoteTool: "Postman / 서버 로그",
    wecomMention: "@HQ-Tech",
    recommendedTag: "area:api",
    guidanceTip: "콘솔 API 로그 번호로 요청 지목. 조회 성공이 서명 정상을 보장하지 않음",
  },
  billing: {
    domain: "billing",
    domainLabel: "결제·인보이스·스토리지",
    primaryContact: "Olivia, Wei Lan",
    firstLineContact: "지사 운영팀",
    remoteTool: "관리 콘솔",
    wecomMention: "@Olivia @Wei Lan",
    recommendedTag: "area:billing",
    guidanceTip: "요금/환불/보상 정책은 내부 합의 전 고객에게 확답 금지",
  },
  sms: {
    domain: "sms",
    domainLabel: "SMS 인증·알림",
    primaryContact: "张华, 张强, Ge Hailong",
    firstLineContact: "지사 운영팀",
    remoteTool: "관리 콘솔",
    wecomMention: "@张华 @张强",
    recommendedTag: "area:sms",
    guidanceTip: "국가 번호(+82) 및 통신사 스팸 차단 여부 점검",
  },
  cloud_cdn: {
    domain: "cloud_cdn",
    domainLabel: "클라우드·드라이브·CDN",
    primaryContact: "牛王帅, 宁华, Wenjun",
    secondaryContact: "朱晨阳 (Zhu Chenyang)",
    firstLineContact: "小助手 (宁华)",
    remoteTool: "WeDrive",
    wecomMention: "@牛王帅 @宁华",
    recommendedTag: "area:cloud",
    guidanceTip: "영상 전달은 WeDrive 지정 공유 활용. 원본 인코딩 변경 금지",
  },
  general: {
    domain: "general",
    domainLabel: "서비스 1차 접점 / 일반",
    primaryContact: "小助手 (兰兰, 宁华, 文娜, 沙桐)",
    firstLineContact: "小助手 (ClassIn Assistant)",
    remoteTool: "RustDesk (지사) / AweSun (HQ)",
    wecomMention: "@小助手",
    recommendedTag: "area:general",
    guidanceTip: "1차 접점(小助手)에 선 보고 후 증상에 따라 전문 기술 담당자 이관",
  },
}

// 알려진 고객사/기관명 딕셔너리
const KNOWN_INSTITUTIONS = [
  "정율사관", "정율사관 온라인", "JYSK",
  "에듀온픽", "KJ영재센터", "Sook's coaching", "쑥쑥코칭", "쏙쏙코칭",
  "12inedu", "캐슬에듀", "쉴라", "쉴라의 영어 다이아그램",
  "Rami English", "라미잉글리쉬", "형아람",
  "이미숙국어", "이미숙국어 가경관",
  "과사람", "철의국어", "철의국어입시학원",
  "차준호국어", "광주 ALCC", "The Solution Edu",
  "플라잉글리쉬", "킹콩수학학원", "에스키어학원",
  "미소에듀", "국풍온", "국풍H&C", "모나르떼", "윤유경플러스학원",
  "아이온영어", "리아잉글리쉬", "NS 과학수학", "Renewgen",
]

/**
 * 한국 시각(KST, UTC+9) 문자열을 중국 북경 시각(UTC+8, KST - 1시간)으로 자동 변환.
 */
export function convertKstToBeijingTime(timeStr: string | null): string | null {
  if (!timeStr) return null

  // 1. 단순 시:분 형태 (예: "18:30", "09:15")
  const hhmmMatch = timeStr.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (hhmmMatch) {
    const hours = parseInt(hhmmMatch[1], 10)
    const minutes = hhmmMatch[2]
    const beijingHours = (hours + 23) % 24
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
    return `${pad(beijingHours)}:${minutes} (北京时间, UTC+8)`
  }

  // 2. 날짜+시간 ISO 또는 표준 문자열 (예: "2026-10-15 18:30")
  const dateObj = new Date(timeStr)
  if (!Number.isNaN(dateObj.getTime())) {
    // KST는 UTC+9, 북경은 UTC+8이므로 1시간을 뺀다
    const beijingDate = new Date(dateObj.getTime() - 3600_000)
    const yyyy = beijingDate.getFullYear()
    const mm = String(beijingDate.getMonth() + 1).padStart(2, "0")
    const dd = String(beijingDate.getDate()).padStart(2, "0")
    const hh = String(beijingDate.getHours()).padStart(2, "0")
    const min = String(beijingDate.getMinutes()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd} ${hh}:${min} (北京时间, UTC+8)`
  }

  return `${timeStr} (KST - 1h, UTC+8)`
}

/**
 * 대화 내용과 메타데이터에서 에스컬레이션 컨텍스트 및 변수를 자동 추출.
 */
export function extractEscalationContext(
  text: string,
  options?: {
    title?: string
    tags?: string[]
    assigneeName?: string | null
    createdDate?: string | null
  }
): EscalationContext {
  const combined = `${options?.title ?? ""} ${text}`

  // 1. 기관명 감지
  let institution: string | null = null
  for (const inst of KNOWN_INSTITUTIONS) {
    if (combined.includes(inst)) {
      institution = inst
      break
    }
  }
  if (!institution) {
    const instMatch = combined.match(/(?:기관|학원|고객사)\s*[:#]?\s*([가-힣a-zA-Z0-9\s]{2,15})(?:학원|센터|어학원|에듀)?/)
    if (instMatch?.[1]) {
      institution = instMatch[1].trim()
    }
  }

  // 2. 계정 / UID 감지
  const accountMatch = combined.match(/\b(?:Account|UID|User\s*ID|계정\s*ID|계정|UID:)\s*[:#]?\s*(\d{6,10})\b/i)
  const accountId = accountMatch?.[1] ?? null

  // 3. 수업 ID / 코스 ID 감지
  const lessonMatch = combined.match(/\b(?:수업\s*ID|lesson\s*id|class\s*id|코스\s*ID|강의\s*ID)\s*[:#]?\s*([a-zA-Z0-9_-]{4,20})\b/i)
  const lessonId = lessonMatch?.[1] ?? null

  // 4. 오류 코드 감지
  const errorMatch = combined.match(/(?:오류\s*코드|에러\s*코드|error\s*code|코드|code|errno)\s*[:#]?\s*(-?\d{2,10}|0x[0-9a-fA-F]+)\b/i)
  let errorCode = errorMatch?.[1] ?? null
  if (!errorCode) {
    if (/(?:코드\s*54|code\s*54)/i.test(combined)) errorCode = "54"
    else if (/(?:코드\s*56|code\s*56)/i.test(combined)) errorCode = "56"
    else if (/(?:코드\s*57|code\s*57)/i.test(combined)) errorCode = "57"
    else if (/\b4001\b/.test(combined)) errorCode = "4001"
    else if (/\b2001\b/.test(combined)) errorCode = "2001"
    else if (/\b102\b/.test(combined)) errorCode = "errno 102"
    else if (/Connection failed/i.test(combined)) errorCode = "Connection failed"
    else if (/Duplicate/i.test(combined)) errorCode = "Duplicate IP"
  }

  // 5. 기기 / 단말 모델 감지
  let deviceModel: string | null = null
  if (/Board\s*S?(?:65|75|86|98|110)|전자칠판/i.test(combined)) {
    const inch = combined.match(/(65|75|86|98|110)\s*인치|S(65|75|86|98|110)/i)
    deviceModel = inch ? `ClassIn Board ${inch[1] ?? inch[2]}"` : "ClassIn Board (전자칠판)"
  } else if (/Cam\s*T1|T1\s*카메라|T1/i.test(combined)) {
    deviceModel = "ClassIn Cam T1"
  } else if (/OPS|Windows\s*11|Win11|Windows\s*10|Win10/i.test(combined)) {
    deviceModel = "OPS Windows PC"
  } else if (/Android|태블릿/i.test(combined)) {
    deviceModel = "Android Client"
  } else if (/iPad|iOS/i.test(combined)) {
    deviceModel = "iPad / iOS"
  }

  // 6. 앱 버전 감지
  const versionMatch = combined.match(/\b(6\.\d+\.\d+(?:\.\d+)?)\b/)
  const appVersion = versionMatch?.[1] ?? null

  // 7. 시각 감지 (KST 및 UTC+8 변환)
  const timeMatch = combined.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  const kstTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]} (KST)` : null
  const beijingTime = convertKstToBeijingTime(timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null)

  // 8. 결함 vs 요구사항 태깅
  let issueType: "bug" | "requirement" | "suspected_bug" = "bug"
  let issueTypeTag: "【缺陷】" | "【需求】" | "【疑似缺陷】" = "【缺陷】"
  if (/(?:기능\s*요청|개선\s*요청|추가\s*요청|지원\s*희망|기능\s*제안|스펙\s*문의)/i.test(combined)) {
    issueType = "requirement"
    issueTypeTag = "【需求】"
  } else if (/(?:의심|간헐|원인\s*불명|확인\s*필요|추정)/i.test(combined)) {
    issueType = "suspected_bug"
    issueTypeTag = "【疑似缺陷】"
  }

  // 9. 도메인 및 담당자 라우팅
  let matchedDomain = "general"
  if (/(?:카메라|T1|CameraCMS|화질|트래킹|파노라마|CMS|554|RTSP)/i.test(combined)) {
    matchedDomain = "camera"
  } else if (/(?:고스트\s*터치|터치|잔류물|센서|OPS|칠판\s*화면|패널\s*줄|Win11\s*OPS)/i.test(combined)) {
    matchedDomain = "board"
  } else if (/(?:액정\s*파손|파손|부서짐|금형|외관)/i.test(combined)) {
    matchedDomain = "hardware_as"
  } else if (/(?:끊김|코드\s*54|코드\s*56|코드\s*57|하트비트|이탈|핑|ping|게이트웨이|NIC|ASIX|IP\s*충돌|메모리\s*부족|12288|闪退)/i.test(combined)) {
    matchedDomain = "network"
  } else if (/(?:녹화|4001|2001|-5801|클라우드\s*녹화|현장\s*녹화|트랜스코딩)/i.test(combined)) {
    matchedDomain = "recording"
  } else if (/(?:미러링|동일한\s*LAN|화면\s*공유|분배기|HDMI)/i.test(combined)) {
    matchedDomain = "mirroring"
  } else if (/(?:AI\s*강의평가|AI\s*교실|AI\s*녹화|AI\s*요약|스마트\s*칠판|6\.0\.9)/i.test(combined)) {
    matchedDomain = "ai_classroom"
  } else if (/(?:LMS|숙제|답안|AgentIn|Answer\s*Sheet)/i.test(combined)) {
    matchedDomain = "lms_agentin"
  } else if (/(?:API|errno\s*102|101002005|safeKey|인증\s*토큰)/i.test(combined)) {
    matchedDomain = "api"
  } else if (/(?:결제|요금제|인보이스|환불|스토리지\s*요금)/i.test(combined)) {
    matchedDomain = "billing"
  } else if (/(?:SMS|문자|인증번호)/i.test(combined)) {
    matchedDomain = "sms"
  } else if (/(?:필기|판서|보정|펜)/i.test(combined)) {
    matchedDomain = "software_pen"
  }

  // 태그에 area:가 명시되어 있다면 우선 반영
  if (options?.tags) {
    for (const tag of options.tags) {
      if (tag === "area:camera") matchedDomain = "camera"
      else if (tag === "area:board") matchedDomain = "board"
      else if (tag === "area:network") matchedDomain = "network"
      else if (tag === "area:recording") matchedDomain = "recording"
      else if (tag === "area:mirroring") matchedDomain = "mirroring"
      else if (tag === "area:ai") matchedDomain = "ai_classroom"
      else if (tag === "area:api") matchedDomain = "api"
      else if (tag === "area:billing") matchedDomain = "billing"
    }
  }

  const contact = HQ_DOMAINS[matchedDomain] ?? HQ_DOMAINS.general

  // 현상 요약 (첫 문장 추출)
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const symptomSummary = lines[0] ?? "증상 상세 확인 필요"

  return {
    domain: matchedDomain,
    contact,
    institution,
    accountId,
    lessonId,
    lessonName: null,
    errorCode,
    deviceModel,
    appVersion,
    kstTime,
    beijingTime,
    issueType,
    issueTypeTag,
    symptomSummary,
    rawQuestion: text,
    assigneeName: options?.assigneeName ?? null,
  }
}

/**
 * 고객 안내문 내부 정보 마스킹 헬퍼
 * 규칙: IP 주소, 내부 NIC명, 민감한 시스템 식별자 등 고객에게 불필요한 내부 정보 제거.
 */
export function sanitizeCustomerContent(text: string): string {
  return text
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[내부 네트워크]")
    .replace(/\b(ASIX|Realtek|PoE|RTSP)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 1. 고객 안내용 카카오톡 문안 생성
 * 원칙: 사실과 추정 분리, 내부 식별자(IP, 서버명, 에러코드) 제외, 친근하고 명확한 안내.
 */
export function buildSmartCustomerDraft(context: EscalationContext): string {
  const greeting = context.institution
    ? `안녕하세요, ${context.institution} 담당자님. 클래스인 기술지원팀입니다.`
    : "안녕하세요, 고객님. 클래스인 기술지원팀입니다."

  const timeLabel = context.kstTime ? ` (발생 시각: ${context.kstTime})` : ""
  const safeSymptom = sanitizeCustomerContent(context.symptomSummary)

  return [
    greeting,
    `문의주신 현상${timeLabel} 관련 확인 결과 안내드립니다.`,
    "",
    "▪ 확인된 현상 및 원인",
    `- 확인된 내용: ${safeSymptom}`,
    context.deviceModel ? `- 대상 기기: ${context.deviceModel}` : "- 상세 환경 및 로그 점검을 완료하였습니다.",
    "- 판정: 현재 지사 기술팀 및 본사 협의를 통해 정확한 원인을 분석 중입니다.",
    "",
    "▪ 영향 및 복구",
    "- 서비스 이용 및 데이터 보존 상태를 면밀히 점검하고 있습니다.",
    "- 필요 시 임시 우회 방안 또는 설정 조정을 즉시 지원해 드리겠습니다.",
    "",
    "▪ 다음 조치 및 안내 예정",
    context.assigneeName
      ? `- 담당자: ${context.assigneeName} 매니저가 전담하여 후속 조치 진행 예정입니다.`
      : "- 담당 엔지니어가 추가 확인 후 신속히 다음 안내를 드리겠습니다.",
    "- 수업 진행 중 동일 증상이 발생하면 언제든 편하게 제보해 주세요.",
    "",
    "감사합니다.",
  ].join("\n")
}

/**
 * 2. HQ 보고 템플릿 v2 (중국어 발송용 + English + 한국어 사내참조)
 * 원칙: 완충 표현, UTC+8 북경 시각 자동 변환, 결함 태그, 담당자 WeCom 멘션.
 */
export function buildSmartHqDraft(context: EscalationContext): string {
  const accountStr = context.accountId ? `${context.accountId}` : "확인 필요"
  const orgStr = context.institution ? `${context.institution}` : "확인 필요"
  const lessonStr = context.lessonId ? `${context.lessonId}` : "확인 필요"
  const timeStr = context.beijingTime ?? "확인 필요 (北京时间, UTC+8)"
  const deviceStr = context.deviceModel ?? "확인 필요"
  const osStr = "Windows / Android 확인 필요"
  const verStr = context.appVersion ?? "6.0.x 확인 필요"
  const errorInfoStr = context.errorCode ? `에러 코드/문구: ${context.errorCode}` : "세부 지표 점검 필요"

  return [
    `// ==========================================`,
    `// [HQ WeCom 발송용 中文] ${context.contact.wecomMention}`,
    `// ==========================================`,
    `你好，百忙之中打扰您，麻烦帮忙确认以下账号及【${context.contact.domainLabel}】的问题。${context.issueTypeTag}`,
    "",
    `- Account : ${accountStr}`,
    `- 机构 : ${orgStr}`,
    `- 课节ID : ${lessonStr}`,
    `- Lesson Start Time : ${timeStr}`,
    `- Device : ${deviceStr} / OS : ${osStr} / ClassIn 版本 : ${verStr}`,
    "",
    "Error info :",
    `- 现象: ${context.symptomSummary}`,
    `- 错误代码: ${errorInfoStr}`,
    `- 韩国分社测试与控制台状态: 网络与设备基础配置已排查`,
    `- 确认要点: 请协助排查服务器日志与底层原因，确认是否有已知缺陷或修复方案`,
    "",
    `// ==========================================`,
    `// [English Version]`,
    `// ==========================================`,
    `Hello, please help verify the issue regarding [${context.contact.domainLabel}].`,
    `- Account : ${accountStr}`,
    `- Organization : ${orgStr}`,
    `- Lesson ID : ${lessonStr}`,
    `- Start Time : ${timeStr}`,
    `- Device : ${deviceStr} / Version : ${verStr}`,
    `Error info : ${context.symptomSummary} (Error: ${errorInfoStr})`,
    "",
    `// ==========================================`,
    `// [한국어 사내 참조용]`,
    `// ==========================================`,
    `[KR-CS][${context.contact.recommendedTag}] ${context.institution ?? "고객사"} - ${context.contact.domainLabel} 확인 요청`,
    `- HQ 담당: ${context.contact.primaryContact} (${context.contact.remoteTool ?? "원격 지원"})`,
    `- 발생 시각: ${context.kstTime ?? "미확인 (KST)"}`,
    `- 현상 요약: ${context.symptomSummary}`,
    `- 가이드 팁: ${context.contact.guidanceTip}`,
  ].join("\n")
}

/**
 * 3. 사내 인수인계 / CRM용 템플릿
 */
export function buildSmartInternalHandoffDraft(context: EscalationContext): string {
  return [
    `[CS-CASE] ${context.institution ? `[${context.institution}] ` : ""}${context.contact.domainLabel} 건 인수인계`,
    `우선순위 / 태그: HIGH / ${context.contact.recommendedTag}`,
    `HQ 소통 경로: ${context.contact.primaryContact} (도구: ${context.contact.remoteTool ?? "RustDesk"})`,
    `식별 정보: 기관 [${context.institution ?? "미확보"}] · 계정 [${context.accountId ?? "미확보"}] · 수업 [${context.lessonId ?? "미확보"}]`,
    `단말 환경: ${context.deviceModel ?? "기기 확인 필요"} · 버전 ${context.appVersion ?? "미확인"}`,
    `현상 및 에러: ${context.symptomSummary}${context.errorCode ? ` (코드: ${context.errorCode})` : ""}`,
    "확인된 사실: 지사 1차 로그 및 재현 조건 검토 완료",
    "고객 안내 상태: 사실/추정 분리 임시 안내 완료",
    "다음 조치: HQ 회신 대기 및 현장 2차 모니터링",
    `담당 매니저: ${context.assigneeName ?? "지정 필요"}`,
  ].join("\n")
}

export const buildSmartHandoffMessage = buildSmartInternalHandoffDraft
