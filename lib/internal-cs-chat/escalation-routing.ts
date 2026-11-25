import "server-only"

// 내부 CS 에스컬레이션 라우팅 및 3-Way 스마트 소통 템플릿 엔진 — 서버 전용.
// 정본: docs/active/cs-error-cases-workflow-rules-2026-10-02.md §7 (HQ 담당자, 역할별 전체 표)
//       docs/active/cs-error-cases-index-2026-10-02.md 부록 C (케이스에서 실제로 닿은 경로, §7 을 보완)
//       docs/active/cs-error-cases-workflow-rules-2026-10-02.md (2장 지킬 규칙, 3장 HQ 보고 템플릿 v2)
//
// 서버 전용인 이유(2026-11 B2, R2): 이 표에는 본사 담당자 실명·위컴 멘션이 있다. 'use client' 파일이 이 모듈을
// 가져다 쓰면 인증 없이 받는 정적 청크(_next/static)에 그대로 실린다. 화면은 POST /api/admin/cs-chat/escalation
// 결과(EscalationResult)만 받고, 형은 escalation-types.ts 에서 가져간다. scripts/check-client-bundle-secrets.mjs 가
// 이 경계를 검사한다.
//
// 안전 규칙(IC-02, 2026-11 CS 코파일럿 점검 B1):
// - 입력은 사용자 글·customer_context·대화 메타뿐이다. AI 답 글은 받지 않는다.
// - 모든 출력 칸은 redactInternalCsDraft(전화·이메일·계좌·주민번호·생년월일·UID)를 거친다.
// - 하지 않은 일("점검 완료", "검토 완료", "임시 안내 완료")을 사실처럼 적지 않고 DRAFT_PLACEHOLDER 자리를 둔다.

import {
  DRAFT_PLACEHOLDER,
  type EscalationCandidate,
  type EscalationConfidence,
  type EscalationContext,
  type EscalationInput,
  type EscalationResult,
  type HqContactInfo,
} from "./escalation-types"
import { redactInternalCsDraft } from "./redact"

export {
  DRAFT_PLACEHOLDER,
  type EscalationCandidate,
  type EscalationContext,
  type EscalationInput,
  type EscalationResult,
  type HqContactInfo,
}

const RULES_DOC = "docs/active/cs-error-cases-workflow-rules-2026-10-02.md"
const INDEX_DOC = "docs/active/cs-error-cases-index-2026-10-02.md"
/** 두 정본 문서의 기준일(파일 이름 날짜). 담당 교체를 실제로 확인한 날이 아니다 — 사용자 확인 전까지 이 값. */
const HQ_DOC_DATE = "2026-10-02"

function src(...refs: string[]) {
  return refs.join(" · ")
}

/**
 * 본사 담당 표. 값은 문서 원문을 따른다(2026-11 B2, R14). 문서끼리 어긋나 확정할 수 없는 값은 바꾸지 않고
 * 그대로 두었다(아래 각 행 주석). wecomMention 은 주 담당(primaryContact)에 적힌 사람만 부른다.
 * 위컴 표시 이름은 문서에 없어 문서의 표기를 그대로 쓴다.
 */
