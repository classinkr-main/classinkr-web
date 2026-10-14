import "server-only"

import type { InternalCsSourceRef } from "@/lib/internal-cs-chat/gemini"

export interface IncidentCase {
  id: string
  date: string
  customer: string
  category: "network" | "recording" | "camera" | "board" | "mirroring" | "audio" | "lms" | "ai" | "drive" | "api" | "billing" | "internal"
  symptom: string
  cause: string
  causeStatus: "확정" | "추정" | "미확정"
  status: "조치 완료" | "종결" | "현장 해소" | "진행" | "대기" | "미해결"
  keywords: string[]
  resolution: string
  workflowTips?: string[]
  hqContact?: string
  sourceDoc: string
}

export interface WorkflowFlow {
  id: string
  section: string
  title: string
  symptoms: string[]
  keywords: string[]
  steps: string[]
  verificationTests: string[]
  guidanceRules: string[]
  hqTemplateGuide: string
  sourceDoc: string
}

export interface IncidentEvidence {
  id: string
  caseId?: string
  title: string
  category: string
  org?: string
  summary: string
  workflowSteps?: string[]
  resolution?: string
  sourceFile: string
  score: number
}

// 2026-10-02 최신 기술지원 오류 케이스 인덱스 및 상세 선례 (76건 핵심 축약 및 주요 케이스)
export const INCIDENT_CASES: readonly IncidentCase[] = [
  // 1. 접속·네트워크 끊김
  {
    id: "D-02a",
    date: "07-30",
    customer: "정율사관 B3",
    category: "network",
    symptom: "수업 중 네트워크 끊김 (콘솔 UDB 4,419ms, TCP 7,972ms)",
    cause: "메인 NIC(ASIX)의 고정 IP 172.17.0.52가 다른 기기와 충돌해 유선 마비 및 Wi-Fi 폴백",
    causeStatus: "확정",
    status: "조치 완료",
    keywords: ["정율사관", "b3", "고정 ip 충돌", "ip 충돌", "asix", "172.17.0.52", "duplicate", "dhcp", "apipa", "169.254"],
    resolution: "ASIX 메인 어댑터를 DHCP(자동 IP)로 변경해 172.17.0.93 할당받아 유선 단독 동작 확인. 설치 규격은 메인 NIC 자동 IP, 카메라 NIC 192.168.1.222 고정.",
    workflowTips: ["ipconfig /all 원문 필수 확인", "Duplicate 표시는 배선 정상 반증"],
    hqContact: "于杰(네트워크)",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#1-접속네트워크-끊김",
  },
  {
    id: "D-02b",
    date: "08-08",
    customer: "정율사관 B4",
    category: "network",
    symptom: "수업 중 인터넷 끊김 제보였으나 실제로는 ClassIn 강제 종료(闪退) 2회",
    cause: "RAM 8GB OPS 메모리 부족(HQ 회신)",
    causeStatus: "확정",
    status: "대기",
    keywords: ["정율사관", "b4", "강제 종료", "튕김", "크래시", "메모리 부족", "가상 메모리", "12288", "12,288", "闪退", "8gb"],
    resolution: "HQ 于杰 승인 후 가상 메모리를 물리 RAM × 1.5인 12,288MB(초기=최대)로 수동 설정.",
    workflowTips: ["8GB OPS는 가상메모리 12,288MB 설정", "고객의 '인터넷 끊김' 표현을 로그로 강제 종료로 재정의"],
    hqContact: "于杰, Zhu Chenyang",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#1-접속네트워크-끊김",
  },
  {
    id: "D-18",
    date: "09-22",
    customer: "Sook's coaching",
    category: "network",
    symptom: "수업 중 교사 2회 이탈 (20:10:37, 20:42:48 둘 다 코드 57 - The server lost the client heartbeat)",
    cause: "클라이언트 프로세스 비정상 종료(크래시·프리즈 또는 PC 절전·전원 차단). 두 이탈 직후 신규 로그인 성공 기록 존재",
    causeStatus: "추정",
    status: "진행",
    keywords: ["sook", "숙스코칭", "sook's coaching", "코드 57", "code 57", "heartbeat", "하트비트", "절전 모드", "크래시", "로그인 성공"],
    resolution: "이탈 직후 신규 로그인이 있으면 프로세스 비정상 종료(크래시, 절전), 없으면 회선 단절(56)로 판별. 고객에게 절전 모드, 백신, Windows 이벤트 뷰어(1000/1001, Kernel-Power 41) 확인 요청.",
    workflowTips: ["신규 로그인 유무로 회선 vs 프로세스 종료 구분", "콘솔 품질 지표 Excellent 100%여도 순간 단절 가능"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#1-접속네트워크-끊김",
  },
  {
    id: "D-19",
    date: "09-22",
    customer: "12inedu",
    category: "network",
    symptom: "Android 기기 학생 41회 재입실, 매번 1~12초(중앙값 5초) 만에 끊김 (코드 56)",
    cause: "User Gateway는 정상(100%)이나 서버 연결만 Poor(41%)로 통신사→서버 구간 또는 세션/기기 측",
    causeStatus: "추정",
    status: "대기",
    keywords: ["12inedu", "12in", "코드 56", "code 56", "반복 퇴장", "재입실", "android", "안드로이드", "태블릿", "핫스팟", "기기 1대"],
    resolution: "공유기 재부팅, 모바일 핫스팟(LTE)으로 1회 수업해 회선 여부 가르기, 기기 1대만 로그인 확인.",
    workflowTips: ["초 단위 규칙적 끊김은 클라이언트/세션 의심", "핫스팟 실험으로 회선 문제 가르기"],
    hqContact: "ClassIn小助手-沙桐",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#1-접속네트워크-끊김",
  },
  {
    id: "D-20",
    date: "09-20",
    customer: "KJ영재센터 사직",
    category: "network",
    symptom: "최대화한 교사 화면이 수업 중 저절로 스테이지 기본 배치로 복귀를 반복",
    cause: "교사 PC가 코드 56으로 끊겨 자동 재입장하면서 최대화가 해제됨(정상 메커니즘 확인). 끊김은 Gateway 2nd(외부망) 불안정",
    causeStatus: "확정",
    status: "대기",
    keywords: ["kj영재", "kj영재센터", "사직", "최대화 해제", "최대화 풀림", "화면 복귀", "코드 56", "재접속", "gateway 2nd", "이영준"],
    resolution: "최대화 상태에서 재접속 시 최대화 풀림은 앱 정상 동작임을 확인. 고객에게 재현 영상과 함께 외부 회선 불안정 설명.",
    workflowTips: ["'화면이 저절로 돌아간다'는 코드 56 재입장부터 확인", "User Gateway 정상 + Gateway 2nd 저하면 공유기 밖 회선 의심"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#1-접속네트워크-끊김",
  },

  // 2. 녹화
  {
    id: "D-04",
    date: "08-13",
    customer: "가경이미숙국어학원 (가경관)",
    category: "recording",
    symptom: "2시간 54분 수업 후 녹화본 없음 ('영상 업로드 오류'로 제보)",
    cause: "해당 회차 생성 시점에 녹화 옵션이 꺼져 있었음 (Recording Settings: Disable, Start Lesson-recording 이벤트 부재)",
    causeStatus: "확정",
    status: "대기",
    keywords: ["가경관", "이미숙국어", "수업 녹화 미생성", "녹화 없음", "업로드 오류", "recording settings disable", "복구 불가", "녹화 옵션"],
    resolution: "원인(생성 시 녹화 비활성)과 복구 불가 회신. 고객 캡처 전달 시 Media Server명과 Port는 마스킹.",
    workflowTips: ["'업로드 오류' 표현을 '녹화 미생성'으로 재정의", "복구 불가는 원인 설명과 함께 안내(단독 통보 금지)"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#2-녹화",
  },
  {
    id: "D-21",
    date: "09-22",
    customer: "KJ영재센터 창원",
    category: "recording",
    symptom: "카메라 녹화 시작 표시는 있는데 파일 없음 (error code 4001)",
    cause: "녹화 시작 시점에 카메라 미지정(Camera Name 공란)으로 시작 1분 뒤 에러코드 4001로 중단",
    causeStatus: "확정",
    status: "종결",
    keywords: ["kj영재", "창원", "카메라 녹화", "현장 녹화", "파일 없음", "error code 4001", "4001", "카메라 미지정", "수업 스크린샷", "김성열"],
    resolution: "영상 복구 불가 안내 및 수업 스크린샷 260장 잔존 확인 안내. 다음 수업 절차([카메라 녹화] 패널 → 톱니바퀴 → 카메라 선택 → 완료 → 바로 녹화하기) 안내.",
    workflowTips: ["녹색 '현장 녹화가 시작되었습니다'는 시작 이벤트일 뿐 성공 보장 안 함", "영상 없어도 [수업 스크린샷] 판서 잔존 확인"],
    hqContact: "宁华 (ClassIn小助手)",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#2-녹화",
  },
  {
    id: "S-03",
    date: "06-30",
    customer: "에듀온픽",
    category: "recording",
    symptom: "Android 태블릿 호스트 수업 중 끊김 후 서버 녹화본이 2분·2초짜리만 남음",
    cause: "Android 모바일 기기는 네트워크 단절 시 로컬 녹화 전환(isSwitchToLocal)을 지원하지 않음(HQ 1차)",
    causeStatus: "추정",
    status: "미해결",
    keywords: ["에듀온픽", "android 녹화", "태블릿 녹화", "로컬 녹화 전환", "isswitchtolocal", "pc 호스트 권장", "최원섭"],
    resolution: "녹화가 중요한 정규 수업은 PC 호스트를 권장.",
    workflowTips: ["모바일/Android 호스트는 로컬 녹화 전환 불가 위험 사전 안내"],
    hqContact: "ClassIn小助手-宁华",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#2-녹화",
  },

  // 3. 카메라
  {
    id: "D-06",
    date: "08-21",
    customer: "과사람",
    category: "camera",
    symptom: "네트워크 카메라(TP-Link VIGI)가 일부 교실만 ClassIn X 직결되고 나머지는 OBS 우회(3~4초 지연)",
    cause: "RTSP 주소에서 rtsp://의 //가 누락됨 (포트 미기재). OBS는 받아들이고 ClassIn X는 안내 없이 거부",
    causeStatus: "확정",
    status: "대기",
    keywords: ["과사람", "rtsp", "rtsp 직결", "슬래시 누락", "vigi", "tp-link", "obs", "지연", "554"],
    resolution: "표준형 `rtsp://계정:비밀번호@IP:554/stream1`로 재등록. 비밀번호에 @가 있으면 %40으로 인코딩, 카메라 IP는 고정(DHCP 예약).",
    workflowTips: ["OBS에선 되는데 ClassIn X 직결 안 되면 // 누락부터 점검", "카메라 IP는 반드시 DHCP 예약 고정"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#3-카메라",
  },
  {
    id: "D-15a",
    date: "09-14",
    customer: "철의국어입시학원",
    category: "camera",
    symptom: "CameraCMS에서 T1 카메라 검색은 되는데 접속 실패 (Connection failed)",
    cause: "카메라 전용 고정 IP(192.168.1.222)가 카메라가 물리지 않은 다른 어댑터(NX USB)에 설정되어 실제 카메라 NIC은 APIPA(169.254)로 떨어짐",
    causeStatus: "확정",
    status: "현장 해소",
    keywords: ["철의국어", "철의국어입시", "cameracms", "카메라 인식", "connection failed", "192.168.1.222", "nic 오지정", "어댑터", "t1", "apipa"],
    resolution: "어댑터를 '사용 안 함'으로 끄고 CMS 재검색해 Search:0이 나오는 쪽이 카메라 연결 NIC임을 확정. 기존 어댑터에서 IP 제거 후 새 어댑터에 192.168.1.222/255.255.255.0(GW 공란) 부여.",
    workflowTips: ["'검색은 되나 접속 실패'는 IP 대역 불일치", "어댑터 비활성화 테스트로 실제 카메라 NIC 확정"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#3-카메라",
  },
  {
    id: "S-34",
    date: "09-15",
    customer: "KJ영재센터",
    category: "camera",
    symptom: "카메라용 이더넷 어댑터가 '네트워크 케이블 언플러그됨'으로 표시",
    cause: "PoE 인젝터 배선 역결선 (Data In과 Data+Power 포트 뒤바뀜)",
    causeStatus: "확정",
    status: "현장 해소",
    keywords: ["kj영재", "케이블 언플러그", "poe", "인젝터", "역결선", "data in", "data power", "급전 실패"],
    resolution: "PoE 인젝터의 Data+Power(카메라행)와 Data In(PC행) 정상 결선.",
    workflowTips: ["'케이블 언플러그됨' 시 PoE 인젝터 전원 및 포트 방향부터 확인"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#3-카메라",
  },
  {
    id: "D-16",
    date: "09-21",
    customer: "아이온영어",
    category: "camera",
    symptom: "T1 카메라 녹화 화질이 4K가 아니고 판서 글자가 뿌옇고 흰 화면 과노출",
    cause: "ClassIn X 녹화 상한은 1080p 고정(4K는 파노라마 스트림만), 흰 화면은 과노출",
    causeStatus: "확정",
    status: "대기",
    keywords: ["아이온영어", "t1 화질", "4k", "1080p", "녹화 화질", "과노출", "판서 흐림", "sunlogin", "원격 조정"],
    resolution: "HQ 기술자(张冰)가 SunLogin 원격으로 카메라 단 과노출 파라미터 조정. T1 직결 유지.",
    workflowTips: ["ClassIn X 녹화 상한은 1080p", "흰 바탕 글자 날아감은 과노출이며 카메라 단에서 조정"],
    hqContact: "Zhu Chenyang → 张冰(원격)",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#3-카메라",
  },

  // 4. 전자칠판·OPS·터치
  {
    id: "S-06",
    date: "07-15",
    customer: "지사 재고 검수 (S75)",
    category: "board",
    symptom: "ClassIn 자체 최소화 + 다른 프로그램 최대화 시 Windows 11 작업 표시줄 터치 무반응",
    cause: "ClassIn 판서 오버레이의 터치 좌표 판정 이슈 (일부 Win11 버전 기지 이슈)",
    causeStatus: "추정",
    status: "종결",
    keywords: ["win11", "작업 표시줄", "터치 무반응", "터치 먹통", "오버레이", "판서 오버레이", "s75", "ops"],
    resolution: "HQ가 클릭 모드에서 작업 표시줄 영역을 오버레이에서 제외하는 7/20 패치 배포. 임시로는 최대화 해제 또는 마우스 조작.",
    workflowTips: ["마우스와 터치 반응 비교로 소프트웨어 오버레이 분리"],
    hqContact: "Li Wei",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#4-전자칠판-하드웨어ops",
  },
  {
    id: "D-03",
    date: "08-12",
    customer: "이미숙국어 / NS 과학수학",
    category: "board",
    symptom: "86인치 2세대 전자칠판 화면에 구름·줄무늬 형태 백색 잔류물 발생 및 터치 민감도 소폭 저하",
    cause: "생산 배치 260318 또는 창고 보관 환경(결로) 추정",
    causeStatus: "미확정",
    status: "미해결",
    keywords: ["이미숙국어", "ns과학수학", "화면 잔류물", "백색 얼룩", "줄무늬", "터치 저하", "건식 와이핑", "세정제 금지", "86인치 2세대", "bs86a"],
    resolution: "건식 극세사 와이핑(세정제 절대 금지). 고객사에는 원인 확정 전까지 '확인 중'까지만 안내.",
    workflowTips: ["세정제·알코올 사용 금지 안내", "사진 촬영 시 정면 검정 화면 반사 없이 촬영"],
    hqContact: "Zhu Chenyang",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#4-전자칠판-하드웨어ops",
  },
  {
    id: "D-05",
    date: "08-14",
    customer: "쉴라의 영어 다이아그램",
    category: "board",
    symptom: "86인치 2세대 전자칠판 2대를 이동식 스탠드로 나란히 배치 시 고스트 터치 발생",
    cause: "인접 칠판 간 IR(적외선) 터치 센서 신호 상호 간섭",
    causeStatus: "추정",
    status: "미해결",
    keywords: ["쉴라", "쉴라의영어", "고스트 터치", "ir 간섭", "적외선 간섭", "이동식 스탠드", "칠판 2대", "이격 거리"],
    resolution: "두 칠판 사이 이격 거리 확보(최소 20~30cm 이상 실험 권장). HQ가 말한 10cm 수치를 확정 권장거리처럼 단독 안내 금지.",
    workflowTips: ["HQ의 일반론 수치를 현장에 단정 안내하지 말 것"],
    hqContact: "朱晨阳 (Zhu Chenyang)",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#4-전자칠판-하드웨어ops",
  },

  // 5. 계정·코스·청강생
  {
    id: "S-01",
    date: "06-03",
    customer: "고객 미상",
    category: "lms",
    symptom: "코스에서 제거한 학생이 지난 수업 기록에 '청강생(Transfer/插班生)'으로 계속 표시됨",
    cause: "코스 옵션 중 '학생이 코스를 떠났거나 코스가 해체되어도 코스 자료를 열람할 수 있도록 허용' 활성화 상태에서 삭제 시 과거 수업 신분 유지(정상 동작)",
    causeStatus: "확정",
    status: "종결",
    keywords: ["청강생", "학생 삭제", "코스 삭제", "기록 잔존", "transfer", "삽반생", "插班生", "코스 옵션"],
    resolution: "코스 옵션 확인 후 삭제 안내. 고객에게 내부 UID나 로그를 빼고 조작 방법만 카카오톡으로 안내.",
    workflowTips: ["'삭제했는데 남아 있다'는 코스 생성 옵션 확인"],
    hqContact: "Tong Guojie",
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#7-수업lms교실-기능",
  },
  {
    id: "S-04",
    date: "07-03",
    customer: "고객 미상 (Mac / Win 2곳)",
    category: "lms",
    symptom: "관리자 대시보드 진입 시 브라우저 자동 번역이 켜져 UI 한국어가 엉뚱하게 깨져 오류처럼 인식",
    cause: "브라우저(Chrome/Safari 등) 내장 자동 번역 기능이 리뉴얼 대시보드에서 발동",
    causeStatus: "추정",
    status: "대기",
    keywords: ["대시보드 번역", "자동 번역", "ui 깨짐", "관리자 콘솔", "브라우저 번역"],
    resolution: "브라우저 주소창 우측 또는 설정에서 '이 사이트 항상 번역 안 함' 설정 안내.",
    workflowTips: ["OS·브라우저 달라도 동일 증상이면 웹페이지 특성 분류"],
    sourceDoc: "docs/active/cs-error-cases-index-2026-10-02.md#11-결제sms콘솔",
  },
]

// 2026-10-02 증상별 5대 확인 흐름 매뉴얼
export const WORKFLOW_FLOWS: readonly WorkflowFlow[] = [
  {
    id: "flow-network-disconnection",
    section: "5-1",
    title: "수업 중 네트워크 끊김·튕김 확인 흐름",
    symptoms: ["수업 끊김", "수업 튕김", "재접속 반복", "인터넷 불안정", "코드 56", "코드 57"],
    keywords: ["코드 56", "코드 57", "code 56", "code 57", "네트워크 끊김", "튕김", "user gateway", "gateway 2nd", "핫스팟", "가상 메모리", "최대화"],
    steps: [
      "1. 관리 콘솔에서 퇴장 시각과 사유 코드를 확인한다. 'The customer actively leave the classroom'이고 종료 시각 근처면 정상 종료일 수 있다(S-13).",
      "2. 이탈 직후 신규 '로그인 성공' 기록이 있는지 확인한다. 있으면 프로세스 종료/크래시/절전 모드(D-18), 없으면 회선 단절(56)이다.",
      "3. 구간별 품질 지표를 판정한다:\n   - User Gateway 나쁨: 기기~공유기 구간(Wi-Fi, 케이블, IP 충돌)\n   - User Gateway 정상 + Gateway 2nd 지연: 공유기 바깥 외부 회선(건물·통신사)\n   - User/2nd 정상 + 서버 연결만 Poor: 통신사→서버 구간 또는 서버 측 세션",
      "4. 전자칠판 OPS인 경우 `ipconfig /all` 원문을 확인한다. RAM 8GB 기기는 가상 메모리를 12,288MB(초기=최대)로 설정한다(D-02b).",
      "5. 가르는 실험: 스마트폰 LTE 핫스팟으로 1회 접속 테스트 요청. 핫스팟에서도 발생하면 기기/서버, 핫스팟에서 정상이면 학원 회선으로 확정.",
      "6. 주의 사항: 코드 56으로 재접속 시 교사 화면 최대화는 저절로 기본 배치로 복귀된다(정상 동작, D-20).",
    ],
    verificationTests: [
      "핫스팟(LTE) 1회 수업 테스트로 학원 회선 vs 기기/서버 분리",
      "기기 1대만 로그인 상태 유지 점검",
      "ipconfig /all 로 Duplicate IP 및 APIPA(169.254) 여부 확인",
    ],
    guidanceRules: [
      "고객에게 '학원 전체 네트워크 문제'라고 단정하지 말고 확인된 범위(해당 기기)만 전달",
      "오류 코드, 서버명, IP, 계정 ID는 고객 안내문에서 제외",
    ],
    hqTemplateGuide: "네트워크 끊김 에스컬레이션 시 Media Server명, Port, Client IP, 구간 지연(User/2nd/Server) 필수 첨부",
    sourceDoc: "docs/active/cs-error-cases-workflow-rules-2026-10-02.md#5-1-수업-중-끊김튕김",
  },
  {
    id: "flow-recording-failure",
    section: "5-2",
    title: "수업·현장 녹화 미생성 및 녹화 오류 확인 흐름",
    symptoms: ["녹화 안 됨", "녹화본 없음", "영상 미생성", "녹화 오류", "에러 4001", "녹화 끊김"],
    keywords: ["녹화", "녹화 안 됨", "녹화본 없음", "녹화 오류", "4001", "카메라 미지정", "recording settings", "disable", "로컬 녹화", "스크린샷"],
    steps: [
      "1. 관리 콘솔 Recording Settings를 본다:\n   - Disable + Start 이벤트 없음: 회차 생성 시 녹화 옵션 OFF(D-04, 복구 불가)\n   - Enable + Start 있음 + Lesson-recording Error (4001): 카메라 미지정(Camera Name 공란) 상태로 시작되어 실패(D-21)\n   - Enable + Start + Quality Upload 정상인데 파일 없음: HQ 에스컬레이션",
      "2. 구성 확인: 교실 녹화 OFF + 카메라 녹화만 단독 ON인 경우 카메라 녹화 실패 시 대체 영상이 없다(단일 장애점).",
      "3. 코스 목록의 녹색 '현장 녹화가 시작되었습니다'는 시작 이벤트일 뿐 실제 파일 생성 성공을 보장하지 않는다.",
      "4. 판서 확인 대안: 녹화가 없더라도 기관 콘솔의 [수업 스크린샷]에서 판서 이미지 잔존 여부를 확인해 안내한다.",
      "5. 호스트 기기 확인: Android 호스트는 네트워크 끊김 시 로컬 녹화 전환을 지원하지 않아 녹화 누락 위험이 있다(S-03).",
      "6. 복구 가능 여부: 녹화 미생성 건은 데이터 자체가 없어 복구가 실질적으로 불가능함을 정중히 안내한다.",
    ],
    verificationTests: [
      "같은 계정 정상 수업과 Recording Settings, Status History 대조",
      "기관 콘솔 [수업 스크린샷] 메뉴에서 판서 캡처 잔존 여부 확인",
    ],
    guidanceRules: [
      "고객의 '업로드 오류' 표현을 '녹화 미생성'으로 첫 회신에서 교정",
      "복구 불가는 원인 설명과 함께 안내(단독 통보 금지)",
      "재발 방지 조작 절차([카메라 녹화] 창 톱니바퀴 → 카메라 선택 → 완료 → 바로 녹화하기) 안내",
    ],
    hqTemplateGuide: "녹화 실패 에스컬레이션 시 Lesson ID, 회차 생성 시각, Recording Settings, 교실/카메라 녹화 여부 첨부",
    sourceDoc: "docs/active/cs-error-cases-workflow-rules-2026-10-02.md#5-2-녹화",
  },
  {
    id: "flow-camera-connection",
    section: "5-3",
    title: "카메라 미인식 및 네트워크 연결 확인 흐름",
    symptoms: ["카메라 인식 안 됨", "카메라 안 잡힘", "cameracms 오류", "rtsp 연결 실패", "카메라 연결 끊김"],
    keywords: ["카메라", "cameracms", "카메라 인식", "192.168.1.222", "poe", "인젝터", "rtsp", "vigi", "t1", "케이블 언플러그", "ipconfig"],
    steps: [
      "1. 최근 자리 이동이나 공사 이력이 있는지 먼저 확인한다(배선 변경 의심).",
      "2. 고객에게 `ncpa.cpl`(네트워크 연결) 창 사진과 `ipconfig` 결과 사진을 요청한다(IPv4 속성 창은 건드리지 않게 주의).",
      "3. 카메라 NIC 상태 판정:\n   - '네트워크 케이블 언플러그됨': PoE 급전 실패 또는 인젝터 역결선(Data In과 Data+Power 포트 확인, S-34)\n   - 링크는 있으나 169.254.x.x (APIPA): 고정 IP 미적용. 192.168.1.222 적용 필요\n   - 한쪽은 192.168.1.222인데 CMS 검색만 되고 접속 실패: 엉뚱한 어댑터에 고정 IP가 들어감(D-15)",
      "4. 실제 카메라 NIC 판별: 어댑터 A를 '사용 안 함'으로 두고 CMS에서 재검색. `Search:0`이 나오면 A에 카메라가 연결되어 있음.",
      "5. IP 이전: 기존 어댑터에서 IP를 완전히 지우고 새 어댑터에 192.168.1.222 / 255.255.255.0(게이트웨이 공란) 부여 후 CMS에서 삭제 후 재등록.",
      "6. 타사 RTSP 카메라: 주소에 `rtsp://계정:비밀번호@IP:554/stream1` 표준형 확인. `rtsp://`의 `//` 누락 주의(D-06).",
      "7. T1 카메라 화질: ClassIn X 녹화 상한은 1080p 고정. 흰 화면 글자 날림은 과노출이며 카메라 단 파라미터 조정 필요(D-16).",
    ],
    verificationTests: [
      "ncpa.cpl 창 사진으로 어댑터별 장치명과 IP 대역 확인",
      "어댑터 끄기 테스트로 CameraCMS Search 결과 대조",
      "ping 192.168.1.x 및 554 포트 응답 확인",
    ],
    guidanceRules: [
      "카메라 NIC에는 게이트웨이·DNS를 비워 두어야 Wi-Fi 인터넷과 유선 카메라 병행 가능",
      "원인 확정 전 하드웨어 불량/결함 표현 금지",
    ],
    hqTemplateGuide: "카메라 에스컬레이션 시 T1 S/N, MAC, 펌웨어 버전, CameraCMS 연결 상태 스크린샷 첨부",
    sourceDoc: "docs/active/cs-error-cases-workflow-rules-2026-10-02.md#5-3-카메라가-안-잡힌다",
  },
  {
    id: "flow-board-hardware",
    section: "5-4",
    title: "전자칠판 하드웨어·OPS 터치·화면 확인 흐름",
    symptoms: ["전자칠판 터치 안 됨", "고스트 터치", "화면 얼룩", "작업 표시줄 터치", "칠판 이상"],
    keywords: ["전자칠판", "터치", "ops", "고스트 터치", "작업 표시줄", "백색 잔류물", "얼룩", "s86", "bs86a", "ir 터치"],
    steps: [
      "1. 규격 대조: 메인 NIC은 자동 IP(DHCP), 카메라 NIC은 192.168.1.222 고정. 규격 외 설정 의심(D-02).",
      "2. Windows 11 작업 표시줄 터치 무반응: ClassIn 최소화 + 다른 앱 최대화 상태인지 확인. 오버레이 좌표 이슈이며 최대화 해제로 해소(S-06).",
      "3. 칠판 2대 인접 시 고스트 터치: IR(적외선) 센서 간섭 가능성. 스탠드 간격 최소 20~30cm 이격 실험(D-05).",
      "4. 화면 백색 잔류물: 건식 극세사 와이핑만 사용하고 세정제·알코올 사용 절대 금지(D-03). 고객사에 하드웨어 불량 단정 금지.",
      "5. 증거 사진 촬영 조건: 정면에서 반사 없이 전체 검정 화면으로 촬영.",
    ],
    verificationTests: [
      "마우스 vs 터치 동작 비교로 소프트웨어 오버레이 분리",
      "ipconfig /all 원문으로 Duplicate IP 여부 확인",
    ],
    guidanceRules: [
      "원인 확정 전 '제품 하자', '리콜', '무상 교체' 표현 절대 금지",
      "화면에 화학 세정제 사용 금지 안내",
    ],
    hqTemplateGuide: "보드 하드웨어 에스컬레이션 시 제품 S/N(예: BS86A...), OPS 모델/RAM/CPU, Windows 빌드 번호 첨부",
    sourceDoc: "docs/active/cs-error-cases-workflow-rules-2026-10-02.md#5-4-전자칠판-네트워크",
  },
]

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function searchIncidentEvidence(
  question: string,
  options: { limit?: number } = {}
): IncidentEvidence[] {
  const limit = options.limit ?? 3
  const normalizedQuestion = normalizeToken(question)
  if (!normalizedQuestion) return []

  const results: IncidentEvidence[] = []

  // 1. 케이스 매칭 (76건 선례)
  for (const c of INCIDENT_CASES) {
    let score = 0
    const normCustomer = normalizeToken(c.customer)
    const normId = c.id.toLowerCase()

    // 케이스 ID 직접 언급 (예: "D-02", "D-21", "S-03")
    if (normalizedQuestion.includes(normId)) {
      score += 150
    }

    // 고객사명 매칭 (예: "정율사관", "과사람", "12inedu", "에듀온픽", "kj영재")
    if (normCustomer && normalizedQuestion.includes(normCustomer)) {
      score += 120
    } else if (normCustomer) {
      const parts = normCustomer.split(" ").filter((p) => p.length >= 2)
      for (const part of parts) {
        if (normalizedQuestion.includes(part)) {
          score += 60
        }
      }
    }

    // 키워드 매칭
    for (const kw of c.keywords) {
      const normKw = normalizeToken(kw)
      if (normKw && normalizedQuestion.includes(normKw)) {
        score += Math.max(10, Math.min(40, normKw.length * 5))
      }
    }

    if (score >= 25) {
      results.push({
        id: `incident:${c.id}`,
        caseId: c.id,
        title: `${c.id} · ${c.customer} · ${c.symptom}`,
        category: c.category,
        org: c.customer,
        summary: `증상: ${c.symptom} / 원인(${c.causeStatus}): ${c.cause} / 조치: ${c.resolution}`,
        resolution: c.resolution,
        workflowSteps: c.workflowTips,
        sourceFile: c.sourceDoc,
        score,
      })
    }
  }

  // 2. 5대 확인 흐름 매칭
  for (const flow of WORKFLOW_FLOWS) {
    let flowScore = 0

    // 섹션 번호 직접 매칭 (예: "5-1", "5.1", "5-2")
    if (question.includes(flow.section) || question.includes(flow.section.replace("-", "."))) {
      flowScore += 60
    }

    // 증상명 직접 매칭
    for (const sym of flow.symptoms) {
      const normSym = normalizeToken(sym)
      if (normSym && normalizedQuestion.includes(normSym)) {
        flowScore += 50
      }
    }

    // 흐름 키워드 매칭
    for (const kw of flow.keywords) {
      const normKw = normalizeToken(kw)
      if (normKw && normalizedQuestion.includes(normKw)) {
        flowScore += Math.max(15, Math.min(45, normKw.length * 6))
      }
    }

    // "확인 흐름", "점검 순서", "절차", "방법" 등의 맥락 가산
    if (/(?:확인\s*흐름|점검\s*순서|확인\s*순서|트러블슈팅|대응\s*절차|점검\s*방법)/.test(question)) {
      flowScore += 30
    }

    if (flowScore >= 35) {
      results.push({
        id: `workflow:${flow.id}`,
        title: `[확인 흐름 ${flow.section}] ${flow.title}`,
        category: flow.section,
        summary: `증상별 점검 순서: ${flow.title}`,
        workflowSteps: flow.steps,
        sourceFile: flow.sourceDoc,
        score: flowScore,
      })
    }
  }

  // 정렬 및 중복 제거
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function incidentSourceRefs(evidence: IncidentEvidence[]): InternalCsSourceRef[] {
  return evidence.map((entry) => ({
    id: entry.sourceFile,
    label: `[선례] ${entry.title}`,
    kind: "internal_guide",
  }))
}

export function formatIncidentEvidence(evidence: IncidentEvidence[]): string {
  if (evidence.length === 0) return ""

  const lines = evidence.slice(0, 4).map((entry, index) => {
    const parts = [
      `${index + 1}. ${entry.title}`,
      `   요약: ${entry.summary}`,
    ]
    if (entry.resolution) {
      parts.push(`   조치/해결: ${entry.resolution}`)
    }
    if (entry.workflowSteps && entry.workflowSteps.length > 0) {
      parts.push(`   점검/업무 팁: ${entry.workflowSteps.slice(0, 3).join(" → ")}`)
    }
    parts.push(`   출처: ${entry.sourceFile}`)
    return parts.join("\n")
  })

  return [
    "[선례 오류 케이스 및 점검 흐름]",
    "2026-10-02 기준 기술지원 선례(76건) 및 5대 점검 매뉴얼에서 검색된 관련 사례입니다. 담당자 확인용 참고이며, 고객 안내 시 현장 환경과 로그를 재확인하세요.",
    ...lines,
  ].join("\n")
}

