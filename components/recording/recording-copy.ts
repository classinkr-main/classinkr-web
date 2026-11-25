// components/recording/recording-copy.ts — 녹화 수업 랜딩(/product/recording) 카피 SSOT. 캔버스 '녹화 수업 랜딩 시안' A안(2026-11-06).
// 녹화 시작·현장 카메라 설정: /docs/teacher/recording-troubleshooting. 처리 및 다시보기: /docs/admin/recording-file-troubleshooting.
// 다운로드·워터마크는 관리자 설정·계약 범위에 따라 다르다 — '항상 차단'으로 쓰지 않는다(docs/active/internal-cs-content-arrangement-2026-07-15.md).
// 캡처는 Drive 원본이고 학생·강사 이름과 사진, 수업 날짜·시각은 스켈레톤 면으로 가렸다(블러 아님, DESIGN.md). 캡션에는 가렸다고 적지 않는다(사용자 결정).
export const RECORDING_COPY = {
  hero: {
    kicker: "Classin 수업 녹화",
    // 두 구절 — 쉼표 뒤에서 줄을 바꾼다
    title: ["학원 수업 녹화,", "판서부터 다시보기까지"],
    lead: "수업을 만들 때 녹화 옵션을 켜면 칠판과 자료가 보이는 수업 화면을 남길 수 있습니다. 카메라를 연결하고 현장 녹화도 설정하면 교실 장면을 담을 수 있고, 녹화 처리가 끝나면 다시보기로 이용합니다.",
    primaryCta: "파일럿 상담 신청",
    secondaryCta: "34문항 운영 진단지 받기",
    secondaryHref: "/resources/academy-system-checklist#download",
    image: {
      src: "/images/product/recording/playback.webp",
      width: 1054,
      height: 695,
      alt: "녹화 수업 다시보기 화면. 칠판 판서와 강사 카메라가 함께 담긴 녹화 아래로 학생 참여율, 시청 완료율, 평균 시청 시간이 보인다",
    },
    caption: "실제 화면 · 녹화 수업 다시보기",
  },
  how: {
    kicker: "작동 방식",
    heading: "녹화 설정부터 다시보기까지",
    image: {
      src: "/images/product/recording/camera-on-board.webp",
      width: 1200,
      height: 791,
      alt: "전자칠판 위에 달린 Classin AI 카메라와 양쪽 마이크",
    },
    caption: "보드 위 AI 카메라 · 제품 이미지",
    steps: [
      { label: "01 · 수업 시작", title: "녹화 옵션을 켜고 시작을 확인합니다", body: "수업을 만들 때 녹화를 켜고, 입장 후 녹화 알림에서 확인합니다. 준비 시간이 지나면 자동으로 시작되며, 기다리지 않으려면 [즉시 녹화]를 선택합니다." },
      { label: "02 · 수업 중", title: "수업 화면과 현장 녹화를 구분합니다", body: "수업 녹화는 칠판과 자료가 보이는 화면을 담습니다. 교실 모습도 남기려면 현장 녹화를 켜고 연결한 카메라를 선택합니다. AI 추적 카메라는 선택 구성입니다." },
      { label: "03 · 수업 후", title: "처리가 끝나면 코스에서 확인합니다", body: "수업이 끝난 뒤 녹화본 처리가 완료되면 해당 수업의 다시보기에서 열 수 있습니다. 학생의 열람 여부는 코스와 다시보기 설정에 따릅니다." },
    ],
    boardLink: { label: "전자칠판 · AI 카메라 보기", href: "/product/hw" },
    guideLink: { label: "교사 가이드: 녹화 시작과 카메라 설정", href: "/docs/teacher/recording-troubleshooting" },
    replayLink: { label: "관리자 가이드: 녹화본 확인 방법", href: "/docs/admin/recording-file-troubleshooting" },
    // 수업 후의 실제 모습 — 앱의 코스 수업 목록(끝난 수업마다 카메라 버튼)
    list: {
      kicker: "수업 목록",
      title: "녹화가 완료된 수업에서 다시 봅니다",
      body: "시청 권한이 있으면 코스 수업 목록의 카메라 버튼으로 해당 수업의 녹화를 열 수 있습니다.",
      image: {
        src: "/images/product/recording/lesson-list.webp",
        width: 778,
        height: 524,
        alt: "Classin 앱의 코스 수업 목록. 주차별로 묶인 수업 가운데 녹화가 있는 수업 오른쪽에 카메라 버튼이 있다",
      },
      caption: "실제 화면 · 앱의 코스 수업 목록",
    },
  },
  gains: {
    kicker: "달라지는 것",
    heading: "보강도, 복습도, 확인도 녹화 하나로",
    image: {
      src: "/images/product/recording/watch-data.webp",
      width: 1059,
      height: 693,
      alt: "학생 데이터 화면. 학생 참여율, 시청 완료율, 평균 시청 시간과 학생별 시청 시간·완료율 목록",
    },
    caption: "실제 화면 · 학생별 시청 기록",
    roles: [
      { role: "학생", title: "결석한 수업을 다시 봅니다", body: "다시보기가 제공된 수업은 코스에서 열어 결석 보강이나 시험 전 복습에 활용할 수 있습니다." },
      { role: "강사", title: "녹화로 보강을 안내합니다", body: "시청 가능한 다시보기를 안내하고, 남은 질문을 다음 수업에서 다룹니다." },
      { role: "원장", title: "누가 끝까지 봤는지 보입니다", body: "학생별 시청 시간과 완료율이 남아, 복습을 챙길 학생이 바로 보입니다." },
    ],
  },
  control: {
    kicker: "시청 설정",
    heading: "누가, 몇 번, 언제까지 볼지도 학원이 정합니다",
    items: [
      { title: "볼 수 있는 사람", body: "정규 학생과 교사만 볼지, 코스를 떠난 학생도 볼지 정합니다." },
      { title: "보는 방식", body: "시청 가능 횟수, 열람 기간, 재생 속도와 건너뛰기 허용을 녹화마다 정합니다." },
      { title: "화면 녹화 방지", body: "켜 두면 다시보기 화면 위로 시청자 이름과 전화번호가 워터마크로 움직입니다." },
    ],
    note: "설정 항목은 관리자 권한과 계약 범위에 따라 다를 수 있습니다.",
    ai: { text: "AI 강의 평가에 사용할 수 있는 녹화와 적용 조건을 확인하세요.", label: "AI 강의 평가 보기", href: "/product/ai-report" },
  },
  // 마지막 띠는 홈 파일럿 띠(HomePilotCta)를 쓰고 제목만 바꾼다(캔버스 사용자 수정 11-06)
  pilot: { heading: "체험해보세요" },
} as const