export const HQ_DOMAINS: Record<string, HqContactInfo> = {
  general: {
    domain: "general",
    domainLabel: "서비스 1차 접점 / 일반",
    primaryContact: "小助手 (兰兰, 宁华, 文娜, 沙桐)",
    firstLineContact: "ClassIn小助手 계정 (한 계정에 여러 담당자가 응대)",
    remoteTool: "RustDesk (지사) / AweSun (HQ)",
    wecomMention: "@小助手",
    recommendedTag: "area:general",
    guidanceTip:
      "담당이 불분명하면 小助手에 묻는다. \"다른 담당자에게 개인 메시지로 물으라\"는 답이면 그 담당자에게 식별자와 첨부를 처음부터 다시 보낸다",
    source: src(`${INDEX_DOC}:514`, `${RULES_DOC}:561`, `${RULES_DOC}:581`),
    verifiedAt: HQ_DOC_DATE,
  },
  network: {
    domain: "network",
    domainLabel: "접속·네트워크·메모리",
    primaryContact: "于杰 (Yu Jie, 네트워크·접속·메모리)",
    // D-02 케이스 HQ 줄: 가상 메모리 산정 기준은 Zhu Chenyang.
    secondaryContact: "Zhu Chenyang (가상 메모리 산정 기준, D-02)",
    firstLineContact: "小助手 (文娜, 沙桐)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@于杰",
    recommendedTag: "area:network",
    guidanceTip: "퇴장 코드(54/56/57) 및 이탈 직후 신규 로그인 유무로 프로세스 종료 vs 회선 단절 판별",
    source: src(`${INDEX_DOC}:515`, `${RULES_DOC}:562`, `${INDEX_DOC}:46`),
    verifiedAt: HQ_DOC_DATE,
  },
  hardware_remote: {
    domain: "hardware_remote",
    domainLabel: "원격 지원·하드웨어 1차·T1 문의",
    primaryContact: "朱晨阳 (Zhu Chenyang)",
    firstLineContact: "朱晨阳 직접 (여러 건이 한 대화창에서 진행)",
    remoteTool: "RustDesk (지사) / 向日葵 (HQ)",
    wecomMention: "@朱晨阳",
    recommendedTag: "area:hardware_remote",
    guidanceTip:
      "여러 건이 한 대화창에서 진행되므로 메시지 첫 줄에 건명을 적는다. 원격 지원(AweSun) 식별·인증 코드는 단체방이 아니라 1:1 로만 보낸다",
    source: src(`${INDEX_DOC}:516`, `${RULES_DOC}:563`, `${RULES_DOC}:166`),
    verifiedAt: HQ_DOC_DATE,
  },
  camera: {
    domain: "camera",
    domainLabel: "카메라·화질·T1",
    primaryContact: "张冰 (Zhang Bing, 카메라 원격 디버깅)",
    // §7 563행: 원격 지원·하드웨어 1차·T1 문의는 朱晨阳. 부록 C 카메라 행에는 张冰만 있어 주 담당은 张冰으로 둔다.
    secondaryContact: "朱晨阳 (Zhu Chenyang, T1 문의·하드웨어 1차)",
    firstLineContact: "小助手 (兰兰, 宁华, 文娜, 沙桐)",
    remoteTool: "AweSun (向日葵 / SunLogin)",
    wecomMention: "@张冰",
    recommendedTag: "area:camera",
    guidanceTip: "실시간/녹화본 구분, 흰 바탕 과노출 여부 확인, T1 직결 및 CameraCMS 대역 점검",
    source: src(`${INDEX_DOC}:517`, `${RULES_DOC}:564`, `${RULES_DOC}:563`),
    verifiedAt: HQ_DOC_DATE,
  },
  board: {
    domain: "board",
    domainLabel: "전자칠판·터치·OPS",
    primaryContact: "Wang Lian / Tang Yilei (전자칠판 2세대 / 3세대)",
    secondaryContact: "朱晨阳 (Zhu Chenyang, 하드웨어 1차)",
    firstLineContact: "小助手 (兰兰, 宁华)",
    remoteTool: "RustDesk (지사) / 向日葵 (HQ)",
    wecomMention: "@Wang Lian @Tang Yilei",
    recommendedTag: "area:board",
    guidanceTip: "1대 전원 차단 단일 변수 대조 테스트(고스트 터치), OPS 메모리/NTP 시계 확인",
    source: src(`${INDEX_DOC}:518`, `${RULES_DOC}:565`, `${RULES_DOC}:563`),
    verifiedAt: HQ_DOC_DATE,
  },
  hardware_as: {
    domain: "hardware_as",
    domainLabel: "하드웨어 A/S·보증 판정·이미지",
    primaryContact: "徐豫, 彭玉龙, Feng Junlong",
    // §7 567행. He Rui 는 문서마다 何睿/贺睿로 적혀 같은 사람인지 미확인(§7 579행) — 표기는 §7 원문 그대로.
    secondaryContact: "何睿 / 彭玉龙 (하드웨어 총괄 / 부서장 — OPS 이미지·출하 구성)",
    firstLineContact: "小助手 (宁华)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@徐豫 @彭玉龙 @Feng Junlong",
    recommendedTag: "area:hardware",
    guidanceTip: "외부 충격/파손 귀책 문제는 사전 고객 단정 금지, 정면 검정 화면 촬영 확보. 보증 판정은 徐豫",
    source: src(`${INDEX_DOC}:519`, `${RULES_DOC}:566`, `${RULES_DOC}:567`),
    verifiedAt: HQ_DOC_DATE,
  },
  software_pen: {
    domain: "software_pen",
    domainLabel: "SW·판서·필기 보정",
    primaryContact: "李伟 (Li Wei, 소프트웨어·필기)",
    firstLineContact: "小助手 (文娜)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@Li Wei",
    recommendedTag: "area:software",
    guidanceTip: "판서 좌표 오버레이 판정 및 최신 패치 적용 여부 확인",
    source: src(`${INDEX_DOC}:520`, `${RULES_DOC}:568`),
    verifiedAt: HQ_DOC_DATE,
  },
  ai_classroom: {
    domain: "ai_classroom",
    domainLabel: "AI 교실·수업 분석·AI 녹화",
    primaryContact: "张雅茹 (Zhang Yaru, AI 교실 — AgentIn 활성화 요청 창구)",
    // 부록 C 521행 원문. 贺睿와 §7 의 何睿가 같은 사람인지 미확인(§7 579행).
    secondaryContact: "贺睿 (라우팅), 许春生 (재요약 처리)",
    firstLineContact: "小助手 (宁华)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@张雅茹",
    recommendedTag: "area:ai",
    guidanceTip: "6.0.9 AI 평가 산출 여부, 스마트 칠판 및 학생 단말 버전 일치 여부 확인",
    source: src(`${INDEX_DOC}:521`, `${RULES_DOC}:569`),
    verifiedAt: HQ_DOC_DATE,
  },
  lms_agentin: {
    domain: "lms_agentin",
    domainLabel: "LMS·AgentIn·Answer Sheet",
    primaryContact: "余烨 (Yu Ye), 肖艳帅 (AI LMS PM)",
    firstLineContact: "LMS 구조·상한 문의는 小助手를 거치지 않고 余烨에게 직행",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@余烨 @肖艳帅",
    recommendedTag: "area:lms",
    guidanceTip: "채점 완료·공개 여부, 마감 경과 및 추가 제출 허용 옵션 확인",
    source: src(`${INDEX_DOC}:522`, `${RULES_DOC}:570`, `${RULES_DOC}:571`),
    verifiedAt: HQ_DOC_DATE,
  },
  homework_tapd: {
    domain: "homework_tapd",
    domainLabel: "숙제 렌더링 (TAPD)",
    primaryContact: "刘颖 → 孟晓亮 → 崔小邯 (TAPD 담당) → 吴建东 → 张国兵",
    firstLineContact: "Done-Tech 방 (D-01 에서는 무응답) → 刘颖",
    wecomMention: "@刘颖",
    recommendedTag: "area:homework_tapd",
    guidanceTip: "D-01 에서 실제로 닿은 사슬이다. 다음 담당으로 넘어갈 때마다 식별자와 첨부를 처음부터 다시 보낸다",
    source: src(`${INDEX_DOC}:525`, `${INDEX_DOC}:288`),
    verifiedAt: HQ_DOC_DATE,
  },
  ai_risk: {
    domain: "ai_risk",
    domainLabel: "AI 리스크 모니터",
    primaryContact: "Shelly (Wu Hongxiang), 张强 (PM)",
    firstLineContact: "小助手 (文娜)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@Shelly @张强",
    recommendedTag: "area:ai_risk",
    guidanceTip: "이상 감지 모니터링 룰셋 및 오탐 임계치 확인. UI 문구 노출은 현지화(Crowdin) 쪽",
    source: src(`${INDEX_DOC}:523`, `${RULES_DOC}:531`),
    verifiedAt: HQ_DOC_DATE,
  },
  api: {
    domain: "api",
    domainLabel: "Open API·연동",
    primaryContact: "郑婉勤 (Zheng Wanqin, API 총괄)",
    secondaryContact: "An Vu (Vu Thai An, 베트남 해외 기술지원 — 참고용, HQ 공식 입장 아님)",
    firstLineContact: "小助手 (文娜)",
    remoteTool: "Postman / 서버 로그",
    wecomMention: "@郑婉勤",
    recommendedTag: "area:api",
    guidanceTip: "콘솔 API 로그 번호로 요청 지목. 조회 성공이 서명 정상을 보장하지 않음",
    channelNote:
      "datasub 활성화·콜백 URL 변경·VA 발급은 위컴이 아니라 본사 gpc 요청 메일로 보낸다(@classin.com 계정 발신만 수신). 필수: SID, 콜백 URL, 알림 이메일, 구독 항목",
    source: src(`${RULES_DOC}:572`, `${INDEX_DOC}:524`, `${RULES_DOC}:577`, `${RULES_DOC}:519`),
    verifiedAt: HQ_DOC_DATE,
  },
  infra_data: {
    domain: "infra_data",
    domainLabel: "인프라·데이터 저장 지역",
    primaryContact: "葛海龙 (Ge Hailong)",
    firstLineContact: "小助手",
    wecomMention: "@葛海龙",
    recommendedTag: "area:infra",
    guidanceTip: "데이터 저장 지역·인프라 확인 요청",
    source: src(`${RULES_DOC}:573`),
    verifiedAt: HQ_DOC_DATE,
  },
  sms: {
    domain: "sms",
    domainLabel: "SMS 인증·알림",
    // 부록 C 527행 원문(3명). §7 574행은 SMS 를 张华·张强 두 명으로 적고 Ge Hailong 은 인프라 행에 둔다 — 미확정이라 유지.
    primaryContact: "张华, 张强, Ge Hailong",
    firstLineContact: "지사 운영팀",
    remoteTool: "관리 콘솔",
    wecomMention: "@张华 @张强",
    recommendedTag: "area:sms",
    guidanceTip: "국가 번호(+82) 및 통신사 스팸 차단 여부 점검",
    source: src(`${INDEX_DOC}:527`, `${RULES_DOC}:574`),
    verifiedAt: HQ_DOC_DATE,
  },
  billing: {
    domain: "billing",
    domainLabel: "결제·인보이스",
    primaryContact: "Olivia (Wei Lan)",
    firstLineContact: "지사 운영팀",
    remoteTool: "관리 콘솔",
    wecomMention: "@Olivia",
    recommendedTag: "area:billing",
    guidanceTip: "요금/환불/보상 정책은 내부 합의 전 고객에게 확답 금지",
    source: src(`${RULES_DOC}:575`, `${INDEX_DOC}:526`),
    verifiedAt: HQ_DOC_DATE,
  },
  security_account: {
    domain: "security_account",
    domainLabel: "보안·백엔드 계정 권한",
    primaryContact: "Shen Yang",
    firstLineContact: "小助手",
    wecomMention: "@Shen Yang",
    recommendedTag: "area:security",
    guidanceTip: "보안·백엔드 계정 권한 확인 요청",
    source: src(`${RULES_DOC}:576`),
    verifiedAt: HQ_DOC_DATE,
  },
  cloud_cdn: {
    domain: "cloud_cdn",
    domainLabel: "클라우드·CDN",
    primaryContact: "牛王帅, 宁华, 朱晨阳, Wenjun",
    firstLineContact: "小助手 (宁华)",
    remoteTool: "WeDrive",
    wecomMention: "@牛王帅 @宁华 @朱晨阳 @Wenjun",
    recommendedTag: "area:cloud",
    guidanceTip: "영상 전달은 WeDrive 지정 공유 활용. 원본 인코딩 변경 금지",
    source: src(`${INDEX_DOC}:528`),
    verifiedAt: HQ_DOC_DATE,
  },
  course_data_log: {
    domain: "course_data_log",
    domainLabel: "코스·학생 데이터 로그",
    primaryContact: "Tong Guojie",
    firstLineContact: "小助手",
    wecomMention: "@Tong Guojie",
    recommendedTag: "area:course_data",
    guidanceTip: "삭제·청강생 전환 같은 코스·학생 기록 이력은 로그 조회 요청으로 보낸다(S-01)",
    source: src(`${INDEX_DOC}:529`, `${INDEX_DOC}:272`),
    verifiedAt: HQ_DOC_DATE,
  },
  recording: {
    domain: "recording",
    domainLabel: "교실/카메라 녹화·트랜스코딩",
    // 부록 C 에 행이 없다. 근거는 D-21 케이스 HQ 줄 하나(宁华).
    primaryContact: "宁华 (ClassIn 小助手)",
    firstLineContact: "小助手 (宁华, 兰兰)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@宁华",
    recommendedTag: "area:recording",
    guidanceTip: "수업 생성 시 Recording Settings(Enable 여부) 및 시작 시 카메라 지정 여부 확인",
    source: src(`${INDEX_DOC}:116`),
    verifiedAt: HQ_DOC_DATE,
  },
  mirroring: {
    domain: "mirroring",
    domainLabel: "무선 미러링·화면공유",
    // 부록 C 에 행이 없다. 근거는 미러링 케이스 HQ 줄 하나(刘颖).
    primaryContact: "刘颖 (Liu Ying, WeCom 1차)",
    firstLineContact: "小助手 (兰兰, 沙桐)",
    remoteTool: "RustDesk (지사)",
    wecomMention: "@刘颖",
    recommendedTag: "area:mirroring",
    guidanceTip:
      "양방향 ping 및 AP 클라이언트 격리 여부 판별. 임시 핫스팟 우회책은 표준으로 고착 주의. 상급 채널은 지점장·상무 승인 필요",
    source: src(`${INDEX_DOC}:230`),
    verifiedAt: HQ_DOC_DATE,
  },
}

