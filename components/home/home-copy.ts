// components/home/home-copy.ts — 홈 5화면 카피 SSOT (스펙 §2-3). H1·리드는 lib/classin-positioning.ts 의
// heroHeadline·oneLine 을 쓴다. 숫자 4개는 docs/active/brand-canon/company-facts.md 의 EEO 공식 수치.
export const HOME_COPY = {
  hero: {
    kicker: "학원 수업 운영 OS",
    primaryCta: "파일럿 상담 신청",
    secondaryCta: "34문항 운영 진단지 받기",
    secondaryHref: "/resources/academy-system-checklist#download",
    imageAlt: "불 꺼진 교실 벽의 대형 전자칠판 화면에 푸른 지구가 떠 있는 장면",
    stats: [
      { value: "3,000만+", label: "월간 수업" },
      { value: "5,000만+", label: "교사 · 학습자" },
      { value: "6만+", label: "교육기관" },
      { value: "160+", label: "서비스 국가" },
    ],
    statsCaption: "EEO 공식 기준 · 전 세계 누적",
  },
  problem: {
    heading: "강사가 바뀌면, 수업도 바뀝니다.",
    scenes: [
      { title: "에이스 강사가 퇴사했습니다.", body: "그 반 20명의 수업 품질은 누가 지킵니까." },
      { title: "같은 교재, 같은 시간.", body: "반마다 성적이 다른데, 어느 반이 왜 다른지 모릅니다." },
      { title: "상담마다 같은 질문.", body: "\"복습은 어떻게 하나요?\"에 매번 말로만 답합니다." },
    ],
    closing: "수업은 개인기가 아니라, 시스템입니다.",
    link: { label: "우리 학원 운영 누수 진단하기", href: "/resources/academy-system-checklist" },
  },
  how: {
    heading: "수업 전·중·후를 하나의 흐름으로",
    linkLabel: "자세히 보기",
    steps: [
      { phase: "수업 전", title: "EDB 교안", body: "우수 강사의 판서와 자료를 다시 쓰는 수업 파일로 남깁니다.", href: "/product/sw" },
      { phase: "수업 중", title: "Classin Board", body: "전자칠판·카메라·OPS·소프트웨어가 한 교실 안에서 함께 돕니다.", href: "/product/hw" },
      { phase: "수업 후", title: "녹화 · AI 리포트 · 관리자 데이터", body: "수업이 끝나도 기록과 관리 기준이 남습니다.", href: "/product/ai-report" },
    ],
  },
  proof: {
    heading: "먼저 바꾼 학원들",
    cases: [
      { name: "청주 이** 국어", result: "첨삭·과제 이력을 누적해 강사별 편차를 줄였습니다." },
      { name: "부산 과**", result: "반별 수업 기록과 평가 데이터로 상담 준비 시간을 줄였습니다." },
      { name: "대치 세**", result: "판서와 자료가 수업 흐름 안에 남아 복습·보강 밀도를 높였습니다." },
    ],
    link: { label: "도입 이야기 더 보기", href: "/blog" },
  },
  pilot: {
    heading: "1개 교실, 90일 파일럿부터",
    steps: [
      { title: "대표 수업 선정", body: "가장 손이 많이 가는 수업 하나를 고릅니다." },
      { title: "교실 설치 · 온보딩", body: "보드 설치와 강사 온보딩을 함께 진행합니다." },
      { title: "결과 확인 후 확대", body: "녹화와 데이터로 결과를 보고 다음 교실을 정합니다." },
    ],
    honest: "결제 · 오프라인 출석 · 고급 리포트는 별도 시스템이나 연동으로 분리해 설계합니다.",
    primaryCta: "파일럿 상담 신청",
    secondaryCta: "34문항 운영 진단지 받기",
    secondaryHref: "/resources/academy-system-checklist#download",
    pages: [
      { label: "목동 쇼룸", href: "/showroom" },
      { label: "가격", href: "/pricing" },
      { label: "자료실", href: "/resources" },
    ],
  },
} as const
