// components/recording/recording-copy.ts — 녹화 수업 랜딩(/product/recording) 카피 SSOT. 캔버스 '녹화 수업 랜딩 시안' A안(2026-11-06).
// 근거: 수업을 만들 때 녹화를 켜면 수업 시간에 자동 시작(docs/active/cs-figma-board-digest-2026-06-21.md),
// 4K AI 카메라 자동 추적(/product/hw), 시청 설정 항목(docs/active/classin-software-feature-inventory.md).
// 다운로드·워터마크는 관리자 설정·계약 범위에 따라 다르다 — '항상 차단'으로 쓰지 않는다(docs/active/internal-cs-content-arrangement-2026-07-15.md).
// 캡처는 Drive 원본이고 학생·강사 이름과 사진, 수업 날짜·시각은 스켈레톤 면으로 가렸다(블러 아님, DESIGN.md). 캡션에는 가렸다고 적지 않는다(사용자 결정).
export const RECORDING_COPY = {
  hero: {
    kicker: "Classin 수업 녹화",
    // 두 구절 — 쉼표 뒤에서 줄을 바꾼다
    title: ["수업만 하면,", "녹화는 저절로 남습니다"],
    lead: "보드로 수업을 시작하면 칠판 화면과 AI 카메라가 함께 녹화합니다. 수업이 끝나면 클라우드에 저장되고, 학생은 그날 바로 다시 봅니다.",
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
    heading: "수업 중에는 누를 버튼이 없습니다",
    image: {
      src: "/images/product/recording/camera-on-board.webp",
      width: 1200,
      height: 791,
      alt: "전자칠판 위에 달린 Classin AI 카메라와 양쪽 마이크",
    },
    caption: "보드 위 AI 카메라 · 제품 이미지",
    steps: [
      { label: "01 · 수업 시작", title: "녹화가 함께 시작됩니다", body: "수업을 만들 때 녹화를 켜 두면, 수업 시간이 되는 순간 녹화가 시작됩니다." },
      { label: "02 · 수업 중", title: "칠판과 강사를 함께 담습니다", body: "4K AI 카메라가 강사를 따라가며 찍습니다. 촬영 담당이 따로 필요 없습니다." },
      { label: "03 · 수업 후", title: "클라우드에 저절로 올라갑니다", body: "파일을 옮기거나 올릴 일이 없습니다. 녹화는 코스의 그 수업에 붙습니다." },
    ],
    boardLink: { label: "전자칠판 · AI 카메라 보기", href: "/product/hw" },
    // 수업 후의 실제 모습 — 앱의 코스 수업 목록(끝난 수업마다 카메라 버튼)
    list: {
      kicker: "수업 목록",
      title: "끝난 수업마다 녹화 버튼이 붙습니다",
      body: "코스 수업 목록에서 카메라 버튼을 누르면 그 수업 녹화가 열립니다. 주차별로 쌓여 지난 수업도 금방 찾습니다.",
      image: {
        src: "/images/product/recording/lesson-list.webp",
        width: 778,
        height: 524,
        alt: "Classin 앱의 코스 수업 목록. 주차별로 묶인 수업 가운데 끝난 수업마다 오른쪽에 카메라 버튼이 있다",
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
      { role: "학생", title: "결석한 날 수업도 그날 봅니다", body: "녹화는 앱의 코스에 남습니다. 시험 전 복습도 같은 녹화로 합니다." },
      { role: "강사", title: "보강 시간을 따로 잡지 않습니다", body: "녹화 링크를 보내고, 남은 질문에만 답합니다." },
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
    ai: { text: "녹화가 쌓이면, AI가 그 수업을 평가합니다.", label: "AI 강의 평가 보기", href: "/product/ai-report" },
  },
  // 마지막 띠는 홈 파일럿 띠(HomePilotCta)를 쓰고 제목만 바꾼다(캔버스 사용자 수정 11-06)
  pilot: { heading: "체험해보세요" },
} as const