export const HQ_DOMAIN_KEYS = Object.keys(HQ_DOMAINS)

// ── 분류 ───────────────────────────────────────────────────────────────────────────────
// 도메인별 점수식(2026-11 B2, R20). 규칙 하나가 맞으면 그 가중치를 한 번 더한다(같은 규칙 여러 번은 한 번).
// 낱말 하나로 갈리던 오분류를 줄인다: '핑'은 앞뒤가 한글이 아닐 때만(매핑·타이핑·쇼핑 제외), OPS 는 대문자 낱말만
// (Oops·stops 제외), '끊김'·'문자'처럼 흔한 낱말은 가중치 1 이라 혼자서는 도메인을 정하지 못한다.

interface KeywordRule {
  pattern: RegExp
  weight: number
}

const PING = /(?<![가-힣A-Za-z])핑(?:$|[^가-힣]|이|을|은|도|값|테스트)|\bping\b/i

export const HQ_KEYWORD_RULES: Record<string, KeywordRule[]> = {
  general: [],
  network: [
    { pattern: /(?:코드|code|퇴장\s*코드)\s*5[467]\b/i, weight: 4 },
    { pattern: /하트비트|게이트웨이|\bNIC\b|ASIX|IP\s*충돌|Duplicate\s*IP/i, weight: 3 },
    { pattern: /메모리\s*부족|가상\s*메모리|12288|闪退/, weight: 3 },
    { pattern: PING, weight: 2 },
    { pattern: /네트워크|와이파이|Wi-?Fi|회선|공유기|방화벽/i, weight: 2 },
    { pattern: /끊김|끊겨|끊어|튕김|튕겨|이탈|접속\s*(?:불가|안\s*됨|실패)/, weight: 1 },
  ],
  hardware_remote: [
    { pattern: /원격\s*(?:지원|접속|연결|제어)/, weight: 3 },
    { pattern: /하드웨어\s*(?:1차|문의|점검)|T1\s*문의/, weight: 2 },
  ],
  camera: [
    { pattern: /카메라/, weight: 3 },
    { pattern: /\bT1\b/i, weight: 3 },
    { pattern: /Camera\s*CMS/i, weight: 3 },
    { pattern: /화질|트래킹|파노라마|과노출/, weight: 2 },
    { pattern: /\bRTSP\b|\b554\b|\bCMS\b/, weight: 1 },
  ],
  board: [
    { pattern: /전자\s*칠판|ClassIn\s*Board|Board\s*S?(?:65|75|86|98|110)\b/i, weight: 3 },
    { pattern: /고스트\s*터치/, weight: 4 },
    { pattern: /터치/, weight: 2 },
    { pattern: /\bOPS\b/, weight: 2 },
    { pattern: /패널\s*줄|칠판\s*화면|잔류물|터치\s*센서/, weight: 2 },
  ],
  hardware_as: [
    { pattern: /액정\s*파손|파손|부서짐|깨짐|금형|외관\s*(?:손상|불량)/, weight: 3 },
    { pattern: /(?<![A-Za-z])A\/S(?![A-Za-z])|보증\s*(?:판정|기간|수리)|무상\s*수리|유상\s*수리|부품\s*교체/, weight: 3 },
    { pattern: /OPS\s*이미지|출하\s*구성/, weight: 3 },
  ],
  software_pen: [
    { pattern: /필기|판서/, weight: 3 },
    { pattern: /(?<![가-힣])펜(?![가-힣])|펜이|펜을|펜\s*(?:보정|인식|입력)|스타일러스|필압/, weight: 2 },
    { pattern: /좌표\s*(?:오차|어긋)|보정/, weight: 1 },
  ],
  ai_classroom: [
    { pattern: /AI\s*(?:강의\s*평가|교실|녹화|요약|분석)|수업\s*분석|강의\s*평가|스마트\s*칠판|6\.0\.9/i, weight: 3 },
    { pattern: /AgentIn\s*활성화/i, weight: 3 },
  ],
  lms_agentin: [
    { pattern: /\bLMS\b|숙제|과제|답안|AgentIn|Answer\s*Sheet|채점/i, weight: 3 },
  ],
  homework_tapd: [
    { pattern: /(?:숙제|과제)[^\n]{0,20}렌더링|렌더링[^\n]{0,20}(?:숙제|과제)|\bTAPD\b/i, weight: 4 },
  ],
  ai_risk: [
    { pattern: /리스크\s*모니터|risk\s*monitor|riskMonitor|이상\s*감지|중점\s*관리\s*교사|오탐/i, weight: 4 },
  ],
  api: [
    { pattern: /\bAPI\b|Open\s*API|\bSDK\b/i, weight: 3 },
    { pattern: /웹훅|콜백|callback|datasub|safeKey|errno\s*102|101002005|인증\s*토큰/i, weight: 3 },
    { pattern: /\bSID\b|서명/, weight: 1 },
  ],
  infra_data: [
    { pattern: /데이터\s*(?:저장\s*)?(?:지역|위치|리전)|저장\s*지역|서버\s*(?:위치|리전)|리전|인프라|데이터\s*센터/, weight: 3 },
  ],
  sms: [
    { pattern: /\bSMS\b|인증\s*번호|인증\s*문자|문자\s*인증|문자가\s*(?:안|오지)|문자\s*(?:수신|발송)\s*(?:안|실패|오류)/i, weight: 3 },
    { pattern: /문자/, weight: 1 },
  ],
  billing: [
    { pattern: /결제|요금제|인보이스|invoice|환불|스토리지\s*요금|청구서/i, weight: 3 },
  ],
  security_account: [
    { pattern: /보안\s*(?:문제|이슈|점검|취약)|백엔드\s*계정|계정\s*권한|해킹|계정\s*(?:도용|잠김|탈취)/, weight: 3 },
  ],
  cloud_cdn: [
    { pattern: /클라우드\s*(?:드라이브|저장|용량|디스크)|\bCDN\b|WeDrive|드라이브/i, weight: 3 },
    { pattern: /(?:파일\s*)?(?:업로드|다운로드)\s*(?:실패|느림|안\s*됨|오류)/, weight: 2 },
  ],
  course_data_log: [
    { pattern: /청강생|학생\s*(?:삭제|기록|데이터)|코스\s*(?:데이터|로그|자료\s*열람)|수강\s*기록|출결\s*기록|데이터\s*로그/, weight: 3 },
  ],
  recording: [
    { pattern: /녹화/, weight: 3 },
    { pattern: /트랜스코딩|transcod/i, weight: 3 },
    { pattern: /\b4001\b|\b2001\b|-5801/, weight: 3 },
    { pattern: /영상\s*파일|재생이?\s*안/, weight: 1 },
  ],
  mirroring: [
    { pattern: /미러링|화면\s*공유|스크린\s*미러|AirPlay|캐스팅/i, weight: 3 },
    { pattern: /동일한\s*LAN|분배기|HDMI/i, weight: 2 },
  ],
}

