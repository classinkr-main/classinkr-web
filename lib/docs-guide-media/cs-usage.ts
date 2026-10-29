import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/cs-usage.json 으로 만든다(원본·자른 위치·가린 영역 기록).
// 대상은 목록에 노출하지 않는(unlisted) 사용법 문서다. 보강(enrichment)이 있는 문서는 단계 제목이 heading 이고,
// 없는 문서는 "순서대로 따라 하기"와 심화 항목 제목이 heading 이다.
const RECORDING = "/docs/files/guides/cs-figma-digest-523"
const LATE_REPLAY = "/docs/files/guides/cs-figma-digest-1054"
const TRANSFER = "/docs/files/guides/cs-transfer-student-registration"
const MEMBERS = "/docs/files/guides/cs-course-member-management"
const CREATE_CLOSE = "/docs/files/guides/cs-course-create-and-close"
const RECORDING_SHARE = "/docs/files/guides/cs-recording-download-share"
const AI_DISABLE = "/docs/files/guides/cs-ai-disable-admin"
const CACHE_UPDATE = "/docs/files/guides/cs-cache-update-pc"
const HOMEWORK_MOBILE = "/docs/files/guides/cs-homework-upload-mobile"

export const CS_USAGE_GUIDE_MEDIA: GuideMediaMap = {
  "admin/cs-figma-digest-523": {
    "1. 클래스인 홈페이지 접속": [
      {
        type: "image",
        src: `${RECORDING}/01-google-search.webp`,
        alt: "구글에서 클래스인을 검색한 결과 화면. 맨 위 '올인원 하이브리드 학습 플랫폼 클래스인' 결과에 빨간 상자가 있다",
        caption: "검색 결과 맨 위의 classin.com 항목을 엽니다.",
        width: 1200,
        height: 378,
      },
    ],
    "2. 로그인 버튼 누르기": [
      {
        type: "image",
        src: `${RECORDING}/02-homepage-login.webp`,
        alt: "클래스인 홈페이지 첫 화면. 오른쪽 위 로그인 버튼에 빨간 상자와 화살표가 있다",
        caption: "오른쪽 위 [로그인]을 누릅니다.",
        width: 1200,
        height: 366,
      },
    ],
    "3. 계정으로 로그인": [
      {
        type: "image",
        src: `${RECORDING}/03-login-form.webp`,
        alt: "클래스인 웹 로그인 화면. 아이디와 비밀번호 입력란, Log In 버튼이 보인다",
        caption: "아이디와 비밀번호를 넣고 [Log In]을 누릅니다.",
        width: 1200,
        height: 425,
      },
    ],
    "4. 수업 관리에서 녹화 데이터 열기": [
      {
        type: "image",
        src: `${RECORDING}/04-lesson-recording-menu.webp`,
        alt: "관리자 대시보드 수업 관리 목록. 왼쪽 수업 관리 메뉴, 위쪽 상태·수업 시작일 필터, 수업 행의 조작 버튼과 펼친 메뉴의 수업 녹화 데이터가 강조돼 있다",
        caption: "[수업 관리]에서 수업 행 오른쪽 [조작]을 누르고 [수업 녹화 데이터]를 고릅니다. 수업이 안 보이면 파란 상자의 필터를 풀어 보세요.",
        width: 1200,
        height: 595,
      },
    ],
    "5. 녹화 파일 다운로드": [
      {
        type: "image",
        src: `${RECORDING}/05-recording-download.webp`,
        alt: "수업 녹화 데이터 화면. 위쪽에 녹화 길이와 파일 크기가, 아래 표의 오퍼레이션 열에 다운로드 버튼이 있다",
        caption: "받을 녹화 행의 [다운로드]를 누릅니다.",
        width: 1200,
        height: 268,
      },
    ],
    "6. 녹화 영상 확인": [
      {
        type: "image",
        src: `${RECORDING}/06-player-more-menu.webp`,
        alt: "녹화 영상 재생 화면. 가운데에 음소거 상태 안내가 뜨고, 오른쪽 아래 더보기 버튼에 빨간 상자가 있다",
        caption: "소리가 안 들리면 볼륨을 올리고, 오른쪽 아래 더보기(⋮)에서 다른 옵션을 고릅니다.",
        width: 1200,
        height: 289,
      },
    ],
  },
  "admin/cs-figma-digest-1054": {
    "1. 관리자 대시보드 열기": [
      {
        type: "image",
        src: `${LATE_REPLAY}/01-admin-dashboard-button.webp`,
        alt: "클래스인 PC 앱에서 왼쪽 아래 프로필을 눌러 연 계정 및 설정 창. 오른쪽 위 관리자용 대시보드 버튼에 빨간 상자가 있다",
        caption: "왼쪽 아래 프로필 → [계정 및 설정] 창의 [관리자용 대시보드]를 누릅니다.",
        width: 935,
        height: 496,
      },
    ],
    "2. 수업 다시보기 탭으로 이동": [
      {
        type: "image",
        src: `${LATE_REPLAY}/02-general-settings-menu.webp`,
        alt: "관리자 대시보드 첫 화면. 왼쪽 메뉴 아래쪽 계정 정보와 그 아래 일반 설정에 빨간 상자가 있다",
        caption: "왼쪽 메뉴 [계정 정보] → [일반 설정]을 누릅니다.",
        width: 1133,
        height: 538,
      },
    ],
    "4. 새로 참여한 학생의 이전 수업 열람 허용": [
      {
        type: "image",
        src: `${LATE_REPLAY}/03-replay-tab-options.webp`,
        alt: "일반 설정의 수업 다시보기 탭. 1번 정규 학생과 교사의 다시보기 옵션이 켜져 있고, 2번 고급 설정의 새로 가입된 학생 옵션에 빨간 상자가 있다",
        caption: "[수업 다시보기] 탭에서 1번 옵션이 켜져 있는지 보고, 2번 고급 설정의 새로 가입한 학생 옵션을 켭니다.",
        width: 1133,
        height: 296,
      },
    ],
  },
  "admin/cs-transfer-student-registration": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${TRANSFER}/01-course-list.webp`,
        alt: "관리자 대시보드 코스 관리 목록. 왼쪽 코스 관리 메뉴와 첫 번째 코스 이름에 빨간 상자와 화살표가 있다",
        caption: "[기관 관리] → [코스 관리]에서 편입생을 넣을 코스 이름을 누릅니다.",
        width: 1200,
        height: 567,
      },
    ],
    "이전 수업 다시보기도 봐야 한다면": [
      {
        type: "image",
        src: `${TRANSFER}/02-replay-option.webp`,
        alt: "관리자 대시보드 일반 설정의 수업 다시보기 탭. 새로 가입된 학생이 이전 수업 다시보기를 볼 수 있게 하는 옵션에 빨간 상자가 있다",
        caption: "[계정 정보] → [일반 설정] → [수업 다시보기] 탭의 2번 고급 설정에서 확인합니다.",
        width: 1133,
        height: 296,
      },
    ],
    "아직 가입하지 않은 학생이라면": [
      {
        type: "image",
        src: `${TRANSFER}/03-proxy-registration.webp`,
        alt: "코스 구성원의 학생 설정 창에서 연 학생 추가 창. 아래쪽 학생 추가 버튼과 학생 대리 등록 체크 상자에 빨간 상자가 있다",
        caption: "[학생 추가] 창 아래쪽 [학생 대리 등록]을 체크하고 번호나 이메일과 이름을 넣습니다.",
        width: 596,
        height: 403,
      },
    ],
  },
  "admin/cs-course-member-management": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${MEMBERS}/01-pc-course-settings.webp`,
        alt: "클래스인 PC 앱의 코스 설정 창. 코스 구성원 및 그룹 구성, 구성원 추가 아이콘, 코스 QR 코드 및 링크, 코스 관리 항목이 보인다",
        caption: "PC 앱: 코스 이름을 눌러 연 [코스 설정]에서 [코스 구성원 및 그룹 구성]이나 오른쪽 추가 아이콘을 누릅니다.",
        width: 401,
        height: 755,
      },
      {
        type: "image",
        src: `${MEMBERS}/02-mobile-course-members.webp`,
        alt: "클래스인 모바일 앱 화면 두 장. 코스 화면 위쪽 코스 이름 옆 화살표 버튼, 이어서 코스 설정의 코스 멤버 항목에 빨간 상자가 있다",
        caption: "모바일 앱: 코스 이름 옆 [>]를 누르고 [코스 멤버]로 들어갑니다.",
        width: 1000,
        height: 889,
      },
      {
        type: "image",
        src: `${MEMBERS}/03-mobile-remove-member.webp`,
        alt: "모바일 앱 코스 멤버 목록. 구성원 오른쪽 더보기 버튼과 아래에서 올라온 메뉴의 멤버 삭제에 빨간 상자가 있다",
        caption: "뺄 사람 오른쪽 더보기(···)를 누르고 [멤버 삭제]를 고릅니다.",
        width: 560,
        height: 995,
      },
    ],
  },
  "admin/cs-course-create-and-close": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${CREATE_CLOSE}/01-mobile-create-course.webp`,
        alt: "클래스인 모바일 앱 홈 화면 위쪽. 코스 만들기와 공개 수업 만들기 버튼이 보인다",
        caption: "[홈] 위쪽의 [코스 만들기]를 누릅니다.",
        width: 640,
        height: 261,
      },
      {
        type: "image",
        src: `${CREATE_CLOSE}/02-mobile-close-course.webp`,
        alt: "클래스인 모바일 앱 화면 두 장. 코스 화면 위쪽 코스 이름 옆 화살표 버튼, 이어서 코스 설정 맨 아래 빨간 글씨 코스 종료에 빨간 상자가 있다",
        caption: "모바일 앱: 코스 이름 옆 [>]로 코스 설정을 열고 맨 아래 [코스 종료]를 누릅니다.",
        width: 1000,
        height: 916,
      },
      {
        type: "image",
        src: `${CREATE_CLOSE}/03-pc-course-settings.webp`,
        alt: "클래스인 PC 앱의 코스 설정 창. 맨 아래에 빨간 글씨 코스 종료가 있다",
        caption: "PC 앱: 코스 이름을 눌러 연 [코스 설정] 맨 아래 [코스 종료]를 누릅니다.",
        width: 401,
        height: 755,
      },
    ],
  },
  // 아래 문서는 전체 순서를 한 장에 모은 화면이 이미 붙어 있어, 단계별로 크게 자른 화면을 그 뒤에 덧붙인다.
  "admin/cs-recording-download-share": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${RECORDING_SHARE}/01-lesson-resources.webp`,
        alt: "관리자 대시보드 수업 리소스 목록. 왼쪽 수업 리소스 메뉴와 수업 행 오른쪽의 녹화된 수업 비디오에 빨간 상자가 있다",
        caption: "[수업 리소스]에서 녹화된 수업 행의 [녹화된 수업 비디오]를 누릅니다.",
        width: 1079,
        height: 511,
      },
      {
        type: "image",
        src: `${RECORDING_SHARE}/02-recording-download.webp`,
        alt: "수업 녹화 데이터 화면. 클립 두 개가 나열되어 있고 첫 번째 클립의 다운로드에 빨간 상자가 있다",
        caption: "클립 목록과 파일 상태를 보고, 받을 클립의 [다운로드]를 누릅니다.",
        width: 1079,
        height: 215,
      },
      {
        type: "image",
        src: `${RECORDING_SHARE}/03-player-download-link.webp`,
        alt: "브라우저에서 녹화 영상을 재생하는 화면. 위쪽 주소창과 오른쪽 아래 점 세 개 메뉴의 다운로드에 빨간 상자가 있다",
        caption: "플레이어 오른쪽 아래 점 세 개 → [다운로드]로 받거나, 위쪽 주소창 링크를 복사해 공유합니다.",
        width: 1079,
        height: 554,
      },
    ],
  },
  "admin/cs-ai-disable-admin": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${AI_DISABLE}/01-dashboard-general-settings.webp`,
        alt: "관리자 대시보드 화면. 왼쪽 메뉴 계정 정보 아래 일반 설정에 빨간 상자가 있고, 오른쪽에 PC 앱 계정 및 설정 창에서 관리자용 대시보드를 여는 방법이 겹쳐 있다",
        caption: "PC 앱 [계정 및 설정]의 [관리자용 대시보드]로 들어가 왼쪽 [계정 정보] → [일반 설정]을 누릅니다.",
        width: 1017,
        height: 482,
      },
      {
        type: "image",
        src: `${AI_DISABLE}/02-ai-agent-toggles.webp`,
        alt: "일반 설정의 부가가치 서비스 탭. AI 에이전트 영역의 기본 에이전트와 AI 강의 분석 토글에 빨간 상자가 있다",
        caption: "[부가가치 서비스] 탭의 AI 에이전트 영역에서 쓰지 않을 토글을 끕니다.",
        width: 1017,
        height: 193,
      },
    ],
  },
  "teacher/cs-cache-update-pc": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${CACHE_UPDATE}/01-file-transfer-cache.webp`,
        alt: "클래스인 PC 앱 계정 및 설정 창. 왼쪽 파일 전송 메뉴와 캐시 파일의 내용 삭제 버튼에 빨간 상자가 있다",
        caption: "왼쪽 아래 프로필 → [계정 및 설정] → [파일 전송]에서 캐시 파일의 [내용 삭제]를 누릅니다.",
        width: 945,
        height: 510,
      },
      {
        type: "image",
        src: `${CACHE_UPDATE}/02-software-upgrade.webp`,
        alt: "클래스인 PC 앱 계정 및 설정 창의 소프트웨어 정보. 현재 버전과 최신 버전이 나오고 업그레이드 버튼에 빨간 상자가 있다",
        caption: "[소프트웨어 정보]에서 두 버전 번호를 비교하고, 다르면 [업그레이드]를 누릅니다.",
        width: 1004,
        height: 595,
      },
    ],
  },
  "student/cs-homework-upload-mobile": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${HOMEWORK_MOBILE}/01-select-course.webp`,
        alt: "클래스인 모바일 앱 홈의 코스 목록. 숙제를 낼 코스 카드에 빨간 상자가 있다",
        caption: "숙제가 있는 코스를 엽니다.",
        width: 312,
        height: 677,
      },
      {
        type: "image",
        src: `${HOMEWORK_MOBILE}/02-homework-submit-button.webp`,
        alt: "코스 활동 목록. 숙제 행 오른쪽 제출하기 버튼에 빨간 상자가 있다",
        caption: "숙제 행의 [제출하기]를 누릅니다.",
        width: 312,
        height: 677,
      },
      {
        type: "image",
        src: `${HOMEWORK_MOBILE}/03-my-homework-submit.webp`,
        alt: "숙제 상세 화면. 나의 숙제 아래 초록색 제출하기 버튼에 빨간 상자가 있다",
        caption: "나의 숙제의 [제출하기]를 눌러 작성을 시작합니다.",
        width: 312,
        height: 677,
      },
      {
        type: "image",
        src: `${HOMEWORK_MOBILE}/04-attach-photo.webp`,
        alt: "숙제 작성 화면. 아래쪽 사진, 음성, 파일, 동영상, 링크 아이콘 줄에 빨간 상자가 있고 그 아래 초안 저장과 숙제 제출 버튼이 있다",
        caption: "아래 사진 아이콘으로 사진을 붙이고 [숙제 제출]을 누릅니다.",
        width: 312,
        height: 677,
      },
    ],
  },
}
