import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/cs-usage-2.json 으로 만든다(원본·자른 위치·가린 영역 기록).
// 대상은 목록에 노출하지 않는(unlisted) 사용법 문서다. 사진을 매핑하면 원본 합성 화면은 빠지므로
// 합성 화면이 보여 주던 단계를 모두 덮는다. 같은 화면을 다른 그룹이 이미 만든 경우 그 사진을 그대로 쓴다.
const G = "/docs/files/guides"
const TEACHER_CHANGE = `${G}/cs-figma-digest-1004`
const NICKNAME = `${G}/cs-figma-digest-1131`
const CAMERA_MIC = `${G}/cs-figma-digest-1213`
const PROXY = `${G}/cs-figma-digest-1327`
const WEB_LIVE = `${G}/cs-figma-digest-350`
const LESSON_DELETE = `${G}/cs-figma-digest-655`
const MEMBER_DELETE = `${G}/cs-figma-digest-859`
const SHARED_DRIVE = `${G}/cs-figma-digest-961`
const FIELD_RECORDING = `${G}/cs-figma-digest-194`
const LOCAL_RECORDING = `${G}/cs-figma-digest-245`
const REPORT = `${G}/cs-figma-digest-1462`
const MOBILE_UPDATE = `${G}/cs-figma-digest-1813`
const HOMEWORK = `${G}/cs-figma-digest-2103`
const COPY_ACTIVITY = `${G}/cs-figma-digest-328`
const BOARD = `${G}/cs-figma-digest-500`