/**
 * 한국 지사 업무 문맥(견적·계약·입금·세금계산서·출고·설치 일정·쇼룸·홈페이지·어드민·마케팅).
 * 이런 질문은 본사보다 한국 담당(resolveContact 의 kr 갈래)을 먼저 본다 — "견적서 문자로"가 SMS(본사)로 가던 오분류.
 */
export const KR_TOPIC_PATTERN =
  /견적|계약(?:금|서)?|입금|수납|세금\s*계산서|계산서\s*발행|출고|납품|설치\s*(?:일정|기사|예약)|현장\s*설치|쇼룸|홈페이지|어드민\s*(?:계정|권한)|마케팅|캠페인|광고/

/** 점수가 이 값보다 낮으면 도메인을 정하지 않는다(general). */
const MIN_DOMAIN_SCORE = 2

const TAG_TO_DOMAIN: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const contact of Object.values(HQ_DOMAINS)) {
    map[contact.recommendedTag] = contact.domain
    // 태그 규칙 통일: 'area:'+도메인 키도 받는다(area:ai_classroom, area:hardware_as …).
    map[`area:${contact.domain}`] = contact.domain
  }
  return map
})()

export function domainForTag(tag: string): string | null {
  return TAG_TO_DOMAIN[tag.trim()] ?? null
}

