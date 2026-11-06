import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/admin.json 으로 만든다(원본·자른 위치·가린 영역 기록).
const G = "/docs/files/guides"

export const ADMIN_GUIDE_MEDIA: GuideMediaMap = {
  "admin/admin-operation-standardization": {
    "관리자 콘솔 메뉴는 이렇게 나뉩니다": [
      {
        type: "image",
        src: `${G}/admin-operation-standardization/01-dashboard-home.webp`,
        alt: "관리자용 대시보드 [홈] 화면. 왼쪽에 기관 관리·스토리지·학습 관리 메뉴가 있고, 서비스 버전, 진행 중인 코스 수, 교사 수, 학생 수와 공지사항이 보입니다.",
        caption: "[홈]에서 서비스 버전과 코스·교사·학생 수를 한눈에 봅니다. 나머지 메뉴는 왼쪽에 모여 있습니다.",
        width: 1145,
        height: 249,
      },
    ],
    "수업 전·중·후에 확인할 것": [
      {
        type: "image",
        src: `${G}/class-monitoring/01-lesson-detail.webp`,
        alt: "수업 모니터링에서 수업 하나를 연 화면. 1분 간격 교실 스크린샷, 시간대별 학생 수 도표, 참여자별 출석과 시간줄이 차례로 보입니다.",
        caption: "수업 중에는 [관리자 기능] > [수업 모니터링]에서 교실 화면과 출석을 함께 봅니다.",
        width: 1200,
        height: 569,
      },
    ],
  },
  "admin/account-verification": {
    "인증 절차": [
      {
        type: "image",
        src: `${G}/account-verification/01-admin-dashboard-entry.webp`,
        alt: "PC 앱 [계정 및 설정] 창의 [나의 서비스] 화면에서 오른쪽 [관리자용 대시보드] 버튼을 강조한 화면",
        caption: "PC 앱에서는 왼쪽 아래 프로필 > [계정 및 설정] > [나의 서비스]의 [관리자용 대시보드]로 들어갑니다.",
        width: 1000,
        height: 755,
      },
      {
        type: "image",
        src: `${G}/account-verification/02-verification-edit.webp`,
        alt: "관리자용 대시보드 [계정 정보] > [인증 자료] 화면. 인증 상태와 [편집] 버튼 아래로 브랜드 이름, 브랜드 로고, 주영 종류, 소재지, 상세 주소, 담당자 정보, 인증 방식 칸이 보입니다.",
        caption: "[계정 정보] > [인증 자료]에서 [편집]을 눌러 학원 정보와 증명서를 올립니다. 처리가 끝나면 인증 상태가 '인증됨'으로 바뀝니다.",
        width: 1000,
        height: 915,
      },
    ],
  },
  "admin/teacher-onboarding": {
    "교사 등록하기": [
      {
        type: "image",
        src: `${G}/teacher-onboarding/02-teacher-list.webp`,
        alt: "관리자용 대시보드 [기관 관리] > [교사] 목록. 오른쪽 위에 [교사 추가] 버튼이 있고, 줄마다 교사 상태와 [보기], [비활성화]가 있습니다.",
        caption: "[교사] 화면 오른쪽 위 [교사 추가]로 등록하고, 목록 오른쪽 [보기]로 그 강사의 수업 목록을 엽니다.",
        width: 1024,
        height: 483,
      },
    ],
    "코스를 직접 만드는 강사에게만 권한 더 주기": [
      {
        type: "image",
        src: `${G}/teacher-onboarding/01-sub-account-list.webp`,
        alt: "관리자용 대시보드 [계정 정보] > [권한 관리] 화면. [하위 계정 추가] 버튼과 하위 계정별 메뉴 권한 체크 표시, 오른쪽 [편집]·[삭제]가 보입니다.",
        caption: "[권한 관리]에서 [하위 계정 추가]를 누르고, 이미 등록한 계정은 오른쪽 [편집]으로 권한을 바꿉니다.",
        width: 1024,
        height: 492,
      },
    ],
    "담당 코스에 배정하기": [
      {
        type: "image",
        src: `${G}/course-management/02-set-teacher.webp`,
        alt: "코스의 [구성원] 탭에서 [교사로 설정]을 눌러 연 교사 선택 창. 강사를 고르고 [확인]을 누르며, 목록에 없으면 왼쪽 아래 [교사 추가]를 씁니다.",
        caption: "코스 [구성원] > [교사로 설정]에서 강사를 골라 [확인]을 누릅니다.",
        width: 1200,
        height: 559,
      },
      {
        type: "image",
        src: `${G}/course-management/03-homeroom-menu.webp`,
        alt: "코스 [구성원] 탭에서 교사 이름 옆 더보기 메뉴를 열어 [교사 삭제]와 [담임 교사로 설정]이 보이는 화면",
        caption: "반 담임으로 둘 강사는 이름 옆 더보기(⋮) 메뉴에서 [담임 교사로 설정]을 누릅니다.",
        width: 1200,
        height: 284,
      },
    ],
  },
  "admin/student-onboarding": {
    "가입 전인 학생은 대리 등록으로": [
      {
        type: "image",
        src: `${G}/student-onboarding/02-proxy-register.webp`,
        alt: "[학생 추가] 창에서 [학생 대리 등록]을 체크해 대리 등록 안내가 나타나고, +82 국가번호와 휴대폰 번호, 이름을 입력한 뒤 [확인]을 누르는 화면",
        caption: "[학생 대리 등록]을 체크하면 안내 문구가 나타납니다. 국가번호 +82를 확인하고 번호와 이름을 넣은 뒤 [확인]을 누릅니다.",
        width: 420,
        height: 432,
      },
    ],
    "등록한 뒤에 할 일": [
      {
        type: "image",
        src: `${G}/student-onboarding/01-course-members.webp`,
        alt: "코스의 [구성원] 탭에서 [코스 내 학생을 설정하기] 버튼을 강조한 화면",
        caption: "코스 [구성원] 탭의 [코스 내 학생을 설정하기]로 등록한 학생을 반에 넣습니다.",
        width: 1026,
        height: 236,
      },
    ],
  },
  "admin/course-creation": {
    "코스 만들기": [
      {
        type: "image",
        src: `${G}/course-management/01-course-list.webp`,
        alt: "관리자용 대시보드 [기관 관리] > [코스 관리] 화면. 검색 조건 아래에 [코스 만들기] 버튼과 코스 목록이 있습니다.",
        caption: "[코스 관리] 목록 위의 [코스 만들기]로 새 코스를 만들고, 코스 이름을 누르면 코스 안으로 들어갑니다.",
        width: 1200,
        height: 218,
      },
    ],
    "교사와 학생 넣기": [
      {
        type: "image",
        src: `${G}/student-onboarding/01-course-members.webp`,
        alt: "코스 [구성원] 탭에서 교사 영역의 [교사로 설정]과 수강생 영역의 [코스 내 학생을 설정하기] 버튼이 보이는 화면",
        caption: "코스 [구성원]에서 교사는 [교사로 설정], 학생은 [코스 내 학생을 설정하기]로 넣습니다.",
        width: 1026,
        height: 236,
      },
    ],
    "수업 하나 만들기": [
      {
        type: "image",
        src: `${G}/web-live-playback/01-create-lesson.webp`,
        alt: "코스 [시간표]에서 [수업 생성]을 눌러 연 수업 생성 창. 수업 이름, 단원, 시작 시간, 진행 시간, 수업 교사, 조교, 스테이지 표시, 온스테이지 인원 수, 하이브리드 수업, 드라이브 리소스, 수업 녹화 옵션 칸이 보입니다.",
        caption: "[시간표] > [수업 생성]을 누르면 수업 정보 창이 열립니다. 다 정했으면 [게시하기]를 누릅니다.",
        width: 990,
        height: 474,
      },
    ],
    "반복 수업은 한 번에 만들기": [
      {
        type: "image",
        src: `${G}/course-management/04-bulk-teacher.webp`,
        alt: "코스 [학습 활동] 탭에서 수업을 전체 선택한 뒤 [대량 작업] 메뉴를 펼친 화면. 단원, 시작일, 시작 시간, 진행 시간, 수업 교사, 조교, 온스테이지 인원 수, 녹화·웹 라이브 설정 같은 항목이 보입니다.",
        caption: "이미 만든 수업 여러 개는 [학습 활동]에서 선택한 뒤 [대량 작업]으로 한꺼번에 바꿉니다.",
        width: 1200,
        height: 595,
      },
    ],
  },
  "admin/course-management": {
    "코스 찾기": [
      {
        type: "image",
        src: `${G}/course-management/01-course-list.webp`,
        alt: "관리자용 대시보드 [기관 관리] > [코스 관리] 화면. 코스 이름·담임 교사·교사·코스 학생·수업 시간·코스 상태 검색 조건과 코스 목록이 보입니다.",
        caption: "[코스 관리]에서 조건을 넣어 코스를 찾고, 코스 이름을 눌러 상세 화면으로 들어갑니다.",
        width: 1200,
        height: 218,
      },
    ],
    "강사가 바뀔 때 담임·수업 교사 넘기기": [
      {
        type: "image",
        src: `${G}/course-management/02-set-teacher.webp`,
        alt: "코스 [구성원] 탭에서 [교사로 설정]을 눌러 연 교사 선택 창. 새 강사를 체크하고 [확인]을 누르며, 왼쪽 아래에 [교사 추가]가 있습니다.",
        caption: "1. [구성원] > [교사로 설정]에서 새 강사를 골라 [확인]을 누릅니다.",
        width: 1200,
        height: 559,
      },
      {
        type: "image",
        src: `${G}/course-management/03-homeroom-menu.webp`,
        alt: "코스 [구성원] 탭에서 강사 이름 옆 더보기 메뉴를 열어 [교사 삭제]와 [담임 교사로 설정]이 보이는 화면",
        caption: "2. 새 강사 이름 옆 더보기(⋮) 메뉴에서 [담임 교사로 설정]을 누릅니다. 이전 강사는 같은 메뉴의 [교사 삭제]로 뺍니다.",
        width: 1200,
        height: 284,
      },
      {
        type: "image",
        src: `${G}/course-management/04-bulk-teacher.webp`,
        alt: "코스 [학습 활동] 탭에서 수업을 전체 선택하고 [대량 작업] > [수업 교사 설정하기]를 고르는 화면",
        caption: "3. [학습 활동]에서 수업을 전체 선택하고 [대량 작업] > [수업 교사 설정하기]로 수업 교사를 바꿉니다.",
        width: 1200,
        height: 595,
      },
    ],
    "수업 기록 확인하기": [
      {
        type: "image",
        src: `${G}/course-management/06-lesson-operate-menu.webp`,
        alt: "관리자용 대시보드 [기관 관리] > [수업 관리] 목록에서 수업 오른쪽 [조작]을 펼쳐 수업 모니터링 데이터, 수업 데이터, 웹 라이브 및 다시 보기 관리, 수업 녹화 데이터, 학습 보고서 메뉴가 보이는 화면",
        caption: "[수업 관리]에서 상태와 수업 시작일로 수업을 좁힌 뒤, 오른쪽 [조작]에서 볼 기록을 고릅니다.",
        width: 1200,
        height: 355,
      },
    ],
    "코스를 종료하기 전에": [
      {
        type: "image",
        src: `${G}/course-management/05-replay-period.webp`,
        alt: "코스 [설정] 탭에서 다시 보기 유효 기간을 고정 유효 기간 또는 수업 종료 후 며칠 동안 유효 중에서 고르고, 맨 아래 [설정 저장하기]를 누르는 화면",
        caption: "코스 [설정]의 [다시 보기 유효 기간]을 정하고 맨 아래 [설정 저장하기]를 누릅니다.",
        width: 670,
        height: 528,
      },
    ],
  },
  "admin/storage-management": {
    "수업 녹화본 보기, 내려받기, 공유하기": [
      {
        type: "image",
        src: `${G}/storage-management/02-recorded-video-link.webp`,
        alt: "관리자용 대시보드 [스토리지] > [수업 리소스] 목록에서 녹화가 있는 수업의 오퍼레이션 칸 [녹화된 수업 비디오]를 강조한 화면",
        caption: "1. [수업 리소스]에서 녹화가 있는 수업의 [녹화된 수업 비디오]를 누릅니다.",
        width: 1079,
        height: 299,
      },
      {
        type: "image",
        src: `${G}/storage-management/03-recording-download.webp`,
        alt: "수업 녹화 데이터 화면. 클립마다 생성 방법(녹화), 동영상 화면(교실·현장 녹화), 녹화 시간, 파일 크기, 파일 상태가 있고 오른쪽에 [다운로드]와 [삭제]가 있습니다.",
        caption: "2. 클립 목록에서 받을 클립의 [다운로드]를 누릅니다. 교실 화면과 현장 녹화는 클립이 따로 나옵니다.",
        width: 1079,
        height: 208,
      },
      {
        type: "image",
        src: `${G}/storage-management/04-player-download.webp`,
        alt: "브라우저에서 녹화 영상을 재생하는 화면. 주소창의 재생 링크와 플레이어 오른쪽 아래 더보기 메뉴의 [다운로드], [재생 속도], [PIP 모드]가 강조되어 있습니다.",
        caption: "3. 플레이어 오른쪽 아래 더보기(⋮) > [다운로드]로도 받고, 주소창의 재생 링크를 복사해 공유합니다.",
        width: 1000,
        height: 528,
      },
    ],
    "수업 데이터 지우기": [
      {
        type: "image",
        src: `${G}/storage-management/01-lesson-resources.webp`,
        alt: "[스토리지] > [수업 리소스] 화면에서 수업 시간으로 기간을 정하고 수업을 체크한 뒤 [모든 수업 데이터 삭제하기]를 누르는 화면. 위쪽에 이미지 삭제, 동영상 삭제, 보호 잠금, 잠금 해제 버튼이 함께 있습니다.",
        caption: "[수업 시간]으로 대상을 좁히고 지울 수업을 체크한 뒤 [모든 수업 데이터 삭제하기]를 누릅니다.",
        width: 1195,
        height: 302,
      },
    ],
  },
  "admin/shared-drive": {
    "공유 드라이브 만들기": [
      {
        type: "image",
        src: `${G}/shared-drive/01-drive-list.webp`,
        alt: "관리자용 대시보드 [스토리지] > [공유 드라이브] 화면. 왼쪽 위 [공유 드라이브 만들기] 버튼, 오른쪽 위 사용 용량과 [지원되는 파일 유형], 드라이브 더보기 메뉴의 [구성원 관리]·[이름 변경]·[삭제]가 보입니다.",
        caption: "[공유 드라이브 만들기]로 새로 만들고, 이미 만든 드라이브는 더보기(···) > [구성원 관리]에서 구성원을 관리합니다.",
        width: 1024,
        height: 234,
      },
    ],
    "권한 네 가지": [
      {
        type: "image",
        src: `${G}/shared-drive/02-member-permission.webp`,
        alt: "공유 드라이브 구성원 관리 창에서 구성원 오른쪽 권한 메뉴를 펼쳐 관리자, 컨텐츠 관리자, 읽기 전용, 감추기, 구성원 삭제가 보이고 읽기 전용이 선택된 화면",
        caption: "구성원 오른쪽 권한 메뉴에서 권한을 고릅니다. 수업 중에 쓰기만 하게 하려면 [읽기 전용]입니다.",
        width: 512,
        height: 294,
      },
    ],
  },
  "admin/web-live-playback": {
    "웹 라이브 수업 만들기": [
      {
        type: "image",
        src: `${G}/web-live-playback/01-create-lesson.webp`,
        alt: "코스 [시간표]에서 [수업 생성]을 눌러 연 창. 아래쪽 수업 녹화 옵션의 Classin 수업 녹화 체크가 강조되어 있습니다.",
        caption: "1. [시간표] > [수업 생성]에서 수업 녹화 옵션을 하나 이상 켭니다.",
        width: 990,
        height: 474,
      },
      {
        type: "image",
        src: `${G}/web-live-playback/02-web-live-options.webp`,
        alt: "수업 생성 창의 웹 라이브&플레이백 옵션. 웹 라이브·다시 보기 체크, 로그인 필요, 비밀번호 입력 후 시청, 비로그인 사용자 채팅·좋아요 허용, 실시간 채팅 금지, 시청 권한, 커버 이미지와 소개 칸, [게시하기] 버튼이 보입니다.",
        caption: "2. [웹 라이브&플레이백]에서 웹 라이브와 다시 보기, 시청 조건을 고른 뒤 [게시하기]를 누릅니다.",
        width: 410,
        height: 418,
      },
    ],
    "링크 복사해서 보내기": [
      {
        type: "image",
        src: `${G}/web-live-playback/03-timetable-link.webp`,
        alt: "코스 [시간표] 목록의 웹 라이브&플레이백 칸에서 링크 아이콘을 눌러 QR 코드와 [링크 복사] 버튼이 있는 창을 연 화면",
        caption: "[시간표] 목록의 웹 라이브&플레이백 칸에서 링크 아이콘을 누르면 QR 코드와 [링크 복사]가 나옵니다.",
        width: 760,
        height: 279,
      },
    ],
    "누가 볼 수 있는지 정하기": [
      {
        type: "image",
        src: `${G}/web-live-playback/04-viewer-settings.webp`,
        alt: "웹 라이브/플레이백 관리 화면의 [웹 라이브 설정] 탭. 권한 설정(로그인 필요, 비밀번호 입력 후 시청, 비로그인 사용자 채팅·좋아요 허용), 보기 권한 설정, 라이브 커버가 보입니다.",
        caption: "수업 하나의 시청 조건은 [웹 라이브 및 다시 보기 관리] > [웹 라이브 설정] 탭에서 바꿉니다.",
        width: 1100,
        height: 274,
      },
    ],
    "끝난 뒤 시청 기록 보기": [
      {
        type: "image",
        src: `${G}/web-live-playback/05-viewing-data.webp`,
        alt: "수업 목록 [관리] 메뉴에서 [웹 라이브 및 다시 보기 관리]를 열어 시청 데이터, 예약·로그인, 채팅 수와 시청자별 시청 기록 표를 보는 화면",
        caption: "[관리] > [웹 라이브 및 다시 보기 관리]에서 시청자 수, 조회수, 채팅과 시청자별 시청 시간을 봅니다.",
        width: 1100,
        height: 562,
      },
    ],
  },
  "admin/class-monitoring": {
    "모니터링 화면에서 보이는 것": [
      {
        type: "image",
        src: `${G}/class-monitoring/01-lesson-detail.webp`,
        alt: "수업 하나의 모니터링 화면. 위에서부터 1분 간격 교실 스크린샷, 시간대별 접속 인원을 그린 학생 수 도표, 참여자별 출석·지각·조퇴와 시간줄이 있는 출석 표가 보입니다.",
        caption: "교실 스크린샷, 학생 수 도표, 출석 표가 한 화면에 나옵니다. 결석은 빨간 글씨로 표시됩니다.",
        width: 1200,
        height: 569,
      },
    ],
    "수업 시작 직후 점검하는 순서": [
      {
        type: "image",
        src: `${G}/class-monitoring/02-attendance-timeline.webp`,
        alt: "학생 수 도표와 출석 표의 시간줄. 시간줄 표시에 마우스를 올리자 교실에서 나간 시각과 이유가 말풍선으로 나온 화면",
        caption: "접속 인원이 떨어진 시점은 도표에서, 그 시각에 누가 나갔는지는 시간줄에 마우스를 올려 확인합니다.",
        width: 1200,
        height: 496,
      },
    ],
  },
  "admin/institution-settings": {
    "학생 이름 대신 전화번호가 보일 때": [
      {
        type: "image",
        src: `${G}/institution-settings/02-nickname-sync.webp`,
        alt: "관리자용 대시보드 [일반 설정] > [클래스 설정] 탭에서 '클래스 닉네임 설정 동기화' 토글과 설명을 강조한 화면",
        caption: "[일반 설정] > [클래스 설정]의 '클래스 닉네임 설정 동기화'를 켭니다.",
        width: 910,
        height: 200,
      },
    ],
    "수업 다시보기 설정": [
      {
        type: "image",
        src: `${G}/institution-settings/01-replay-new-students.webp`,
        alt: "관리자용 대시보드 [일반 설정] > [수업 다시보기] 탭. 코스 정규 학생과 교사의 다시보기 설정 아래 고급 설정의 '코스에 새로 가입된 학생이 이전 수업의 다시보기 시청을 허용합니다' 토글이 강조되어 있습니다.",
        caption: "[수업 다시보기] 탭의 고급 설정에서 새로 들어온 학생의 지난 수업 다시보기를 허용합니다.",
        width: 1145,
        height: 328,
      },
    ],
    "부가가치 서비스": [
      {
        type: "image",
        src: `${G}/institution-settings/03-value-added-services.webp`,
        alt: "관리자용 대시보드 [일반 설정] > [부가가치 서비스] 탭. AI 에이전트의 기본 에이전트와 AI 강의 분석 토글, 하이브리드 수업 기능 활성화 토글, 스마트 담임 교사 항목이 보입니다.",
        caption: "[부가가치 서비스] 탭에서 AI 에이전트, 하이브리드 수업, 스마트 담임 교사를 켜고 끕니다.",
        width: 1036,
        height: 260,
      },
    ],
    "저장 설정": [
      {
        type: "image",
        src: `${G}/institution-settings/04-storage-settings.webp`,
        alt: "관리자용 대시보드 [일반 설정] > [저장 설정] 탭. 삭제한 파일은 되돌릴 수 없다는 경고, 과거 저장된 리소스 삭제의 [삭제 작업 생성] 버튼, 리소스 자동 삭제 설정의 항목별 토글이 보입니다.",
        caption: "[저장 설정]에서 지난 데이터를 한 번에 지우거나(삭제 작업 생성) 항목별 자동 삭제를 켭니다.",
        width: 1039,
        height: 499,
      },
      {
        type: "image",
        src: `${G}/institution-settings/05-delete-task.webp`,
        alt: "[삭제 작업 생성] 창. 위쪽 주의 사항 아래에서 시간 범위를 정하고, 수업 리소스·코스 첨부 파일·코스 내 파일·게시판 문서 가운데 지울 콘텐츠를 체크한 뒤 [확인]을 누릅니다.",
        caption: "지울 기간과 콘텐츠 종류를 고르고 [확인]을 누르면 삭제 작업이 만들어집니다.",
        width: 354,
        height: 370,
      },
    ],
  },
  "admin/statistics-data": {
    "통계 파일 내려받기": [
      {
        type: "image",
        src: `${G}/statistics-data/01-statistics-download.webp`,
        alt: "관리자용 대시보드 [결제] > [통계 다운로드] 화면. 위쪽에서 기간을 고르고, 수업 소비, 저장 소비/레슨 스토리지 소비 요약, 문자/통화, 출결 통계, 수업 강의 분석 항목마다 [다운로드] 버튼이 있습니다.",
        caption: "기간을 고른 뒤 [수업 소비]의 [다운로드]를 누르면 Excel 파일로 받습니다.",
        width: 488,
        height: 492,
      },
      {
        type: "image",
        src: `${G}/statistics-data/02-teacher-schedule.webp`,
        alt: "[기관 관리] > [교사]에서 [보기]를 눌러 연 교사 세부 정보 화면. 수업 목록 탭에 수업 일자, 수업 시간, 지속 시간, 상태, 학생 수, 실제 수업 기간, 출석이 나오고 아래쪽에서 페이지당 개수를 바꿉니다.",
        caption: "강사 한 명의 수업 일정은 [교사] 목록의 [보기]에서 바로 봅니다.",
        width: 1024,
        height: 486,
      },
    ],
    "학생이 다시보기를 봤는지 확인하려면": [
      {
        type: "image",
        src: `${G}/statistics-data/03-learning-data-list.webp`,
        alt: "관리자용 대시보드 [학습 관리] > [학습 데이터] 수업 목록에서 수업 오른쪽 [수업 데이터]를 펼쳐 [수업 데이터]를 고르는 화면",
        caption: "1. [학습 데이터]에서 확인할 수업의 [수업 데이터] > [수업 데이터]를 누릅니다.",
        width: 1021,
        height: 489,
      },
      {
        type: "image",
        src: `${G}/statistics-data/04-custom-columns.webp`,
        alt: "수업 데이터의 [학습 분석] 탭에서 [표 사용자 정의 지표]를 열어 '수업 다시보기'를 체크하고 [확인]을 누르는 화면",
        caption: "2. [학습 분석] 탭에서 수업과 학생을 고르고 [표 사용자 정의 지표]에서 '수업 다시보기'를 체크합니다.",
        width: 1021,
        height: 253,
      },
      {
        type: "image",
        src: `${G}/statistics-data/05-replay-watch-count.webp`,
        alt: "학습 분석 표 오른쪽 수업 다시보기 칸에 학생별 유효 시청 횟수, 실제 시청 시간, 동영상 시간이 나온 화면",
        caption: "3. 오른쪽 [수업 다시보기] 칸에서 유효 시청 횟수와 실제 시청 시간을 봅니다.",
        width: 1021,
        height: 494,
      },
    ],
  },
}
