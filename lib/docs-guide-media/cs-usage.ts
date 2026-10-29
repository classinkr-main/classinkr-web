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
const FIELD_RECORDING = "/docs/files/guides/cs-field-recording-camera-setup"
const WEB_LIVE = "/docs/files/guides/cs-web-live-create"
const MIC_CAMERA = "/docs/files/guides/cs-microphone-camera-check"
const BULK_EXAM = "/docs/files/guides/cs-bulk-exam-upload"

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
    "초대 링크로 들어오게 할 때": [
      {
        type: "image",
        src: `${MEMBERS}/04-allow-course-join.webp`,
        alt: "PC 앱 코스 관리 창 맨 위의 코스 가입 허용 토글이 켜져 있다",
        caption: "코스 설정 → [코스 관리] 맨 위 [코스 가입 허용]이 켜져 있어야 링크와 QR 코드로 들어올 수 있습니다.",
        width: 270,
        height: 116,
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
  "teacher/cs-field-recording-camera-setup": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/01-lesson-options.webp`,
        alt: "클래스인 PC 앱의 수업 새로 만들기 창. 시작 시각과 진행 시간, 온스테이지 인원수 1V0, 현장 녹화 토글에 빨간 상자가 있다",
        caption: "수업 시간을 정하고 온스테이지 인원수를 1V0으로, [현장 녹화]를 켠 뒤 [등록]을 누릅니다.",
        width: 972,
        height: 618,
      },
      {
        type: "image",
        src: `${FIELD_RECORDING}/02-enter-classroom.webp`,
        alt: "코스 화면의 수업 행에 있는 교실 입장 버튼과 오른쪽 아래 수업 알림의 수업 입장 버튼에 빨간 상자가 있다",
        caption: "수업 행의 [교실 입장]이나 수업 알림의 [수업 입장]을 누릅니다.",
        width: 948,
        height: 620,
      },
      {
        type: "image",
        src: `${FIELD_RECORDING}/03-recording-notice.webp`,
        alt: "교실 화면 가운데 뜬 현장 녹화 알림 창. 아래쪽 확인 버튼에 빨간 상자가 있다",
        caption: "현장 녹화 알림이 뜨면 [확인]을 누릅니다.",
        width: 953,
        height: 547,
      },
      {
        type: "image",
        src: `${FIELD_RECORDING}/04-camera-record-now.webp`,
        alt: "현장 녹화 창 위쪽 톱니바퀴, 설정 창의 카메라 목록, 바로 녹화하기 버튼, 화면 오른쪽 위 초록색 녹화 아이콘에 빨간 상자가 있다",
        caption: "톱니바퀴에서 녹화할 카메라를 고르고 [바로 녹화하기]를 누르면 오른쪽 위에 초록색 녹화 아이콘이 뜹니다.",
        width: 955,
        height: 750,
      },
      {
        type: "image",
        src: `${FIELD_RECORDING}/05-board-recording-icon.webp`,
        alt: "전자칠판 화면 아래쪽 독. 녹화 아이콘을 누르면 현장 녹화 진행 중 안내가 뜬다",
        caption: "전자칠판에서는 화면 아래쪽 독에서 녹화 상태를 봅니다.",
        width: 467,
        height: 300,
      },
    ],
  },
  "teacher/cs-web-live-create": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${WEB_LIVE}/01-new-lesson.webp`,
        alt: "코스 화면 오른쪽 위 새로 만들기 버튼과, 열린 활동 게시하기 창의 수업 항목에 빨간 상자가 있다",
        caption: "코스 오른쪽 위 [새로 만들기] → [수업]을 누릅니다.",
        width: 1021,
        height: 547,
      },
      {
        type: "image",
        src: `${WEB_LIVE}/02-recording-live-option.webp`,
        alt: "수업 새로 만들기 창 오른쪽 옵션. Classin 수업 녹화가 켜져 있고 그 아래 라이브가 선택돼 있다",
        caption: "녹화 옵션을 하나 이상 켜고 [라이브]를 고른 뒤 [등록]을 누릅니다.",
        width: 730,
        height: 483,
      },
      {
        type: "image",
        src: `${WEB_LIVE}/03-live-replay-links.webp`,
        alt: "수업 목록 행의 점 세 개 버튼과, 수업 상세의 생방송 리플레이·코스 다시보기 링크와 복사 버튼에 빨간 상자가 있다",
        caption: "수업의 점 세 개를 누르면 [생방송 리플레이]와 [코스 다시보기] 링크가 나옵니다. 오른쪽 복사 버튼으로 복사합니다.",
        width: 1120,
        height: 580,
      },
      {
        type: "image",
        src: `${WEB_LIVE}/04-live-chat-tool.webp`,
        alt: "교실 화면에서 수업 도구 창을 열고 실시간 채팅 창을 띄운 모습",
        caption: "수업 중 [수업 도구] → [실시간 채팅]에서 시청자 채팅을 봅니다.",
        width: 1118,
        height: 555,
      },
    ],
    "링크가 안 보이거나 시청을 제한하려면": [
      {
        type: "image",
        src: `${WEB_LIVE}/05-dashboard-live-settings.webp`,
        alt: "관리자 대시보드 웹 라이브/플레이백 화면의 웹 라이브 설정 탭. 계정 로그인 필요, 비밀번호 입력 후 시청, 비로그인 사용자 채팅·좋아요 허용, 보기 권한 설정이 보인다",
        caption: "[웹 라이브 설정] 탭에서 로그인·비밀번호·채팅 권한을 바꾸고, 오른쪽 위 [웹 라이브/플레이백 주소]에서 링크를 찾습니다.",
        width: 1125,
        height: 270,
      },
    ],
  },
  "teacher/cs-microphone-camera-check": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${MIC_CAMERA}/01-classroom-device-menu.webp`,
        alt: "교실 화면 오른쪽 위 마이크 아이콘 메뉴. 마이크 선택, 스피커 선택 목록 아래 설정 항목에 빨간 상자가 있다",
        caption: "오른쪽 위 마이크 아이콘 옆 화살표를 눌러 장치를 고르거나 맨 아래 [설정]을 누릅니다.",
        width: 625,
        height: 357,
      },
      {
        type: "image",
        src: `${MIC_CAMERA}/02-camera-settings.webp`,
        alt: "설정 창의 카메라 탭. 카메라 미리 보기 아래 카메라 목록이 펼쳐져 있다",
        caption: "[카메라]에서 미리 보기를 보며 쓸 카메라를 고릅니다.",
        width: 800,
        height: 802,
      },
      {
        type: "image",
        src: `${MIC_CAMERA}/03-microphone-settings.webp`,
        alt: "설정 창의 마이크 탭. 마이크 선택 상자와 그 아래 초록색 소리 막대에 빨간 상자가 있다",
        caption: "[마이크]에서 쓸 마이크를 고르고, 말할 때 소리 막대가 초록색으로 움직이는지 봅니다.",
        width: 800,
        height: 685,
      },
    ],
  },
  // "순서대로 따라 하기"에는 전체 순서 한 장이 붙어 있으므로, 단계 화면은 템플릿·게시 안내 섹션에 나눠 붙인다.
  "teacher/cs-bulk-exam-upload": {
    "템플릿을 쓸 때": [
      {
        type: "image",
        src: `${BULK_EXAM}/01-bulk-add-button.webp`,
        alt: "새 시험 추가 화면. 시험 문제 대량 추가 버튼에 빨간 상자와 화살표가 있다",
        caption: "[시험 문제 대량 추가]를 누릅니다.",
        width: 1060,
        height: 698,
      },
      {
        type: "image",
        src: `${BULK_EXAM}/02-template-download-upload.webp`,
        alt: "시험 문제 대량 추가 창. 템플릿 다운로드 메뉴의 워드 템플릿 다운로드와 오른쪽 템플릿 업로드 버튼에 빨간 상자가 있다",
        caption: "[템플릿 다운로드]로 템플릿을 받고, 문제를 적은 뒤 [템플릿 업로드]를 누릅니다.",
        width: 1078,
        height: 272,
      },
    ],
    "게시하기 전에": [
      {
        type: "image",
        src: `${BULK_EXAM}/03-recognition-confirm.webp`,
        alt: "시험 문제 편집 단계. 오른쪽에 문제 번호 동그라미와 인식 성공·실패 표시가 있고, 아래쪽 내 문제 은행에도 저장하기와 확인 버튼에 빨간 상자가 있다",
        caption: "초록 동그라미는 인식 성공, 빨간 동그라미는 실패입니다. 실패한 문제를 고치고, 필요하면 [내 문제 은행]에도 저장하기를 체크한 뒤 [확인]을 누릅니다.",
        width: 1078,
        height: 717,
      },
      {
        type: "image",
        src: `${BULK_EXAM}/04-publish-exam.webp`,
        alt: "문제가 들어간 새 시험 추가 화면. 오른쪽에 시간, 점수, 게시 설정이 있고 오른쪽 아래 게시 버튼에 빨간 상자가 있다",
        caption: "문제 수·만점과 게시 설정을 확인하고 [게시]를 누릅니다. 바로 공개하지 않으려면 [초안 저장]을 누릅니다.",
        width: 1060,
        height: 700,
      },
    ],
  },
}
