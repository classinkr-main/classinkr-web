import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/troubleshooting.json 으로 만든다(원본·자른 위치·가린 영역 기록).
const UPDATE = "/docs/files/guides/app-update-cache-reinstall"
const CAMERA_MIC = "/docs/files/guides/camera-mic-troubleshooting"
const LOGIN = "/docs/files/guides/login-troubleshooting"
const PC_INSTALL = "/docs/files/guides/pc-install-troubleshooting"

const PC_SOFTWARE_INFO_UPGRADE = {
  type: "image" as const,
  src: `${UPDATE}/01-pc-software-info-upgrade.webp`,
  alt: "PC 앱 [계정 및 설정] 창의 [소프트웨어 정보]. 현재 버전과 최신 버전이 표시되고 [업그레이드], [업데이트 검사], [공식 웹사이트] 버튼이 있는 화면",
  caption: "왼쪽 아래 프로필 → [계정 및 설정] → [소프트웨어 정보]에서 버전을 비교하고 [업그레이드]를 누릅니다.",
  width: 1022,
  height: 620,
}

const PC_CACHE_DELETE = {
  type: "image" as const,
  src: `${UPDATE}/02-pc-cache-delete.webp`,
  alt: "PC 앱 [계정 및 설정] 창의 [파일 전송] 화면. 파일 관리에 캐시 파일과 데이터 파일 항목이 있고 캐시 파일 오른쪽 [내용 삭제]가 강조된 화면",
  caption: "[계정 및 설정] → [파일 전송]에서 캐시 파일의 [내용 삭제]를 누릅니다. 바로 아래 데이터 파일 버튼과 헷갈리지 마세요.",
  width: 950,
  height: 550,
}

