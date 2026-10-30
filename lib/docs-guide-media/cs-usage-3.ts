import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/cs-usage-3.json 으로 만든다(원본·자른 위치·가린 영역 기록).
// 대상은 목록에 노출하지 않는(unlisted) 사용법 문서다. 여기 매핑된 문서는 원본 합성 화면 대신 단계별 화면만 보인다.
// 다른 그룹이 같은 원본에서 이미 만든 화면은 그대로 다시 쓴다(spec 기록은 원래 그룹에 있다).
const G = "/docs/files/guides"

export const CS_USAGE_3_GUIDE_MEDIA: GuideMediaMap = {
  "admin/cs-figma-digest-1035": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-transfer-student-registration/01-course-list.webp`,
        alt: "관리자 대시보드 [코스 관리] 목록. 왼쪽 코스 관리 메뉴와 첫 번째 코스 이름에 빨간 상자가 있다",
        caption: "1단계: 왼쪽 [코스 관리]를 누르고, 담당 교사를 바꿀 코스 이름을 누릅니다.",
        width: 1200,
        height: 567,
      },
      {
        type: "image",
        src: `${G}/course-management/02-set-teacher.webp`,
        alt: "코스 [구성원] 탭에서 [교사로 설정]을 눌러 연 교사 선택 창. 구성원 탭, 교사로 설정 카드, 왼쪽 아래 교사 추가, 오른쪽 아래 확인 버튼에 빨간 상자가 있다",
        caption: "2단계: 위쪽 [구성원] → [교사로 설정]을 누르고, 교사로 등록할 계정을 골라 [확인]을 누릅니다.",
        width: 1200,
        height: 559,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1035/03-add-teacher-form.webp`,
        alt: "교사 추가 창. 국가 번호와 전화번호/이메일 입력란, 이름 입력란, 교사 대리 등록 체크 상자, 취소·확인 버튼이 보인다",
        caption: "3단계: 목록에 없는 교사는 [교사 추가]에서 전화번호 또는 이메일과 이름을 넣고 [확인]을 누릅니다.",
        width: 486,
        height: 382,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1035/04-set-homeroom-teacher.webp`,
        alt: "코스 구성원 화면. 교사 카드의 점 세 개 메뉴가 펼쳐져 교사 삭제와 담임 교사로 설정이 보이고, 담임 교사로 설정에 빨간 상자가 있다",
        caption: "4단계: 추가한 교사 카드의 점 세 개를 누르고 [담임 교사로 설정]을 누릅니다.",
        width: 1200,
        height: 186,
      },
    ],
  },
  "admin/cs-figma-digest-1151": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-1151/01-course-list.webp`,
        alt: "관리자 대시보드 [코스 관리] 목록. 왼쪽 코스 관리 메뉴에 빨간 상자가 있고 화살표가 코스 이름 열을 가리킨다",
        caption: "1단계: 왼쪽 [코스 관리]를 누르고, 옵션을 바꿀 수업이 있는 코스 이름을 누릅니다.",
        width: 1073,
        height: 555,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1151/02-lesson-edit-menu.webp`,
        alt: "코스 [시간표] 탭의 수업 목록. 수업 행 오른쪽 조작 메뉴가 펼쳐져 수업 복사·수업 편집·수업 삭제 등이 보이고 수업 편집에 빨간 상자가 있다",
        caption: "2단계: 옵션을 바꿀 수업 오른쪽 [조작]을 누르고 [수업 편집]을 고릅니다.",
        width: 950,
        height: 572,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1151/03-lesson-edit-stage-off.webp`,
        alt: "수업 편집 창. 가운데 '기본으로 스테이지 표시' 토글이 꺼져 있어 학생 자동 온스테이지·전체 음소거가 회색이고, 이 묶음과 아래 확인 버튼에 빨간 표시가 있다",
        caption: "3단계: '기본으로 스테이지 표시'를 켜고 '학생 자동 온스테이지'에 체크한 뒤 [확인]을 누릅니다.",
        width: 590,
        height: 580,
      },
      {
        type: "image",
        src: `${G}/lesson-option-concepts/02-lesson-edit-stage.webp`,
        alt: "수업 편집 창에서 '기본으로 스테이지 표시' 토글이 초록색으로 켜지고 학생 자동 온스테이지에 초록 체크가 된 모습",
        caption: "4단계: 두 옵션이 초록색으로 바뀌었는지 확인합니다.",
        width: 425,
        height: 415,
      },
    ],
  },
  "admin/cs-figma-digest-1239": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-1239/01-classroom-device-menu.webp`,
        alt: "PC 교실 화면 오른쪽 위. 마이크·카메라 아이콘을 눌러 연 목록에 마이크 선택과 스피커 선택이 있고, 아이콘 묶음과 맨 아래 설정에 빨간 상자가 있다",
        caption: "1단계: 교실 오른쪽 위 마이크·카메라 아이콘을 눌러 장치를 바꾸거나, 목록 맨 아래 [설정]을 누릅니다.",
        width: 699,
        height: 321,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1239/02-mic-settings.webp`,
        alt: "설정 창의 마이크 탭. 마이크 선택 목록과 시험 버튼, 입력 막대에 빨간 상자가 있고 아래에 자동 마이크 볼륨 조정, 스피커, 설정 더 보기 옵션이 있다",
        caption: "2~4단계: [마이크]에서 쓸 마이크를 고르고 아래 막대가 초록색으로 움직이는지 봅니다. 스피커와 배경 소음 감소·음악 모드도 여기서 정합니다.",
        width: 1000,
        height: 860,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1239/03-camera-settings.webp`,
        alt: "설정 창의 카메라 탭. 왼쪽 카메라 메뉴와 카메라 선택 목록(TranScreen Camera, Integrated Camera, CamIn Virtual Camera, 사용 안 함, 네트워크 카메라 추가)에 빨간 상자가 있고 위에 카메라 미리 보기가 있다",
        caption: "5~7단계: [카메라]에서 미리 보기 화면을 확인하고, 목록을 열어 쓸 카메라를 고릅니다.",
        width: 1000,
        height: 997,
      },
    ],
  },
  "admin/cs-figma-digest-145": {
    "수업 리소스 메뉴 열기": [
      {
        type: "image",
        src: `${G}/cs-recording-download-share/01-lesson-resources.webp`,
        alt: "관리자 대시보드 수업 리소스 목록. 왼쪽 수업 리소스 메뉴와 수업 행 오른쪽의 녹화된 수업 비디오에 빨간 표시가 있다",
        caption: "왼쪽 [수업 리소스]를 누르고, 녹화된 수업 행 오른쪽 [녹화된 수업 비디오]를 누릅니다.",
        width: 1079,
        height: 511,
      },
    ],
    "녹화 내역 확인하기": [
      {
        type: "image",
        src: `${G}/cs-recording-download-share/02-recording-download.webp`,
        alt: "수업 녹화 데이터 화면. 클립 두 개의 생성 방법·녹화 시간·영상 길이·파일 크기·파일 상태가 나열되고 첫 번째 클립의 다운로드에 빨간 상자가 있다",
        caption: "클립 내역을 확인하고, 받을 클립 행 오른쪽 [다운로드]를 누릅니다.",
        width: 1079,
        height: 215,
      },
    ],
    "플레이어에서 내려받기": [
      {
        type: "image",
        src: `${G}/cs-recording-download-share/03-player-download-link.webp`,
        alt: "브라우저에서 녹화 영상을 재생하는 화면. 위쪽 주소창과 오른쪽 아래 점 세 개 메뉴의 다운로드에 빨간 상자가 있다",
        caption: "플레이어 오른쪽 아래 점 세 개 → [다운로드]로 받거나, 위쪽 주소창의 재생 링크를 복사해 공유합니다.",
        width: 1079,
        height: 554,
      },
    ],
  },
  "admin/cs-figma-digest-603": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/class-monitoring/01-lesson-detail.webp`,
        alt: "수업 상세 모니터링 화면. 위에서부터 교실 스크린샷 목록, 학생 수 도표 그래프, 이름·참여 구분·출석·실제 수업 기간과 시간줄 표가 있고 오른쪽 위에 문제 없음·교사에게 연락함 버튼이 있다",
        caption: "위쪽 교실 스크린샷, 가운데 학생 수 도표, 아래 출석·시간줄 표 순서로 수업 상태를 확인합니다.",
        width: 1200,
        height: 569,
      },
    ],
  },
  "admin/cs-figma-digest-713": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-713/01-mobile-home-course.webp`,
        alt: "클래스인 모바일 앱 홈 화면. 아래 홈 탭과 모든 코스 목록의 코스 카드에 빨간 상자와 번호 안내(1. 홈으로 이동, 2. 코스를 찾아 이동)가 있다",
        caption: "1~2단계: 아래 [홈] 탭의 모든 코스 목록에서 대상 코스를 누릅니다.",
        width: 560,
        height: 1011,
      },
      {
        type: "image",
        src: `${G}/cs-course-create-and-close/02-mobile-close-course.webp`,
        alt: "왼쪽은 코스 상세 화면으로 코스 정보 오른쪽 화살표에 '3. 여기 클릭하기' 안내가 있고, 오른쪽은 코스 설정 화면으로 맨 아래 빨간 코스 종료에 '4. 코스 종료/클래스 탈퇴' 안내가 있다",
        caption: "3~4단계: 코스 정보 오른쪽 [>]를 눌러 코스 설정으로 들어간 뒤 맨 아래 [코스 종료]를 누릅니다.",
        width: 1000,
        height: 916,
      },
    ],
  },
  "admin/cs-figma-digest-817": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-817/01-course-settings-top.webp`,
        alt: "모바일 코스 설정 화면 위쪽. 코스 정보, 코스 멤버 2명과 추가(+)·제거(−) 버튼, 코스 QR 코드 및 링크, 코스 소개, 코스 별칭 항목이 보인다",
        caption: "위쪽: 코스 멤버를 추가·제거하고 QR 코드, 소개, 별칭을 설정합니다.",
        width: 560,
        height: 536,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-817/02-course-settings-bottom.webp`,
        alt: "모바일 코스 설정 화면 아래쪽. 코스 내 나의 닉네임, 채팅 상단에 고정 토글, 코스 관리, 코스 설정, 게시판 설정, AI 에이전트 설정, 알림 끄기 설정, 문제 제기와 맨 아래 빨간 코스 종료가 보인다",
        caption: "아래쪽: 닉네임과 채팅 고정, 관리 메뉴가 있고 맨 아래 빨간 [코스 종료]는 코스를 끝낼 때만 누릅니다.",
        width: 560,
        height: 548,
      },
    ],
  },
  "admin/cs-figma-digest-904": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-904/01-login-window.webp`,
        alt: "클래스인 PC 앱 로그인 창. 왼쪽은 Classin Board 소개 배너, 오른쪽은 국가 번호(+1)와 전화번호/이메일·암호 입력란, 로그인 버튼, 자동 로그인·비밀번호 기억, 스캔해 로그인, 구글 계정으로 로그인하기, 비밀번호 변경이 있다",
        caption: "국가 번호가 +1로 되어 있으면 +82로 바꾼 뒤 전화번호 또는 이메일과 암호를 넣습니다.",
        width: 1200,
        height: 705,
      },
    ],
  },
  "admin/cs-figma-digest-982": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-982/01-course-settings-replay.webp`,
        alt: "관리자 대시보드 코스 [설정] 화면. 왼쪽 코스 관리 메뉴, 위쪽 설정 탭, 다시 보기 유효 기간 행(고정 유효 기간 / 수업 종료 후 X일 동안 유효)에 빨간 상자가 있다",
        caption: "1~3단계: [코스 관리] → 코스 → [설정]에서 '다시 보기 유효 기간'의 두 방식 중 하나를 고릅니다.",
        width: 547,
        height: 355,
      },
      {
        type: "image",
        src: `${G}/course-management/05-replay-period.webp`,
        alt: "코스 설정 화면. 다시 보기 유효 기간에서 '수업 종료 후 15일 동안 유효'가 선택되어 있고 화살표가 맨 아래 설정 저장하기 버튼을 가리킨다",
        caption: "4~5단계: 맨 아래 [설정 저장하기]를 누릅니다. 바뀐 설정은 새로고침하거나 다시 로그인하면 반영됩니다.",
        width: 670,
        height: 528,
      },
    ],
  },
  "start/cs-figma-digest-2140": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-2140/01-login-panel.webp`,
        alt: "클래스인 PC 앱 로그인 패널. 국가 번호 +82와 휴대폰 번호 입력란, 비밀번호 입력란, 초록색 로그인 버튼, 자동 로그인·비밀번호 기억, 스캔해 로그인, 구글 계정으로 로그인하기, 위쪽 회원 가입과 아래쪽 비밀번호 변경이 보인다",
        caption: "국가 번호와 휴대폰 번호, 비밀번호를 넣고 [로그인]을 누릅니다. QR 스캔이나 구글 계정으로도 로그인할 수 있습니다.",
        width: 600,
        height: 1007,
      },
    ],
  },
  "start/cs-figma-digest-274": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/01-step.webp`,
        alt: "클래스인 PC 앱 홈 화면의 코스 목록. 입장할 코스 카드 하나에 빨간 상자가 있다",
        caption: "1단계: 수업할 코스를 눌러 들어갑니다.",
        width: 957,
        height: 635,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/02-step.webp`,
        alt: "코스 상세 화면(New Course). 오른쪽 위 새로 만들기 버튼에 빨간 상자가 있다",
        caption: "2단계: 코스 오른쪽 위 [새로 만들기]를 누릅니다.",
        width: 962,
        height: 635,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/03-step.webp`,
        alt: "학습 활동 추가하기 창. 수업·녹화 수업·숙제·일일 과제·시험·OMR 카드 등 활동 유형 중 수업에 빨간 상자가 있다",
        caption: "3단계: 학습 활동 유형에서 [수업]을 누릅니다.",
        width: 957,
        height: 635,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/04-step.webp`,
        alt: "수업 새로 만들기 창. 시작 시각 및 진행 시간과 교실 설정의 ClassIn 수업 녹화·현장 녹화 토글에 빨간 상자가 있다",
        caption: "4단계: 수업 시간과 녹화 옵션을 정하고 [등록]을 누릅니다. ClassIn 수업 녹화는 칠판 화면, 현장 녹화는 카메라 화면을 녹화합니다.",
        width: 987,
        height: 635,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/05-step.webp`,
        alt: "코스 화면에 새 수업이 추가되고 수업 행의 교실 입장 버튼과 아래 수업 알림 창의 수업 입장 버튼에 빨간 상자가 있다",
        caption: "5단계: [교실 입장]이나 수업 알림의 [수업 입장]을 눌러 들어갑니다. 학생은 10분 전부터 입장할 수 있습니다.",
        width: 957,
        height: 652,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/06-step.webp`,
        alt: "교실 입장 전 장비 테스트 창. 카메라·마이크·스피커 선택 항목에 빨간 상자가 있고 아래에 수업 입장 버튼이 있다",
        caption: "6단계: 카메라·마이크·스피커를 확인하고 [수업 입장]을 누릅니다.",
        width: 595,
        height: 386,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/07-step.webp`,
        alt: "전자칠판 교실 화면 가운데의 현장 녹화 활성화 알림 창. 아래 확인 버튼에 빨간 상자가 있다",
        caption: "7단계: 녹화 안내 알림이 뜨면 [확인]을 누릅니다.",
        width: 967,
        height: 586,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-274/08-step.webp`,
        alt: "전자칠판 교실의 현장 녹화 창과 설정 창. 톱니바퀴, 카메라 선택 목록, 바로 녹화하기 버튼에 빨간 상자가 있고 오른쪽 아래 작은 화면에 현장 녹화 진행 중 표시가 보인다",
        caption: "8단계: 톱니바퀴를 눌러 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다. 녹화가 되면 화면 아래에 초록색 아이콘이 생깁니다.",
        width: 1029,
        height: 768,
      },
    ],
  },
  "start/cs-figma-digest-473": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/01-step.webp`,
        alt: "수업 새로 만들기 창. 시작 시각·진행 시간, 온스테이지 인원수 1V0, ClassIn 수업 녹화·현장 녹화 항목에 빨간 상자가 있고 교실 설정 펼치기와 스테이지 표시에 파란 상자가 있다",
        caption: "1단계: 시간과 옵션을 정하고 [등록]을 누릅니다. 학생 카메라를 띄우지 않는 현장 녹화라면 온스테이지 인원수 1V0, 녹화 두 가지 모두 사용, 스테이지 표시 끔으로 맞춥니다.",
        width: 980,
        height: 631,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/02-step.webp`,
        alt: "코스 화면에 새 수업이 추가되고 수업 행의 교실 입장 버튼과 아래 수업 알림 창의 수업 입장 버튼에 빨간 상자가 있다",
        caption: "2단계: [교실 입장]을 눌러 들어갑니다.",
        width: 957,
        height: 631,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/03-step.webp`,
        alt: "교실 입장 전 장비 테스트 창. 카메라·마이크·스피커 선택 항목에 빨간 상자가 있다",
        caption: "3단계: 카메라·마이크·스피커를 확인하고 [수업 입장]을 누릅니다.",
        width: 570,
        height: 361,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/04-step.webp`,
        alt: "PC 교실 화면 가운데의 현장 녹화 활성화 알림 창. 아래 확인 버튼에 빨간 상자가 있다",
        caption: "4단계: 녹화 알림이 뜨면 [확인]을 누릅니다.",
        width: 479,
        height: 442,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/05-step.webp`,
        alt: "PC 교실의 현장 녹화 미리 보기 창과 설정 창. 위쪽 톱니바퀴, 바로 녹화하기 버튼, 카메라 선택 목록에 빨간 상자가 있다",
        caption: "PC: 톱니바퀴를 눌러 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 843,
        height: 474,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/06-step.webp`,
        alt: "PC 교실 오른쪽 위 아이콘 막대. 초록색 녹화 아이콘에 빨간 상자가 있다",
        caption: "PC: 오른쪽 위 녹화 아이콘을 눌러 설정을 바꿉니다. 녹화 중이면 아이콘이 초록색입니다.",
        width: 546,
        height: 368,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/07-step.webp`,
        alt: "전자칠판 교실의 현장 녹화 창과 설정 창. 톱니바퀴, 카메라 선택 목록(T1-Tracking 등), 바로 녹화하기 버튼에 빨간 상자가 있다",
        caption: "전자칠판: 톱니바퀴를 눌러 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 980,
        height: 593,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-473/08-step.webp`,
        alt: "전자칠판 아래 독의 캠코더 아이콘에 빨간 상자가 있고, 화살표가 가리키는 작은 창에 현장 녹화 진행 중·수업 녹화·설정 버튼이 보인다",
        caption: "전자칠판: 아래 슬라이드바를 올려 캠코더 아이콘 → [설정]으로 바꿉니다. 녹화 중이면 아이콘이 초록색입니다.",
        width: 831,
        height: 579,
      },
    ],
  },
  "student/cs-figma-digest-2083": {
    "홈 화면에서 QR 코드 스캔 열기": [
      {
        type: "image",
        src: `${G}/course-members/01-qr-scan-menu.webp`,
        alt: "클래스인 모바일 앱 홈 화면. 오른쪽 위 + 아이콘을 눌러 펼친 메뉴(친구 추가, 코스 가입, 공개 수업 참가, QR 코드 스캔)에서 QR 코드 스캔에 빨간 상자가 있다",
        caption: "오른쪽 위 [+] → [QR 코드 스캔]을 누릅니다.",
        width: 520,
        height: 541,
      },
    ],
    "코스 가입 버튼 누르기": [
      {
        type: "image",
        src: `${G}/course-members/02-join-course-button.webp`,
        alt: "QR 코드로 연 코스 상세 화면. 코스 소개와 코스 멤버 아래 맨 밑 초록색 코스 가입 버튼에 빨간 상자가 있다",
        caption: "코스 이름과 담당 선생님을 확인한 뒤 맨 아래 [코스 가입]을 누릅니다.",
        width: 520,
        height: 983,
      },
    ],
  },
  "student/cs-figma-digest-2311": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-2311/01-student-home.webp`,
        alt: "클래스인 PC 앱 홈 화면(학생 탭 선택). 왼쪽 메뉴(홈·채팅·할 일·캘린더·드라이브·칠판·미러링), 위쪽 코스 만들기·공개 수업 만들기 버튼, 코스 카드, 오른쪽 최근 할 일과 영상 보기 버튼이 보인다",
        caption: "[학생] 탭에서 수강 중인 코스를, 오른쪽 [최근 할 일]에서 다가오는 수업과 녹화 수업을 확인합니다.",
        width: 1200,
        height: 442,
      },
    ],
  },
  "teacher/cs-figma-digest-1370": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/class-monitoring/02-attendance-timeline.webp`,
        alt: "수업 상세 화면의 학생 수 도표와 출석·시간줄 표. 참여자별 출석·지각·조퇴, 실제 수업 기간, 입장·퇴장 표시가 있는 시간줄과 '교실에서 나가기' 안내 말풍선이 보인다",
        caption: "결석·지각·조퇴는 빨간 글씨로 표시되고, 시간줄의 말풍선에서 입장·퇴장 시각을 확인합니다.",
        width: 1200,
        height: 496,
      },
    ],
  },
  "teacher/cs-figma-digest-1658": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-1658/01-download-page.webp`,
        alt: "Chrome에서 classin.com/kr/download 다운로드 페이지를 연 화면. 왼쪽 Windows용 제목과 초록색 다운로드 버튼, 가운데 AI Agents 안내 창의 설치하기·사용자 지정 설치 버튼과 오른쪽 위 X 버튼이 보인다",
        caption: "안내 창의 [설치하기]를 누릅니다. 설치 옵션을 바꾸려면 [사용자 지정 설치]를, 창을 닫으려면 오른쪽 위 X를 누릅니다.",
        width: 1200,
        height: 701,
      },
    ],
  },
  "teacher/cs-figma-digest-1741": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-1741/01-playstore-update.webp`,
        alt: "안드로이드 패드 화면 세 장. 검색에서 Play 스토어 앱을 찾고, Play 스토어 위 검색창에 classin을 검색한 뒤, Classin 앱 페이지의 업데이트 버튼에 빨간 상자가 있다",
        caption: "1~3단계: Play 스토어를 열어 classin을 검색하고 [업데이트]를 누릅니다.",
        width: 1152,
        height: 470,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-1741/02-classin-version-check.webp`,
        alt: "클래스인 앱 화면 세 장. 홈 왼쪽 위 프로필, 설정의 소프트웨어 정보, 소프트웨어 정보 화면의 현재 버전 표시에 빨간 상자가 있다",
        caption: "4~6단계: 왼쪽 위 프로필 → [소프트웨어 정보]에서 현재 버전을 확인합니다.",
        width: 1138,
        height: 470,
      },
    ],
  },
  "teacher/cs-figma-digest-1840": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-cache-update-pc/01-file-transfer-cache.webp`,
        alt: "클래스인 PC 앱 계정 및 설정 창. 왼쪽 아래 프로필, 파일 전송 메뉴, 캐시 파일의 내용 삭제 버튼에 빨간 상자가 있다",
        caption: "1~3단계: 왼쪽 아래 프로필 → [파일 전송]에서 캐시 파일의 [내용 삭제]를 누릅니다.",
        width: 945,
        height: 510,
      },
      {
        type: "image",
        src: `${G}/cs-cache-update-pc/02-software-upgrade.webp`,
        alt: "클래스인 PC 앱 계정 및 설정 창의 소프트웨어 정보. 현재 버전과 최신 버전이 나오고 업그레이드 버튼에 빨간 상자가 있다",
        caption: "4~6단계: [소프트웨어 정보]에서 현재 버전과 최신 버전을 비교하고 [업그레이드]를 누릅니다.",
        width: 1004,
        height: 595,
      },
    ],
  },
  "teacher/cs-figma-digest-2190": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-2190/01-class-tools-video-gallery.webp`,
        alt: "교실 화면의 수업 도구 창. 아래 독의 수업 도구 아이콘, 오른쪽 세로 도구 막대의 공구 상자 아이콘, 수업 도구 목록의 비디오 갤러리에 빨간 상자가 있다",
        caption: "1~2단계: 아래 [수업 도구](또는 오른쪽 공구 상자)를 누르고 [비디오 갤러리]를 고릅니다.",
        width: 820,
        height: 815,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-2190/02-gallery-windows.webp`,
        alt: "비디오 갤러리 창과 사진 저장 및 공유 창, 설정(비디오 갤러리) 창. 비디오 갤러리 제목줄의 아이콘 세 개에 빨간 상자가 있고 화살표가 각 창을 가리킨다",
        caption: "3~5단계·9단계: 비디오 갤러리 제목줄 아이콘으로 송출 모니터를 고르거나, 사진 저장 및 공유 창(로컬에 저장·QR 코드)과 설정 창을 엽니다.",
        width: 1200,
        height: 418,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-2190/03-gallery-settings.webp`,
        alt: "설정(비디오 갤러리) 창. 교실 레이아웃 7x7, 자동 페이지 넘기기 30초/쪽, 표시할 카메라(카메라 켜진 학생), 교사 카메라 표시, 조교 카메라 표시, 완료 버튼이 보인다",
        caption: "6~8단계: 레이아웃, 자동 페이지 넘기기, 표시할 카메라를 정하고 [완료]를 누릅니다.",
        width: 386,
        height: 325,
      },
    ],
  },
  "teacher/cs-figma-digest-2283": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-2283/01-course-header.webp`,
        alt: "모바일 앱의 코스 화면 위쪽. 우주 사진 커버, New Course 제목, 수업 칩과 정렬·필터·리본·검색 아이콘, 수업 계획 추가하기·학습 계획 추가하기 버튼이 보인다",
        caption: "위쪽: 코스 제목 아래에서 수업 계획과 학습 계획을 추가합니다.",
        width: 560,
        height: 566,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-2283/02-lesson-cards.webp`,
        alt: "모바일 앱의 코스 화면 아래쪽. 종료된 수업 카드 두 개(시작 시각, 출석 수)와 아이콘, 오른쪽 아래 + 버튼, 아래 목록·채팅·할 일·공지사항 탭이 보인다",
        caption: "아래쪽: 수업 카드마다 진행 상태, 시작 시각, 출석 수가 보입니다.",
        width: 560,
        height: 560,
      },
    ],
  },
  "teacher/cs-figma-digest-401": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/recording-troubleshooting/02-camera-select.webp`,
        alt: "현장 녹화 미리 보기 창과 설정 창. 위쪽 톱니바퀴, 바로 녹화하기 버튼, 카메라 선택 목록에 빨간 상자가 있다",
        caption: "1단계: 톱니바퀴를 눌러 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다.",
        width: 1017,
        height: 551,
      },
      {
        type: "image",
        src: `${G}/recording-troubleshooting/05-mic-warning.webp`,
        alt: "'마이크가 꺼져 있으므로 녹화되는 영상에 소리가 없을 수 있습니다' 알림의 알림 설정 버튼과, 설정 창 마이크 탭의 '사용 안 함' 목록에 빨간 상자가 있다",
        caption: "2~3단계: 알림의 [알림 설정]을 누르고, 마이크 목록의 '사용 안 함'을 쓸 마이크로 바꿉니다.",
        width: 1200,
        height: 669,
      },
      {
        type: "image",
        src: `${G}/camera-mic-troubleshooting/07-board-dock-mic-camera.webp`,
        alt: "전자칠판 아래 독. 꺼진 상태로 표시된 카메라·마이크 아이콘에 빨간 상자가 있다",
        caption: "4~5단계: 알림이 없으면 아래 독에서 마이크·카메라 상태를 확인하고, 아이콘을 눌러 바로 켜고 끕니다.",
        width: 1100,
        height: 218,
      },
      {
        type: "image",
        src: `${G}/cs-figma-digest-401/04-board-settings-panel.webp`,
        alt: "전자칠판 독 오른쪽 톱니바퀴를 눌러 연 설정 창. 스피커·마이크·카메라 장치 카드에 빨간 상자가 있고 로컬 수업 녹화, 교실에서 나가기, 설정 더 보기 버튼이 있다",
        caption: "6단계: 오른쪽 톱니바퀴를 눌러 마이크·카메라를 고릅니다.",
        width: 1000,
        height: 679,
      },
    ],
  },
  "teacher/cs-figma-digest-557": {
    "순서대로 따라 하기": [
      {
        type: "image",
        src: `${G}/cs-figma-digest-557/01-trophy-award.webp`,
        alt: "AI Board 창의 답안 현황 탭. 참여 인원, 평균 소요 시간, 점수 분포 그래프와 트로피 수여 창(모든 학생 / 직접 제출한 학생 / 80점 이상 획득 학생, 점수 슬라이더, 취소·확인), 오른쪽 아래 새 문항 게시하기 버튼이 보인다",
        caption: "위쪽 트로피 버튼으로 트로피 수여 창을 열고, 받을 학생을 고른 뒤 [확인]을 누릅니다.",
        width: 1200,
        height: 760,
      },
    ],
  },
}