export interface DomainClassification {
  domain: string
  confidence: EscalationConfidence
  candidates: EscalationCandidate[]
  krTopic: boolean
  /** 태그(area:)로 정해졌는지. */
  fromTag: boolean
}

export function scoreHqDomains(text: string): EscalationCandidate[] {
  const scored: EscalationCandidate[] = []
  for (const key of HQ_DOMAIN_KEYS) {
    let score = 0
    for (const rule of HQ_KEYWORD_RULES[key] ?? []) {
      if (rule.pattern.test(text)) score += rule.weight
    }
    if (score > 0) scored.push({ domain: key, domainLabel: HQ_DOMAINS[key].domainLabel, score })
  }
  // 점수가 같으면 표의 순서(위가 먼저).
  return scored.sort((a, b) => b.score - a.score || HQ_DOMAIN_KEYS.indexOf(a.domain) - HQ_DOMAIN_KEYS.indexOf(b.domain))
}

/**
 * 글·태그로 본사 도메인을 고른다. 결정형(모델 없음).
 * - 태그 area:… 가 있으면 그 도메인(여럿이면 글 점수가 높은 쪽, 같으면 앞의 태그).
 * - 아니면 점수 1위. 1위가 MIN_DOMAIN_SCORE 미만이면 general.
 * - 1위가 3점 미만이거나 2위와 2점 미만 차이면 confidence=low 이고 후보 2개를 낸다.
 */