export const CS_USAGE_2_GUIDE_MEDIA: GuideMediaMap = {
  "admin/cs-figma-digest-1004": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/course-management/04-bulk-teacher.webp`,
        alt: "관리자 대시보드 코스의 학습 활동 탭. 목록 맨 위 전체 선택 체크박스, 대량 작업 버튼, 펼친 메뉴의 수업 교사 설정하기에 빨간 상자가 있다",
        caption: "1~4단계: [학습 활동]에서 전체 선택 체크박스를 누르고 [대량 작업] → [수업 교사 설정하기]를 고릅니다.",
        width: 1200,
        height: 595,
      },
      {
        type: "image",
        src: `${TEACHER_CHANGE}/02-select-lesson-teacher.webp`,
        alt: "수업 교사 설정하기 창. 구성원 목록에서 선택하기 탭에서 교사 한 명이 선택돼 있고, 왼쪽 아래 교사 추가와 오른쪽 아래 확인 버튼이 있다",
        caption: "5~6단계: 새 교사를 고르고 [확인]을 누릅니다. 목록에 없으면 왼쪽 아래 [교사 추가]로 넣습니다.",
        width: 856,
        height: 568,
      },
      {
        type: "image",
        src: `${G}/course-management/03-homeroom-menu.webp`,
        alt: "코스 구성원 탭. 교사 카드 옆 점 세 개 메뉴를 펼쳐 교사 삭제와 담임 교사로 설정 항목이 보인다",
        caption: "7~9단계: [구성원]에서 기존 교사 카드의 점 세 개(⋮)를 누르고 [교사 삭제]를 고릅니다.",
        width: 1200,
        height: 284,
      },
    ],
  },
  "admin/cs-figma-digest-1131": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/student-profile/03-pc-course-name.webp`,
        alt: "클래스인 PC 앱의 코스 화면. 왼쪽 위 코스 이름 영역에 빨간 상자와 화살표가 있다",
        caption: "1단계: 왼쪽 위 코스 이름을 누릅니다.",
        width: 893,
        height: 519,
      },
      {
        type: "image",
        src: `${NICKNAME}/02-course-settings-manage.webp`,
        alt: "코스 설정 창. 코스 구성원 및 그룹 구성, 코스 QR 코드 및 링크, 코스 소개 등 메뉴 가운데 코스 관리에 빨간 상자가 있다",
        caption: "2단계: 코스 설정에서 [코스 관리]를 누릅니다.",
        width: 276,
        height: 468,
      },
      {
        type: "image",
        src: `${G}/teacher-profile/05-allow-student-nickname.webp`,
        alt: "코스 관리 창의 토글 목록. 학생의 코스 내 닉네임 수정을 허용 항목에 빨간 상자와 화살표가 있다",
        caption: "3단계: [학생의 코스 내 닉네임 수정을 허용]을 켭니다.",
        width: 320,
        height: 500,
      },
      {
        type: "image",
        src: `${G}/teacher-profile/06-student-nickname-before-after.webp`,
        alt: "학생 휴대폰의 코스 설정 화면 두 개. 왼쪽은 닉네임 수정 권한이 꺼졌다는 안내가 뜬 화면, 오른쪽은 코스 내 나의 닉네임 옆에 화살표가 생긴 화면이다",
        caption: "켜기 전(왼쪽)에는 학생이 닉네임을 바꿀 수 없다는 안내가 뜨고, 켠 뒤(오른쪽)에는 [코스 내 나의 닉네임]을 눌러 바꿀 수 있습니다.",
        width: 930,
        height: 620,
      },
    ],
  },
  "admin/cs-figma-digest-1213": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/camera-mic-troubleshooting/01-pc-quick-device-menu.webp`,
        alt: "교실 화면 오른쪽 위 마이크·카메라 아이콘 메뉴. 마이크 선택과 스피커 선택 목록 아래 설정 항목에 빨간 상자가 있다",
        caption: "1단계: 교실 오른쪽 위 아이콘 옆 화살표로 장치를 바꾸거나, 맨 아래 [설정]을 누릅니다.",
        width: 594,
        height: 287,
      },
      {
        type: "image",
        src: `${G}/classroom-basic-setup/05-mic-settings.webp`,
        alt: "설정 창의 마이크 탭. 마이크 선택 상자와 그 아래 초록색 소리 막대에 빨간 상자가 있다",
        caption: "2~3단계: [마이크]에서 쓸 마이크를 고르고, 소리 막대가 초록색으로 움직이는지 봅니다.",
        width: 800,
        height: 688,
      },
      {
        type: "image",
        src: `${G}/classroom-basic-setup/06-settings-camera.webp`,
        alt: "설정 창의 카메라 탭. 카메라 미리 보기 아래 카메라 목록이 펼쳐져 있고 빨간 상자가 있다",
        caption: "4~5단계: [카메라]에서 쓸 카메라를 고르고, 미리 보기 화면과 장치 이름을 확인합니다.",
        width: 800,
        height: 803,
      },
      {
        type: "image",
        src: `${CAMERA_MIC}/04-field-recording-camera.webp`,
        alt: "현장 녹화 창과 설정 창. 현장 녹화 창 위쪽 톱니바퀴, 카메라 목록, 바로 녹화하기 버튼에 빨간 상자가 있다",
        caption: "6~7단계(현장 녹화를 켠 수업): 현장 녹화 창의 톱니바퀴에서 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 839,
        height: 464,
      },
      {
        type: "image",
        src: `${CAMERA_MIC}/05-recording-icon.webp`,
        alt: "교실 화면 오른쪽 위 아이콘 줄. 초록색 녹화 아이콘에 빨간 상자가 있다",
        caption: "8~9단계: 오른쪽 위 녹화 아이콘으로 설정을 바꿀 수 있고, 녹화 중이면 아이콘이 초록색입니다.",
        width: 513,
        height: 323,
      },
    ],
  },
  "admin/cs-figma-digest-1327": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${PROXY}/01-course-list.webp`,
        alt: "관리자 대시보드 코스 관리 화면. 왼쪽 코스 관리 메뉴와 목록의 코스 이름에 빨간 상자와 화살표가 있다",
        caption: "1단계: [기관 관리] → [코스 관리]에서 학생을 넣을 코스 이름을 누릅니다.",
        width: 727,
        height: 310,
      },
      {
        type: "image",
        src: `${G}/student-onboarding/01-course-members.webp`,
        alt: "코스 화면의 구성원 탭. 위쪽 구성원 탭과 수강생 아래 코스 내 학생을 설정하기 버튼에 빨간 상자와 화살표가 있다",
        caption: "2단계: [구성원]을 누르고 [코스 내 학생을 설정하기]를 누릅니다.",
        width: 1026,
        height: 236,
      },
      {
        type: "image",
        src: `${G}/cs-transfer-student-registration/03-proxy-registration.webp`,
        alt: "학생 추가 창. 왼쪽 아래 학생 대리 등록 체크박스와 뒤쪽 창의 학생 추가 버튼에 빨간 상자가 있다",
        caption: "3단계: 아래 [학생 추가]를 누르고 [학생 대리 등록]을 체크합니다.",
        width: 596,
        height: 403,
      },
      {
        type: "image",
        src: `${G}/student-onboarding/02-proxy-register.webp`,
        alt: "학생 대리 등록을 체크한 학생 추가 창. 위쪽 노란 안내문 아래 휴대폰 번호와 이름 입력 줄, 오른쪽 아래 확인 버튼에 빨간 상자가 있다",
        caption: "4단계: 아이디로 쓸 휴대폰 번호와 이름을 넣고 [확인]을 누릅니다. 등록하면 학생 휴대폰으로 문자가 가고 요금이 붙습니다.",
        width: 420,
        height: 432,
      },
      {
        type: "image",
        src: `${PROXY}/05-multiple-students.webp`,
        alt: "학생 추가 창에 입력 줄 세 개가 이어져 있고 빨간 상자로 묶여 있다",
        caption: "5단계: 여러 명이면 아래 줄에 이어서 입력합니다. 한 번에 300명까지 넣을 수 있습니다.",
        width: 481,
        height: 376,
      },
      {
        type: "image",
        src: `${PROXY}/06-import-from-text.webp`,
        alt: "관리자 대시보드 학생 화면에서 연 학생 추가 창. 왼쪽 학생 메뉴, 학생 추가 버튼, 텍스트에서 가져오기 입력 칸, 학생 대리 등록 체크박스, 확인 버튼에 빨간 상자가 있다",
        caption: "6단계: 코스 없이 학생만 만들 때는 [학생] → [학생 추가] → [텍스트에서 가져오기]에 \"82-휴대폰번호#이름\" 형식으로 넣고 [학생 대리 등록]을 체크한 뒤 [확인]을 누릅니다.",
        width: 778,
        height: 434,
      },
    ],
  },
  "admin/cs-figma-digest-350": {
    "코스 선택하기": [
      {
        type: "image",
        src: `${WEB_LIVE}/01-course-list.webp`,
        alt: "관리자 대시보드 코스 관리 화면. 왼쪽 코스 관리 메뉴에 빨간 상자가 있고 화살표가 목록의 코스 이름을 가리킨다",
        caption: "[코스 관리]에서 수업을 만들 코스 이름을 누릅니다.",
        width: 727,
        height: 348,
      },
    ],
    "수업 생성하고 녹화 옵션 켜기": [
      {
        type: "image",
        src: `${WEB_LIVE}/02-create-lesson-recording.webp`,
        alt: "코스의 시간표 탭과 수업 생성 버튼, 열린 수업 생성 창 아래쪽 수업 녹화 옵션에 빨간 상자가 있다",
        caption: "[시간표] → [수업 생성]을 누르고 [수업 녹화 옵션]을 하나 이상 켭니다.",
        width: 706,
        height: 465,
      },
    ],
    "웹 라이브와 플레이백 설정하기": [
      {
        type: "image",
        src: `${WEB_LIVE}/03-web-live-options.webp`,
        alt: "수업 생성 창의 웹 라이브&플레이백 옵션. 웹 라이브, 다시 보기, 로그인·비밀번호·채팅 허용, 시청 권한 설정에 빨간 상자가 있고 오른쪽 아래 게시하기 버튼이 강조돼 있다",
        caption: "[웹 라이브&플레이백]을 켜고 세부 옵션을 고른 뒤 [게시하기]를 누릅니다.",
        width: 410,
        height: 465,
      },
    ],
    "공유 링크와 QR 확인하기": [
      {
        type: "image",
        src: `${WEB_LIVE}/04-share-link-qr.webp`,
        alt: "코스 시간표의 수업 행. 웹 라이브&플레이백 칸의 링크 아이콘을 눌러 QR 코드(가림)와 링크 복사 버튼이 있는 작은 창이 열려 있다",
        caption: "[시간표]에서 수업 행의 웹 라이브&플레이백 칸 링크 아이콘을 누르면 QR 코드와 [링크 복사]가 나옵니다.",
        width: 766,
        height: 287,
      },
    ],
    "시청 데이터 확인하기": [
      {
        type: "image",
        src: `${WEB_LIVE}/05-live-replay-data.webp`,
        alt: "수업 행의 관리 메뉴에서 웹 라이브 및 다시 보기 관리를 고르는 모습과, 뒤쪽 웹 라이브/플레이백 화면의 시청 데이터·예약/로그인·채팅 통계와 사용자 목록",
        caption: "수업의 [관리] → [웹 라이브 및 다시 보기 관리]에서 시청자 수, 채팅, 사용자별 시청 기록을 봅니다.",
        width: 1174,
        height: 550,
      },
    ],
    "입장 권한 추가로 부여하기": [
      {
        type: "image",
        src: `${WEB_LIVE}/06-web-live-settings.webp`,
        alt: "웹 라이브/플레이백 화면의 웹 라이브 설정 탭. 권한 설정과 보기 권한 설정, 라이브 커버, 라이브 소개 항목이 보인다",
        caption: "[웹 라이브 설정] 탭에서 로그인 필요, 비밀번호, 채팅 허용, 보기 권한을 바꿉니다.",
        width: 1130,
        height: 338,
      },
    ],
  },
  "admin/cs-figma-digest-655": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/storage-management/01-lesson-resources.webp`,
        alt: "관리자 대시보드 수업 리소스 화면. 왼쪽 수업 리소스 메뉴, 수업 시간 필터, 첫 수업 체크박스, 모든 수업 데이터 삭제하기 버튼에 빨간 상자가 있다",
        caption: "1~3단계: 왼쪽 [수업 리소스]를 누르고, 지울 수업을 체크한 뒤 [모든 수업 데이터 삭제하기]를 누릅니다.",
        width: 1195,
        height: 302,
      },
      {
        type: "image",
        src: `${LESSON_DELETE}/02-delete-confirm.webp`,
        alt: "수업 리소스 화면 위에 뜬 알림 창. 보호 잠금 안내와 복구할 수 없다는 빨간 경고 아래 확인 버튼에 빨간 상자가 있다",
        caption: "4~5단계: 알림 창에서 지울 수업 수가 맞는지 확인하고 [확인]을 누릅니다. 지운 데이터는 되돌릴 수 없습니다.",
        width: 691,
        height: 208,
      },
      {
        type: "image",
        src: `${LESSON_DELETE}/03-deleted-replay.webp`,
        alt: "종료된 수업 창의 수업 다시보기 탭. 영상 자리가 비어 있고 다시보기 영상이 없다는 안내만 있다",
        caption: "6단계: 지운 수업은 [수업 다시보기]에 영상이 나오지 않습니다.",
        width: 423,
        height: 311,
      },
    ],
  },
  "admin/cs-figma-digest-859": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${MEMBER_DELETE}/01-mobile-home-course.webp`,
        alt: "클래스인 모바일 앱 홈 화면. 아래 홈 탭과 모든 코스 목록의 첫 코스 카드에 빨간 상자와 번호 말풍선이 있다",
        caption: "1~2단계: 아래 [홈]을 누르고 모든 코스에서 멤버를 지울 코스를 엽니다.",
        width: 560,
        height: 995,
      },
      {
        type: "image",
        src: `${G}/cs-course-member-management/02-mobile-course-members.webp`,
        alt: "모바일 코스 화면 위쪽 화살표 버튼과, 이어서 열린 코스 설정 화면의 코스 멤버 항목에 빨간 상자가 있다",
        caption: "3~4단계: 코스 화면 위쪽 화살표(>)를 눌러 코스 설정을 열고 [코스 멤버]를 누릅니다.",
        width: 1000,
        height: 889,
      },
      {
        type: "image",
        src: `${G}/cs-course-member-management/03-mobile-remove-member.webp`,
        alt: "모바일 코스 멤버 화면. 구성원 오른쪽 점 세 개 버튼과, 아래에서 올라온 메뉴의 멤버 삭제에 빨간 상자가 있다",
        caption: "5~6단계: 지울 구성원 오른쪽 [···]을 누르고 [멤버 삭제]를 고릅니다.",
        width: 560,
        height: 995,
      },
    ],
  },
  "admin/cs-figma-digest-961": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${SHARED_DRIVE}/01-shared-drive-menu.webp`,
        alt: "관리자 대시보드 공유 드라이브 화면. 왼쪽 공유 드라이브 메뉴와, 드라이브 오른쪽 점 세 개 메뉴의 구성원 관리에 빨간 상자가 있다",
        caption: "1단계: [스토리지] → [공유 드라이브]에서 드라이브 오른쪽 점 세 개를 누르고 [구성원 관리]를 고릅니다.",
        width: 1024,
        height: 206,
      },
      {
        type: "image",
        src: `${SHARED_DRIVE}/02-invite-member.webp`,
        alt: "공유 드라이브 구성원 관리 창. 구성원 및 권한 오른쪽 구성원 초대 버튼에 빨간 상자가 있다",
        caption: "2단계: [구성원 및 권한]에서 [+구성원 초대]를 누릅니다.",
        width: 378,
        height: 305,
      },
      {
        type: "image",
        src: `${SHARED_DRIVE}/03-select-teacher.webp`,
        alt: "구성원을 선택해 주세요 창. 왼쪽 목록에서 교사 한 명이 체크돼 있고 오른쪽 아래 확인 버튼에 빨간 상자와 화살표가 있다",
        caption: "3단계: 접근을 허락할 교사를 체크하고 [확인]을 누릅니다.",
        width: 372,
        height: 312,
      },
      {
        type: "image",
        src: `${SHARED_DRIVE}/04-read-only.webp`,
        alt: "구성원 관리 창의 교사 권한 메뉴. 관리자, 컨텐츠 관리자, 읽기 전용, 감추기 가운데 읽기 전용에 빨간 상자가 있다",
        caption: "4단계: 추가한 교사의 권한을 [읽기 전용]으로 바꿉니다. 수업 중 파일은 쓸 수 있고 저장은 막힙니다.",
        width: 489,
        height: 281,
      },
    ],
  },
  "start/cs-figma-digest-194": {
    "수업 옵션 설정 후 등록": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/01-lesson-options.webp`,
        alt: "클래스인 PC 앱의 수업 새로 만들기 창. 시작 시간과 진행 시간, 온스테이지 인원수 1V0, ClassIn 수업 녹화·현장 녹화 줄에 빨간 상자가, 스테이지 표시에 파란 상자가 있다",
        caption: "수업 시간과 온스테이지 인원수, 녹화 설정, 스테이지 표시를 정한 뒤 [등록]을 누릅니다.",
        width: 980,
        height: 621,
      },
    ],
    "수업에 입장하기": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/02-enter-classroom.webp`,
        alt: "코스 화면의 수업 행 교실 입장 버튼과 오른쪽 아래 수업 알림의 수업 입장 버튼에 빨간 상자가 있다",
        caption: "수업 행의 [교실 입장]이나 수업 알림의 [수업 입장]을 누릅니다.",
        width: 967,
        height: 621,
      },
    ],
    "장비 점검하기": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/03-device-check.webp`,
        alt: "교실 입장 전 장비 테스트 창. 카메라, 마이크, 스피커 선택 칸에 빨간 상자가 있고 아래 수업 입장 버튼이 있다",
        caption: "카메라·마이크·스피커를 확인하고 [수업 입장]을 누릅니다.",
        width: 608,
        height: 456,
      },
    ],
    "현장 녹화 알림 확인": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/04-recording-notice.webp`,
        alt: "교실 화면 가운데 뜬 현장 녹화 알림 창. 녹화 범위와 사양 안내 아래 확인 버튼에 빨간 상자가 있다",
        caption: "알림을 읽고 [확인]을 누릅니다.",
        width: 322,
        height: 267,
      },
    ],
    "PC에서 녹화 시작": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/05-pc-camera-record-now.webp`,
        alt: "현장 녹화 창과 설정 창. 현장 녹화 창 위쪽 톱니바퀴, 카메라 목록, 바로 녹화하기 버튼에 빨간 상자가 있다",
        caption: "톱니바퀴에서 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 818,
        height: 463,
      },
      {
        type: "image",
        src: `${FIELD_RECORDING}/06-pc-recording-icon.webp`,
        alt: "교실 화면 오른쪽 위 아이콘 줄. 초록색 녹화 아이콘에 빨간 상자가 있다",
        caption: "녹화 중이면 오른쪽 위 녹화 아이콘이 초록색입니다. 이 아이콘으로 설정을 바꿀 수 있습니다.",
        width: 508,
        height: 351,
      },
    ],
    "전자칠판에서 녹화 시작": [
      {
        type: "image",
        src: `${FIELD_RECORDING}/07-board-camera-record-now.webp`,
        alt: "전자칠판 화면의 현장 녹화 창과 설정 창. 톱니바퀴, 카메라 목록, 바로 녹화하기 버튼에 빨간 상자가 있다",
        caption: "전자칠판에서도 톱니바퀴에서 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 980,
        height: 596,
      },
      {
        type: "image",
        src: `${FIELD_RECORDING}/08-board-recording-icon.webp`,
        alt: "전자칠판 아래 슬라이드바를 올린 모습. 초록 점이 있는 캠코더 아이콘과, 이를 눌렀을 때 뜨는 현장 녹화 진행 중 창의 설정 버튼에 빨간 상자가 있다",
        caption: "아래 슬라이드바를 올리면 나오는 캠코더 아이콘이 초록색이면 녹화 중이고, 눌러서 [설정]을 바꿀 수 있습니다.",
        width: 818,
        height: 579,
      },
    ],
  },
  "start/cs-figma-digest-245": {
    "카메라 아이콘으로 녹화 메뉴 열기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/01-board-camera-icon.webp`,
        alt: "전자칠판 화면 아래쪽 독. 파일, 수업 도구, 미러링 옆 카메라 아이콘에 빨간 상자가 있다",
        caption: "화면 아래 독의 카메라 아이콘을 누릅니다.",
        width: 670,
        height: 313,
      },
    ],
    "녹화 시작 선택하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/02-start-recording.webp`,
        alt: "전자칠판 화면의 녹화 알림 창. 녹화 범위·사운드·화질과 사양 안내 아래 녹화 시작 버튼에 빨간 상자가 있다",
        caption: "알림 창에서 [녹화 시작]을 누릅니다.",
        width: 496,
        height: 292,
      },
    ],
    "저장 경로와 파일 형식 정하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/03-save-mp4.webp`,
        alt: "전자칠판에 뜬 수업 녹화 파일 저장 창. 바탕 화면 폴더가 열려 있고 파일 형식 목록의 mp4 항목에 빨간 상자가 있다",
        caption: "저장할 폴더를 고르고 파일 형식에서 mp4를 선택한 뒤 [저장]을 누릅니다.",
        width: 608,
        height: 450,
      },
    ],
    "녹화 진행 상태 확인하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/04-recording-green-light.webp`,
        alt: "녹화 중인 전자칠판 화면. 왼쪽 위에 카메라 화면 창이 있고 화면 아래 가운데 아이콘 줄에 빨간 상자가 있다",
        caption: "화면 아래 카메라 아이콘에 초록 불이 들어와 있으면 녹화 중입니다.",
        width: 818,
        height: 438,
      },
    ],
    "녹화 종료하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/05-stop-recording.webp`,
        alt: "전자칠판 화면의 수업 녹화를 끝내시겠습니까 알림 창. 네 버튼과 아래 독의 카메라 아이콘에 빨간 상자가 있다",
        caption: "독의 카메라 아이콘을 다시 누르고 [네]를 누릅니다.",
        width: 868,
        height: 396,
      },
    ],
    "저장된 녹화 영상 확인하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/06-desktop-file.webp`,
        alt: "전자칠판 바탕 화면. 칠판으로 시작하는 녹화 파일 아이콘에 빨간 상자가 있다",
        caption: "바탕 화면에 저장된 녹화 파일을 확인합니다.",
        width: 508,
        height: 417,
      },
    ],
    "코스에서 새로 만들기 열기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/07-course-new.webp`,
        alt: "클래스인 PC 앱 코스 화면. 오른쪽 위 새로 만들기 버튼에 빨간 상자가 있고 아래에 학습 활동 유형 목록이 보인다",
        caption: "코스 화면 오른쪽의 [새로 만들기]를 누릅니다.",
        width: 955,
        height: 625,
      },
    ],
    "녹화 수업 유형 선택하기": [
      {
        type: "image",
        src: `${G}/recording-file-troubleshooting/05-recorded-lesson-type.webp`,
        alt: "학습 활동 추가하기 창. 학습 활동 유형 가운데 녹화 수업에 빨간 상자가 있다",
        caption: "[녹화 수업]을 고릅니다.",
        width: 645,
        height: 584,
      },
    ],
    "업로드 메뉴 열기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/09-upload-folder.webp`,
        alt: "전자칠판에서 연 새 녹화 수업 추가하기 창. 서식 도구 줄의 폴더 아이콘에 빨간 상자가 있다",
        caption: "서식 도구 줄의 폴더 아이콘을 눌러 파일 창을 엽니다.",
        width: 955,
        height: 529,
      },
    ],
    "영상 업로드하고 게시하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/10-open-and-publish.webp`,
        alt: "파일 열기 창의 열기 버튼, 오른쪽 시간 설정 칸, 오른쪽 아래 게시 버튼에 빨간 상자와 화살표가 있다",
        caption: "영상을 고르고 [열기]를 누른 뒤, 시작·마감 시간을 정하고 [게시]를 누릅니다.",
        width: 942,
        height: 529,
      },
    ],
  },
  "start/cs-figma-digest-449": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${LOCAL_RECORDING}/01-board-camera-icon.webp`,
        alt: "전자칠판 화면 아래쪽 독. 파일, 수업 도구, 미러링 옆 카메라 아이콘에 빨간 상자가 있다",
        caption: "1단계: 화면 아래 독의 카메라 아이콘을 누릅니다.",
        width: 670,
        height: 313,
      },
      {
        type: "image",
        src: `${LOCAL_RECORDING}/02-start-recording.webp`,
        alt: "전자칠판 화면의 녹화 알림 창. 녹화 범위·사운드·화질과 사양 안내 아래 녹화 시작 버튼에 빨간 상자가 있다",
        caption: "2단계: 알림 창에서 [녹화 시작]을 누릅니다.",
        width: 496,
        height: 292,
      },
      {
        type: "image",
        src: `${LOCAL_RECORDING}/03-save-mp4.webp`,
        alt: "전자칠판에 뜬 수업 녹화 파일 저장 창. 바탕 화면 폴더가 열려 있고 파일 형식 목록의 mp4 항목에 빨간 상자가 있다",
        caption: "3단계: 저장할 폴더를 고르고 파일 형식에서 mp4를 선택한 뒤 [저장]을 누릅니다.",
        width: 608,
        height: 450,
      },
      {
        type: "image",
        src: `${LOCAL_RECORDING}/04-recording-green-light.webp`,
        alt: "녹화 중인 전자칠판 화면. 왼쪽 위에 카메라 화면 창이 있고 화면 아래 가운데 아이콘 줄에 빨간 상자가 있다",
        caption: "4단계: 화면 아래 카메라 아이콘에 초록 불이 들어와 있으면 녹화 중입니다.",
        width: 818,
        height: 438,
      },
      {
        type: "image",
        src: `${LOCAL_RECORDING}/05-stop-recording.webp`,
        alt: "전자칠판 화면의 수업 녹화를 끝내시겠습니까 알림 창. 네 버튼과 아래 독의 카메라 아이콘에 빨간 상자가 있다",
        caption: "5단계: 끝낼 때는 카메라 아이콘을 다시 누르고 [네]를 누릅니다.",
        width: 868,
        height: 396,
      },
      {
        type: "image",
        src: `${LOCAL_RECORDING}/06-desktop-file.webp`,
        alt: "전자칠판 바탕 화면. 칠판으로 시작하는 녹화 파일 아이콘에 빨간 상자가 있다",
        caption: "6단계: 바탕 화면에 저장된 녹화 파일을 확인합니다.",
        width: 508,
        height: 417,
      },
    ],
  },
  "student/cs-figma-digest-1462": {
    "학습 보고서 탭 열기": [
      {
        type: "image",
        src: `${G}/class-report/01-report-tab.webp`,
        alt: "종료된 수업 창의 학습 보고서 탭. 별 세 개 평가와 오른쪽 위 English 언어 선택 상자가 보인다",
        caption: "[학습 보고서] 탭을 누르면 맨 위에 별점이, 오른쪽 위에 언어 선택이 보입니다.",
        width: 1062,
        height: 495,
      },
    ],
    "수업 참여도(Activity) 확인": [
      {
        type: "image",
        src: `${G}/class-report/02-activity.webp`,
        alt: "학습 보고서의 Activity 항목. 반 친구보다 60% 더 활발하다는 문구 아래 On-stage, Speaking, Authorized 시간과 비율 막대가 있다",
        caption: "발표·말하기·발언 허용 시간과 반 친구와 비교한 비율을 봅니다.",
        width: 563,
        height: 444,
      },
    ],
    "출석과 수업 시간 보기": [
      {
        type: "image",
        src: `${REPORT}/04-attendance.webp`,
        alt: "학습 보고서의 Attendance 항목. This Lesson 옆에 수업 시간(73min)이 보인다",
        caption: "아래로 내리면 Attendance에서 이번 수업 시간을 봅니다.",
        width: 818,
        height: 108,
      },
    ],
  },
  "teacher/cs-figma-digest-1719": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/app-update-cache-reinstall/03-android-play-store-update.webp`,
        alt: "안드로이드 태블릿 화면 세 장. 앱 검색에서 Play 스토어 아이콘, 스토어 검색창, 검색 결과 ClassIn 옆 업데이트 버튼에 빨간 상자가 있다",
        caption: "1~3단계(안드로이드): Play 스토어를 열고 classin을 검색한 뒤 ClassIn 옆 [업데이트]를 누릅니다.",
        width: 1152,
        height: 454,
      },
      {
        type: "image",
        src: `${G}/app-update-cache-reinstall/04-ios-app-store-update.webp`,
        alt: "아이폰 화면 세 장. 홈 검색창의 앱스토어 입력, App Store 검색창의 클래스인 입력, 검색 결과 ClassIn 옆 업데이트 버튼에 빨간 상자가 있다",
        caption: "4~6단계(iOS): App Store를 열고 클래스인을 검색한 뒤 ClassIn 옆 [업데이트]를 누릅니다.",
        width: 1094,
        height: 470,
      },
    ],
  },
  "teacher/cs-figma-digest-1813": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${MOBILE_UPDATE}/01-mobile-update.webp`,
        alt: "클래스인 모바일 앱 화면 세 장. 홈 화면 왼쪽 위 프로필, 설정 화면의 소프트웨어 메뉴, 소프트웨어 정보 화면의 초록색 업데이트 버튼에 빨간 상자가 있다",
        caption: "업데이트 1~3단계: 왼쪽 위 [홈]을 눌러 설정을 열고, 소프트웨어 정보 화면에서 버전을 확인한 뒤 [업데이트]를 누릅니다.",
        width: 1200,
        height: 572,
      },
      {
        type: "image",
        src: `${G}/app-update-cache-reinstall/06-mobile-cache-delete.webp`,
        alt: "클래스인 모바일 앱 화면 세 장. 홈 화면 왼쪽 위 프로필, 설정 화면의 소프트웨어 설정, 소프트웨어 설정 화면의 캐시 삭제에 빨간 상자가 있다",
        caption: "캐시 삭제 1~3단계: 설정에서 [소프트웨어 설정]을 열고 [캐시 삭제]를 누릅니다.",
        width: 1238,
        height: 590,
      },
    ],
  },
  "teacher/cs-figma-digest-2103": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/course-submit-activity/05-homework-status.webp`,
        alt: "학생 휴대폰의 숙제 화면 두 개. 왼쪽은 종료된 숙제로 나의 숙제에 채점 점수 100과 숙제 역사 링크가, 오른쪽은 진행 중인 숙제로 초록색 제출하기 버튼과 미제출 학생 목록이 보인다",
        caption: "학생 화면: 제출을 마치면 점수와 [숙제 역사]가(왼쪽), 아직 내지 않았으면 [제출하기]가(오른쪽) 보입니다.",
        width: 1000,
        height: 943,
      },
      {
        type: "image",
        src: `${HOMEWORK}/02-teacher-homework-pc.webp`,
        alt: "선생님 PC의 숙제 화면. 숙제 데이터에 제출 비율 0%와 최고 점수, 미제출(3)·채점 대기·콜백·채점 완료 탭, 학생별 미조회·조회됨 상태가 보인다",
        caption: "선생님 화면: 제출 비율, 상태별 탭, 학생별 조회 여부를 확인합니다.",
        width: 1200,
        height: 637,
      },
    ],
  },
  "teacher/cs-figma-digest-328": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/course-activities/01-copy-activity-menu.webp`,
        alt: "코스 학습 활동 목록. 활동 오른쪽 끝 점 세 개 버튼과 펼친 메뉴의 작업 복사에 빨간 상자가 있다",
        caption: "1단계: 학습 활동 오른쪽 끝 점 세 개를 누르고 [작업 복사]를 고릅니다.",
        width: 715,
        height: 147,
      },
      {
        type: "image",
        src: `${G}/course-activities/02-copy-activity-course.webp`,
        alt: "녹화 수업 새로 만들기 창. 오른쪽 설정 더 보기 아래 코스 항목에 빨간 상자와 화살표가 있다",
        caption: "2단계: [설정 더 보기] 아래 [코스]를 누릅니다.",
        width: 890,
        height: 588,
      },
      {
        type: "image",
        src: `${G}/course-activities/03-copy-activity-select.webp`,
        alt: "코스를 고르는 선택 창. 왼쪽 코스 목록 두 곳이 체크돼 있고 오른쪽 아래 확인 버튼에 빨간 상자가 있다",
        caption: "3단계: 복사할 코스를 체크하고 [확인]을 누릅니다.",
        width: 860,
        height: 593,
      },
      {
        type: "image",
        src: `${G}/course-activities/04-recorded-lesson-new.webp`,
        alt: "녹화 수업 새로 만들기 창. 오른쪽 코스 칸에 코스 2개가 선택돼 있고 오른쪽 아래 게시 버튼에 빨간 상자가 있다",
        caption: "4단계: 코스·과정·단원을 확인하고 [게시]를 누릅니다.",
        width: 880,
        height: 579,
      },
      {
        type: "image",
        src: `${COPY_ACTIVITY}/05-new-course-check.webp`,
        alt: "복사한 코스의 화면. 학습 활동 목록 맨 아래 새로 생긴 활동에 빨간 상자와 화살표가 있다",
        caption: "5단계: 복사한 코스로 가서 학습 활동이 생겼는지 확인합니다.",
        width: 1080,
        height: 594,
      },
    ],
  },
  "teacher/cs-figma-digest-500": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/drive-materials/02-board-menu.webp`,
        alt: "클래스인 PC 앱 홈 화면. 왼쪽 메뉴의 칠판에 빨간 상자와 화살표가 있다",
        caption: "1단계: 왼쪽 메뉴에서 [칠판]을 누릅니다.",
        width: 1000,
        height: 653,
      },
      {
        type: "image",
        src: `${BOARD}/02-blank-board-tools.webp`,
        alt: "빈 칠판 화면. 오른쪽 세로 편집 도구 막대에 빨간 상자가 있다",
        caption: "2단계: 빈 칠판에서 오른쪽 편집 도구로 판서를 꾸밉니다.",
        width: 583,
        height: 657,
      },
      {
        type: "image",
        src: `${BOARD}/03-board-settings-tools.webp`,
        alt: "칠판 화면. 오른쪽 위 아이콘에 1번 표시, 오른쪽 도구 막대에 2번 표시가 있고 펜 색상 창과 가위 도구 메뉴가 열려 있다",
        caption: "3단계: 위쪽 메뉴(1)에서 교실 배경을 바꾸고, 오른쪽 도구(2)로 필기·텍스트 입력·화면 잘라 내기를 합니다. 이미지와 글은 Ctrl+C, Ctrl+V로 붙여 넣습니다.",
        width: 579,
        height: 613,
      },
      {
        type: "image",
        src: `${G}/drive-materials/03-board-open-file.webp`,
        alt: "칠판 위에 연 수업 도구 창의 파일 열기(1번)와, 드라이브 창(2번), 기기 파일 열기 창이 함께 보인다",
        caption: "4단계: [수업 도구] → [파일 열기]로 기기의 edb 파일을, [클라우드 드라이브]로 드라이브의 edb 파일을 엽니다.",
        width: 1000,
        height: 562,
      },
      {
        type: "image",
        src: `${G}/drive-materials/04-board-save-share.webp`,
        alt: "칠판 위 수업 도구 창의 판서 저장/공유와, 열린 판서 저장 및 공유 창의 저장 방법 버튼에 빨간 상자가 있다",
        caption: "5단계: [수업 도구] → [판서 저장/공유]에서 저장 방법을 고릅니다.",
        width: 1000,
        height: 561,
      },
    ],
  },
}
