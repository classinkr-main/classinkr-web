import type { DocMedia } from "@/lib/docs"

import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/start.json 으로 만든다(원본·자른 위치·가린 영역 기록).
// 같은 화면을 여러 문서에서 쓰는 경우 파일은 한 번만 만들고 설명만 문서에 맞춰 바꾼다.

const BASE = "/docs/files/guides"

const WINDOWS_DOWNLOAD_PAGE: DocMedia = {
  type: "image",
  src: `${BASE}/pc-install/01-download-page.webp`,
  alt: "클래스인 공식 홈페이지 다운로드 페이지. 위쪽 메뉴의 [다운로드]와 'Windows용 클래스인' 아래 초록색 [다운로드] 버튼이 노란 상자로 표시된 화면",
  caption: "공식 홈페이지 위쪽 메뉴에서 [다운로드]를 누르고, Windows용 클래스인의 [다운로드] 버튼을 누릅니다.",
  width: 1000,
  height: 949,
}

const WINDOWS_INSTALLER_INSTALL: DocMedia = {
  type: "image",
  src: `${BASE}/pc-install/03-installer-install.webp`,
  alt: "Windows 설치 파일을 실행하면 뜨는 클래스인 설치 창. 가운데 초록색 [설치하기] 버튼, 왼쪽 아래 약관 동의 체크 항목, 오른쪽 아래 [사용자 지정 설치] 버튼이 있는 화면",
  caption: "약관 동의 항목에 체크돼 있는지 보고 [설치하기]를 누릅니다.",
  width: 1000,
  height: 622,
}

const PLAY_STORE_PAGE: DocMedia = {
  type: "image",
  src: `${BASE}/mobile-install/01-play-store.webp`,
  alt: "Play 스토어의 ClassIn 앱 화면 두 장. 왼쪽은 개발사 EEO Education Ltd. 아래 [설치] 버튼, 오른쪽은 설치가 끝난 뒤 [제거]와 [열기] 버튼이 보이는 화면",
  caption: "개발사가 EEO Education Ltd.인 ClassIn에서 [설치]를 누르고, 설치가 끝나면 [열기]를 누릅니다.",
  width: 1000,
  height: 359,
}

const PC_LOGIN_WINDOW = {
  type: "image",
  src: `${BASE}/pc-install/05-login-window.webp`,
  width: 600,
  height: 1010,
} as const

const MOBILE_LOGIN_SIGNUP = {
  type: "image",
  src: `${BASE}/signup/01-mobile-login.webp`,
  width: 560,
  height: 1088,
} as const

const MOBILE_EMAIL_PHONE: DocMedia = {
  type: "image",
  src: `${BASE}/signup/03-mobile-email-phone.webp`,
  alt: "모바일 앱 회원 가입 화면 두 장. 왼쪽은 이메일 입력 화면 아래쪽 [전화 번호로 등록하기], 오른쪽은 국가 번호 +1이 잡힌 휴대폰 번호 입력 화면 아래쪽 [이메일로 등록하기]가 노란 상자로 표시된 화면",
  caption: "가입 방식은 화면 맨 아래 버튼으로 바꿉니다. 휴대폰 번호 화면은 국가 번호가 +1로 잡혀 있을 수 있으니 +82로 바꿉니다.",
  width: 1000,
  height: 940,
}

const PC_PHONE_NUMBER: DocMedia = {
  type: "image",
  src: `${BASE}/signup/04-pc-phone-number.webp`,
  alt: "PC 회원 가입의 전화 번호 입력 화면. 국가 번호 +82 옆에 1012345678이 입력된 칸이 노란 상자로 표시되고, 그 아래 약관 동의 체크 칸과 [인증코드 받기] 버튼이 있는 화면",
  caption: "국가 번호는 +82, 번호는 010의 맨 앞 0을 빼고 10부터 넣습니다. 약관에 체크해야 [인증코드 받기]가 눌립니다.",
  width: 600,
  height: 1016,
}

