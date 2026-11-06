// /llms.txt — AI 답변 엔진이 사이트를 요약할 때 읽는 안내문(https://llmstxt.org 형식).
// 손으로 쓴 정적 파일은 옛 도메인(classin.ai.kr)·영문 설명으로 사이트와 따로 놀았다. 그래서 화면이 쓰는 정본에서 만든다:
// 포지셔닝 lib/classin-positioning.ts, 회사 수치 lib/blog-ai-prompts.ts(company-facts §3 사본), 공개 FAQ lib/public-faq.ts.

import { COMPANY_SCALE, COMPANY_SCALE_SOURCE } from "@/lib/blog-ai-prompts"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { PUBLIC_FAQ_CATEGORIES } from "@/lib/public-faq"
import { COMPANY_FOUNDING_DATE, COMPANY_LEGAL_NAME, SITE_URL, toAbsoluteUrl } from "@/lib/seo"

const PRIMARY_PAGES: Array<{ path: string; title: string; summary: string }> = [
  { path: "/", title: "홈", summary: "클래스인이 무엇이고 어떤 학원에 맞는지" },
  { path: "/product/sw", title: "Classin 소프트웨어", summary: "실시간 수업, 판서, 과제·시험, 녹화, LMS, 관리자 데이터" },
  { path: "/product/hw", title: "Classin Board 전자칠판", summary: "OPS 내장 교육용 전자칠판, AI 카메라 녹화, 판서 PDF 공유" },
  { path: "/product/recording", title: "수업 녹화", summary: "보드 수업 자동 녹화, 클라우드 저장, 다시보기와 학생별 시청 기록" },
  { path: "/product/ai-report", title: "AI 강의 평가", summary: "녹화된 수업을 음성인식과 AI로 정리한 수업 리포트" },
  { path: "/pricing", title: "요금제·도입 견적", summary: "소프트웨어 요금제와 전자칠판·설치 견적 안내" },
  { path: "/faq", title: "자주 묻는 질문", summary: "도입·기능·요금·설치·사용법 질문과 답변" },
  { path: "/docs", title: "가이드", summary: "설치·가입부터 코스 개설, 수업 진행, 전자칠판 사용법까지 공식 사용 안내" },
  { path: "/resources", title: "자료실", summary: "도입 검토용 체크리스트·로드맵 PDF" },
  { path: "/blog", title: "블로그", summary: "학원 운영 사례와 기능 활용 글(RSS: /blog/rss.xml)" },
  { path: "/showroom", title: "목동 쇼룸 예약", summary: "실제 수업 흐름을 직접 보는 60분 상담" },
  { path: "/contact", title: "도입 문의", summary: "도입 상담 신청" },
  { path: "/about", title: "회사 소개", summary: "EEO와 클래스인 코리아" },
]

function oneLineText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

export function buildLlmsTxt(): string {
  const p = CLASSIN_POSITIONING
  const lines: string[] = [
    "# 클래스인 (Classin)",
    "",
    `> ${p.oneLine} 한국에서는 ${COMPANY_LEGAL_NAME}(${COMPANY_FOUNDING_DATE} 설립, 서울 목동)가 운영하며, 모회사는 EEO(Empower Education Online)입니다.`,
    "",
    `정본 주소는 ${SITE_URL} 입니다. 예전 주소 classin.ai.kr 은 이 주소로 넘어옵니다. 표기는 영문 "Classin", 한글 "클래스인"을 씁니다.`,
    "",
    "## 무엇을 하는 서비스인가",
    "",
    `- 범주: ${p.categoryName}. ${oneLineText(p.coreNarrative)}`,
    `- 대상: ${p.primaryAudience}`,
    `- 한국 학원 도입 방식: ${p.localReality}`,
    `- EDB 교안: ${p.edbSummary}`,
    `- 관리자 데이터: ${p.adminDataSummary}`,
    `- 하지 않는 일(정직한 한계): ${p.honestLimit}`,
    ...p.comparisonPoints.map((item) => `- ${item.label}: ${item.point}`),
    "",
    "## 주요 페이지",
    "",
    ...PRIMARY_PAGES.map((page) => `- [${page.title}](${toAbsoluteUrl(page.path)}): ${page.summary}`),
    "",
    "## 회사 사실",
    "",
    `- ${COMPANY_SCALE} (${COMPANY_SCALE_SOURCE}, 출처 https://www.classin.com/ ). 한국 실적이 아닙니다.`,
    "- 국내 도입 기관 수, 서버 위치, 콘텐츠 소유권, 투자·기업 가치는 공개 자료로 단정하지 않습니다. 도입 상담에서 확인합니다.",
    "- 소프트웨어 Standard·Plus 계정당 요금은 제품 페이지 요금표에 공개돼 있고, Enterprise와 전자칠판·설치 구성은 견적입니다. 통화·세금 등 최종 조건은 결제·상담 단계에서 확정됩니다.",
    "- AI 기능(채점·출제·리포트)은 교사를 돕는 보조 도구이며 최종 판단을 대신하지 않습니다.",
    "",
    "## 자주 묻는 질문",
    "",
  ]

  for (const category of PUBLIC_FAQ_CATEGORIES) {
    for (const item of category.items) {
      lines.push(`### ${item.question}`, "", oneLineText(item.answer), "", `출처: ${toAbsoluteUrl(`/faq#${item.id}`)}`, "")
    }
  }

  lines.push(
    "## 수집 안내",
    "",
    "공개 마케팅 페이지, 제품 페이지, FAQ, 가이드, 블로그, 행사 페이지는 검색과 AI 답변에 쓰여도 됩니다. 관리자(/admin), API, 결제(/checkout), 영수증, 수신 거부 경로는 수집 대상이 아닙니다.",
    "",
  )

  return lines.join("\n")
}
