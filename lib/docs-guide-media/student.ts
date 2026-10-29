import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/student.json 으로 만든다(원본·자른 위치·가린 영역 기록).
const G = "/docs/files/guides"

export const STUDENT_GUIDE_MEDIA: GuideMediaMap = {
  "student/student-profile": {
    "PC에서 바꾸기": [
      {
        type: "image",
        src: `${G}/student-profile/01-pc-account-settings.webp`,
        alt: "PC 홈 화면 왼쪽 아래 내 프로필을 누른 뒤, 계정 및 설정 창의 개인 정보에서 이름 옆 연필 아이콘을 누르는 두 화면",
        caption: "왼쪽 아래 내 프로필 → [계정 및 설정] 창의 [개인 정보] → 이름 옆 연필 아이콘",
        width: 1267,
        height: 356,
      },
    ],
    "휴대폰·태블릿에서 바꾸기": [
      {
        type: "image",
        src: `${G}/student-profile/02-mobile-nickname.webp`,
        alt: "모바일 앱 홈 왼쪽 위 프로필 사진, 설정 화면의 내 닉네임, 개인 정보의 닉네임 항목, 닉네임 입력과 저장 버튼으로 이어지는 네 화면",
        caption: "프로필 사진 → 내 닉네임 → [개인 정보]의 [닉네임] → 입력 후 [저장]",
        width: 1238,
        height: 538,
      },
    ],
    "바꿨는데 수업에서는 예전 이름이 보일 때": [
      {
        type: "image",
        src: `${G}/student-profile/03-pc-course-name.webp`,
        alt: "PC 코스 화면 왼쪽 위 코스 이름 영역에 빨간 표시가 된 화면",
        caption: "PC에서는 코스 화면 왼쪽 위 코스 이름을 눌러 코스 설정을 엽니다.",
        width: 893,
        height: 519,
      },
      {
        type: "image",
        src: `${G}/student-profile/04-mobile-course-nickname.webp`,
        alt: "모바일 코스 설정의 코스 내 나의 닉네임 항목. 왼쪽은 담임 선생님이 닉네임 수정 권한을 꺼 둔 안내 문구가 뜬 화면, 오른쪽은 항목 끝에 화살표가 있는 화면",
        caption: "왼쪽처럼 안내 문구가 뜨면 선생님께 부탁하고, 오른쪽처럼 화살표(>)가 있으면 직접 바꿉니다.",
        width: 950,
        height: 634,
      },
    ],
  },
  "student/chat": {
    "반 채팅방 열기": [
      {
        type: "image",
        src: `${G}/chat/01-course-chat-room.webp`,
        alt: "PC 왼쪽 메뉴에서 채팅을 고르고 채팅 목록에서 코스 채팅방을 연 화면. 채팅방 위쪽에 채팅, 파일, 코스 입장 탭이 있다",
        caption: "[채팅]에서 코스를 누르면 채팅방이 열리고, 위쪽 [코스 입장]으로 코스 화면에 갑니다.",
        width: 850,
        height: 504,
      },
    ],
    "채팅창 아이콘으로 하는 일": [
      {
        type: "image",
        src: `${G}/chat/02-chat-toolbar.webp`,
        alt: "채팅 입력창 아래 아이콘 줄. 왼쪽부터 이모티콘, @, 가위, 폴더, 연락처, 임시 교실 아이콘이 있고 임시 교실 아이콘에 빨간 표시가 있다",
        caption: "입력창 아래 아이콘 줄. 맨 오른쪽이 [임시 교실]입니다.",
        width: 412,
        height: 77,
      },
    ],
    "잠깐 만나서 묻고 싶을 때는 임시 교실": [
      {
        type: "image",
        src: `${G}/chat/03-temp-class-create.webp`,
        alt: "15분 임시 교실 만들기 창에서 수업 이름과 참여 구성원을 정하고, 옆 창에서 함께 들어올 사람을 체크하는 화면",
        caption: "수업 이름을 정하고 [참여 구성원]의 [추가]에서 사람을 고른 뒤 [만들기]를 누릅니다.",
        width: 1288,
        height: 658,
      },
      {
        type: "image",
        src: `${G}/chat/04-temp-class-card.webp`,
        alt: "채팅방에 올라온 임시 교실 카드. 남은 시간과 온스테이지 인원 수, 초록색 수업 입장 버튼이 있다",
        caption: "채팅방에 올라온 카드의 [수업 입장]을 눌러 들어갑니다.",
        width: 278,
        height: 217,
      },
    ],
    "친구 추가와 연락처": [
      {
        type: "image",
        src: `${G}/chat/05-add-friend-menu.webp`,
        alt: "PC 채팅 화면 위쪽 연락처 버튼 옆 플러스 버튼을 눌러 친구 추가, 코스 가입, 공개 수업 참가 메뉴가 열린 화면",
        caption: "[채팅] 위쪽 [+]를 누르면 [친구 추가]가 있습니다.",
        width: 491,
        height: 239,
      },
    ],
  },
  "student/todo-calendar": {
    "오늘 할 일은 [할 일]에서": [
      {
        type: "image",
        src: `${G}/todo-calendar/01-pc-home-todo.webp`,
        alt: "PC 홈 화면. 왼쪽 메뉴에 홈, 채팅, 할 일, 캘린더, 드라이브가 있고 오른쪽에 최근 할 일 목록과 영상 보기 버튼이 있다",
        caption: "왼쪽 메뉴의 [할 일]·[캘린더]와 홈 오른쪽 [최근 할 일]",
        width: 1200,
        height: 392,
      },
    ],
    "휴대폰에서 볼 때": [
      {
        type: "image",
        src: `${G}/todo-calendar/02-mobile-tab-bar.webp`,
        alt: "모바일 앱 아래쪽 탭 줄. 홈, 채팅, 할 일, 캘린더, 드라이브, 성장 탭이 있다",
        caption: "앱 아래쪽 탭 줄의 [할 일]과 [캘린더]",
        width: 749,
        height: 100,
      },
    ],
  },
  "student/class-report": {
    "학습 보고서에 들어 있는 것": [
      {
        type: "image",
        src: `${G}/class-report/02-activity.webp`,
        alt: "학습 보고서의 Activity 영역. 같은 반 친구들과 비교한 참여 비율과 On-stage, Speaking, Authorized 시간 막대가 있다",
        caption: "참여 정도(Activity): 스테이지에 오른 시간, 말한 시간, 권한을 받은 시간",
        width: 563,
        height: 444,
      },
      {
        type: "image",
        src: `${G}/class-report/03-attendance-notes.webp`,
        alt: "학습 보고서의 Attendance 영역과 Blackboard Notes 영역. 이번 수업 출석 상태 원형 그래프와 코스 전체 출석·지각·조퇴 횟수, 판서를 넘겨 보는 화살표가 있다",
        caption: "출석(Attendance)과 판서(Blackboard Notes). 판서는 좌우 화살표로 넘깁니다.",
        width: 563,
        height: 908,
      },
    ],
    "보고서 여는 방법": [
      {
        type: "image",
        src: `${G}/class-report/01-report-tab.webp`,
        alt: "끝난 수업 창 위쪽의 수업 정보, 수업 평가, 학습 보고서 탭 가운데 학습 보고서가 선택되고, 보고서 오른쪽 위에 언어 선택 메뉴가 있는 화면",
        caption: "끝난 수업 → [학습 보고서] 탭. 언어는 오른쪽 위 메뉴에서 바꿉니다.",
        width: 1062,
        height: 495,
      },
    ],
    "보고서만으로는 부족한 부분": [
      {
        type: "image",
        src: `${G}/class-report/04-highlights.webp`,
        alt: "학습 보고서의 Highlights 영역. 수업 장면 이미지를 좌우로 넘기는 화면과 아래 썸네일 줄, 보고서가 학습 결과를 모두 담지 않는다는 안내 문구가 있다",
        caption: "Highlights는 1분 간격 장면이라 그 사이 설명은 다시보기로 채웁니다.",
        width: 563,
        height: 537,
      },
    ],
  },
  "student/course-grades": {
    "점수가 안 보이거나 이상할 때": [
      {
        type: "image",
        src: `${G}/course-grades/01-homework-score.webp`,
        alt: "모바일 숙제 화면의 나의 숙제 영역에 채점 완료 시각, 숙제 역사 링크, 점수 100이 표시된 화면",
        caption: "채점이 끝난 숙제에는 채점 완료 시각과 점수가 보입니다.",
        width: 640,
        height: 745,
      },
    ],
  },
  "student/ai-features": {
    "코스에서 AI 탭 열기": [
      {
        type: "image",
        src: `${G}/ai-features/01-course-ai-tabs.webp`,
        alt: "PC 코스 화면 왼쪽 사이드바. 과정, 게시판 아래 에이전트 묶음에 AI 튜터와 AI 평가가 있다",
        caption: "코스 왼쪽 사이드바 [에이전트] 아래 [AI 튜터]·[AI 평가]",
        width: 474,
        height: 271,
      },
    ],
  },
  "student/course-join": {
    "이미 들어가 있는지 먼저 보세요": [
      {
        type: "image",
        src: `${G}/course-join/01-home-student-tab.webp`,
        alt: "PC 홈 화면 코스 목록에서 학생 탭이 선택되어 내가 학생으로 들어가 있는 코스 카드가 보이는 화면",
        caption: "홈 코스 목록의 [학생] 탭에서 내 반이 있는지 봅니다.",
        width: 1200,
        height: 535,
      },
    ],
    "초대 링크를 받았다면": [
      {
        type: "image",
        src: `${G}/course-join/02-invite-link.webp`,
        alt: "메신저로 받은 코스 초대 문구와 링크, 링크를 눌렀을 때 열리는 휴대폰 코스 가입 화면",
        caption: "초대 문구의 링크를 누르면 코스 가입 화면이 열립니다. 아래 [코스 가입]을 누릅니다.",
        width: 1200,
        height: 599,
      },
    ],
    "QR 코드를 받았다면": [
      {
        type: "image",
        src: `${G}/course-join/03-qr-scan.webp`,
        alt: "모바일 앱 홈 오른쪽 위 플러스 메뉴에서 QR 코드 스캔을 고르는 화면과, QR 코드를 찍은 뒤 열리는 코스 정보 화면의 코스 가입 버튼",
        caption: "홈 오른쪽 위 [+] → [QR 코드 스캔] → 코스 정보 확인 → [코스 가입]",
        width: 1000,
        height: 935,
      },
    ],
    "검색해서 들어가기": [
      {
        type: "image",
        src: `${G}/course-join/04-course-id-search.webp`,
        alt: "모바일 앱 홈 플러스 메뉴의 코스 가입을 누르고, 코스 검색하기 창에 코스 ID를 넣은 뒤, 찾은 코스 화면 아래 코스 가입 버튼을 누르는 순서",
        caption: "[+] → [코스 가입] → 코스 ID 검색 → 반 이름과 담임 선생님 확인 → [코스 가입]",
        width: 1000,
        height: 832,
      },
    ],
    "코스에서 나가려면": [
      {
        type: "image",
        src: `${G}/course-join/05-leave-course.webp`,
        alt: "학생이 보는 모바일 코스 설정 화면. 코스 멤버, 코스 소개, 코스 내 나의 닉네임, 알림 끄기 설정 아래에 빨간 글씨 코스 나가기가 있다",
        caption: "코스 설정 맨 아래 [코스 나가기]",
        width: 560,
        height: 825,
      },
    ],
  },
  "student/class-join-replay": {
    "수업에 들어가는 세 가지 방법": [
      {
        type: "image",
        src: `${G}/class-join-replay/01-dynamic-island.webp`,
        alt: "PC 화면 위쪽 가운데 검은 표시에 수업이 없습니다라고 적힌 다이내믹 아일랜드와 양옆의 검색, 플러스 버튼",
        caption: "화면 위쪽 가운데 검은 표시가 다이내믹 아일랜드입니다. 수업이 있으면 눌러서 들어갑니다.",
        width: 874,
        height: 84,
      },
    ],
    "들어가기 전에 카메라·마이크·스피커 고르기": [
      {
        type: "image",
        src: `${G}/class-join-replay/02-mic-settings.webp`,
        alt: "교실 설정 창의 마이크 화면. 마이크 드롭다운과 시험 버튼, 초록색 소리 막대, 스피커 드롭다운이 있다",
        caption: "마이크를 고르고 말할 때 소리 막대가 움직이는지 봅니다. 스피커는 [시험]으로 들어 봅니다.",
        width: 900,
        height: 772,
      },
      {
        type: "image",
        src: `${G}/class-join-replay/03-camera-settings.webp`,
        alt: "교실 설정 창의 카메라 화면. 카메라 미리 보기와 카메라 드롭다운 목록이 열려 있다",
        caption: "왼쪽 [카메라]에서 쓸 카메라를 고르고 미리 보기를 확인합니다.",
        width: 900,
        height: 901,
      },
    ],
  },
  "student/course-submit-activity": {
    "녹화 수업 시청하기": [
      {
        type: "image",
        src: `${G}/course-submit-activity/01-recorded-lesson.webp`,
        alt: "녹화 수업 재생 화면. 아래쪽 나의 참여 내역에 시청 완료율, 누적 시청 시간, 댓글·답글·좋아요 수가 있고 오른쪽에 토론 영역이 있다",
        caption: "영상 아래 [나의 참여 내역]과 오른쪽 [토론]",
        width: 1200,
        height: 715,
      },
    ],
    "휴대폰으로 숙제 사진 올리기": [
      {
        type: "image",
        src: `${G}/course-submit-activity/02-mobile-homework-open.webp`,
        alt: "모바일 앱 홈에서 숙제가 있는 코스를 고르고, 코스 목록에서 숙제 오른쪽 제출하기 버튼을 누르는 두 화면",
        caption: "코스를 고르고, 목록에서 숙제 오른쪽 [제출하기]를 누릅니다.",
        width: 1008,
        height: 701,
      },
      {
        type: "image",
        src: `${G}/course-submit-activity/03-mobile-homework-attach.webp`,
        alt: "숙제 화면의 나의 숙제 아래 초록색 제출하기 버튼과, 작성 화면 아래쪽 사진·음성·파일·동영상·링크 아이콘 줄과 숙제 제출 버튼",
        caption: "[나의 숙제]의 [제출하기] → 아래 사진 아이콘으로 붙이기 → [숙제 제출]",
        width: 1008,
        height: 701,
      },
    ],
    "따라읽기(AI 스피킹) 참여하기": [
      {
        type: "image",
        src: `${G}/course-submit-activity/04-follow-reading.webp`,
        alt: "따라읽기 화면. 왼쪽 위 듣기 버튼과 느리게 듣기 버튼, 가운데 단어와 뜻 버튼, 아래 초록색 마이크 버튼, 오른쪽 문제 목록과 제출하기 버튼이 있다",
        caption: "가운데 마이크로 녹음하고, 오른쪽 [목록]에서 다시 읽을 문제를 고릅니다.",
        width: 1200,
        height: 791,
      },
    ],
    "숙제가 안 올라가거나 화면이 이상할 때": [
      {
        type: "image",
        src: `${G}/course-submit-activity/05-homework-status.webp`,
        alt: "모바일 숙제 화면 두 개. 왼쪽은 제출과 채점이 끝나 점수와 숙제 역사가 보이고, 오른쪽은 아직 내지 않아 초록색 제출하기 버튼이 남아 있다",
        caption: "왼쪽은 제출이 끝난 상태, 오른쪽처럼 [제출하기]가 남아 있으면 아직 내지 않은 것입니다.",
        width: 1000,
        height: 943,
      },
    ],
  },
}
