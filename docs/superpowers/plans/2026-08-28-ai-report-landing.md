# 녹화 · AI 리포트 딥다이브 랜딩 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/product/ai-report` — 녹화→음성인식→AI 리포트 기능을 원장·실장에게 설득하는 5섹션 딥다이브 랜딩 + SW·HW 탭 진입 버튼.

**Architecture:** Next.js App Router. `layout.tsx`(서버, 메타데이터+JSON-LD) + `page.tsx`("use client", 5섹션). 진입 버튼은 SW 페이지 "데이터 & LMS" 섹션과 HW `AfterClassSection`에 `TrackedLink`로 추가. sitemap 등록.

**Tech Stack:** React 19, framer-motion, lucide-react, Tailwind 4, `lib/seo.ts`, `components/TrackedLink.tsx`.

**Spec:** [2026-08-28-ai-report-landing-design.md](../specs/2026-08-28-ai-report-landing-design.md)

**테스트 정책:** 정적 마케팅 페이지 — 단위 테스트 대상 로직 없음. 저장소 품질 게이트
(`npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`)
+ 실화면(데스크톱/모바일) 검증이 테스트 단계다.

---

### Task 1: 라우트 레이아웃 (메타데이터 + JSON-LD)

**Files:**
- Create: `app/product/ai-report/layout.tsx`

- [ ] **Step 1: layout.tsx 작성**

```tsx
import { JsonLd } from "@/components/seo/JsonLd"
import {
  createBreadcrumbJsonLd,
  createFaqJsonLd,
  createPublicMetadata,
  createWebPageJsonLd,
} from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "수업 녹화와 AI 리포트: 녹화부터 리포트까지 자동으로",
  description:
    "Classin은 수업을 자동 녹화하고, 음성인식으로 수업 내용을 AI 리포트로 정리합니다. 원장님이 교실에 없어도 학원의 모든 수업이 보입니다.",
  path: "/product/ai-report",
  keywords: ["수업 녹화", "학원 수업 녹화", "AI 수업 리포트", "수업 음성인식", "학원 수업 관리"],
})

export default function AiReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/product/ai-report",
            name: "수업 녹화와 AI 리포트",
            description:
              "수업 자동 녹화, 음성인식, AI 리포트로 학원의 모든 수업을 기록하고 확인하는 Classin의 수업 기록 흐름.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
            { name: "녹화 · AI 리포트", path: "/product/ai-report" },
          ]),
          createFaqJsonLd([/* page.tsx의 FAQ_ITEMS와 동일 텍스트 — Task 2에서 확정 */]),
        ]}
      />
      {children}
    </>
  )
}
```

FAQ 데이터는 page.tsx와 텍스트가 같아야 하므로 `lib/` 공유 상수로 두지 않고
layout.tsx에 배열 리터럴로 두되, Task 2의 FAQ 텍스트를 복사해 채운다(페이지 1곳
전용이라 YAGNI — 공유 모듈 불필요, 대신 두 파일 동기화 주석 남김).

### Task 2: 페이지 본문 5섹션

**Files:**
- Create: `app/product/ai-report/page.tsx` ("use client")

디자인 철칙: DESIGN.md 팔레트만(그린 `#084734` 액센트 한정, 파스텔 채움 지양 —
아웃라인/타이포 강조), 보더 `1px solid rgba(0,0,0,0.08)`, 섹션 배경
`#FFFFFF↔#F6F5F4↔#ECFDF5` 교차, 모바일 우선, `useReducedMotion`으로 루프 애니메이션
비활성. 모션 헬퍼는 SW 페이지의 `fadeUp`/`stagger` 패턴 복제.

- [ ] **Step 1: 섹션 1 히어로 — 문제 제기**
  - Eyebrow 뱃지 "녹화 · AI 리포트"
  - H1: "수업이 끝나면,\n그 수업이 어땠는지 아무도 모릅니다"
  - 서브: "이제는 다릅니다. 모든 수업이 자동으로 녹화되고, 음성인식이 수업 내용을
    리포트로 정리합니다. 원장님이 교실에 없어도, 학원의 모든 수업이 보이기 시작합니다."
  - 고충 3줄 아웃라인 카드: ① "강사 열 명의 수업을 다 들어볼 수는 없습니다" ②
    ""오늘 뭐 배웠어요?" — 학부모 문의에 답할 근거가 없습니다" ③ "결석생 보강은
    매번 강사의 개인 부담입니다"
  - 파이프라인 스트립: 수업 → 자동 녹화 → 음성인식 → AI 리포트 (4노드, 순차 리빌)
  - CTA: `TrackedLink` `ctaId="ai_report_hero_contact"` → `/contact#contact-form`

- [ ] **Step 2: 섹션 2 자동 녹화 딥다이브** (배경 `#F6F5F4`)
  - Eyebrow "STEP 1 — 자동 녹화", H2 "누르지 않아도,\n녹화되고 있습니다"
  - 기능 행 3개: 자동 시작(강사가 잊어도 누락 없음) / 클라우드 저장(파일 정리·공유
    업무 제로) / 앱 내 재생(학생 복습·결석 보강이 링크 하나로)
  - 모의 UI: 다크 카드 녹화 재생 화면 — 수업명·날짜 헤더, REC 뱃지, 재생 타임라인
  - 신뢰 라인 3종: 재생 시 워터마크 / 외부 다운로드 차단 / 저작권은 기관과 강사에게

