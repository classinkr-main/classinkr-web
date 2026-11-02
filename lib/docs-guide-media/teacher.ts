import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/teacher.json 으로 만든다(원본·자른 위치·가린 영역 기록).
const DIR = "/docs/files/guides"

export const TEACHER_GUIDE_MEDIA: GuideMediaMap = {
  "teacher/teacher-profile": {
    "PC에서 바꾸기": [
      {
        type: "image",
        src: `${DIR}/teacher-profile/01-pc-profile-button.webp`,
        alt: "클래스인 PC 앱 첫 화면. 왼쪽 메뉴 맨 아래 내 프로필 영역이 빨간 상자로 표시돼 있습니다.",
        caption: "왼쪽 메뉴 맨 아래 내 프로필을 누릅니다.",
        width: 590,
        height: 350,
      },
      {
        type: "image",
        src: `${DIR}/teacher-profile/02-pc-personal-info.webp`,
        alt: "계정 및 설정 창에서 개인 정보 메뉴를 고르고 닉네임 오른쪽 편집 아이콘을 표시한 화면",
        caption: "[개인 정보]에서 사진을 누르거나 닉네임 오른쪽 편집 아이콘을 눌러 고칩니다.",
        width: 585,
        height: 350,
      },
    ],
    "휴대폰·태블릿에서 바꾸기": [
      {
        type: "image",
        src: `${DIR}/teacher-profile/03-mobile-nickname.webp`,
        alt: "모바일 앱에서 홈 왼쪽 위 프로필, 설정 화면의 내 닉네임, 개인 정보의 닉네임, 닉네임 입력 화면을 차례로 보여 주는 네 화면",
        caption: "홈 왼쪽 위 프로필 → 내 닉네임 → [닉네임] → 고친 뒤 [저장] 순서입니다.",
        width: 1176,
        height: 538,
      },
    ],
    "코스마다 다른 이름이 보일 때": [
      {
        type: "image",
        src: `${DIR}/teacher-profile/04-course-nickname.webp`,
        alt: "PC 앱의 코스 설정 창. 코스 구성원, 코스 소개, 코스 내 나의 닉네임, 채팅방 상단에 고정 항목이 보입니다.",
        caption: "코스 이름을 누르면 열리는 코스 설정에서 [코스 내 나의 닉네임]을 바꿉니다.",
        width: 560,
        height: 733,
      },
      {
        type: "image",
        src: `${DIR}/teacher-profile/05-allow-student-nickname.webp`,
        alt: "코스 관리 창에서 '학생의 코스 내 닉네임 수정을 허용' 토글이 빨간 상자로 표시된 화면",
        caption: "학생이 직접 코스 닉네임을 바꾸게 하려면 [코스 관리]에서 이 옵션을 켭니다.",
        width: 320,
        height: 500,
      },
      {
        type: "image",
        src: `${DIR}/teacher-profile/06-student-nickname-before-after.webp`,
        alt: "학생 모바일 코스 설정 화면 두 장. 왼쪽은 '담임 선생님이 닉네임 수정 권한을 비활성화했습니다.' 안내가 뜬 모습, 오른쪽은 코스 내 나의 닉네임 옆에 화살표가 생겨 바꿀 수 있는 모습입니다.",
        caption: "옵션을 켜기 전(왼쪽)과 켠 뒤(오른쪽) 학생 화면입니다.",
        width: 930,
        height: 620,
      },
    ],
  },

  "teacher/drive-materials": {
    "판서 파일(EDB)을 드라이브에 두고 쓰기": [
      {
        type: "image",
        src: `${DIR}/drive-materials/02-board-menu.webp`,
        alt: "클래스인 PC 앱 첫 화면 왼쪽 메뉴에서 칠판이 빨간 상자로 표시된 화면",
        caption: "왼쪽 메뉴의 [칠판]에서 수업 전에 판서를 만듭니다.",
        width: 1000,
        height: 653,
      },
      {
        type: "image",
        src: `${DIR}/drive-materials/03-board-open-file.webp`,
        alt: "칠판 화면에서 수업 도구의 파일 열기와 오른쪽 도구 모음의 클라우드 드라이브 버튼을 표시하고, 드라이브 창과 파일 열기 창이 함께 열린 화면",
        caption: "1번 [수업 도구] > [파일 열기]는 내 컴퓨터 파일을, 2번 [클라우드 드라이브]는 드라이브의 EDB 파일을 엽니다.",
        width: 1000,
        height: 562,
      },
      {
        type: "image",
        src: `${DIR}/drive-materials/04-board-save-share.webp`,
        alt: "판서를 다 만든 뒤 수업 도구의 판서 저장/공유를 누르고, 저장 방법 선택 창과 드라이브에 저장 창이 열린 화면",
        caption: "[판서 저장/공유] > [드라이브에 저장]에서 파일 이름, 저장 위치, 파일 유형을 정합니다.",
        width: 1000,
        height: 561,
      },
    ],
    "웹페이지를 수업 자료로 쓰기(EDX)": [
      {
        type: "image",
        src: `${DIR}/drive-materials/01-drive-new-menu.webp`,
        alt: "드라이브 화면에서 새로 만들기 메뉴를 펼치고 맨 아래 EDX 항목을 빨간 상자로 표시한 화면",
        caption: "[드라이브] > [새로 만들기] > [EDX]를 누릅니다.",
        width: 1056,
        height: 570,
      },
      {
        type: "image",
        src: `${DIR}/drive-materials/05-edx-create.webp`,
        alt: "새 EDX 만들기 창. 이름과 URL 주소 입력란, 취소와 만들기 버튼이 보입니다.",
        caption: "이름과 웹페이지 주소를 넣고 [만들기]를 누릅니다.",
        width: 1056,
        height: 570,
      },
    ],
  },

  "teacher/course-create": {
    "코스 만들기": [
      {
        type: "image",
        src: `${DIR}/course-create/01-home-create-course.webp`,
        alt: "클래스인 PC 앱 첫 화면 위쪽의 코스 만들기 버튼과 코스 목록의 코스 카드가 빨간 상자로 표시된 화면",
        caption: "첫 화면 위쪽 [코스 만들기]를 누릅니다. 만든 코스는 아래 코스 목록에 카드로 생깁니다.",
        width: 1019,
        height: 549,
      },
    ],
    "코스 설정에서 정할 것": [
      {
        type: "image",
        src: `${DIR}/course-create/02-course-settings-pc.webp`,
        alt: "PC 앱 코스 설정 창. 코스 구성원 및 그룹 구성, 코스 QR 코드 및 링크, 코스 소개, 코스 별칭, 코스 내 나의 닉네임, 코스 관리, 게시판 설정, AI 에이전트 설정, 알림 끄기 설정, 코스 종료가 차례로 보입니다.",
        caption: "코스 이름을 누르면 열리는 코스 설정 창입니다. 맨 아래 [코스 종료]는 폐강할 때만 씁니다.",
        width: 387,
        height: 747,
      },
    ],
    "코스 화면 구성": [
      {
        type: "image",
        src: `${DIR}/course-create/04-course-screen.webp`,
        alt: "새로 만든 코스 화면. 왼쪽에 과정·게시판·에이전트(AI 튜터, AI 평가), 가운데에 코스 이름과 학습 활동 영역, 오른쪽에 구성원·공지사항·채팅·할 일이 있습니다.",
        caption: "왼쪽은 과정·게시판·AI 도구, 가운데는 학습 활동, 오른쪽은 구성원·공지사항·채팅·할 일입니다.",
        width: 1200,
        height: 708,
      },
    ],
    "모바일에서 설정을 바꾸거나 코스에서 나가려면": [
      {
        type: "image",
        src: `${DIR}/course-create/03-course-settings-mobile.webp`,
        alt: "모바일 앱 코스 화면 위쪽 코스 정보 카드의 오른쪽 화살표를 누르면 열리는 코스 설정 화면. 맨 아래 코스 종료 위치가 표시돼 있습니다.",
        caption: "코스 정보 카드 오른쪽 화살표(>)로 코스 설정을 열고, 맨 아래에서 코스를 종료합니다.",
        width: 1200,
        height: 1100,
      },
    ],
  },

  "teacher/course-members": {
    "학생에게 보낼 초대 안내 문구": [
      {
        type: "image",
        src: `${DIR}/course-members/01-qr-scan-menu.webp`,
        alt: "학생 모바일 앱 홈 화면 오른쪽 위 더하기 버튼을 누르면 펼쳐지는 메뉴에서 QR 코드 스캔이 빨간 상자로 표시된 화면",
        caption: "학생은 앱 홈 오른쪽 위 [+] > [QR 코드 스캔]으로 QR을 찍습니다.",
        width: 520,
        height: 541,
      },
      {
        type: "image",
        src: `${DIR}/course-members/02-join-course-button.webp`,
        alt: "QR을 찍은 뒤 열리는 코스 소개 화면. 아래쪽 초록색 코스 가입 버튼이 빨간 상자로 표시돼 있습니다.",
        caption: "코스 소개 화면 아래 [코스 가입]을 누르면 들어옵니다.",
        width: 520,
        height: 983,
      },
    ],
    "초대했는데 학생이 못 들어올 때": [
      {
        type: "image",
        src: `${DIR}/course-members/04-allow-join.webp`,
        alt: "코스 관리 창 맨 위 코스 가입 허용 토글이 켜져 있는 화면",
        caption: "코스 설정 > [코스 관리]의 '코스 가입 허용'이 켜져 있어야 QR과 링크로 들어옵니다.",
        width: 320,
        height: 136,
      },
    ],
    "구성원 강제 퇴장시키기": [
      {
        type: "image",
        src: `${DIR}/course-members/03-remove-member-mobile.webp`,
        alt: "모바일 앱 코스 설정에서 코스 멤버를 누르고, 구성원 오른쪽 점 세 개 메뉴에서 멤버 삭제를 고르는 두 화면",
        caption: "코스 설정 > [코스 멤버] > 구성원 오른쪽 [···] > [멤버 삭제]. 바로 위 [교사로 설정], [채팅 금지]와 헷갈리지 않게 누릅니다.",
        width: 1200,
        height: 1066,
      },
    ],
  },

  "teacher/course-units": {
    "수업 추가하기": [
      {
        type: "image",
        src: `${DIR}/course-units/01-new-activity-button.webp`,
        alt: "PC 앱 코스 화면 오른쪽 위 새로 만들기 버튼이 빨간 상자로 표시된 화면",
        caption: "코스 오른쪽 위 [새로 만들기]를 누릅니다.",
        width: 955,
        height: 635,
      },
      {
        type: "image",
        src: `${DIR}/course-units/02-activity-type-lesson.webp`,
        alt: "학습 활동 추가하기 창. 수업, 녹화 수업, 숙제, 일일 과제, 시험, OMR 카드, 토론, 학습 자료, AI 스피킹, SCORM, 단원 중 수업이 빨간 상자로 표시돼 있습니다.",
        caption: "학습 활동 유형에서 [수업]을 고릅니다. 단원은 같은 창 아래 [+ 단원]으로 만듭니다.",
        width: 955,
        height: 628,
      },
      {
        type: "image",
        src: `${DIR}/course-units/03-new-lesson-form.webp`,
        alt: "수업 새로 만들기 창. 시작 시각 및 진행 시간, 게시 설정, 교실 설정의 온스테이지 인원수와 녹화 옵션이 빨간 상자로 표시돼 있습니다.",
        caption: "시작 시각과 진행 시간, 온스테이지 인원수, 녹화 옵션을 정하고 [등록]을 누릅니다.",
        width: 975,
        height: 628,
      },
    ],
  },

  "teacher/course-activities": {
    "반마다 같은 활동을 쓰려면": [
      {
        type: "image",
        src: `${DIR}/course-activities/01-copy-activity-menu.webp`,
        alt: "코스 학습 활동 목록에서 활동 오른쪽 점 세 개 메뉴를 열고 작업 복사를 빨간 상자로 표시한 화면",
        caption: "보낼 활동 오른쪽 [···] > [작업 복사]를 누릅니다.",
        width: 715,
        height: 147,
      },
      {
        type: "image",
        src: `${DIR}/course-activities/02-copy-activity-course.webp`,
        alt: "작업 복사로 열린 녹화 수업 새로 만들기 창. 오른쪽 설정 더 보기 아래 코스 항목이 빨간 상자로 표시돼 있습니다.",
        caption: "오른쪽 [설정 더 보기] 아래 [코스]를 누릅니다.",
        width: 890,
        height: 588,
      },
      {
        type: "image",
        src: `${DIR}/course-activities/03-copy-activity-select.webp`,
        alt: "코스 선택 창에서 코스 두 개를 체크하고 아래 확인 버튼을 표시한 화면",
        caption: "활동을 보낼 코스를 체크하고 [확인]을 누릅니다.",
        width: 860,
        height: 593,
      },
      {
        type: "image",
        src: `${DIR}/course-activities/04-recorded-lesson-new.webp`,
        alt: "코스 2개가 선택되고 활동이 각 코스로 개별 전송된다는 안내가 보이는 창. 오른쪽 아래 게시 버튼이 빨간 상자로 표시돼 있습니다.",
        caption: "과정과 단원을 확인하고 [게시]를 누르면 고른 코스마다 활동이 따로 게시됩니다.",
        width: 880,
        height: 579,
      },
    ],
    "시험 만들기": [
      {
        type: "image",
        src: `${DIR}/course-activities/05-exam-new.webp`,
        alt: "새 시험 추가 창. 문제 은행에서 불러오기, 시험 문제 추가, 시험 문제 대량 추가, AI 출제 버튼 중 시험 문제 대량 추가가 빨간 상자로 표시돼 있습니다.",
        caption: "문제를 넣는 네 가지 버튼이 나란히 있습니다. 문제가 많으면 [+시험 문제 대량 추가]를 누릅니다.",
        width: 1060,
        height: 698,
      },
      {
        type: "image",
        src: `${DIR}/course-activities/06-exam-bulk-upload.webp`,
        alt: "시험 문제 대량 추가 첫 단계. 템플릿 다운로드 메뉴에서 워드 템플릿 다운로드와 템플릿 업로드 버튼이 표시돼 있습니다.",
        caption: "[템플릿 다운로드]로 양식을 받아 문제를 채우고 [템플릿 업로드]로 올립니다.",
        width: 1080,
        height: 707,
      },
      {
        type: "image",
        src: `${DIR}/course-activities/07-exam-bulk-review.webp`,
        alt: "시험 문제 편집 단계. 인식된 문제와 정답·해설, 오른쪽 문제 번호 목록, 왼쪽 아래 내 문제 은행에도 저장하기 체크 칸과 오른쪽 아래 확인 버튼이 보입니다.",
        caption: "인식된 문제를 확인하고, 다시 쓸 문제라면 [내 문제 은행]에도 저장하기를 체크한 뒤 [확인]을 누릅니다.",
        width: 1080,
        height: 706,
      },
    ],
  },

  "teacher/lesson-option-concepts": {
    "옵션마다 켜면 달라지는 것": [
      {
        type: "image",
        src: `${DIR}/lesson-option-concepts/01-lesson-options-panel.webp`,
        alt: "앱의 수업 새로 만들기 창 오른쪽 옵션 영역. 스테이지 표시, 학생 자동 온스테이지, 온스테이지 인원 수, 하이브리드 수업, ClassIn 수업 녹화, 현장 녹화, 라이브와 플레이백 선택지가 보입니다.",
        caption: "실제 수업 만들기 화면에서는 옵션이 이 순서로 나옵니다.",
        width: 275,
        height: 295,
      },
    ],
    "수업 녹화와 현장 녹화": [
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/03-onsite-recording-camera.webp`,
        alt: "현장 녹화 창의 톱니바퀴와 바로 녹화하기 버튼, 카메라 선택 목록, 녹화 중일 때 초록색으로 바뀐 오른쪽 위 녹화 아이콘을 표시한 화면",
        caption: "현장 녹화는 톱니바퀴에서 교실을 비추는 카메라를 고르고 [바로 녹화하기]를 누릅니다. 녹화 중이면 아이콘이 초록색입니다.",
        width: 967,
        height: 754,
      },
    ],
    "옵션이 안 보이거나 녹화가 안 될 때": [
      {
        type: "image",
        src: `${DIR}/lesson-option-concepts/02-lesson-edit-stage.webp`,
        alt: "관리자 대시보드의 수업 편집 창. 기본으로 스테이지 표시 토글이 켜지고 그 아래 학생 자동 온스테이지가 체크된 부분이 빨간 상자로 표시돼 있습니다.",
        caption: "[기본으로 스테이지 표시]를 켜야 아래 [학생 자동 온스테이지]와 [전체 음소거]를 고를 수 있습니다.",
        width: 425,
        height: 415,
      },
    ],
  },

  "teacher/lesson-web-live": {
    "수업 만들 때 웹 라이브 켜기": [
      {
        type: "image",
        src: `${DIR}/lesson-web-live/01-new-activity-lesson.webp`,
        alt: "활동 게시하기 창에서 일반 활동의 수업이 빨간 상자로 표시된 화면",
        caption: "코스의 [새로 만들기]에서 [수업]을 고릅니다.",
        width: 409,
        height: 382,
      },
      {
        type: "image",
        src: `${DIR}/lesson-web-live/02-recording-live-option.webp`,
        alt: "수업 새로 만들기 창 오른쪽에서 ClassIn 수업 녹화를 켜고 그 아래 라이브와 플레이백 중 라이브를 고른 부분이 빨간 상자로 표시된 화면",
        caption: "녹화 옵션을 하나 이상 켜야 [라이브]와 [플레이백]이 나타납니다.",
        width: 750,
        height: 500,
      },
      {
        type: "image",
        src: `${DIR}/lesson-web-live/03-live-links.webp`,
        alt: "코스 수업 목록에서 수업의 점 세 개 메뉴를 누르면 보이는 수업 정보. 생방송 리플레이와 코스 다시보기 링크 위치가 빨간 상자로 표시돼 있습니다.",
        caption: "수업 오른쪽 [···]에서 [생방송 리플레이]와 [코스 다시보기] 링크를 복사합니다.",
        width: 1130,
        height: 600,
      },
    ],
    "참여자에게 링크 보내기": [
      {
        type: "image",
        src: `${DIR}/lesson-web-live/04-web-viewer.webp`,
        alt: "참여자가 웹 링크로 들어온 화면. 가운데에 수업 판서 화면, 오른쪽에 채팅 창, 아래쪽에 조회수·시청자·좋아요 수가 보입니다.",
        caption: "참여자는 앱 없이 이 화면에서 수업을 보고 오른쪽 채팅 창에 글을 남깁니다.",
        width: 1180,
        height: 590,
      },
    ],
    "라이브 시작과 진행": [
      {
        type: "image",
        src: `${DIR}/lesson-web-live/05-live-chat-tool.webp`,
        alt: "교실의 수업 도구 창에 실시간 채팅이 있고, 그 옆에 웹 참여자가 남긴 메시지가 보이는 실시간 채팅 창이 열린 화면",
        caption: "[수업 도구] > [실시간 채팅]을 열면 웹 참여자의 채팅이 보입니다.",
        width: 1135,
        height: 570,
      },
    ],
  },

  "teacher/classroom-basic-setup": {
    "교실 입장은 20분 전부터": [
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/01-enter-classroom.webp`,
        alt: "코스 학습 활동 목록의 수업 오른쪽 교실 입장 버튼과 화면 오른쪽 아래 수업 알림의 수업 입장 버튼이 빨간 상자로 표시된 화면",
        caption: "수업 오른쪽 [교실 입장]이나 수업 알림의 [수업 입장]을 누릅니다.",
        width: 955,
        height: 628,
      },
    ],
    "입장 전 장비 테스트": [
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/02-device-test.webp`,
        alt: "교실에 들어가기 전 장비 테스트 화면. 카메라, 마이크, 스피커 선택 칸과 시험 버튼, 아래 수업 입장 버튼이 보이고 마이크는 사용 안 함으로 돼 있습니다.",
        caption: "마이크가 '사용 안 함'이면 쓸 마이크로 바꾼 뒤 [수업 입장]을 누릅니다.",
        width: 610,
        height: 350,
      },
    ],
    "녹화가 시작됐는지 확인": [
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/03-onsite-recording-camera.webp`,
        alt: "현장 녹화 창의 톱니바퀴와 바로 녹화하기 버튼, 카메라 선택 목록, 녹화 중일 때 초록색으로 바뀐 오른쪽 위 녹화 아이콘을 표시한 화면",
        caption: "톱니바퀴에서 카메라를 고르고 [바로 녹화하기]를 누른 뒤, 오른쪽 위 녹화 아이콘이 초록색인지 봅니다.",
        width: 967,
        height: 754,
      },
    ],
    "수업 중 소리가 안 들릴 때": [
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/04-mic-dropdown.webp`,
        alt: "교실 오른쪽 위 마이크 아이콘 옆 화살표를 누르면 열리는 메뉴. 마이크 선택에서 사용 안 함이 체크돼 있고 맨 아래 설정이 빨간 상자로 표시돼 있습니다.",
        caption: "마이크 아이콘 옆 화살표에서 쓸 마이크를 고르거나 [설정]을 엽니다.",
        width: 590,
        height: 273,
      },
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/05-mic-settings.webp`,
        alt: "교실 설정 창의 마이크 탭. 마이크 선택 칸과 시험 버튼, 초록색으로 움직이는 사운드 바가 빨간 상자로 표시돼 있습니다.",
        caption: "[설정] > [마이크]에서 마이크를 고르고 말할 때 사운드 바가 초록색으로 움직이는지 봅니다.",
        width: 800,
        height: 688,
      },
    ],
    "스테이지·가상 배경·교실 배경 바꾸기": [
      {
        type: "image",
        src: `${DIR}/classroom-basic-setup/06-settings-camera.webp`,
        alt: "교실 설정 창. 왼쪽에 일반, 카메라, 마이크, 가상 배경, 교실 배경 메뉴가 있고 카메라 탭에서 카메라 선택 목록이 열려 있습니다.",
        caption: "설정 창 왼쪽에서 [일반], [가상 배경], [교실 배경]을 고릅니다. 카메라도 여기서 바꿉니다.",
        width: 800,
        height: 803,
      },
    ],
  },
}