export const START_GUIDE_MEDIA: GuideMediaMap = {
  "start/pc-install": {
    "윈도우에 설치하기": [
      WINDOWS_DOWNLOAD_PAGE,
      {
        type: "image",
        src: `${BASE}/pc-install/02-browser-downloads.webp`,
        alt: "크롬 브라우저 오른쪽 위 다운로드 목록에 classin_win_install로 시작하는 설치 파일이 '완료'로 표시된 화면",
        caption: "받기가 끝나면 브라우저 오른쪽 위 다운로드 목록에서 설치 파일을 엽니다.",
        width: 1000,
        height: 381,
      },
      WINDOWS_INSTALLER_INSTALL,
      {
        type: "image",
        src: `${BASE}/pc-install/04-installer-start.webp`,
        alt: "설치가 끝난 클래스인 설치 창. 가운데 아래 초록색 [시작하기] 버튼이 있는 화면",
        caption: "설치가 끝나면 [시작하기]를 눌러 클래스인을 실행합니다.",
        width: 1000,
        height: 620,
      },
    ],
    "설치한 다음에는": [
      {
        ...PC_LOGIN_WINDOW,
        alt: "PC 클래스인 로그인 화면. 오른쪽 위 [회원 가입], 국가 번호 +1이 잡힌 전화번호/이메일 칸과 암호 칸, [로그인] 버튼, 맨 아래 [비밀번호 변경]이 있는 화면",
        caption: "계정이 없으면 오른쪽 위 [회원 가입]을 누릅니다. 한국 휴대폰 번호로 로그인한다면 국가 번호를 +82로 바꿉니다.",
      },
    ],
  },
  "start/mobile-install": {
    "안드로이드(갤럭시 등)에 설치하기": [PLAY_STORE_PAGE],
    "아이폰·아이패드에 설치하기": [
      {
        type: "image",
        src: `${BASE}/mobile-install/02-app-store.webp`,
        alt: "App Store에서 '클래스인'을 검색한 결과 화면. 맨 위에 개발사 EEO Education Ltd.의 ClassIn이 나오고, 이미 설치된 기기라 오른쪽에 [업데이트] 버튼이 표시된 화면",
        caption: "개발사가 EEO Education Ltd.인 ClassIn을 고릅니다. 처음 설치할 때는 [받기], 이미 설치한 기기에서는 [업데이트]가 보입니다.",
        width: 216,
        height: 462,
      },
    ],
    "설치한 다음에는": [
      {
        ...MOBILE_LOGIN_SIGNUP,
        alt: "모바일 클래스인 앱 첫 화면. 오른쪽 위 [회원 가입]이 노란 상자로 표시되고, 비밀번호 칸 아래 약관 동의 체크 칸과 [로그인] 버튼, [비밀번호를 잊으셨나요?]가 있는 화면",
        caption: "계정이 없으면 오른쪽 위 [회원 가입]을 누릅니다. 로그인할 때는 비밀번호 칸 아래 [약관 동의]에 체크합니다.",
      },
    ],
  },
  "start/signup": {
    "클래스인을 열고 회원 가입 누르기": [
      {
        ...MOBILE_LOGIN_SIGNUP,
        alt: "모바일 클래스인 앱 첫 화면. 오른쪽 위 [회원 가입]이 노란 상자와 화살표로 표시된 화면",
        caption: "모바일은 앱 첫 화면 오른쪽 위 [회원 가입]을 누릅니다.",
      },
      {
        type: "image",
        src: `${BASE}/signup/02-pc-login.webp`,
        alt: "PC 클래스인 첫 화면의 로그인 칸. 오른쪽 위 [회원 가입]이 노란 상자와 화살표로 표시된 화면",
        caption: "PC도 프로그램 첫 화면 오른쪽 위 [회원 가입]을 누릅니다.",
        width: 511,
        height: 1025,
      },
    ],
    "이메일이나 휴대폰 번호로 인증하기": [MOBILE_EMAIL_PHONE, PC_PHONE_NUMBER],
  },
  "start/password-change-pc": {
    "비밀번호 변경 화면 열기": [
      {
        ...PC_LOGIN_WINDOW,
        alt: "PC 클래스인 로그인 화면. 아이디·암호 칸과 [로그인] 버튼 아래, 화면 맨 아래 가운데에 [비밀번호 변경]이 있는 화면",
        caption: "PC 로그인 화면 맨 아래 가운데의 [비밀번호 변경]을 누릅니다.",
      },
    ],
    "그래도 로그인이 안 될 때": [
      {
        type: "image",
        src: `${BASE}/password-change-pc/01-country-code.webp`,
        alt: "PC 로그인 화면의 아이디 칸 앞 국가 번호가 +1로 잡혀 있는 화면",
        caption: "국가 번호가 +1이면 [+1]을 눌러 +82로 바꾼 뒤 번호를 10부터 넣습니다.",
        width: 659,
        height: 223,
      },
    ],
  },
  "start/password-change-mobile": {
    "비밀번호 변경 화면 열기": [
      {
        type: "image",
        src: `${BASE}/password-change-mobile/01-forgot-password-link.webp`,
        alt: "모바일 클래스인 로그인 화면. 비밀번호 칸 아래 약관 동의 체크 칸, [로그인] 버튼 아래 왼쪽에 [비밀번호를 잊으셨나요?], 오른쪽에 [인증 코드로 로그인]이 있는 화면",
        caption: "[로그인] 버튼 아래 왼쪽의 [비밀번호를 잊으셨나요?]를 누릅니다. 다시 로그인할 때는 비밀번호 칸 아래 [약관 동의]에 체크합니다.",
        width: 639,
        height: 635,
      },
    ],
  },
  "start/cs-classin-app-download": {
    "순서대로 따라 하기": [WINDOWS_DOWNLOAD_PAGE, WINDOWS_INSTALLER_INSTALL, PLAY_STORE_PAGE],
  },
  "start/cs-classin-account-signup": {
    "순서대로 따라 하기": [
      {
        ...MOBILE_LOGIN_SIGNUP,
        alt: "모바일 클래스인 앱 첫 화면. 오른쪽 위 [회원 가입]이 노란 상자와 화살표로 표시된 화면",
        caption: "앱 첫 화면 오른쪽 위 [회원 가입]을 누릅니다.",
      },
      MOBILE_EMAIL_PHONE,
      PC_PHONE_NUMBER,
    ],
  },
  "start/cs-classin-account-delete": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${BASE}/cs-classin-account-delete/01-settings-account-security.webp`,
        alt: "모바일 앱에서 왼쪽 위 프로필 이미지를 누르면 열리는 설정 화면. 프로필 아래 [내 QR 코드]와 [계정 및 보안] 메뉴가 보이는 화면",
        caption: "왼쪽 위 프로필 이미지를 누르면 설정 화면이 열립니다. 여기서 [계정 및 보안]을 누릅니다.",
        width: 354,
        height: 192,
      },
    ],
  },
}