export const TROUBLESHOOTING_GUIDE_MEDIA: GuideMediaMap = {
  "start/login-troubleshooting": {
    "잘못된 계정 또는 비밀번호라고 나올 때": [
      {
        type: "image",
        src: `${LOGIN}/01-pc-country-code-default.webp`,
        alt: "PC 로그인 창. 국가 번호가 +1로 잡혀 있고 아이디와 암호 칸이 비어 있어 로그인 버튼이 회색인 화면",
        caption: "PC 로그인 창은 국가 번호가 +1로 잡혀 있을 때가 있습니다. +1을 눌러 +82로 바꿉니다.",
        width: 659,
        height: 460,
      },
      {
        type: "image",
        src: `${LOGIN}/02-pc-phone-format.webp`,
        alt: "PC 로그인 창. 국가 번호 +82를 고르고 휴대폰 번호를 10부터 입력해 로그인 버튼이 초록색으로 바뀐 화면",
        caption: "+82를 고르고 010의 맨 앞 0을 뺀 10부터 입력합니다.",
        width: 660,
        height: 459,
      },
    ],
    "로그인 버튼을 눌러도 들어가지지 않을 때": [
      {
        type: "image",
        src: `${LOGIN}/03-mobile-login-terms.webp`,
        alt: "모바일 앱 로그인 화면. 아이디와 비밀번호 칸 아래 약관 동의 체크 항목, 로그인 버튼, 비밀번호를 잊으셨나요와 인증 코드로 로그인 링크가 있고 오른쪽 위 회원 가입이 표시된 화면",
        caption: "모바일은 비밀번호 칸 아래 약관 동의에 체크해야 [로그인]이 눌립니다.",
        width: 560,
        height: 1077,
      },
    ],
    "비밀번호가 기억나지 않을 때": [
      {
        type: "image",
        src: `${LOGIN}/04-pc-password-change-link.webp`,
        alt: "PC 로그인 창 아래쪽. 스캔해 로그인, 구글 계정으로 로그인하기 버튼 아래에 비밀번호 변경 링크가 있는 화면",
        caption: "PC는 로그인 창 맨 아래 [비밀번호 변경]에서 새 비밀번호를 정합니다.",
        width: 660,
        height: 564,
      },
    ],
  },

  "start/class-connection-troubleshooting": {
    "오래된 버전이 원인일 때": [PC_SOFTWARE_INFO_UPGRADE, PC_CACHE_DELETE],
  },

  "start/camera-mic-troubleshooting": {
    "PC 교실에서 마이크·카메라 다시 고르기": [
      {
        type: "image",
        src: `${CAMERA_MIC}/01-pc-quick-device-menu.webp`,
        alt: "PC 교실 오른쪽 위 마이크 아이콘 옆 목록. 마이크 선택에 사용 안 함이 체크돼 있고 스피커 선택 목록과 맨 아래 설정 메뉴가 있는 화면",
        caption: "오른쪽 위 마이크 아이콘 옆 삼각형을 누르면 마이크·스피커를 바로 고를 수 있습니다. [사용 안 함]이면 실제 마이크로 바꿉니다.",
        width: 594,
        height: 287,
      },
      {
        type: "image",
        src: `${CAMERA_MIC}/02-pc-settings-microphone.webp`,
        alt: "교실 설정 창의 마이크 탭. 마이크 장치 선택 목록과 시험 버튼, 초록색으로 채워진 입력 막대, 자동 마이크 볼륨 조정 토글이 있는 화면",
        caption: "[설정] → [마이크]에서 쓸 마이크를 고르고, 말할 때 막대가 초록색으로 움직이는지 봅니다.",
        width: 1100,
        height: 423,
      },
      {
        type: "image",
        src: `${CAMERA_MIC}/03-pc-settings-camera.webp`,
        alt: "교실 설정 창의 카메라 탭. 카메라 미리 보기 아래 카메라 목록이 펼쳐져 Integrated Camera가 선택돼 있고 사용 안 함, 네트워크 카메라 추가 항목이 보이는 화면",
        caption: "[설정] → [카메라]에서 쓸 카메라를 고르고 미리 보기에 화면이 나오는지 봅니다.",
        width: 1000,
        height: 973,
      },
    ],
    "마이크가 꺼져 있다는 알림이 뜰 때": [
      {
        type: "image",
        src: `${CAMERA_MIC}/04-mic-off-alert.webp`,
        alt: "마이크가 꺼져 있어 녹화 영상에 소리가 없을 수 있다는 알림 막대와 오른쪽 알림 설정 버튼",
        caption: "알림이 뜨면 오른쪽 [알림 설정]을 누릅니다.",
        width: 1100,
        height: 119,
      },
      {
        type: "image",
        src: `${CAMERA_MIC}/05-settings-mic-not-used.webp`,
        alt: "설정 창의 마이크 탭에서 마이크 목록이 사용 안 함으로 선택돼 있는 화면",
        caption: "마이크가 [사용 안 함]이면 목록을 열어 실제로 쓸 마이크를 고릅니다.",
        width: 1100,
        height: 428,
      },
    ],
    "전자칠판에서 마이크·카메라 켜기": [
      {
        type: "image",
        src: `${CAMERA_MIC}/07-board-dock-mic-camera.webp`,
        alt: "전자칠판 화면 아래 독. 파일, 수업 도구, LMS, ClassIn 아이콘 옆에 사선이 그어진 카메라·마이크 아이콘이 강조된 화면",
        caption: "사선이 그어진 아이콘은 꺼진 상태입니다. 한 번 눌러 켜고 끕니다.",
        width: 1100,
        height: 218,
      },
      {
        type: "image",
        src: `${CAMERA_MIC}/08-board-device-cards.webp`,
        alt: "전자칠판 톱니바퀴를 눌러 연 패널. 스피커·마이크·카메라 카드가 있고 마이크 카드가 사용 안 함으로 표시돼 있으며 아래에 로컬 수업 녹화, 교실에서 나가기, 설정 더 보기가 있는 화면",
        caption: "독 오른쪽 끝 톱니바퀴를 누르면 장치 카드가 열립니다. 마이크가 [사용 안 함]이면 카드에서 마이크를 고릅니다.",
        width: 1100,
        height: 756,
      },
    ],
    "선생님 목소리나 수업 소리가 안 들릴 때": [
      {
        type: "image",
        src: `${CAMERA_MIC}/06-pc-settings-speaker.webp`,
        alt: "교실 설정 창의 스피커 항목. 스피커 장치 목록이 시스템 기본으로 선택돼 있고 시험 버튼과 볼륨 막대, 배경 소음 감소와 음악 모드 체크 항목이 있는 화면",
        caption: "[설정] → [마이크] 아래 [스피커]에서 소리를 낼 장치를 고르고 [시험]을 눌러 봅니다.",
        width: 1100,
        height: 517,
      },
    ],
  },

  "start/app-update-cache-reinstall": {
    "PC: 최신 버전으로 업데이트하기": [PC_SOFTWARE_INFO_UPGRADE],
    "PC: 캐시 파일 지우기": [PC_CACHE_DELETE],
    "휴대폰·태블릿: 스토어에서 업데이트하기": [
      {
        type: "image",
        src: `${UPDATE}/03-android-play-store-update.webp`,
        alt: "안드로이드 태블릿에서 Play 스토어를 찾아 열고, classin을 검색해 ClassIn 오른쪽 업데이트 버튼을 누르는 세 화면",
        caption: "안드로이드: Play 스토어에서 classin을 검색하고 [업데이트]를 누릅니다.",
        width: 1152,
        height: 454,
      },
      {
        type: "image",
        src: `${UPDATE}/04-ios-app-store-update.webp`,
        alt: "아이폰에서 App Store를 찾아 열고, 클래스인을 검색해 ClassIn 오른쪽 업데이트 버튼을 누르는 세 화면",
        caption: "아이폰·아이패드: App Store에서 클래스인을 검색하고 [업데이트]를 누릅니다.",
        width: 1094,
        height: 470,
      },
    ],
    "휴대폰·태블릿: 버전 확인과 캐시 삭제": [
      {
        type: "image",
        src: `${UPDATE}/05-mobile-software-info.webp`,
        alt: "모바일 앱 설정 화면에서 소프트웨어 정보를 눌러 현재 버전을 확인하는 두 화면",
        caption: "[설정] → [소프트웨어 정보]에서 현재 버전을 확인합니다.",
        width: 697,
        height: 470,
      },
      {
        type: "image",
        src: `${UPDATE}/06-mobile-cache-delete.webp`,
        alt: "모바일 앱 홈 왼쪽 위 프로필에서 설정을 열고, 소프트웨어 설정의 캐시 삭제 항목을 누르는 세 화면",
        caption: "홈 왼쪽 위 프로필 → [설정] → [소프트웨어 설정] → [캐시 삭제]를 누릅니다.",
        width: 1238,
        height: 590,
      },
    ],
    "전자칠판: 업데이트하기": [
      {
        type: "image",
        src: `${UPDATE}/07-board-settings-more.webp`,
        alt: "전자칠판 화면 아래 독의 톱니바퀴를 누른 뒤, 열린 패널에서 설정 더 보기를 누르는 두 장의 사진",
        caption: "독 오른쪽 끝 톱니바퀴 → [설정 더 보기]를 누릅니다.",
        width: 691,
        height: 844,
      },
      {
        type: "image",
        src: `${UPDATE}/08-board-software-info-upgrade.webp`,
        alt: "전자칠판 설정 창 왼쪽 메뉴 맨 아래 소프트웨어 정보를 누르고, 현재 버전과 최신 버전 아래 초록색 업그레이드 버튼을 누르는 두 장의 사진",
        caption: "왼쪽 메뉴 맨 아래 [소프트웨어 정보]에서 초록색 [업그레이드]를 누릅니다.",
        width: 691,
        height: 879,
      },
    ],
    "그래도 안 되면 지우고 다시 설치하기": [
      {
        type: "image",
        src: `${UPDATE}/09-board-uninstall-local-data.webp`,
        alt: "윈도우 앱 및 기능에서 클래스인을 제거할 때 뜨는 창. Uninstall 버튼과 그 아래 Save local data for next use 체크 항목이 강조된 사진",
        caption: "'Save local data for next use?' 체크를 끈 채로 [Uninstall]을 누릅니다.",
        width: 533,
        height: 350,
      },
      {
        type: "image",
        src: `${UPDATE}/10-board-classin-x-download.webp`,
        alt: "클래스인 공식 홈페이지 다운로드 페이지의 강의실용 ClassIn X 항목과 다운로드(64 bit), 다운로드(32 bit) 버튼",
        caption: "전자칠판은 다운로드 페이지의 [강의실용 ClassIn X]에서 [다운로드(64 bit)]를 받습니다.",
        width: 425,
        height: 382,
      },
    ],
  },

  "start/pc-install-troubleshooting": {
    "다운로드한 설치 파일이 안 보일 때": [
      {
        type: "image",
        src: `${PC_INSTALL}/01-browser-download-list.webp`,
        alt: "크롬 브라우저 오른쪽 위 다운로드 아이콘을 눌러 연 목록. 클래스인 윈도우 설치 파일이 다운로드 완료로 표시된 화면",
        caption: "브라우저 오른쪽 위 다운로드 아이콘에서 받은 설치 파일을 눌러 엽니다.",
        width: 1200,
        height: 334,
      },
      {
        type: "image",
        src: `${PC_INSTALL}/02-save-as-dialog.webp`,
        alt: "윈도우 다른 이름으로 저장 창. 왼쪽에서 바탕 화면이 선택돼 있고 파일 이름에 클래스인 설치 파일 이름이 들어가 있으며 오른쪽 아래 저장 버튼이 있는 화면",
        caption: "저장 위치를 묻는 창이 뜨면 [바탕 화면]을 고르고 [저장]을 누릅니다.",
        width: 1200,
        height: 569,
      },
    ],
    "설치 창에서 무엇을 눌러야 할지 모를 때": [
      {
        type: "image",
        src: `${PC_INSTALL}/03-installer-language.webp`,
        alt: "클래스인 설치 파일을 열면 뜨는 언어 선택 창. 한국어가 선택돼 있고 확인과 취소 버튼이 있는 화면",
        caption: "언어 선택에서 [한국어]를 고르고 [확인]을 누릅니다.",
        width: 1100,
        height: 429,
      },
      {
        type: "image",
        src: `${PC_INSTALL}/04-installer-install-button.webp`,
        alt: "클래스인 설치 창. 가운데 초록색 설치하기 버튼, 아래쪽 약관 동의 체크 항목, 오른쪽 아래 사용자 지정 설치 버튼이 있는 화면",
        caption: "약관 동의에 체크돼 있는지 보고 [설치하기]를 누릅니다.",
        width: 1000,
        height: 634,
      },
    ],
    "설치가 멈춘 것 같을 때": [
      {
        type: "image",
        src: `${PC_INSTALL}/05-installer-progress.webp`,
        alt: "클래스인 설치 창 아래쪽에 설치 중 10% 진행률과 진행 막대가 표시된 화면",
        caption: "진행률이 올라가는 동안에는 창을 닫지 말고 기다립니다.",
        width: 1000,
        height: 651,
      },
      {
        type: "image",
        src: `${PC_INSTALL}/06-installer-start.webp`,
        alt: "설치가 끝난 클래스인 설치 창. 가운데 초록색 시작하기 버튼이 있는 화면",
        caption: "설치가 끝나면 [시작하기]를 눌러 클래스인을 실행합니다.",
        width: 1000,
        height: 632,
      },
    ],
  },
}
