import { CS_FIGMA_DIGEST_GUIDES } from "@/lib/cs-figma-guides.generated"
import { CS_FIGMA_GUIDE_ALIASES } from "@/lib/cs-figma-guide-aliases"
import { getCsFigmaEnrichment } from "@/lib/cs-figma-enrichments"

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
}

export const CURATED_CS_FIGMA_GUIDES: CsFigmaGuide[] = [
  {
    slug: "field-recording-camera-setup",
    docSlug: "cs-field-recording-camera-setup",
    docCategory: "teacher",
    category: "classroom",
    title: "현장 녹화 카메라 설정",
    audience: "교사, 강사, CS 담당자",
    summary:
      "Figma CS 캡처 보드의 현장 녹화 가이드를 기준으로 코스 입장, 수업 생성, 1V0/현장 녹화 설정, 장비 테스트, 녹화 카메라 선택, 정상 녹화 확인 순서로 안내합니다.",
    keywords: [
      "현장 녹화",
      "카메라 설정",
      "녹화 카메라",
      "1V0",
      "수업 녹화",
      "교실 입장",
      "바로 녹화하기",
      "초록색 아이콘",
    ],
    steps: [
      "수업을 진행할 코스에 입장합니다.",
      "우측 새로 만들기에서 학습 활동 유형 수업을 선택합니다.",
      "수업 옵션에서 온스테이지 인원수를 1V0으로 설정하고 현장 녹화 토글을 켭니다.",
      "등록 후 생성된 수업의 교실 입장 버튼을 누릅니다.",
      "입장 전 장비 테스트 화면에서 카메라, 마이크, 스피커를 확인합니다.",
      "현장 녹화 알림이 뜨면 확인을 누르고 상단 톱니바퀴에서 녹화할 카메라를 선택합니다.",
      "바로 녹화하기를 누릅니다.",
      "정상 녹화가 시작되면 화면 우측 상단 또는 하단에 초록색 녹화 아이콘이 보이는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "빠른 설정",
        body: "코스에서 새 수업을 만들 때 현장 녹화 토글과 1V0 설정을 먼저 맞춥니다.",
        checks: ["학습 활동 유형이 수업인지 확인", "온스테이지 인원수 1V0", "현장 녹화 토글 ON"],
      },
      {
        level: "2단계",
        title: "입장 전 장비 확인",
        body: "수업 입장 전 장비 테스트에서 실제 녹화에 쓸 카메라·마이크·스피커를 확인합니다.",
        checks: ["카메라 미리보기 정상", "마이크 입력 정상", "수업 입장 버튼 활성"],
      },
      {
        level: "3단계",
        title: "CS 확인 포인트",
        body: "녹화 알림, 카메라 선택, 바로 녹화하기, 초록색 녹화 아이콘까지 확인해야 실제 고객 안내가 끝납니다.",
        checks: ["CPU 6세대 Intel i5 이상 권장", "상향 대역폭 3Mbps 이상 권장", "녹화 아이콘 초록색 표시"],
      },
    ],
    sourceImageFiles: [
      "12/17 실시간 수업 생성 ~ 현장 녹화 확인(PC).png",
      "12/17 실시간 수업 생성 ~ 현장 녹화 확인(IFP).png",
    ],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:47",
  },
  {
    slug: "recording-download-share",
    docSlug: "cs-recording-download-share",
    docCategory: "admin",
    category: "admin",
    title: "수업 녹화 데이터 다운로드와 공유",
    audience: "학원 관리자, 선생님, CS 담당자",
    summary:
      "관리자 대시보드에서 수업 리소스, 녹화된 수업 비디오, 수업 녹화 데이터, 다운로드, 재생 링크 공유 순서로 안내합니다.",
    keywords: ["수업 녹화 데이터", "녹화 다운로드", "녹화 공유", "수업 리소스", "녹화된 수업 비디오", "플레이백"],
    steps: [
      "관리자 대시보드 좌측 수업 리소스 메뉴로 이동합니다.",
      "녹화된 수업 행에서 녹화된 수업 비디오를 클릭합니다.",
      "수업 녹화 데이터 화면에서 클립 목록과 파일 상태를 확인합니다.",
      "다운로드할 클립 행의 다운로드를 클릭합니다.",
      "플레이어에서 받을 때는 우측 하단 점 세 개 메뉴를 열고 다운로드를 선택합니다.",
      "공유가 필요하면 브라우저 상단 재생 링크를 복사해 전달합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "녹화 위치 찾기",
        body: "수업 리소스에서 해당 수업의 녹화된 수업 비디오로 들어갑니다.",
        checks: ["수업명 확인", "수업 날짜 확인", "녹화된 수업 비디오 링크 확인"],
      },
      {
        level: "2단계",
        title: "다운로드 실행",
        body: "클립별 파일 크기와 상태를 확인한 뒤 다운로드합니다.",
        checks: ["파일 상태 보통", "다운로드 버튼", "플레이어 점 세 개 메뉴"],
      },
      {
        level: "3단계",
        title: "공유 전 보안 확인",
        body: "로그인 없이 열리는 링크가 포함될 수 있으므로 공유 대상과 접근 범위를 먼저 확인합니다.",
        checks: ["외부 공유 가능 여부", "개인정보 노출 여부", "원본 링크 보관 위치"],
      },
    ],
    sourceImageFiles: ["대시보드 수업 내용 다운로드 및 공유.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:157",
  },
  {
    slug: "web-live-create",
    docSlug: "cs-web-live-create",
    docCategory: "teacher",
    category: "classroom",
    title: "웹 라이브 생성 방법",
    audience: "강사, 관리자, CS 담당자",
    summary:
      "앱 또는 대시보드에서 웹 라이브 수업을 만들고 녹화 옵션을 활성화한 뒤 수업 링크와 다시보기 링크를 확보하는 순서입니다.",
    keywords: ["웹 라이브", "생방송", "수업 링크", "다시보기", "라이브", "실시간 채팅", "플레이어"],
    steps: [
      "코스에 입장해 새로 만들기에서 수업을 생성합니다.",
      "웹 라이브 기능을 사용할 수 있도록 녹화 옵션을 최소 1개 활성화합니다.",
      "필요한 게시 설정을 확인하고 수업을 게시합니다.",
      "생성된 수업의 점 세 개 메뉴에서 생방송 리플레이 또는 수업 링크를 확인합니다.",
      "학생에게 전달할 수업 링크 또는 코스 다시보기 링크를 복사합니다.",
      "강사는 수업 도구의 실시간 채팅으로 라이브 시청자와 소통합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "수업 생성",
        body: "웹 라이브는 일반 수업 생성 흐름 안에서 녹화/라이브 옵션을 켜는 방식으로 시작합니다.",
        checks: ["코스 선택", "새로 만들기", "수업 생성"],
      },
      {
        level: "2단계",
        title: "링크 확보",
        body: "게시 후 수업 메뉴에서 수업 링크와 다시보기 링크를 따로 확인합니다.",
        checks: ["생방송 리플레이", "수업 링크", "코스 다시보기 링크"],
      },
      {
        level: "3단계",
        title: "운영 주의",
        body: "실시간 채팅 창은 학생에게 보이지 않고 녹화에도 포함되지 않을 수 있어 전달 방식에 주의합니다.",
        checks: ["학생 공지 필요 여부", "채팅 내용 녹화 포함 여부", "캡처 공유 필요 여부"],
      },
    ],
    sourceImageFiles: ["웹 라이브 생성 방법 (앱).png", "웹 라이브 생성 방법 (대시보드).png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:383",
  },
  {
    slug: "microphone-camera-check",
    docSlug: "cs-microphone-camera-check",
    docCategory: "teacher",
    category: "troubleshooting",
    title: "교실 내 카메라와 마이크 설정 확인",
    audience: "강사, 학원 운영자, CS 담당자",
    summary:
      "수업 입장 전과 수업 중 설정 화면에서 카메라·마이크를 확인하고, 소리 없음 경고가 뜨면 마이크 입력 장치를 바꾸는 순서입니다.",
    keywords: ["마이크 설정", "카메라 설정", "소리 없음", "장비 테스트", "수업 입장", "마이크 안됨", "카메라 안됨"],
    steps: [
      "수업 입장 전 장비 테스트 화면에서 카메라, 마이크, 스피커 선택값을 확인합니다.",
      "수업 중에는 우측 상단 톱니바퀴 설정을 엽니다.",
      "카메라 드롭다운에서 사용할 카메라를 선택합니다.",
      "마이크 드롭다운이 사용 안 함이면 실제 사용할 마이크로 변경합니다.",
      "하단 독의 마이크와 카메라 아이콘으로 ON/OFF 상태를 확인합니다.",
      "소리 없음 경고가 반복되면 기기 권한과 입력 장치를 다시 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "입장 전 확인",
        body: "장비 테스트에서 선택된 장치가 실제 교실 장치인지 먼저 봅니다.",
        checks: ["카메라 미리보기", "마이크 입력", "스피커 출력"],
      },
      {
        level: "2단계",
        title: "수업 중 변경",
        body: "수업 중 톱니바퀴 설정과 하단 독 아이콘으로 장치를 바꿀 수 있습니다.",
        checks: ["톱니바퀴 설정", "마이크 드롭다운", "카메라 드롭다운"],
      },
      {
        level: "3단계",
        title: "장애 접수 기준",
        body: "반복 장애는 기기명, OS, 앱 버전, 오류 문구, 발생 시점을 같이 받아야 빠르게 처리됩니다.",
        checks: ["사용 기기", "앱 버전", "오류 화면 캡처"],
      },
    ],
    sourceImageFiles: ["클래스인 '마이크' 설정.png", "클래스인 교실 내 카메라/ 마이크 설정 확인.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:433",
  },
  {
    slug: "bulk-exam-upload",
    docSlug: "cs-bulk-exam-upload",
    docCategory: "teacher",
    category: "classroom",
    title: "시험 문제 대량 업로드와 시험 추가",
    audience: "교사, CS 담당자",
    summary:
      "코스에서 시험을 만들고 워드/엑셀 템플릿으로 문제를 대량 업로드한 뒤 인식 결과 확인, 내 문제 은행 저장, 게시까지 이어지는 절차입니다.",
    keywords: ["시험 문제 대량 업로드", "시험 추가", "템플릿 다운로드", "템플릿 업로드", "문제 은행", "게시", "Word", "Excel"],
    steps: [
      "코스 화면에서 새로 만들기를 누르고 시험을 선택합니다.",
      "새 시험 추가 화면에서 시험 문제 대량 추가를 클릭합니다.",
      "템플릿 다운로드에서 워드 또는 엑셀 템플릿을 내려받습니다.",
      "문제를 템플릿 형식에 맞게 작성한 뒤 템플릿 업로드를 누릅니다.",
      "업로드된 문제 텍스트를 확인하고 다음을 누릅니다.",
      "문제 인식 성공/실패 결과를 확인하고 필요한 문제를 수정합니다.",
      "필요하면 내 문제 은행에도 저장하기를 체크합니다.",
      "확인 후 시험 세부 설정을 마치고 게시를 누릅니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "템플릿 준비",
        body: "문제 유형별 Answer와 Explanation 형식을 유지해 템플릿을 작성합니다.",
        checks: ["객관식 보기", "Answer 표기", "Explanation 표기"],
      },
      {
        level: "2단계",
        title: "인식 결과 확인",
        body: "문제 인식 실패 항목은 게시 전에 반드시 수정합니다.",
        checks: ["문제 인식 성공", "문제 인식 실패", "미확인 문제"],
      },
      {
        level: "3단계",
        title: "게시 전 검수",
        body: "점수, 게시 대상, 교사, 코스, 문제 은행 저장 여부를 마지막으로 확인합니다.",
        checks: ["만점", "게시 설정", "교사/코스 선택"],
      },
    ],
    sourceImageFiles: ["문제 은행 가이드.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:2171",
  },
  {
    slug: "homework-upload-mobile",
    docSlug: "cs-homework-upload-mobile",
    docCategory: "student",
    category: "classroom",
    title: "숙제 업로드 모바일",
    audience: "학생, 교사, CS 담당자",
    summary:
      "모바일 앱에서 코스 선택, 숙제 확인, 제출하기, 사진 아이콘 첨부 순서로 숙제를 업로드합니다.",
    keywords: ["숙제 업로드", "숙제 제출", "모바일", "사진 첨부", "제출하기", "학생"],
    steps: [
      "모바일 앱에서 해당 코스를 선택합니다.",
      "숙제 활동을 열고 제출하기 버튼을 누릅니다.",
      "제출 화면 중간의 제출하기를 눌러 제출 작성을 시작합니다.",
      "화면 하단 사진 아이콘을 눌러 사진을 첨부합니다.",
      "첨부 파일을 확인한 뒤 제출을 완료합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "숙제 찾기",
        body: "학생 앱에서 코스와 숙제 활동을 정확히 선택합니다.",
        checks: ["코스명", "숙제 제목", "마감 상태"],
      },
      {
        level: "2단계",
        title: "사진 첨부",
        body: "사진 아이콘으로 촬영본 또는 앨범 이미지를 첨부합니다.",
        checks: ["사진 아이콘", "첨부 미리보기", "파일 권한"],
      },
      {
        level: "3단계",
        title: "제출 확인",
        body: "제출 완료 상태가 보이는지 확인하고, 미제출이면 다시 첨부와 제출을 확인합니다.",
        checks: ["제출 완료 표시", "미제출 상태", "마감 시간"],
      },
    ],
    sourceImageFiles: ["숙제 업로드_모바일.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:2227",
  },
  {
    slug: "cache-update-pc",
    docSlug: "cs-cache-update-pc",
    docCategory: "teacher",
    category: "troubleshooting",
    title: "클래스인 캐시 삭제와 PC 업데이트",
    audience: "교사, 관리자, CS 담당자",
    summary:
      "PC 앱에서 계정 및 설정, 파일 전송, 캐시 파일 내용 삭제, 소프트웨어 정보, 업그레이드 순서로 캐시 삭제와 업데이트를 진행합니다.",
    keywords: ["캐시 삭제", "업데이트", "PC", "업그레이드", "파일 관리", "계정 및 설정", "느려요", "오류"],
    steps: [
      "PC 앱 좌측 하단 프로필을 클릭합니다.",
      "계정 및 설정 메뉴를 엽니다.",
      "파일 전송으로 들어가 파일 관리 화면을 엽니다.",
      "캐시 파일 항목의 내용 삭제를 클릭합니다.",
      "다시 계정 및 설정에서 소프트웨어 정보를 엽니다.",
      "현재 버전과 최신 버전을 확인하고 업그레이드를 누릅니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "캐시 정리",
        body: "파일 관리에서 캐시 파일 용량을 확인하고 삭제합니다.",
        checks: ["계정 및 설정", "파일 전송", "캐시 파일 내용 삭제"],
      },
      {
        level: "2단계",
        title: "버전 확인",
        body: "소프트웨어 정보에서 현재 버전과 최신 버전을 비교합니다.",
        checks: ["현재 버전", "최신 버전", "업그레이드 버튼"],
      },
      {
        level: "3단계",
        title: "장애 재현 확인",
        body: "캐시 삭제와 업데이트 후 같은 오류가 재현되는지 다시 확인합니다.",
        checks: ["재로그인", "오류 재현", "스크린샷 확보"],
      },
    ],
    sourceImageFiles: ["클래스인 캐시 삭제/업데이트 (PC).png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:1852",
  },
  {
    slug: "ai-disable-admin",
    docSlug: "cs-ai-disable-admin",
    docCategory: "admin",
    category: "admin",
    title: "Classin AI 비활성화 안내",
    audience: "관리자, CS 담당자",
    summary:
      "관리자 대시보드에서 계정 일반 설정과 부가가치 서비스 탭으로 이동해 AI 에이전트, AI 강의 분석, 스마트 담임 교사 등 AI 관련 옵션을 끄는 절차입니다.",
    keywords: ["AI 비활성화", "AI 에이전트", "AI 강의 분석", "스마트 담임", "부가가치 서비스", "관리자 대시보드"],
    steps: [
      "관리자 계정으로 대시보드에 접속합니다.",
      "계정 정보 또는 일반 설정 화면으로 이동합니다.",
      "상단 부가가치 서비스 탭을 엽니다.",
      "AI 에이전트 영역의 옵션을 확인합니다.",
      "필요한 AI 기능 토글을 모두 끕니다.",
      "변경 후 실제 코스나 수업 화면에서 AI 메뉴 노출 여부를 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "관리자 위치 확인",
        body: "AI 옵션은 교사 수업 화면이 아니라 관리자 대시보드 계정 설정에서 확인합니다.",
        checks: ["관리자 계정", "일반 설정", "부가가치 서비스"],
      },
      {
        level: "2단계",
        title: "AI 옵션 끄기",
        body: "AI 에이전트와 관련 부가 기능을 고객 요구 범위에 맞춰 비활성화합니다.",
        checks: ["AI 에이전트", "AI 강의 분석", "스마트 담임 교사"],
      },
      {
        level: "3단계",
        title: "노출 검수",
        body: "설정 변경 후 교사/학생 화면에서 AI 메뉴가 기대대로 보이는지 확인합니다.",
        checks: ["교사 화면", "학생 화면", "기관 설정 반영 시간"],
      },
    ],
    sourceImageFiles: ["Classin AI 비활성화 안내.png"],
    sourceDigestLineHint: "docs/active/cs-figma-board-digest-2026-06-21.md:759",
  },
  {
    slug: "classin-app-download",
    docSlug: "cs-classin-app-download",
    docCategory: "start",
    category: "onboarding",
    title: "클래스인 앱 다운로드와 설치",
    audience: "학생, 교사, 학부모, 기관 관리자",
    summary:
      "Windows·macOS는 공식 다운로드 페이지에서, Android·iOS는 각 앱 스토어에서 클래스인 앱을 내려받아 설치하는 절차입니다.",
    keywords: [
      "클래스인 다운로드",
      "클래스인 설치",
      "Windows 설치",
      "윈도우 설치",
      "Mac 설치",
      "안드로이드 설치",
      "아이폰 설치",
      "앱스토어",
      "플레이 스토어",
    ],
    steps: [
      "PC에서는 클래스인 공식 다운로드 페이지를 엽니다.",
      "Windows 사용자는 Windows용 다운로드를 선택하고 내려받은 설치 파일을 실행합니다.",
      "Mac 사용자는 Mac용 다운로드에서 사용 중인 기기에 맞는 설치 파일을 선택합니다.",
      "Android 기기는 Play 스토어에서 ClassIn을 검색해 설치합니다.",
      "iPhone 또는 iPad는 App Store에서 ClassIn을 검색해 설치합니다.",
      "설치가 끝나면 앱을 실행하고 기존 계정으로 로그인하거나 회원가입을 진행합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "기기에 맞는 설치 경로",
        body: "PC는 공식 다운로드 페이지, 모바일은 운영체제의 앱 스토어를 이용합니다.",
        checks: ["Windows 또는 Mac 구분", "Android 또는 iOS 구분"],
      },
      {
        level: "2단계",
        title: "앱 확인",
        body: "검색 결과에서 ClassIn 앱 이름과 아이콘을 확인한 뒤 설치합니다.",
        checks: ["앱 이름 ClassIn", "설치 완료 후 앱 실행"],
      },
      {
        level: "3단계",
        title: "설치 문제 확인",
        body: "설치가 되지 않으면 저장 공간, 운영체제 버전, 네트워크 상태를 먼저 확인합니다.",
        checks: ["저장 공간", "운영체제와 네트워크"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
  {
    slug: "classin-account-signup",
    docSlug: "cs-classin-account-signup",
    docCategory: "start",
    category: "onboarding",
    title: "클래스인 회원가입",
    audience: "학생, 교사, 학부모, 신규 사용자",
    summary:
      "클래스인 앱의 로그인 화면에서 회원가입으로 이동해 본인 인증, 계정 정보 입력, 필수 동의를 마치고 프로필을 확인하는 순서입니다.",
    keywords: [
      "클래스인 회원가입",
      "회원가입 방법",
      "신규 가입",
      "본인 인증",
      "인증 코드",
      "계정 만들기",
      "프로필 설정",
    ],
    steps: [
      "클래스인 앱을 실행하고 로그인 화면에서 회원가입을 선택합니다.",
      "화면에 표시된 휴대전화 또는 이메일 인증 방식을 선택합니다.",
      "인증 정보를 입력하고 받은 인증 코드를 확인합니다.",
      "비밀번호와 이름 등 화면에 표시된 필수 계정 정보를 입력합니다.",
      "필수 약관을 확인하고 회원가입을 완료합니다.",
      "가입한 계정으로 로그인한 뒤 이름과 프로필 정보가 맞는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "본인 인증",
        body: "가입 화면에 표시되는 인증 방식에 따라 휴대전화 또는 이메일 인증을 진행합니다.",
        checks: ["국가 번호와 연락처", "인증 코드 수신"],
      },
      {
        level: "2단계",
        title: "계정 정보 입력",
        body: "이름과 비밀번호 등 필수 항목을 빠짐없이 입력하고 필수 약관을 확인합니다.",
        checks: ["필수 입력값", "필수 약관 동의"],
      },
      {
        level: "3단계",
        title: "가입 완료 확인",
        body: "로그인 후 프로필에서 이름과 계정 정보가 올바르게 저장됐는지 확인합니다.",
        checks: ["로그인 성공", "프로필 이름"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
  {
    slug: "classin-account-delete",
    docSlug: "cs-classin-account-delete",
    docCategory: "start",
    category: "onboarding",
    title: "클래스인 계정 삭제와 회원 탈퇴",
    audience: "학생, 교사, 학부모, 일반 사용자",
    summary:
      "모바일 앱의 프로필에서 계정 및 보안으로 이동해 계정 삭제 안내를 확인하고 본인 인증을 거쳐 탈퇴하는 절차입니다.",
    keywords: [
      "계정 삭제",
      "회원 탈퇴",
      "클래스인 탈퇴",
      "계정 및 보안",
      "계정 지우기",
      "탈퇴 방법",
      "본인 확인",
    ],
    steps: [
      "모바일 앱에 로그인한 뒤 좌측 상단의 프로필 이미지를 누릅니다.",
      "계정 및 보안을 선택합니다.",
      "계정 삭제를 선택하고 삭제 안내와 주의사항을 끝까지 확인합니다.",
      "계정 삭제에 동의한다는 확인 항목을 선택하고 다음을 누릅니다.",
      "화면에 표시된 방식으로 본인 인증을 완료합니다.",
      "최종 삭제를 확인한 뒤 계정이 로그아웃되고 더 이상 로그인되지 않는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "삭제 전 확인",
        body: "계정 삭제는 되돌리기 어려우므로 필요한 수업 자료와 기록을 먼저 확인합니다.",
        checks: ["보관할 자료", "참여 중인 코스"],
      },
      {
        level: "2단계",
        title: "삭제 동의와 인증",
        body: "삭제 안내에 동의한 뒤 계정 소유자 본인 인증을 완료합니다.",
        checks: ["삭제 동의", "본인 인증"],
      },
      {
        level: "3단계",
        title: "완료 확인",
        body: "최종 확인 후 자동 로그아웃과 재로그인 가능 여부를 확인합니다.",
        checks: ["자동 로그아웃", "삭제 완료 안내"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
  {
    slug: "transfer-student-registration",
    docSlug: "cs-transfer-student-registration",
    docCategory: "admin",
    category: "admin",
    title: "편입생(참관생) 등록",
    audience: "기관 관리자, 코스 관리자, CS 담당자",
    summary:
      "관리자 대시보드의 코스 상세 화면에서 편입생을 추가하고 목록 반영 여부까지 확인하는 절차입니다.",
    keywords: [
      "편입생 등록",
      "참관생 등록",
      "편입생 추가",
      "참관생 추가",
      "코스 관리",
      "코스 상세",
      "학생 검색",
    ],
    steps: [
      "관리자 대시보드에 로그인한 뒤 기관 관리의 코스 관리로 이동합니다.",
      "편입생을 등록할 코스 이름을 눌러 코스 상세 화면을 엽니다.",
      "코스 상세 화면에서 편입생 항목을 선택하고 추가를 누릅니다.",
      "학생 이름을 검색하거나 아래 목록에서 대상 학생을 찾습니다.",
      "대상 학생 왼쪽의 체크박스를 선택하고 확인을 누릅니다.",
      "코스 상세 화면의 편입생 목록에 해당 학생이 표시되는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "코스 선택",
        body: "기관 관리의 코스 관리에서 대상 코스를 정확히 선택합니다.",
        checks: ["코스 이름", "코스 상태"],
      },
      {
        level: "2단계",
        title: "학생 추가",
        body: "편입생 추가 창에서 검색 또는 목록으로 학생을 찾고 체크박스를 선택합니다.",
        checks: ["학생 이름", "체크박스와 확인 버튼"],
      },
      {
        level: "3단계",
        title: "등록 결과 확인",
        body: "같은 이름의 학생을 잘못 선택하지 않았는지 편입생 목록에서 다시 확인합니다.",
        checks: ["편입생 목록 반영", "동명이인 여부"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
  {
    slug: "course-member-management",
    docSlug: "cs-course-member-management",
    docCategory: "admin",
    category: "admin",
    title: "코스 구성원 추가와 삭제",
    audience: "교사, 코스 관리자, CS 담당자",
    summary:
      "코스 설정 또는 코스 관리에서 구성원을 직접 추가하거나 초대하고, 구성원 목록에서 대상을 삭제하는 절차입니다.",
    keywords: [
      "코스 구성원 추가",
      "코스 구성원 삭제",
      "코스 멤버 추가",
      "코스 멤버 삭제",
      "구성원 및 그룹 구성",
      "코스 초대 링크",
      "QR 초대",
    ],
    steps: [
      "대상 코스로 이동한 뒤 코스 이름 또는 코스 정보 영역을 눌러 코스 설정을 엽니다.",
      "코스 관리 또는 코스 구성원 및 그룹 구성을 선택합니다.",
      "구성원을 직접 추가할 때는 추가 버튼을 누르고 대상 사용자와 역할을 확인한 뒤 저장합니다.",
      "사용자가 직접 입장하게 하려면 코스 QR 코드 또는 초대 링크를 전달합니다.",
      "구성원을 삭제할 때는 구성원 목록에서 대상 사용자의 더보기 메뉴를 열고 멤버 삭제를 선택합니다.",
      "추가 또는 삭제 후 구성원 수와 역할이 의도대로 반영됐는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "구성원 메뉴 진입",
        body: "코스 설정에서 구성원 및 그룹 구성 또는 코스 관리 메뉴를 찾습니다.",
        checks: ["대상 코스", "구성원 메뉴"],
      },
      {
        level: "2단계",
        title: "추가 방식 선택",
        body: "관리자가 직접 추가하거나 QR·초대 링크로 사용자가 직접 들어오게 할 수 있습니다.",
        checks: ["직접 추가", "QR 또는 초대 링크"],
      },
      {
        level: "3단계",
        title: "삭제 전 역할 확인",
        body: "담임 교사나 운영 담당자를 잘못 삭제하지 않도록 대상과 역할을 먼저 확인합니다.",
        checks: ["사용자 이름", "교사·학생 역할"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
  {
    slug: "course-wide-chat-control",
    docSlug: "cs-course-wide-chat-control",
    docCategory: "admin",
    category: "admin",
    title: "코스 전체 학생 채팅 활성화와 비활성화",
    audience: "교사, 코스 관리자, CS 담당자",
    summary:
      "코스 관리의 전체 학생 채팅 금지 옵션으로 학생의 채팅 가능 범위를 켜거나 제한하는 절차입니다.",
    keywords: [
      "코스 전체 채팅",
      "전체 학생 채팅 금지",
      "학생 채팅 비활성화",
      "학생 채팅 활성화",
      "코스 채팅 제한",
      "채팅 금지",
      "코스 관리",
    ],
    steps: [
      "대상 코스로 이동합니다.",
      "좌측 상단의 코스 이름을 누르고 코스 관리를 선택합니다.",
      "코스 관리 옵션에서 전체 학생 채팅 금지를 찾습니다.",
      "학생의 전체 채팅을 제한하려면 옵션을 켭니다.",
      "학생의 전체 채팅을 다시 허용하려면 옵션을 끕니다.",
      "설정 후 학생 계정에서 채팅 가능 범위가 의도대로 바뀌었는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "코스 관리 열기",
        body: "코스 이름 메뉴에서 코스 관리로 이동합니다.",
        checks: ["대상 코스", "코스 관리 메뉴"],
      },
      {
        level: "2단계",
        title: "채팅 범위 변경",
        body: "전체 학생 채팅 금지 토글의 현재 상태를 확인하고 필요한 방향으로 변경합니다.",
        checks: ["금지 토글 ON·OFF", "학생 채팅 범위"],
      },
      {
        level: "3단계",
        title: "학생 화면 검수",
        body: "설정 변경 후 교사 화면뿐 아니라 학생 화면에서도 채팅 동작을 확인합니다.",
        checks: ["학생 계정 확인", "기존 채팅방 동작"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
  {
    slug: "course-create-and-close",
    docSlug: "cs-course-create-and-close",
    docCategory: "admin",
    category: "admin",
    title: "코스 생성과 종료",
    audience: "교사, 코스 관리자, CS 담당자",
    summary:
      "앱에서 새 코스를 만들고 코스 설정을 확인하며, 운영이 끝난 코스를 종료하는 기본 절차입니다.",
    keywords: [
      "코스 생성",
      "코스 만들기",
      "새 코스",
      "코스 삭제",
      "코스 종료",
      "코스 관리",
      "코스 설정",
    ],
    steps: [
      "앱 홈의 코스 목록에서 코스 만들기를 선택합니다.",
      "코스 이름과 기간 등 화면에 표시된 필수 정보를 입력하고 코스를 생성합니다.",
      "생성된 코스로 들어가 코스 이름을 누르면 코스 설정과 코스 관리 메뉴를 열 수 있습니다.",
      "코스 운영이 끝났다면 코스 설정 하단의 코스 종료 항목을 선택합니다.",
      "종료 안내와 데이터 접근 영향을 확인한 뒤 최종 확인합니다.",
      "코스 목록에서 상태가 종료됨으로 바뀌었는지 확인합니다.",
    ],
    deepDive: [
      {
        level: "1단계",
        title: "새 코스 만들기",
        body: "코스 만들기에서 기본 정보와 운영 기간을 확인한 뒤 생성합니다.",
        checks: ["코스 이름", "운영 기간과 역할"],
      },
      {
        level: "2단계",
        title: "코스 설정 확인",
        body: "코스 이름 메뉴에서 구성원, 초대, 채팅 등 운영 옵션으로 이동할 수 있습니다.",
        checks: ["코스 설정", "코스 관리"],
      },
      {
        level: "3단계",
        title: "종료 전 주의",
        body: "코스 종료 전 구성원과 수업 자료의 접근 범위가 어떻게 달라지는지 확인합니다.",
        checks: ["필요한 자료 보관", "코스 상태 종료됨"],
      },
    ],
    sourceImageFiles: [],
    sourceDigestLineHint: "docs/active/cs-figma-board-update-2026-08-05.md",
  },
]

export const CS_FIGMA_GUIDES = [
  ...CURATED_CS_FIGMA_GUIDES,
  ...CS_FIGMA_DIGEST_GUIDES,
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
  /안\s*돼|안됨|끊|나가|튕|오류|문제\s*(있|발생|생기)|불가|실패|느려|꺼짐|안\s*켜|켜지지|안\s*나|안\s*들|안\s*보/

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

function findKnownCsFigmaIntentSlug(normalizedQuestion: string) {
  if (hasAccountSignupProcedureIntent(normalizedQuestion)) return "classin-account-signup"
  if (hasAccountDeletionProcedureIntent(normalizedQuestion)) return "classin-account-delete"
  if (hasTransferStudentRegistrationIntent(normalizedQuestion)) return "transfer-student-registration"
  if (hasCourseMemberManagementIntent(normalizedQuestion)) return "course-member-management"
  if (hasCourseWideChatControlIntent(normalizedQuestion)) return "course-wide-chat-control"
  if (hasCourseCreateOrCloseIntent(normalizedQuestion)) return "course-create-and-close"
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

  const stepLines = guide.steps.map((step, index) => `${index + 1}. ${sanitizeGuideStep(step, hiddenTerms)}`)
  const deepDiveLines = guide.deepDive
    .filter((item) => !/순서\s*그대로\s*안내/.test(item.title))
    .map((item) => {
      const title = sanitizeGuideStep(item.title, hiddenTerms)
      const checks = item.checks
        .slice(0, 2)
        .map((check) => compactGuideAnswerText(sanitizeGuideStep(check, hiddenTerms), hiddenTerms, 88))
        .filter(Boolean)
        .join(" / ")
      return `- ${item.level} ${title}${checks ? `: ${checks}` : ""}`
    })

  return [
    "아래 순서대로 진행하시면 됩니다.",
    stepLines.join("\n"),
    deepDiveLines.length > 0 ? `확인 포인트\n${deepDiveLines.join("\n")}` : "",
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
