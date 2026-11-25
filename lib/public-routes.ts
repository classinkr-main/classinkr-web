// 고객에게 보내도 되는 공개 정적 경로 — 갈매봇 링크 목록(lib/admin-ai/links.ts)의 고객용 줄이 여기서 나온다.
//
// app/sitemap.ts 의 staticRoutes 와 같은 집합이다. sitemap 은 다른 파트 소유라 이 파일로 옮기지 않았고(점검 결정 10 대기),
// 사본을 두는 대신 tests/admin-ai/links.test.ts 가 "sitemap 의 path 집합 = 이 목록"을 고정한다.
// 결정 10 이 승인되면 sitemap.ts 가 이 목록을 import 하도록 바꾸고 그 시험은 지운다.
//
// 동적 공개 주소(블로그 글·문서·자료)는 여기 없다 — 요청 때 공개 상태를 다시 확인해야 하는 동적층이다(다음 묶음).

export interface PublicRoute {
  path: string
  /** 사람이 읽는 이름 — 갈매봇 링크 카드의 줄 제목. */
  label: string
  /** 링크 찾기 검색어(공백 구분, 한·영 병기). */
  keywords: string
}

export const PUBLIC_STATIC_ROUTES: readonly PublicRoute[] = [
  { path: "/", label: "클래스인 홈", keywords: "홈 메인 첫 화면 홈페이지 home main" },
  { path: "/docs", label: "도움말 센터", keywords: "도움말 가이드 문서 사용법 docs help guide" },
  { path: "/docs/first-week", label: "첫 주 사용 가이드", keywords: "첫 주 시작 가이드 처음 사용 온보딩 first week onboarding" },
  { path: "/product", label: "제품 소개", keywords: "제품 소개 전체 product" },
  { path: "/product/sw", label: "소프트웨어 제품 소개", keywords: "소프트웨어 sw 수업 프로그램 요금제 software" },
  { path: "/product/hw", label: "하드웨어(전자칠판) 제품 소개", keywords: "하드웨어 hw 전자칠판 보드 카메라 모델 hardware board" },
  { path: "/product/ai-report", label: "AI 강의 평가 리포트 소개", keywords: "ai 강의 평가 리포트 수업 분석 report" },
  { path: "/product/recording", label: "수업 녹화 소개", keywords: "수업 녹화 녹화 다시보기 recording" },
  { path: "/pricing", label: "가격표", keywords: "가격표 가격 요금 요금제 단가 얼마 pricing price plan" },
  { path: "/contact", label: "문의하기", keywords: "문의 연락 상담 신청 contact inquiry" },
  { path: "/showroom", label: "쇼룸 방문 예약", keywords: "쇼룸 방문 예약 체험 데모 showroom booking" },
  { path: "/introduction", label: "도입 안내", keywords: "도입 안내 소개서 도입 방법 introduction" },
  { path: "/introduction/story", label: "도입 안내 · 이야기", keywords: "도입 이야기 story" },
  { path: "/introduction/proof", label: "도입 안내 · 근거", keywords: "도입 근거 증거 proof" },
  { path: "/introduction/full", label: "도입 안내 · 전체 보기", keywords: "도입 전체 full" },
  { path: "/introduction/cases", label: "도입 사례", keywords: "도입 사례 고객 사례 학원 사례 cases" },
  { path: "/privacy", label: "개인정보처리방침", keywords: "개인정보 처리방침 privacy" },
  { path: "/terms", label: "이용약관", keywords: "이용약관 약관 terms" },
  { path: "/data-deletion", label: "데이터 삭제 요청 안내", keywords: "데이터 삭제 탈퇴 삭제 요청 data deletion" },
  { path: "/blog", label: "블로그", keywords: "블로그 소식 글 blog" },
  { path: "/events", label: "행사·웨비나", keywords: "행사 웨비나 세미나 이벤트 events webinar" },
  { path: "/resources", label: "자료실", keywords: "자료 자료실 다운로드 자료 리소스 resources" },
  { path: "/download", label: "프로그램 다운로드", keywords: "다운로드 설치 프로그램 앱 download install" },
  { path: "/updates", label: "업데이트 소식", keywords: "업데이트 패치 새 기능 소식 updates" },
  { path: "/faq", label: "자주 묻는 질문", keywords: "자주 묻는 질문 faq 질문" },
  { path: "/about", label: "회사 소개", keywords: "회사 소개 about" },
]
