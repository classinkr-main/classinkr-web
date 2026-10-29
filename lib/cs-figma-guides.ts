import { CURATED_CS_FIGMA_GUIDES } from "@/lib/cs-figma-curated-guides"
import { CS_FIGMA_DIGEST_GUIDES } from "@/lib/cs-figma-guides.generated"
import { CS_FIGMA_GUIDE_ALIASES } from "@/lib/cs-figma-guide-aliases"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"

export { CURATED_CS_FIGMA_GUIDES } from "@/lib/cs-figma-curated-guides"

export type CsFigmaGuideCategory = "classroom" | "admin" | "troubleshooting" | "onboarding"
export type CsFigmaGuideDocCategory = "teacher" | "admin" | "student" | "start"

export interface CsFigmaGuide {
  slug: string
  docSlug: string
  docCategory: CsFigmaGuideDocCategory
  category: CsFigmaGuideCategory
  title: string
  audience: string
  summary: string
  keywords: string[]
  steps: string[]
  deepDive: {
    level: "1단계" | "2단계" | "3단계"
    title: string
    body: string
    checks: string[]
  }[]
  sourceImageFiles: string[]
  sourceDigestLineHint: string
  // 사람이 다시 쓴 큐레이션 가이드의 공개 문서 갱신일. 없으면 캡처 판독 시점으로 계산한다.
  updatedAt?: string
}


// 생성 가이드(캡처 판독본) 중 사내 전용 화면(직원 계정 비밀번호 재설정, 사용자 수업 이력·품질 진단), 번역 작업 화면,
// 충전·결제 금액과 계정 잔액이 찍힌 캡처, 예시 학원명이 제목인 대응 메모, 빈 캡처는 공개 문서와 챗봇 답변 어디에도 내보내지 않는다.
// (생성 파일은 스크립트가 다시 만들므로 여기서 거른다.) 이 가이드들의 원본 캡처 파일은 URL 로도 열리지 않도록
// public/docs/files/cs-figma/ 에서 뺐다(2026-10-29). 다시 내보낼 때도 이 화면들은 공개 폴더에 넣지 않는다.
const INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS = new Set([
  "cs-figma-digest-881",
  "cs-figma-digest-1385",
  "cs-figma-digest-1402",
  "cs-figma-digest-1427",
  "cs-figma-digest-1895",
  "cs-figma-digest-1914",
  "cs-figma-digest-1936",
  "cs-figma-digest-1960",
  "cs-figma-digest-757",
  "cs-figma-digest-1492",
  "cs-figma-digest-689",
  "cs-figma-digest-2256",
  "cs-figma-digest-1988",
  "cs-figma-digest-2017",
])

// 남은 생성 가이드 텍스트에서 직원 이름·테스트 계정·예시 학원명·계정 잔액·내부 표현을 문서와 챗봇 공통으로 걷어 낸다.
// 이미지 매핑에 쓰는 slug·docSlug·sourceImageFiles 는 건드리지 않는다.
export function scrubCsFigmaCaptureText(value: string): string {
  return value
    .replace(/EEO[-_ ]?TEST[-_ ]?[A-Za-z0-9_-]*(?:\s+KIM\b)?/gi, "예시 계정")
    .replace(/Classin(?:\s*[-_]\s*|\s)(?:Liz|Hope)\b/g, "예시 계정")
    .replace(/Minjae(?:[ ._]?(?:Kim|sub))?(?:\s?\d+)?(?:\s*\(minjae\.kim\))?/gi, "예시 사용자")
    .replace(/Wayne\s+Kim|zhangsan\d*/gi, "예시 사용자")
    .replace(/\s*\(?EEO\d{4,}\)?/g, "")
    .replace(/학원[A-Z](?![A-Za-z])\s*(?=학원용)/g, "")
    .replace(/학원[A-Z](?![A-Za-z])/g, "예시 학원")
    .replace(/[,，·]?\s*계정\s*잔액\s*\(?\s*[¥₩$]\s*-?\s*\d+(?:[.,]\d+)*\s*\)?/g, "")
    .replace(/\s*(?:\(₩\s?[\d,.]+\)|₩\s?[\d,.]+)/g, "")
    .replace(
      /[,，·]?\s*(?:스토리지|사용된\s*저장\s*용량)\s*(?:\(\s*[\d.]+\s*G\s*\/\s*[\d.]+\s*G\s*\)|[\d.]+\s*G\s*\/\s*[\d.]+\s*G)/g,
      ""
    )
    .replace(/월별\s*무료\s*수업\s*\d+\s*회\s*[,，]?\s*/g, "")
    .replace(/\s*\((?:CNY|KRW|USD)\)/g, "")
    .replace(/CS\s*주의사항/g, "주의사항")
    .replace(/\(\s*\)/g, "")
}

