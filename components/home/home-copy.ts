// components/home/home-copy.ts — 홈 5화면 카피 SSOT (스펙 §2-3). H1·리드는 lib/classin-positioning.ts 의
// heroHeadline·oneLine 을 쓴다. 숫자 4개는 docs/active/brand-canon/company-facts.md 의 EEO 공식 수치.
export const HOME_COPY = {
  hero: {
    kicker: "학원 수업 운영 OS",
    primaryCta: "파일럿 상담 신청",
    secondaryCta: "34문항 운영 진단지 받기",
    secondaryHref: "/resources/academy-system-checklist#download",
    imageAlt: "불 꺼진 교실 벽의 대형 전자칠판 화면에 푸른 지구가 떠 있는 장면",
    image: { src: "/images/hero-dashboard.webp", width: 1536, height: 1024 },
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
    heading: "첫 수업부터 바로 생기는 것",
    linkLabel: "자세히 보기",
    steps: [
      {
        phase: "수업 전",
        product: "EDB 교안",
        title: "누가 들어가도 같은 수업",
        body: "에이스 강사의 판서와 자료를 코스 파일로 남깁니다. 다음 강사는 그 파일을 그대로 엽니다.",
        href: "/product/sw",
        image: { src: "/images/home/how-before.webp", alt: "클래스인 코스 화면. 주차별 수업·학습 자료·숙제·시험이 한 과정 안에 정리돼 있다" },
      },
      {
        phase: "수업 중",
        product: "자동 녹화",
        title: "수업만 하면 녹화가 저절로 쌓입니다",
        body: "보드로 수업을 시작하면 칠판과 AI 카메라 녹화가 함께 시작되고, 끝나면 클라우드에 저장됩니다. 결석 보강·복습 영상이 그날 바로 생깁니다.",
        href: "/product/hw",
        image: { src: "/images/home/how-during.webp", alt: "교실 벽에 설치된 클래스인 전자칠판" },
      },
      {
        phase: "수업 후",
        product: "AI 강의 평가",
        title: "수업이 끝나면 AI가 바로 평가합니다",
        body: "녹화본을 AI가 분석해 점수와 보고서를 만듭니다. 참관하지 않아도 강사별 수업 품질을 같은 기준으로 봅니다.",
        href: "/product/ai-report",
        image: { src: "/images/home/how-after.webp", alt: "수업 다시보기 창의 AI 강의 분석 탭. 종합 점수와 항목별 평가" },
      },
    ],
  },
  proof: {
    heading: "먼저 바꾼 학원들",
    cases: [
      {
        name: "청주 이** 국어",
        result: "첨삭·과제 이력을 누적해 강사별 편차를 줄였습니다.",
        image: { src: "/images/case-studies/cheongju-imisook-korean-v3.jpg", alt: "청주 국어 학원 교실의 클래스인 수업" },
      },
      {
        name: "부산 과**",
        result: "반별 수업 기록과 평가 데이터로 상담 준비 시간을 줄였습니다.",
        image: { src: "/images/case-studies/busan-gwasaram.jpg", alt: "부산 학원 교실의 클래스인 전자칠판" },
      },
      {
        name: "대치 세**",
        result: "판서와 자료가 수업 흐름 안에 남아 복습·보강 밀도를 높였습니다.",
        image: { src: "/images/case-studies/daechi-sejeong.webp", alt: "대치 학원 교실의 클래스인 전자칠판" },
      },
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
