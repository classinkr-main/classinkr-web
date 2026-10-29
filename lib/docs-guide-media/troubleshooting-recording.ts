import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/troubleshooting-recording.json 으로 만든다(원본·자른 위치·가린 영역 기록).
export const TROUBLESHOOTING_RECORDING_GUIDE_MEDIA: GuideMediaMap = {
  "teacher/recording-troubleshooting": {
    "녹화 옵션이 꺼져 있었을 때": [
      {
        type: "image",
        src: "/docs/files/guides/recording-troubleshooting/01-recording-options.webp",
        alt: "수업 새로 만들기 창의 교실 설정에서 ClassIn 수업 녹화와 현장 녹화 토글이 켜진 화면",
        caption: "[교실 설정]에서 필요한 녹화 옵션을 켠 뒤 [등록]을 누릅니다.",
        width: 521,
        height: 631,
      },
    ],
    "녹화 아이콘이 초록색으로 바뀌지 않을 때": [
      {
        type: "image",
        src: "/docs/files/guides/recording-troubleshooting/02-camera-select.webp",
        alt: "현장 녹화 창 위쪽 톱니바퀴를 눌러 설정 창의 카메라 목록에서 녹화할 카메라를 고르고 바로 녹화하기 버튼을 누르는 PC 화면",
        caption: "톱니바퀴 > [카메라]에서 교실을 비추는 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 1017,
        height: 551,
      },
      {
        type: "image",
        src: "/docs/files/guides/recording-troubleshooting/03-recording-icon-pc.webp",
        alt: "PC 교실 화면 오른쪽 위 도구 막대에서 녹화 아이콘이 초록색으로 표시된 모습",
        caption: "PC는 오른쪽 위 녹화 아이콘이 초록색이면 녹화 중입니다.",
        width: 491,
        height: 123,
      },
      {
        type: "image",
        src: "/docs/files/guides/recording-troubleshooting/04-recording-icon-board.webp",
        alt: "전자칠판 화면 아래 슬라이드 바의 캠코더 아이콘이 초록색이고, 눌렀을 때 현장 녹화 진행 중과 설정 버튼이 보이는 모습",
        caption: "전자칠판은 아래 슬라이드 바의 캠코더 아이콘을 봅니다. 눌러서 [설정]으로 카메라를 바꿉니다.",
        width: 843,
        height: 572,
      },
    ],
    "녹화본에 소리가 없을 때": [
      {
        type: "image",
        src: "/docs/files/guides/recording-troubleshooting/05-mic-warning.webp",
        alt: "마이크가 꺼져 있으므로 녹화되는 영상에 소리가 없을 수 있다는 알림과 알림 설정 버튼, 설정 창 마이크 항목이 사용 안 함으로 된 화면",
        caption: "[알림 설정]을 누르고 [마이크]의 '사용 안 함'을 실제로 쓰는 마이크로 바꿉니다.",
        width: 1200,
        height: 669,
      },
    ],
  },
  "admin/recording-file-troubleshooting": {
    "종료된 수업이 목록에 안 보일 때": [
      {
        type: "image",
        src: "/docs/files/guides/recording-file-troubleshooting/01-status-filter.webp",
        alt: "관리자 대시보드 코스 시간표 화면에서 상태 필터를 열었더니 종료됨만 선택되지 않은 모습",
        caption: "[상태] 필터에서 '종료됨'에도 체크해야 끝난 수업이 목록에 나옵니다.",
        width: 936,
        height: 203,
      },
    ],
    "수업 녹화 데이터에서 녹화본 찾기": [
      {
        type: "image",
        src: "/docs/files/guides/recording-file-troubleshooting/02-manage-menu.webp",
        alt: "코스 수업 목록에서 종료된 수업의 관리 버튼을 눌러 펼친 메뉴 가운데 수업 녹화 데이터를 가리키는 화면",
        caption: "수업 오른쪽 [관리] > [수업 녹화 데이터]를 누릅니다.",
        width: 1109,
        height: 545,
      },
      {
        type: "image",
        src: "/docs/files/guides/recording-file-troubleshooting/03-recording-clips.webp",
        alt: "수업 녹화 데이터 화면에 동영상 화면이 교실인 클립 1과 현장 녹화인 클립 2가 나란히 있고 오른쪽에 다운로드 링크가 있는 표",
        caption: "[동영상 화면]의 '교실'은 수업 녹화, '현장 녹화'는 카메라 녹화입니다.",
        width: 1094,
        height: 230,
      },
    ],
    "내려받기가 안 될 때": [
      {
        type: "image",
        src: "/docs/files/guides/recording-file-troubleshooting/04-player-download.webp",
        alt: "녹화 영상 재생 화면 오른쪽 아래 점 세 개 메뉴를 열어 다운로드, 재생 속도, PIP 모드가 보이는 모습",
        caption: "재생 화면에서는 오른쪽 아래 점 세 개(⋮) > [다운로드]로 받습니다.",
        width: 317,
        height: 176,
      },
    ],
    "받은 영상을 다른 코스에서 보여 주려면": [
      {
        type: "image",
        src: "/docs/files/guides/recording-file-troubleshooting/05-recorded-lesson-type.webp",
        alt: "코스의 학습 활동 추가하기 창에서 학습 활동 유형 가운데 녹화 수업을 고르는 화면",
        caption: "[새로 만들기] > [녹화 수업]을 골라 영상 파일을 올립니다.",
        width: 645,
        height: 584,
      },
    ],
  },
  "admin/replay-troubleshooting": {
    "수업이 끝난 뒤 코스에 들어온 학생일 때": [
      {
        type: "image",
        src: "/docs/files/guides/replay-troubleshooting/01-replay-settings.webp",
        alt: "관리자 대시보드 일반 설정의 수업 다시보기 탭에서 코스에 새로 가입된 학생이 이전 수업의 다시보기 시청을 허용하는 토글을 켜는 화면",
        caption: "[일반 설정] > [수업 다시보기] 탭의 고급 설정에서 새로 가입한 학생의 이전 수업 다시보기를 허용합니다.",
        width: 1138,
        height: 313,
      },
    ],
    "코스 설정에서 기간이나 횟수가 막혀 있을 때": [
      {
        type: "image",
        src: "/docs/files/guides/replay-troubleshooting/02-replay-period.webp",
        alt: "관리자 대시보드 코스 설정 탭에서 다시 보기 유효 기간을 수업 종료 후 며칠 동안 유효로 정하고 설정 저장하기를 누르는 화면",
        caption: "코스 [설정]의 [다시 보기 유효 기간]과 [시청 횟수 제한]을 확인하고 [설정 저장하기]를 누릅니다.",
        width: 504,
        height: 536,
      },
    ],
  },
  "student/homework-submit-troubleshooting": {
    "휴대폰에서 끝까지 제출하기": [
      {
        type: "image",
        src: "/docs/files/guides/homework-submit-troubleshooting/01-homework-row.webp",
        alt: "모바일 앱 코스 화면에서 진행 중인 숙제 행 오른쪽의 제출하기 버튼을 가리키는 모습",
        caption: "코스에서 숙제 행 오른쪽 [제출하기]를 누릅니다.",
        width: 324,
        height: 701,
      },
      {
        type: "image",
        src: "/docs/files/guides/homework-submit-troubleshooting/02-submit-attach.webp",
        alt: "숙제 화면 나의 숙제의 초록색 제출하기 버튼과, 제출 작성 화면 아래쪽 사진·음성·파일·동영상·링크 아이콘과 초안 저장, 숙제 제출 버튼",
        caption: "초록색 [제출하기]로 작성을 시작하고, 아이콘으로 붙인 뒤 [숙제 제출]까지 눌러야 제출됩니다.",
        width: 1001,
        height: 679,
      },
    ],
    "제출이 됐는지 확인하기": [
      {
        type: "image",
        src: "/docs/files/guides/homework-submit-troubleshooting/03-submitted-vs-not.webp",
        alt: "왼쪽은 나의 숙제에 채점 완료와 숙제 역사, 점수가 보이는 제출한 숙제, 오른쪽은 초록색 제출하기 버튼이 남아 있는 아직 내지 않은 숙제",
        caption: "왼쪽처럼 [숙제 역사]가 보이면 제출된 것이고, 오른쪽처럼 [제출하기]가 남아 있으면 아직 내지 않은 것입니다.",
        width: 1200,
        height: 608,
      },
      {
        type: "image",
        src: "/docs/files/guides/homework-submit-troubleshooting/04-teacher-status.webp",
        alt: "선생님 PC 화면의 숙제 데이터에 제출 비율과 미제출, 채점 대기, 콜백, 채점 완료 탭이 보이는 모습",
        caption: "선생님 화면에서는 학생이 [미제출], [채점 대기], [채점 완료] 탭으로 나뉩니다.",
        width: 1200,
        height: 366,
      },
    ],
  },
}