export function classifyHqDomain(text: string, tags: string[] = []): DomainClassification {
  const scored = scoreHqDomains(text)
  const krTopic = KR_TOPIC_PATTERN.test(text)
  const scoreOf = (domain: string) => scored.find((item) => item.domain === domain)?.score ?? 0

  const tagged = tags.map(domainForTag).filter((domain): domain is string => Boolean(domain))
  if (tagged.length > 0) {
    const domain = tagged.reduce((best, candidate) => (scoreOf(candidate) > scoreOf(best) ? candidate : best), tagged[0])
    return { domain, confidence: "high", candidates: [], krTopic, fromTag: true }
  }

  const top = scored[0]
  if (!top) return { domain: "general", confidence: "none", candidates: [], krTopic, fromTag: false }
  const second = scored[1]
  const candidates = scored.slice(0, 2)
  if (top.score < MIN_DOMAIN_SCORE) {
    return { domain: "general", confidence: "low", candidates, krTopic, fromTag: false }
  }
  const clear = top.score >= 3 && top.score - (second?.score ?? 0) >= 2
  return {
    domain: top.domain,
    confidence: clear ? "high" : "low",
    candidates: clear ? [] : candidates,
    krTopic,
    fromTag: false,
  }
}

// customer_context 에서 기관명을 찾는 열쇠. 브리지·상담 Inbox 가 넘기는 칸 이름이 아직 하나로 정해지지 않아(결정 14)
// 흔한 이름을 차례로 본다. 고객사 이름 목록을 코드에 두지 않는다 — 다른 고객 이름이 초안에 붙는 원인이었다.
const INSTITUTION_CONTEXT_KEYS = [
  "institution",
  "institutionName",
  "organization",
  "organizationName",
  "orgName",
  "company",
  "companyName",
  "school",
  "academy",
  "기관",
  "기관명",
  "고객사",
  "학원",
]

function institutionFromContext(context: Record<string, unknown> | null | undefined) {
  if (!context || typeof context !== "object") return { value: null as string | null, count: 0 }
  for (const key of INSTITUTION_CONTEXT_KEYS) {
    const raw = context[key]
    if (typeof raw === "string" && raw.trim()) {
      const redacted = redactInternalCsDraft(raw.trim().slice(0, 80))
      return { value: redacted.text, count: redacted.count }
    }
  }
  return { value: null, count: 0 }
}

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
 * 사용자 글·customer_context·대화 메타에서 에스컬레이션 컨텍스트를 뽑는다.
 * 분류(도메인·오류 코드·기기)에는 원문을 쓰지만, 초안에 실리는 값(현상·기관)은 가린 값만 남긴다.
 */
