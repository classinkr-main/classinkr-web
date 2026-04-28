# HW Onboarding Roadmap — Design Spec

**Date:** 2026-04-27
**Branch:** `crm_v0`
**Scope:** `/product/hw` 페이지의 `OnboardingProcessSection` (HOW TO START 영역) 비주얼 강화

## Goal

현재 `app/product/hw/page.tsx` 내부에 정의된 `OnboardingProcessSection`은 4단계 도입 프로세스를 작은 원과 텍스트만으로 표현해 시각적 임팩트가 약하다. 콘텐츠는 그대로 유지하면서 다음을 달성한다.

- 각 단계의 의미가 한눈에 들어오도록 아이콘 추가
- 진행 흐름이 시각적으로 느껴지도록 연결선 강화
- HW 페이지 다른 섹션들과 일관된 코드 구조(별도 컴포넌트 파일)

## Non-Goals

- 콘텐츠(단계 수, 제목, 설명) 변경
- 신규 일러스트 자산 제작
- CTA · 헤드라인 카피 수정
- 다른 페이지(`/product/sw` 등)로의 확산

## Source of Truth — 현재 상태

- `app/product/hw/page.tsx`
  - `processSteps` (L779~784): 4단계 데이터 (01 문의·상담 / 02 현장 실측·견적 / 03 설치 1일 완료 / 04 교사 교육 2시간)
  - `OnboardingProcessSection` (L786~821): 페이지 내부 함수
  - 페이지 마운트 위치: L1360 `<OnboardingProcessSection />`
- 다른 HW 섹션은 모두 `components/product/hw/*.tsx`로 분리됨 (예: `OpeningStatement`, `ClassroomStudioSection`, `AfterClassSection`)

## Design

### 1. 파일 구조 — 컴포넌트 추출

`OnboardingProcessSection`과 `processSteps`를 다음 신규 파일로 이동한다.

- 신규: `components/product/hw/OnboardingRoadmap.tsx`
- 컴포넌트명: `OnboardingRoadmap` (기존 섹션 함수명 변경)
- `app/product/hw/page.tsx`는 import 추가 + 마운트 지점 교체 + 내부 함수·데이터 삭제

### 2. 노드 시각

각 단계 노드는 아래 구조를 따른다.

```
원 (w-14 h-14 rounded-full bg-white border border-[#22A366]/30)
 ├─ 중앙: lucide 아이콘 (24px, color #22A366)
 └─ 우상단 absolute: 번호 배지 (w-6 h-6 rounded-full bg-[#22A366] text-white text-[10px] font-bold tabular-nums)
제목 (font-bold, text-sm, text-slate-900)
설명 (text-xs, text-slate-500)
```

**아이콘 매핑** (lucide-react):

| Step | Title | Icon |
|------|-------|------|
| 01 | 문의 · 상담 | `MessageCircle` |
| 02 | 현장 실측 · 견적 | `Ruler` |
| 03 | 설치 (1일 완료) | `Wrench` |
| 04 | 교사 교육 (2시간) | `GraduationCap` |

**호버 인터랙션** (group hover 적용):

- 원 배경: `bg-white` → `bg-[#22A366]/8`
- 원 테두리: `border-[#22A366]/30` → `border-[#22A366]/60`
- 아이콘: `scale-1.0` → `scale-1.1`
- transition: `200ms ease-out`

### 3. 연결선

데스크탑(`lg:` 이상)에서만 노출하며, 두 레이어로 구성한다.

- **베이스 라인** — 점선, `#22A366` opacity 15%, 좌측 12% ~ 우측 12% 영역에 위치
  - Tailwind: `border-t border-dashed border-[#22A366]/15`
- **채워지는 라인** — 솔리드, `#22A366` opacity 50%, viewport 진입 시 좌→우로 채워짐
  - framer-motion: `initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: "easeOut" }}`
  - `transformOrigin: "left"`

모바일(`< sm`)은 연결선 자체를 숨기고 세로 스택으로 자연스럽게 흐른다 (현재 동작과 동일).

### 4. 섹션 외곽 구조

- 섹션 wrapper(`<section className="py-24 md:py-32 bg-[#FDFCF8]">`) 유지
- 라벨/헤드라인/서브카피 그대로 유지
- 그리드: `grid sm:grid-cols-2 lg:grid-cols-4 gap-8` 유지
- `motion.div` stagger 애니메이션 유지

### 5. 반응형

| Breakpoint | Layout |
|------------|--------|
| `< sm` (모바일) | 1열 세로 스택, 연결선 숨김 |
| `sm` ~ `< lg` (태블릿) | 2×2 그리드, 연결선 숨김 |
| `lg` 이상 (데스크탑) | 1×4 가로 정렬, 연결선 표시 (점선 + 채움 애니메이션) |

## Visual Diff Summary

| 항목 | Before | After |
|------|--------|-------|
| 노드 크기 | `w-14 h-14` 원 + 숫자 텍스트 | `w-14 h-14` 원 + 중앙 아이콘 + 우상단 번호 배지 |
| 아이콘 | 없음 | lucide 4종 (`MessageCircle` / `Ruler` / `Wrench` / `GraduationCap`) |
| 호버 | 없음 | 배경 채움 + 테두리 진해짐 + 아이콘 scale 1.1 |
| 연결선 | 단색 그라디언트 (정적) | 점선 베이스 + viewport 진입 시 채워지는 솔리드 라인 |
| 파일 위치 | `app/product/hw/page.tsx` 내부 함수 | `components/product/hw/OnboardingRoadmap.tsx` |

## DESIGN.md 준수 체크

- 색상: `#22A366` (브랜드 그린), `#FDFCF8` (섹션 배경), `slate-*` 텍스트 — 기존 팔레트 준수
- 보더: `border-[#22A366]/30` 등 브랜드 색 활용 보더 (`1px solid rgba(0,0,0,0.08)` 일반 룰은 카드/패널에 적용되는 것이며, 여기서는 시각 강조 요소이므로 브랜드 색 보더 사용)
- 모바일 우선 반응형 유지

## Validation

- `npx eslint app components lib --max-warnings=0`
- `npm run build`
- 시각 회귀 — 데스크탑 / 태블릿 / 모바일 3 viewport 수동 확인
- 호버·viewport 진입 애니메이션 동작 확인