function scrubCsFigmaCaptureGuide(guide: CsFigmaGuide): CsFigmaGuide {
  return {
    ...guide,
    title: scrubCsFigmaCaptureText(guide.title),
    audience: scrubCsFigmaCaptureText(guide.audience),
    summary: scrubCsFigmaCaptureText(guide.summary),
    keywords: guide.keywords.map(scrubCsFigmaCaptureText),
    steps: guide.steps.map(scrubCsFigmaCaptureText),
    deepDive: guide.deepDive.map((item) => ({
      ...item,
      title: scrubCsFigmaCaptureText(item.title),
      body: scrubCsFigmaCaptureText(item.body),
      checks: item.checks.map(scrubCsFigmaCaptureText),
    })),
  }
}

export const CS_FIGMA_GUIDES = [
  ...CURATED_CS_FIGMA_GUIDES,
  ...CS_FIGMA_DIGEST_GUIDES.filter((guide) => !INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS.has(guide.docSlug)).map(
    scrubCsFigmaCaptureGuide
  ),
] satisfies CsFigmaGuide[]

function normalizeGuideText(value: string) {
  return value
    .toLowerCase()
    .replace(/설졍/g, "설정")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// 한국어 조사 제거 — "마이크가"→"마이크", "옵션을"→"옵션"처럼 토큰이 haystack과 매칭되도록 한다.
const JOSA_SUFFIX_PATTERN =
  /(으로서|으로써|에서는|에게서|으로|에서|에게|한테|까지|부터|이나|라도|마저|조차|이라|에는|에도|보다|처럼|만큼|을|를|이|가|은|는|와|과|의|도|만|로|나|랑|에|께)$/
function stripJosa(token: string) {
  const stripped = token.replace(JOSA_SUFFIX_PATTERN, "")
  return stripped.length >= 2 ? stripped : token
}

function normalizeGuideTitleAliases(title: string) {
  const normalizedTitle = normalizeGuideText(title)
  const titleWithoutLeadingNumber = normalizedTitle.replace(/^\d+\s+/, "")
  return [...new Set([normalizedTitle, titleWithoutLeadingNumber])].filter(Boolean)
}

const CURATED_CS_FIGMA_GUIDE_SLUGS = new Set(CURATED_CS_FIGMA_GUIDES.map((guide) => guide.slug))

const CS_FIGMA_GUIDE_INDEX = CS_FIGMA_GUIDES.map((guide) => {
  const aliasKeywords = CS_FIGMA_GUIDE_ALIASES[guide.slug] ?? []
  const allKeywords = aliasKeywords.length > 0 ? [...guide.keywords, ...aliasKeywords] : guide.keywords
  return {
    guide,
    haystack: normalizeGuideText(
      [guide.title, guide.summary, allKeywords.join(" "), guide.steps.join(" ")].join(" ")
    ),
    isCurated: CURATED_CS_FIGMA_GUIDE_SLUGS.has(guide.slug),
    normalizedKeywords: allKeywords.map(normalizeGuideText).filter(Boolean),
    normalizedTitle: normalizeGuideText(guide.title),
    normalizedTitleAliases: normalizeGuideTitleAliases(guide.title),
  }
})

const PROCEDURE_INTENT_PATTERN =
  /어떻게|방법|순서|가이드|하는 법|어디|어느|위치|설정|업로드|다운로드|제출|삭제|업데이트|클릭|누르|선택|켜|끄|만들|생성|추가|확인|비활성화|활성화|첨부|바꾸|변경|등록|스캔|초대|가입/

const TROUBLE_SYMPTOM_PATTERN =
  /안\s*돼|안됨|끊|나가|튕|오류|문제\s*(있|발생|생기)|불가|실패|느려|꺼짐|안\s*켜|켜지지|안\s*나|안\s*들|안\s*보|안\s*떠|안\s*뜬|못\s*보|못\s*봐/

const BILLING_OR_PURCHASE_PATTERN =
  /요금|가격|비용|견적|결제|정기|단가|유료|무료|환불|계약|플랜|과금|수납|구매처|구매/

const HARDWARE_PRODUCT_INFO_PATTERN =
  /전자칠판|클래스인\s*보드|classin\s*board|\bboard\b|사이즈|크기|인치|모델|라인업|스펙|사양|무게|소비\s*전력|해상도|밝기|터치|ops|스탠드|벽걸이/

const KNOWLEDGE_DOC_QUERY_PATTERN =
  /도입|온보딩|전환|90일|22\s*가지|확인해야\s*할|확인\s*질문|얼마나\s*걸|기간|뭐부터|사례|후기|기능\s*전체|흔한\s*고민/

const POLICY_BOUNDARY_PATTERN =
  /권한|누가|정책|스토리지|용량|소유권|개인정보|서버|약관|저장\s*관리|관리할|관리\s*가능/

const POLICY_OR_CAPABILITY_QUESTION_PATTERN =
  /정책|가능(?:한가|해|한지|여부)?|되나|되나요|될까요|지원(?:하|되|여부)|누가|관리할|관리\s*가능|소유권|개인정보|서버|약관|용량|요금제|플랜|시청\s*제한|시청\s*횟수|플레이바|api|sdk|연동|crm|lms|라이브\s*&\s*플레이백|라이브\s*플레이백/

const RAW_CAPTURE_QUERY_PATTERN = /ai\s*board|new\s*course|빈\s*이미지/

const WEAK_GUIDE_KEYWORDS = new Set([
  "pc",
  "word",
  "excel",
  "학생",
  "모바일",
  "게시",
  "오류",
  "라이브",
  "플레이어",
  "업데이트",
])

const TOKEN_STOPWORDS = new Set([
  "수업",
  "학생",
  "교사",
  "강사",
  "관리자",
  "코스",
  "화면",
  "방법",
  "순서",
  "안내",
  "설정",
  "확인",
  "앱",
  "pc",
])

function isStrongGuideKeyword(normalizedKeyword: string) {
  if (!normalizedKeyword || WEAK_GUIDE_KEYWORDS.has(normalizedKeyword)) return false
  return normalizedKeyword.includes(" ") || normalizedKeyword.length >= 4
}

function hasQrInviteActivationIntent(normalizedQuestion: string) {
  const asksAboutInvite = /초대|링크|link|qr/.test(normalizedQuestion)
  const asksToEnable = /켜|활성화|허용|어디|설정|가능/.test(normalizedQuestion)
  return asksAboutInvite && asksToEnable
}

function isQrInviteActivationGuide(haystack: string) {
  return haystack.includes("코스 가입 허용") || haystack.includes("초대 활성화") || haystack.includes("초대 링크")
}

function isStudentQrScanGuide(haystack: string) {
  return haystack.includes("qr 코드 스캔") || haystack.includes("스캔으로 코스 가입")
}

function isGeneratedGuide(guide: CsFigmaGuide) {
  return guide.slug.startsWith("cs-figma-digest-")
}

function isDirectAnswerEligibleGuide(indexedGuide: (typeof CS_FIGMA_GUIDE_INDEX)[number]) {
  const { guide, haystack, normalizedTitle } = indexedGuide
  if (!isGeneratedGuide(guide)) return true
  if (normalizedTitle === "ai board" || normalizedTitle === "new course") return false
  if (normalizedTitle.includes("빈 이미지")) return false
  if (/^(frame|group|image)\s+\d+$/.test(normalizedTitle)) return false
  return !(
    haystack.includes("순수 ui 스크린샷") ||
    haystack.includes("별도의 안내 문구") ||
    haystack.includes("별도의 안내 설명") ||
    haystack.includes("단계별 설명 텍스트") ||
    haystack.includes("원본 화면을 확인합니다")
  )
}

function hasRecordingDownloadIntent(normalizedQuestion: string) {
  return /녹화|녹화본/.test(normalizedQuestion) && /다운로드|받|공유|링크/.test(normalizedQuestion)
}

function hasAppDownloadIntent(normalizedQuestion: string) {
  const asksDownload = /다운로드|설치|내려받/.test(normalizedQuestion)
  const asksApp = /클래스인|classin|앱|pc|windows|윈도우/.test(normalizedQuestion)
  const asksRecording = /녹화|녹화본|수업자료|pdf|리소스/.test(normalizedQuestion)
  return asksDownload && asksApp && !asksRecording
}

function hasAccountSignupProcedureIntent(normalizedQuestion: string) {
  const asksAboutSignup = /회원\s*가입|계정\s*만들|신규\s*가입/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|진행|완료|인증|가입/.test(normalizedQuestion)
  const asksRequiredPersonalInfo = /필요|개인정보|전화번호나|이메일만/.test(normalizedQuestion)
  return asksAboutSignup && asksProcedure && !asksRequiredPersonalInfo
}

function hasAccountDeletionProcedureIntent(normalizedQuestion: string) {
  const asksAboutAccount = /계정|회원/.test(normalizedQuestion)
  const asksAboutDeletion = /삭제|탈퇴|지우/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|진행|삭제|탈퇴/.test(normalizedQuestion)
  return asksAboutAccount && asksAboutDeletion && asksProcedure
}

function hasTransferStudentRegistrationIntent(normalizedQuestion: string) {
  const asksAboutTransferStudent = /편입생|참관생/.test(normalizedQuestion)
  const asksProcedure = /등록|추가|방법|순서|어디|선택/.test(normalizedQuestion)
  return asksAboutTransferStudent && asksProcedure
}

function hasCourseMemberManagementIntent(normalizedQuestion: string) {
  const asksAboutCourseMember = /코스\s*(구성원|멤버)|구성원\s*(추가|삭제)|멤버\s*(추가|삭제)/.test(
    normalizedQuestion
  )
  const asksProcedure = /추가|삭제|초대|방법|순서|어디|관리/.test(normalizedQuestion)
  return asksAboutCourseMember && asksProcedure
}

function hasCourseWideChatControlIntent(normalizedQuestion: string) {
  const asksAboutCourseChat = /코스.*채팅|전체\s*학생\s*채팅|학생\s*채팅/.test(normalizedQuestion)
  const asksAboutControl = /활성|비활성|금지|제한|허용|켜|끄|설정|방법|어디/.test(normalizedQuestion)
  return asksAboutCourseChat && asksAboutControl
}

function hasCourseCreateOrCloseIntent(normalizedQuestion: string) {
  const asksAboutCourse = /코스/.test(normalizedQuestion)
  const asksAboutLifecycle = /생성|만들|종료|삭제/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|생성|만들|종료|삭제/.test(normalizedQuestion)
  return asksAboutCourse && asksAboutLifecycle && asksProcedure
}

function hasLessonDeletionProcedureIntent(normalizedQuestion: string) {
  if (/수업\s*교사|담임\s*교사|교사\s*설정/.test(normalizedQuestion)) return false
  const asksAboutLessonDeletion =
    /수업\s*(일괄\s*)?삭제|삭제할\s*수업|수업\s*리소스.*삭제|수업\s*데이터.*삭제/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|리소스|데이터|삭제/.test(normalizedQuestion)
  return asksAboutLessonDeletion && asksProcedure
}

function hasDashboardWebLiveCreateProcedureIntent(normalizedQuestion: string) {
  const asksAboutWebLive = /웹\s*라이브|웹\s*생방송|생방송/.test(normalizedQuestion)
  const asksAboutDashboard = /대시보드|dashboard/.test(normalizedQuestion)
  const asksProcedure = /생성|만들|설정|방법|순서|게시|녹화/.test(normalizedQuestion)
  return asksAboutWebLive && asksAboutDashboard && asksProcedure
}

function hasElectronicBoardLocalRecordingProcedureIntent(normalizedQuestion: string) {
  const asksAboutElectronicBoard = /전자칠판|ifp|classin\s*board|클래스인\s*보드/.test(normalizedQuestion)
  const asksAboutLocalRecording = /로컬\s*녹화|현장\s*녹화/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|시작|종료|사용|녹화|안내/.test(normalizedQuestion)
  return asksAboutElectronicBoard && asksAboutLocalRecording && asksProcedure
}

function hasReplayValidityProcedureIntent(normalizedQuestion: string) {
  const asksAboutReplay = /다시보기|다시\s*보기|리플레이|플레이백/.test(normalizedQuestion)
  const asksAboutValidity = /유효|기간/.test(normalizedQuestion)
  const asksProcedure = /설정|방법|어디|변경|바꾸|선택/.test(normalizedQuestion)
  return asksAboutReplay && asksAboutValidity && asksProcedure
}

function hasReplayAnalyticsProcedureIntent(normalizedQuestion: string) {
  const asksAboutReplay = /다시보기|다시\s*보기|리플레이|플레이백/.test(normalizedQuestion)
  const asksAboutAnalytics =
    /시청\s*기록|시청\s*시간|시청\s*횟수|진도|학습\s*데이터|학습\s*분석|수업\s*데이터|표\s*사용자\s*정의\s*지표|대시보드/.test(normalizedQuestion)
  const asksProcedure = /확인|방법|어디|선택|지표|횟수|시간/.test(normalizedQuestion)
  return asksAboutReplay && asksAboutAnalytics && asksProcedure
}

function hasSharedDrivePermissionProcedureIntent(normalizedQuestion: string) {
  const asksAboutSharedDrive = /공유\s*드라이브/.test(normalizedQuestion)
  const asksAboutPermission = /권한|접근|구성원|초대|읽기\s*전용|부여/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|설정|부여|추가|초대|선택|활성화|허용/.test(normalizedQuestion)
  return asksAboutSharedDrive && asksAboutPermission && asksProcedure
}

function hasSubAccountSettingsProcedureIntent(normalizedQuestion: string) {
  const asksAboutSubAccount = /하위\s*계정|권한\s*관리/.test(normalizedQuestion)
  const asksProcedure = /설정|추가|권한|방법|등록|생성|편집|삭제/.test(normalizedQuestion)
  return asksAboutSubAccount && asksProcedure
}

function hasStorageDeletionProcedureIntent(normalizedQuestion: string) {
  const asksAboutStorage = /스토리지|저장\s*공간|리소스/.test(normalizedQuestion)
  const asksAboutDeletion = /삭제|자동\s*삭제|정리/.test(normalizedQuestion)
  const asksProcedure = /방법|안내|설정|활성화|삭제|어디|순서/.test(normalizedQuestion)
  return asksAboutStorage && asksAboutDeletion && asksProcedure
}

function hasAccountUsageDetailProcedureIntent(normalizedQuestion: string) {
  const asksAboutAccount = /계정/.test(normalizedQuestion)
  const asksAboutUsageDetail = /세부\s*사용\s*내역|사용\s*내역|상세\s*내역/.test(normalizedQuestion)
  const asksProcedure = /확인|방법|어디|조회|보기/.test(normalizedQuestion)
  return asksAboutAccount && asksAboutUsageDetail && asksProcedure
}

function hasLessonTeacherSettingsProcedureIntent(normalizedQuestion: string) {
  const asksAboutLessonTeacher = /수업\s*교사|교사\s*설정|교사로\s*설정/.test(normalizedQuestion)
  const asksProcedure = /설정|삭제|변경|방법|순서|대량\s*작업/.test(normalizedQuestion)
  return asksAboutLessonTeacher && asksProcedure
}

function hasCourseTeacherChangeProcedureIntent(normalizedQuestion: string) {
  if (/수업\s*교사/.test(normalizedQuestion)) return false
  const asksAboutCourse = /코스|담임\s*교사|교사로\s*설정/.test(normalizedQuestion)
  const asksAboutTeacherChange = /교사.*변경|변경.*교사|담임\s*교사|교사로\s*설정/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|변경|설정|추가|선택/.test(normalizedQuestion)
  return asksAboutCourse && asksAboutTeacherChange && asksProcedure
}

function hasStudentNicknameSyncProcedureIntent(normalizedQuestion: string) {
  const asksAboutStudent = /학생|사용자/.test(normalizedQuestion)
  const asksAboutNickname = /닉네임|실명|본명/.test(normalizedQuestion)
  const asksAboutSync = /동기화|동일|맞추|추가|활성화|설정/.test(normalizedQuestion)
  return asksAboutStudent && asksAboutNickname && asksAboutSync
}

function hasCourseNicknameOptionIntent(normalizedQuestion: string) {
  const asksAboutCourse = /코스|수업|클래스/.test(normalizedQuestion)
  const asksAboutNickname = /닉네임/.test(normalizedQuestion)
  const asksAboutOption = /옵션|허용|활성|비활성|켜|끄|수정|변경/.test(normalizedQuestion)
  return asksAboutCourse && asksAboutNickname && asksAboutOption
}

function hasElectronicBoardLogReportProcedureIntent(normalizedQuestion: string) {
  const asksAboutElectronicBoard = /전자칠판|ifp|classin\s*board/.test(normalizedQuestion)
  const asksAboutLogReport = /데이터\s*로그|로그\s*보고|소프트웨어\s*로그|보고/.test(normalizedQuestion)
  const asksProcedure = /방법|순서|어디|보고|제출|전송|첨부/.test(normalizedQuestion)
  return asksAboutElectronicBoard && asksAboutLogReport && asksProcedure
}

function hasClassinXReinstallProcedureIntent(normalizedQuestion: string) {
  const asksAboutClassinX = /classinx|클래스인x|강의실용/.test(normalizedQuestion)
  const asksAboutReinstall = /삭제|재설치|제거|설치/.test(normalizedQuestion)
  return asksAboutClassinX && asksAboutReinstall
}

function hasKnownWebLiveChatVisibilityIntent(normalizedQuestion: string) {
  const asksAboutWebLive = /웹\s*라이브|생방송/.test(normalizedQuestion)
  const asksAboutChat = /채팅|메시지|메세지|실시간/.test(normalizedQuestion)
  const asksAboutVisibility = /안\s*보|보이|보여|노출|표시|학생/.test(normalizedQuestion)
  return asksAboutWebLive && asksAboutChat && asksAboutVisibility
}

function hasLateJoinedStudentReplayIntent(normalizedQuestion: string) {
  const asksAboutReplay = /다시보기|녹화본|리플레이/.test(normalizedQuestion)
  const mentionsSpecificPreviousLesson =
    /이전\s*수업|과거\s*수업|지난\s*수업|지난\s*강의|1강|첫\s*수업/.test(normalizedQuestion)
  const mentionsAffectedStudent = /학생|수강생|편입생|참관생/.test(normalizedQuestion)
  const mentionsLateJoin =
    /수업\s*(?:후|끝나고|종료.*후).*가입|나중에\s*(?:가입|들어)|뒤늦게\s*(?:가입|등록|합류)|새로\s*(?:가입|참여|들어)|중간\s*(?:합류|등록)|가입.*(?:후|뒤).*이전|편입.*이전/.test(
      normalizedQuestion
    )
  const asksAboutAccess = /안\s*(?:떠|뜬|보|나)|못\s*(?:보|봐)|시청|권한|허용|설정|보이|볼\s*수/.test(
    normalizedQuestion
  )
  const explicitLateJoinAccess = mentionsLateJoin && asksAboutAccess
  const specificReplaySymptom =
    mentionsAffectedStudent && mentionsSpecificPreviousLesson && (asksAboutReplay || asksAboutAccess)
  return explicitLateJoinAccess || specificReplaySymptom
}

function findKnownCsFigmaIntentSlug(normalizedQuestion: string) {
  if (hasAccountSignupProcedureIntent(normalizedQuestion)) return "classin-account-signup"
  if (hasAccountDeletionProcedureIntent(normalizedQuestion)) return "classin-account-delete"
  if (hasTransferStudentRegistrationIntent(normalizedQuestion)) return "transfer-student-registration"
  if (hasCourseMemberManagementIntent(normalizedQuestion)) return "course-member-management"
  if (hasCourseWideChatControlIntent(normalizedQuestion)) return "course-wide-chat-control"
  if (hasCourseCreateOrCloseIntent(normalizedQuestion)) return "course-create-and-close"
  if (hasLateJoinedStudentReplayIntent(normalizedQuestion)) return "cs-figma-digest-1054"
  if (hasKnownWebLiveChatVisibilityIntent(normalizedQuestion)) return "web-live-create"
  if (hasDashboardWebLiveCreateProcedureIntent(normalizedQuestion)) return "cs-figma-digest-350"
  if (hasElectronicBoardLocalRecordingProcedureIntent(normalizedQuestion)) return "cs-figma-digest-449"
  if (hasReplayValidityProcedureIntent(normalizedQuestion)) return "cs-figma-digest-982"
  if (hasReplayAnalyticsProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1558"
  if (hasSharedDrivePermissionProcedureIntent(normalizedQuestion)) return "cs-figma-digest-940"
  if (hasSubAccountSettingsProcedureIntent(normalizedQuestion)) return "cs-figma-digest-919"
  if (hasStorageDeletionProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1294"
  if (hasAccountUsageDetailProcedureIntent(normalizedQuestion)) return "cs-figma-digest-633"
  if (hasLessonTeacherSettingsProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1004"
  if (hasCourseTeacherChangeProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1035"
  if (hasStudentNicknameSyncProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1102"
  if (hasCourseNicknameOptionIntent(normalizedQuestion)) return "cs-figma-digest-1131"
  if (hasLessonDeletionProcedureIntent(normalizedQuestion)) return "cs-figma-digest-655"
  if (hasElectronicBoardLogReportProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1516"
  if (hasClassinXReinstallProcedureIntent(normalizedQuestion)) return "cs-figma-digest-1863"
  return null
}

const POLICY_BOUNDARY_ALLOWED_KNOWN_INTENT_SLUGS = new Set([
  "cs-figma-digest-919",
  "cs-figma-digest-940",
  "cs-figma-digest-1294",
])

export function findCsFigmaGuideForQuestion(question: string): CsFigmaGuide | null {
  const normalized = normalizeGuideText(question)
  if (!normalized) return null

  const hasProcedureIntent = PROCEDURE_INTENT_PATTERN.test(normalized)
  const hasInviteActivationIntent = hasQrInviteActivationIntent(normalized)
  const hasRecordingDownload = hasRecordingDownloadIntent(normalized)
  const hasAppDownload = hasAppDownloadIntent(normalized)
  const knownIntentSlug = findKnownCsFigmaIntentSlug(normalized)
  if (RAW_CAPTURE_QUERY_PATTERN.test(normalized)) return null
  if (BILLING_OR_PURCHASE_PATTERN.test(normalized)) return null
  if (POLICY_OR_CAPABILITY_QUESTION_PATTERN.test(normalized)) return null
  if (HARDWARE_PRODUCT_INFO_PATTERN.test(normalized) && !knownIntentSlug) return null
  if (KNOWLEDGE_DOC_QUERY_PATTERN.test(normalized) && !knownIntentSlug) return null
  if (
    POLICY_BOUNDARY_PATTERN.test(normalized) &&
    !POLICY_BOUNDARY_ALLOWED_KNOWN_INTENT_SLUGS.has(knownIntentSlug ?? "")
  ) {
    return null
  }
  // 증상형 질문("안 돼요/안 켜져요/오류")도 관련 how-to 가이드로 매칭하되, 답변에서 상담 연결을 함께 제안한다.
  const hasSymptomIntent = TROUBLE_SYMPTOM_PATTERN.test(normalized)

  const tokens = [...new Set(
    normalized
      .split(" ")
      .filter((token) => token.length >= 2 && !TOKEN_STOPWORDS.has(token))
      .flatMap((token) => {
        const stripped = stripJosa(token)
        return stripped !== token && !TOKEN_STOPWORDS.has(stripped) ? [token, stripped] : [token]
      })
  )]
  const scored = CS_FIGMA_GUIDE_INDEX.filter(isDirectAnswerEligibleGuide).map(({ guide, haystack, isCurated, normalizedKeywords, normalizedTitleAliases }) => {
    let score = 0
    let strongKeywordHits = 0
    let weakKeywordHits = 0
    let tokenHits = 0
    const matchedKeywords = new Set<string>()

    for (const normalizedKeyword of normalizedKeywords) {
      if (!normalized.includes(normalizedKeyword)) continue
      if (matchedKeywords.has(normalizedKeyword)) continue
      matchedKeywords.add(normalizedKeyword)

      if (isStrongGuideKeyword(normalizedKeyword)) {
        score += 12
        strongKeywordHits += 1
      } else if (hasProcedureIntent || hasSymptomIntent) {
        score += 4
        weakKeywordHits += 1
      }
    }

    const titleMatched = normalizedTitleAliases.some((titleAlias) => normalized.includes(titleAlias))
    if (titleMatched) score += 24

    for (const token of tokens) {
      if (haystack.includes(token)) tokenHits += 1
    }
    score += Math.min(tokenHits, 6)

    if (hasProcedureIntent || hasSymptomIntent) score += 4
    if (isCurated && (titleMatched || strongKeywordHits > 0 || tokenHits >= 1)) score += 8
    const inviteActivationMatched =
      hasInviteActivationIntent &&
      guide.slug !== "course-member-management" &&
      isQrInviteActivationGuide(haystack)
    if (hasInviteActivationIntent) {
      if (inviteActivationMatched) score += 16
      if (guide.slug === "course-member-management") score -= 16
      if (!normalized.includes("스캔") && isStudentQrScanGuide(haystack)) score -= 12
    }
    if (hasRecordingDownload && guide.slug === "recording-download-share") score += 24
    if (hasAppDownload) {
      if (guide.slug === "classin-app-download") score += 36
      if (guide.slug === "cs-figma-digest-1602") score += 12
      if (haystack.includes("수업 녹화 데이터") || haystack.includes("녹화본 다운로드")) score -= 16
    }
    const knownIntentMatched = knownIntentSlug === guide.slug
    if (knownIntentMatched) score += 36

    return {
      guide,
      score,
      strongKeywordHits,
      weakKeywordHits,
      titleMatched,
      tokenHits,
      inviteActivationMatched,
      knownIntentMatched,
    }
  }).sort((left, right) => right.score - left.score)

  const top = scored[0]
  if (!top || top.score < 16) return null
  if (!hasProcedureIntent && !hasSymptomIntent && !knownIntentSlug) return null
  if (
    !top.titleMatched &&
    top.strongKeywordHits === 0 &&
    top.weakKeywordHits < 2 &&
    !top.inviteActivationMatched &&
    !top.knownIntentMatched &&
    top.tokenHits < 3
  ) {
    return null
  }
  return top.guide
}

// 증상형 질문 여부 — service에서 fast-path 답변에 상담 연결 제안을 붙일지 판단할 때 사용한다.
export function isCsFigmaSymptomQuestion(question: string) {
  const normalized = normalizeGuideText(question)
  if (!normalized) return false
  return TROUBLE_SYMPTOM_PATTERN.test(normalized)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function sanitizeGuideAnswerText(value: string, hiddenTerms: string[] = []) {
  let sanitized = value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "링크")
    .replace(/\s+/g, " ")
    .trim()

  for (const term of hiddenTerms) {
    const normalizedTerm = term.replace(/\s+/g, " ").trim()
    if (!normalizedTerm) continue
    sanitized = sanitized.replace(new RegExp(escapeRegExp(normalizedTerm), "g"), "").trim()
  }

  return sanitized.replace(/\s+/g, " ").trim()
}

function compactGuideAnswerText(value: string, hiddenTerms: string[], maxLength = 120) {
  const sanitized = sanitizeGuideAnswerText(value, hiddenTerms)
  if (sanitized.length <= maxLength) return sanitized
  return `${sanitized.slice(0, maxLength - 3).trim()}...`
}

// 캡처 제작·검수 과정에서만 의미가 있는 메타데이터. 생성형 가이드의 deepDive에
// 이런 메모가 섞여 있어도 공개 CS 답변에는 절대 노출하지 않는다.
export const INTERNAL_GUIDE_PRODUCTION_NOTE_RE =
  /원본\s*(?:이미지|캡처|화면|파일)|회색\s*(?:빈\s*)?(?:플레이스홀더|박스|영역)|플레이스홀더|export(?:되지|되지\s*않|에서|\s*상태)|스크린샷\s*(?:자리|영역|상태)|스텝\s*\d+\s*스크린샷|\d+\s*단계\s*스크린샷|프로필\s*\(\s*블러|실제\s*화면\s*캡처|캡션만|이미지\s*(?:없음|누락)|source\s*digest|cs\s*주의사항/i

function isPublicGuideText(value: string) {
  return Boolean(value.trim()) && !INTERNAL_GUIDE_PRODUCTION_NOTE_RE.test(value)
}

// 단계/팁 텍스트에서 화면 주석("(…빨간 박스/화살표/표시…)"), 예시 식별자("예: 1026165787"),
// 전화/계정 숫자, 피그마/캡처 표현을 제거해 소비자용으로 정리한다.
export function sanitizeGuideStep(value: string, hiddenTerms: string[] = []) {
  const sanitized = sanitizeGuideAnswerText(value, hiddenTerms)
    .replace(/\([^)]*(?:빨간|박스|화살표|주석|강조)[^)]*표시[^)]*\)/g, "")
    .replace(/\([^)]*(?:빨간\s*박스|화살표|주석|강조|표시)[^)]*\)/g, "")
    .replace(/[,，]?\s*예\s*[:：]\s*[\d\s-]{3,}/g, "")
    .replace(/\d{7,}/g, "")
    .replace(/Figma\s*CS\s*캡처\s*보드/gi, "안내 화면")
    .replace(/Figma\s*CS\s*캡처/gi, "안내 화면")
    .replace(/CS\s*캡처/gi, "안내 화면")
    .replace(/Figma\s*(?:보드|캡처|캡쳐)/gi, "안내 화면")
    .replace(/원본\s*캡처/gi, "안내 화면")
    .replace(/\bFigma\b/gi, "안내 화면")
    .replace(/\(\s*[,，]?\s*\)/g, "")
    .replace(/\s+([.,)])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
  return sanitized
}

// enrichment 단계 본문(마크다운)을 챗봇 한 줄용 평문으로 평탄화한다.
function flattenEnrichmentBody(body: string, hiddenTerms: string[] = []) {
  const plain = body
    .replace(/\*\*/g, "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
  return sanitizeGuideStep(plain, hiddenTerms)
}

export function formatCsFigmaGuideAnswer(guide: CsFigmaGuide) {
  const hiddenTerms = guide.sourceImageFiles
  const enrichment = getCsFigmaEnrichment(guide.docSlug)

  // 소비자용 보강이 있으면 문서 페이지와 동일한 정리된 단계/톤을 그대로 쓴다.
  if (enrichment) {
    const stepLines = enrichment.stages.map((stage, index) => {
      const title = stage.title.replace(/^\d+\.\s*/, "").trim()
      const body = flattenEnrichmentBody(stage.body, hiddenTerms)
      return body ? `${index + 1}. ${title} — ${body}` : `${index + 1}. ${title}`
    })
    const blocks = [enrichment.intro, stepLines.join("\n")]
    if (enrichment.tips && enrichment.tips.length > 0) {
      const tipLines = enrichment.tips.map((tip) => `- ${flattenEnrichmentBody(tip, hiddenTerms)}`)
      blocks.push(`알아두면 좋은 점\n${tipLines.join("\n")}`)
    }
    return blocks.join("\n\n")
  }

  const publicSteps = guide.steps
    .map((step) => sanitizeGuideStep(step, hiddenTerms))
    .filter(isPublicGuideText)
  const stepLines = publicSteps.map((step, index) => `${index + 1}. ${step}`)
  const deepDiveLines = guide.deepDive
    .filter((item) => !/순서\s*그대로\s*안내/.test(item.title))
    .flatMap((item) => {
      const title = sanitizeGuideStep(item.title, hiddenTerms)
      if (!isPublicGuideText(title)) return []
      const checks = item.checks
        .slice(0, 2)
        .map((check) => compactGuideAnswerText(sanitizeGuideStep(check, hiddenTerms), hiddenTerms, 88))
        .filter(isPublicGuideText)
        .join(" / ")
      if (!checks) return []
      return [`- ${item.level} ${title}: ${checks}`]
    })

  return [
    "아래 순서대로 따라 하시면 됩니다.",
    stepLines.join("\n"),
    deepDiveLines.length > 0 ? `함께 확인할 것\n${deepDiveLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const SUGGESTION_KEYWORD_BLOCKLIST = new Set([
  "pc",
  "word",
  "excel",
  "qr",
  "설정 옵션",
  "link 등",
])

function isUsefulSuggestionKeyword(keyword: string, guide: CsFigmaGuide) {
  const normalizedKeyword = normalizeGuideText(keyword)
  if (!normalizedKeyword) return false
  if (normalizeGuideText(guide.title) === normalizedKeyword) return false
  if (SUGGESTION_KEYWORD_BLOCKLIST.has(normalizedKeyword)) return false
  if (WEAK_GUIDE_KEYWORDS.has(normalizedKeyword)) return false
  if (!isStrongGuideKeyword(normalizedKeyword)) return false
  if (/^\d/.test(normalizedKeyword)) return false
  if (/\.(png|jpe?g|webp)$/i.test(keyword)) return false
  return true
}

export function buildCsFigmaGuideSuggestedQuestions(guide: CsFigmaGuide) {
  const candidates = [
    `${guide.title} 순서 알려줘`,
    ...guide.keywords
      .filter((keyword) => isUsefulSuggestionKeyword(keyword, guide))
      .map((keyword) => `${keyword} 방법 알려줘`),
  ]
  const seen = new Set<string>()

  return candidates
    .filter((question) => {
      const normalizedQuestion = normalizeGuideText(question)
      if (!normalizedQuestion || seen.has(normalizedQuestion)) return false
      seen.add(normalizedQuestion)
      return true
    })
    .slice(0, 3)
}

export function getCsFigmaGuideDocPath(guide: CsFigmaGuide) {
  return `/docs/${guide.docCategory}/${guide.docSlug}`
}