export function extractEscalationContext(input: EscalationInput): EscalationContext {
  const userText = input.userMessages.map((message) => message.trim()).filter(Boolean).join("\n")
  const title = input.title?.trim() ?? ""
  const combined = `${title} ${userText}`

  // 1. 기관명 — customer_context 에서만.
  const institutionResult = institutionFromContext(input.customerContext)
  const institution = institutionResult.value

  // 2. 계정 / UID — 있는지만 기록한다.
  const hasAccountId = /(?:Account|UID|User\s*ID|계정\s*ID|계정|아이디)\s*[:：#]?\s*\d{5,12}(?!\d)/i.test(userText)

  // 3. 수업 ID / 코스 ID 감지 (사용자 글만)
  const lessonMatch = userText.match(/\b(?:수업\s*ID|lesson\s*id|class\s*id|코스\s*ID|강의\s*ID)\s*[:#]?\s*([a-zA-Z0-9_-]{4,20})\b/i)
  const lessonId = lessonMatch?.[1] ?? null
  // 4. 오류 코드 감지
  const errorMatch = combined.match(/(?:오류\s*코드|에러\s*코드|error\s*code|코드|code|errno)\s*[:#]?\s*(-?\d{2,10}|0x[0-9a-fA-F]+)\b/i)
  let errorCode = errorMatch?.[1] ?? null
  if (!errorCode) {
    if (/\b4001\b/.test(combined)) errorCode = "4001"
    else if (/\b2001\b/.test(combined)) errorCode = "2001"
    else if (/\b102\b/.test(combined)) errorCode = "errno 102"
    else if (/Connection failed/i.test(combined)) errorCode = "Connection failed"
    else if (/Duplicate/i.test(combined)) errorCode = "Duplicate IP"
  }

  // 5. 기기 / 단말 모델 감지. OPS·T1 은 낱말 경계로만(Oops·stops·VT100 제외).
  let deviceModel: string | null = null
  if (/Board\s*S?(?:65|75|86|98|110)|전자\s*칠판/i.test(combined)) {
    const inch = combined.match(/(65|75|86|98|110)\s*인치|S(65|75|86|98|110)/i)
    deviceModel = inch ? `ClassIn Board ${inch[1] ?? inch[2]}"` : "ClassIn Board (전자칠판)"
  } else if (/Cam\s*T1|T1\s*카메라|\bT1\b/i.test(combined)) {
    deviceModel = "ClassIn Cam T1"
  } else if (/\bOPS\b|Windows\s*1[01]|Win1[01]/.test(combined)) {
    deviceModel = "OPS Windows PC"
  } else if (/Android|태블릿/i.test(combined)) {
    deviceModel = "Android Client"
  } else if (/iPad|iOS/i.test(combined)) {
    deviceModel = "iPad / iOS"
  }

  // 6. 앱 버전 감지
  const versionMatch = userText.match(/\b(6\.\d+\.\d+(?:\.\d+)?)\b/)
  const appVersion = versionMatch?.[1] ?? null

  // 7. 시각 감지 (KST 및 UTC+8 변환)
  const timeMatch = userText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  const kstTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]} (KST)` : null
  const beijingTime = convertKstToBeijingTime(timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null)

  // 8. 결함 vs 요구사항 태깅
  let issueType: "bug" | "requirement" | "suspected_bug" = "bug"
  let issueTypeTag: EscalationContext["issueTypeTag"] = "【缺陷】"
  if (/(?:기능\s*요청|개선\s*요청|추가\s*요청|지원\s*희망|기능\s*제안|스펙\s*문의)/i.test(combined)) {
    issueType = "requirement"
    issueTypeTag = "【需求】"
  } else if (/(?:의심|간헐|원인\s*불명|확인\s*필요|추정)/i.test(combined)) {
    issueType = "suspected_bug"
    issueTypeTag = "【疑似缺陷】"
  }

  // 9. 도메인 — 점수식 분류(태그 area: 가 있으면 우선).
  const classification = classifyHqDomain(combined, input.tags ?? [])
  const contact = HQ_DOMAINS[classification.domain] ?? HQ_DOMAINS.general

  // 현상 요약: 사용자 글 첫 줄(가림 적용). 가린 개수는 사용자 글 전체 기준이다(초안 위 "개인정보 N건" 문구).
  const firstLine = userText.split("\n").map((line) => line.trim()).find(Boolean)
  const symptom = redactInternalCsDraft(firstLine ? firstLine.slice(0, 200) : "")
  const userRedactions = redactInternalCsDraft(`${title}\n${userText}`).count
  const priority = typeof input.priority === "string" && input.priority.trim() ? input.priority.trim() : null

  return {
    domain: contact.domain,
    contact,
    confidence: classification.confidence,
    candidates: classification.candidates,
    krTopic: classification.krTopic,
    institution,
    hasAccountId,
    lessonId,
    lessonName: null,
    errorCode,
    deviceModel,
    appVersion,
    kstTime,
    beijingTime,
    issueType,
    issueTypeTag,
    symptomSummary: symptom.text || "증상 상세 확인 필요",
    priority,
    assigneeName: input.assigneeName ?? null,
    redactionCount: userRedactions + institutionResult.count,
  }
}

function finalize(lines: string[]) {
  // 마지막 방어선: 위 칸들은 이미 가린 값이지만, 조립된 글 전체를 한 번 더 거른다(멱등).
  return redactInternalCsDraft(lines.join("\n")).text
}

function accountLine(context: EscalationContext) {
  return context.hasAccountId ? `${DRAFT_PLACEHOLDER} (대화에 계정 ID 있음 — 공유 범위 확인 뒤 직접 입력)` : DRAFT_PLACEHOLDER
}

/**
 * 1. HQ 보고 템플릿 v2 (중국어 발송용 + English + 한국어 사내참조)
 * 원칙: 완충 표현, UTC+8 북경 시각 자동 변환, 결함 태그, 담당자 WeCom 멘션.
 * 계정 ID 는 넣지 않는다(국외 공유 범위 미정 — 결정 3). 한국 지사가 확인한 사항은 담당자가 채운다.
 */
export function buildSmartHqDraft(context: EscalationContext): string {
  const accountStr = accountLine(context)
  const orgStr = context.institution ?? "확인 필요"
  const lessonStr = context.lessonId ?? "확인 필요"
  const timeStr = context.beijingTime ?? "확인 필요 (北京时间, UTC+8)"
  const deviceStr = context.deviceModel ?? "확인 필요"
  const osStr = "Windows / Android 확인 필요"
  const verStr = context.appVersion ?? "6.0.x 확인 필요"
  const errorInfoStr = context.errorCode ? `에러 코드/문구: ${context.errorCode}` : "세부 지표 점검 필요"

  return finalize([
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
    `- 韩国分社已确认事项: ${DRAFT_PLACEHOLDER}`,
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
    `Korea branch checks : ${DRAFT_PLACEHOLDER}`,
    "",
    `// ==========================================`,
    `// [한국어 사내 참조용]`,
    `// ==========================================`,
    `[KR-CS][${context.contact.recommendedTag}] ${context.institution ?? "고객사"} - ${context.contact.domainLabel} 확인 요청`,
    `- HQ 담당: ${context.contact.primaryContact} (${context.contact.remoteTool ?? "원격 지원"})`,
    `- 발생 시각: ${context.kstTime ?? "미확인 (KST)"}`,
    `- 현상 요약: ${context.symptomSummary}`,
    `- 한국 지사 확인 사항: ${DRAFT_PLACEHOLDER}`,
    `- 가이드 팁: ${context.contact.guidanceTip}`,
    ...(context.contact.channelNote ? [`- 다른 경로: ${context.contact.channelNote}`] : []),
    `- 담당표 근거: ${context.contact.source} (문서 기준일 ${context.contact.verifiedAt})`,
  ])
}

/**
 * 2. 사내 인수인계 / CRM용 템플릿. 우선순위는 대화 값을 따르고, 확인한 사실·고객 안내 상태는 담당자가 채운다.
 */
export function buildSmartInternalHandoffDraft(context: EscalationContext): string {
  const priority = context.priority ? context.priority.toUpperCase() : DRAFT_PLACEHOLDER
  return finalize([
    `[CS-CASE] ${context.institution ? `[${context.institution}] ` : ""}${context.contact.domainLabel} 건 인수인계`,
    `우선순위 / 태그: ${priority} / ${context.contact.recommendedTag}`,
    `HQ 소통 경로: ${context.contact.primaryContact} (도구: ${context.contact.remoteTool ?? "RustDesk"})`,
    `식별 정보: 기관 [${context.institution ?? "미확보"}] · 계정 ${accountLine(context)} · 수업 [${context.lessonId ?? "미확보"}]`,
    `단말 환경: ${context.deviceModel ?? "기기 확인 필요"} · 버전 ${context.appVersion ?? "미확인"}`,
    `현상 및 에러: ${context.symptomSummary}${context.errorCode ? ` (코드: ${context.errorCode})` : ""}`,
    `확인된 사실: ${DRAFT_PLACEHOLDER}`,
    `고객 안내 상태: ${DRAFT_PLACEHOLDER}`,
    "다음 조치: HQ 회신 대기",
    `담당 매니저: ${context.assigneeName ?? "지정 필요"}`,
  ])
}

export const buildSmartHandoffMessage = buildSmartInternalHandoffDraft

const MAX_MESSAGES = 200
const MAX_MESSAGE_LENGTH = 8_000
const MAX_TAGS = 50

function optionalText(value: unknown, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : null
}

/**
 * API 요청 본문을 EscalationInput 으로 거른다. 모양이 틀리면 null(라우트는 400).
 * 글 개수·길이에 상한을 둔다 — 초안은 첫 줄과 짧은 값만 쓰므로 잘라도 결과가 같다.
 */
export function parseEscalationInput(body: unknown): EscalationInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  if (!Array.isArray(raw.userMessages) || !raw.userMessages.every((item) => typeof item === "string")) return null
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || !raw.tags.every((item) => typeof item === "string"))) return null
  const context = raw.customerContext
  if (context !== undefined && context !== null && (typeof context !== "object" || Array.isArray(context))) return null
  return {
    userMessages: (raw.userMessages as string[]).slice(-MAX_MESSAGES).map((item) => item.slice(0, MAX_MESSAGE_LENGTH)),
    customerContext: (context as Record<string, unknown> | null | undefined) ?? null,
    title: optionalText(raw.title),
    tags: ((raw.tags as string[] | undefined) ?? []).slice(0, MAX_TAGS).map((item) => item.slice(0, 100)),
    priority: optionalText(raw.priority, 40),
    assigneeName: optionalText(raw.assigneeName, 100),
  }
}

/** 화면이 받는 결과 — 분류 컨텍스트와 두 초안. 채널과 무관하다(어드민 화면·나중의 위컴 응답이 같이 쓴다). */
export function buildEscalationResult(input: EscalationInput): EscalationResult {
  const context = extractEscalationContext(input)
  return {
    context,
    hqDraft: buildSmartHqDraft(context),
    handoffDraft: buildSmartInternalHandoffDraft(context),
  }
}