- [ ] **Step 3: 섹션 3 AI 리포트 (심장)** (배경 `#FFFFFF`)
  - Eyebrow "STEP 2 — 음성인식 · AI 리포트", H2 "60분 수업이,\n읽을 수 있는 리포트가 됩니다"
  - 서브: "녹화가 끝나면 음성인식이 수업 내용을 텍스트로 옮기고, AI가 핵심만 리포트로
    정리합니다. 다시 듣지 않아도, 읽으면 됩니다."
  - 모의 UI(우측, "예시 화면" 라벨 필수): 음성 파형 → 리포트 카드(수업 요약 / 오늘
    다룬 개념 / 진도·다음 수업 / 과제 안내) 순차 생성 애니메이션
  - 파형 애니메이션은 `useReducedMotion` 시 정지 상태로 렌더

- [ ] **Step 4: 섹션 4 원장 활용 시나리오** (배경 `#ECFDF5` 또는 `#F6F5F4`)
  - H2 "원장실에서,\n학원의 모든 수업이 보입니다"
  - 에디토리얼 카드 3장(AfterClassSection 카드 문법 참조):
    ① 강사 품질 관리 — "신입 강사의 수업, 리포트로 먼저 봅니다" / 전 수업을 참관하지
    않아도 수업 흐름을 파악하고, 코칭할 근거가 생깁니다.
    ② 학부모 응대 — "기억이 아니라 기록으로 답합니다" / "오늘 뭐 배웠어요?"라는
    문의에 수업 리포트로 답하는 학원이 됩니다.
    ③ 결석 · 보강 — "보강 요청에 링크 하나로 답합니다" / 녹화와 리포트를 함께 보내면
    보강의 상당 부분이 해결됩니다.

- [ ] **Step 5: 섹션 5 신뢰 요약 + CTA** (배경 `#FFFFFF`)
  - H2 "녹화는 쌓이고,\n리포트는 학원의 자산이 됩니다"
  - 서브: "강사가 바뀌어도 수업 기록은 학원에 남습니다. 좋은 수업이 개인기가 아니라
    시스템이 되는 것 — Classin이 말하는 수업 시스템 OS의 시작입니다."
  - 미니 FAQ 3 (아코디언 없이 정적 리스트): ① 녹화본 저작권 → 기관과 강사에게,
    앱 내 재생만 허용·다운로드 차단·워터마크 ② 도입이 복잡한가요 → Classin
    소프트웨어에 포함된 흐름, 1개 교실 파일럿부터 ③ 비용 → 학원 규모·구성에 따라
    달라 상담으로 안내 (가격 단정 금지 철칙)
  - CTA: `TrackedLink` `ctaId="ai_report_bottom_contact"` → `/contact#contact-form`
  - FAQ 텍스트를 Task 1 layout.tsx의 `createFaqJsonLd`에 동일하게 반영

### Task 3: SW 탭 진입 버튼

**Files:**
- Modify: `app/product/sw/page.tsx` — "관리 & 분석" 섹션 기능 행 3개 아래 (`~L2047`)

- [ ] **Step 1: TrackedLink import 추가 후 기능 행 리스트 닫는 `</div>` 아래에 삽입**

```tsx
<motion.div {...fadeUp} className="mt-8">
    <TrackedLink
        href="/product/ai-report"
        ctaId="sw_ai_report_deep_dive"
        className="inline-flex items-center gap-2 rounded-[6px] border border-[#084734]/25 px-5 py-3 text-sm font-semibold text-[#084734] hover:bg-[#ECFDF5] transition-colors"
    >
        녹화 · AI 리포트 자세히 보기
        <ArrowRight className="w-4 h-4" />
    </TrackedLink>
</motion.div>
```

### Task 4: HW 탭 진입 버튼

**Files:**
- Modify: `components/product/hw/AfterClassSection.tsx` — 카드 그리드 아래

- [ ] **Step 1: TrackedLink + ArrowRight import 후 그리드 아래 중앙 정렬 버튼 삽입**

```tsx
<motion.div {...fadeUp} className="mt-10 text-center">
    <TrackedLink
        href="/product/ai-report"
        ctaId="hw_ai_report_deep_dive"
        className="inline-flex items-center gap-2 rounded-[6px] border border-[#084734]/25 px-5 py-3 text-sm font-semibold text-[#084734] hover:bg-[#ECFDF5] transition-colors"
    >
        녹화 · AI 리포트 자세히 보기
        <ArrowRight className="w-4 h-4" />
    </TrackedLink>
</motion.div>
```

### Task 5: sitemap 등록

**Files:**
- Modify: `app/sitemap.ts` — `staticRoutes` 배열 `/product/hw` 다음 줄

- [ ] **Step 1: 엔트리 추가**

```ts
{ path: "/product/ai-report", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-08-28" },
```

### Task 6: 품질 게이트

- [ ] `npm run typecheck` — 통과
- [ ] `npx eslint app components lib --max-warnings=0` — 통과
- [ ] `npm run build` — 통과 (content-visibility 경고는 재빌드 1회 재시도)

### Task 7: 실화면 검증

- [ ] dev 서버 프리뷰로 `/product/ai-report` 데스크톱 스크린샷 — 5섹션 렌더·배경
      교차·그린 한정 확인
- [ ] 모바일(375px) 스크린샷 — 스택 레이아웃·letter-spacing 확인
- [ ] `/product/sw`·`/product/hw` 진입 버튼 노출 확인
- [ ] CTA 클릭 시 `click_cta` 발화 확인 (콘솔/네트워크)

### Task 8: 커밋

- [ ] 신규·수정 5개 파일만 개별 `git add` (더러운 워크트리 — `git add -A` 금지)

```bash
git add app/product/ai-report/layout.tsx app/product/ai-report/page.tsx \
  app/product/sw/page.tsx components/product/hw/AfterClassSection.tsx app/sitemap.ts
git commit -m "feat(product): 녹화·AI 리포트 딥다이브 랜딩 — /product/ai-report 5섹션 + SW/HW 진입 버튼"
```
