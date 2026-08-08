# Design System — Classin (Notion base × Apple whitespace × Classin Green)

Notion의 구조/타이포그래피 철학을 기반으로, Apple의 넉넉한 공백감과
Classin 브랜드 그린(`#084734`)을 액센트로 오버라이드한 시스템.

---

## 1. 핵심 철학

- **따뜻한 미니멀리즘**: 차가운 그레이 대신 따뜻한 오프화이트 + 웜 뉴트럴
- **프리미엄 공백**: Apple처럼 여백이 디자인의 일부. 섹션 간 64–120px
- **그린 액센트**: Classin 브랜드 포레스트 그린을 유일한 포화 컬러로 사용
- **경량 보더**: `1px solid rgba(0,0,0,0.08)` — 보이지 않을 듯 존재하는 구분선

---

## 2. 컬러 팔레트

### Primary
- **Classin Green** (`#084734`): Primary CTA, 링크, 인터랙티브 액센트 — 유일한 포화 컬러
- **Green Hover** (`#065c41`): 버튼 hover/active 상태
- **Page White** (`#FAFAF8`): 페이지 배경 (현재 프로젝트 기존값 유지)
- **Near Black** (`#111110`): 헤딩, 본문 텍스트 (현재 프로젝트 기존값 유지)

### 그린 서피스 스케일
- **Green Surface 50** (`#ECFDF5`): 연한 그린 배경, 섹션 교차, 뱃지 배경
- **Green Surface 100** (`#D1FAE5`): 호버 서피스, 강조 블록 배경
- **Green Muted** (`#6EE7B7`): 보조 그린 텍스트, 아이콘

### 웜 뉴트럴 스케일 (Notion 기반)
- **Warm White** (`#F6F5F4`): 섹션 교차 배경 — 노란-갈색 언더톤
- **Warm Dark** (`#31302E`): 다크 서피스 텍스트
- **Warm Gray 500** (`#615D59`): 보조 텍스트, 설명
- **Warm Gray 300** (`#A39E98`): 플레이스홀더, 비활성, 캡션
- **Pure White** (`#FFFFFF`): 카드 표면, 모달
- **Skeleton Neutral** (`#F0F0EC`): 로딩 스켈레톤(`animate-pulse`) 전용 배경 — 실사용 다수(어드민 전반)를 공식 토큰으로 편입

### 운영 상태 스케일 (Status scale) — 어드민 전용

운영 데이터의 상태(부족/예정/출고/취소 등)는 녹색 단일 액센트만으로 구분되지 않으므로, 어드민 운영 화면(`/admin/hardware` 등)에 한해 아래 신호색을 정식 토큰으로 허용한다. 단 **CTA 액센트는 여전히 Classin Green 하나**이며, 신호색은 상태 표시(뱃지·수치·작은 라벨)에만 쓰고 일반 버튼 채움·주요 액션엔 쓰지 않는다.

| 의미 | 텍스트 | 배경 틴트 | 보더 |
| --- | --- | --- | --- |
| Danger (출고·부족·취소) | `#B43E3E` (강조 `#8F2C2C`) | `#FCE9E9` | `#F2B8B8` |
| Warning (예정·주문 검토) | `#A8741A` (강조 `#7A520F`) | `#FBF1E0` | `#ECD29C` |
| Success·Info (입고·확정·정상) | `#084734` | `#ECFDF5` | `#BDEFD8` |

원칙:
- 신호색은 **상태 의미가 있을 때만**. 장식·카테고리 구분엔 웜 뉴트럴을 쓴다.
- 한 화면에서 신호색이 경쟁하면 위계가 무너진다 — 행 내 빠른 액션처럼 의미가 약한 곳은 중립(`#31302E`)으로 두고 hover에서만 의도색을 드러낸다.
- 채움(solid) 버튼의 포화색은 Classin Green(주요)과 Danger(파괴적 확인)만 허용.

### 확도 신호 토큰 (Confidence scale) — 매출 확도 전용

REV 매출의 3단 확도(확정/고확도/예정)는 본질 기능이라 서로 구분되는 신호색 3개가 필요하다.
코드 SSOT는 `lib/branch/confidence-tokens.ts`의 `CONFIDENCE_TOKENS` 단일 맵 — 확도 맥락의
소비처는 이 맵만 import하고 색 리터럴을 재정의하지 않는다.

| 확도 | 텍스트 | 강조 | 배경 틴트 | 보더 | 비고 |
| --- | --- | --- | --- | --- | --- |
| 확정 (confirmed) | `#084734` | `#084734` | `#ECFDF5` | `#BDEFD8` | Success·Info 상태 축과 동일(Classin Green) |
| 고확도 (high-confidence) | `#1E5DA8` | `#1E5DA8` | `#EFF6FF` | `#BFDBFE` | **냉색 금지 원칙의 유일한 예외 토큰** — 2026-07-10 운영자 결정으로 공식화. 확도 신호 맥락 전용 |
| 예정 (expected) | `#A8741A` | `#7A520F` | `#FBF1E0` | `#ECD29C` | Warning 상태 축과 동일 |

오용 금지 규칙:
- `#1E5DA8`은 **확도(고확도) 신호에만** 쓴다. 파이프라인 stage 색·캠페인 태그·KPI 실적 막대 등
  비확도 맥락의 파랑 사용은 여전히 팔레트 위반이다(기존 오용은 별도 정리 대상이며, 이 토큰의
  존재가 새 파랑 사용을 정당화하지 않는다).
- 확도 색을 CTA·일반 버튼 채움·장식·카테고리 구분에 쓰지 않는다. 예외는 확도 선택 토글(3버튼)의
  활성 상태뿐 — 그 외 solid 채움 규칙은 위 원칙(Classin Green·Danger만)을 따른다.
- 세 색은 항상 3단 체계로 함께 읽힌다 — 한 색만 떼어 단독 강조색으로 차용하지 않는다.
- 고확도 틴트(`#EFF6FF`/`#BFDBFE`)도 예외 토큰의 일부로, 확도 뱃지·칩 밖에서는 쓰지 않는다.

### Team Identity 색 (BD/MKT/CSM) — 어드민 지사 대시보드 전용

지사 대시보드에서 딜·인사이트·KPI를 BD/MKT/CSM 팀별로 색 구분할 때 쓰는 팀 아이덴티티
색이다. 코드 SSOT는 `lib/branch/team-colors.ts`의 `TEAM_COLORS` 단일 맵 — 소비처는
여기서 import만 하고 색 리터럴을 재정의하지 않는다.

| 팀 | 색 | 비고 |
| --- | --- | --- |
| BD | `#084734` | Status Success 축과 값이 겹침(우연) |
| MKT | `#7B8B36` (올리브) | Status 3색 어디에도 대응 없는 **팀 아이덴티티 전용 예외 토큰** — 확도 예외 파랑(`#1E5DA8`)과 같은 패턴으로 공식화(2026-07-17) |
| CSM | `#A8741A` | Status Warning 축과 값이 겹침(우연) |

원칙:
- **Team Identity 색은 팀 구분에만 쓴다.** 상태(정상/부족 등)·확도(확정/고확도/예정)·
  페이싱·확률 등급 같은 의미 축에는 절대 재사용하지 않는다 — 특히 MKT 올리브를
  "중간 단계" 색으로 차용해 KPI·확률 그라데이션에 쓰는 것은 팔레트 위반이다. 그
  맥락은 §2 Status 스케일(Danger/Warning/Success) 또는 `lib/branch/confidence-tokens.ts`를 쓴다.
- BD·CSM이 Status 색과 값이 같은 것은 팀 색이 상태 의미를 겸한다는 뜻이 아니다 —
  같은 팔레트에서 고른 결과일 뿐, 두 축은 독립적으로 관리한다.

### 지역 히트맵 램프 (Region heatmap ramp) — BranchRegionHeatmap 전용

지사 대시보드의 지역별 매출 히트맵(`components/admin/branch/sections/BranchRegionHeatmap.tsx`)은
연속값(0~1 정규화 지표)을 4단 그라데이션으로 표현해야 해서, 이산 상태/팀 색과는 다른 별도의
연속 램프 예외 토큰이 필요하다. 색 자체는 이미 실사용 중이었고 이 항목은 **새 색 도입이 아니라
가드 사각지대(문서 미등재) 해소**다 — 색 변경 없음.

| 위치(t) | 색 | 의미 |
| --- | --- | --- |
| 0.00 | `#A85952` (muted terracotta) | 낮음 / 위험 |
| 0.34 | `#C09460` (warm tan) | 주의 필요 |
| 0.67 | `#7F9A82` (sage) | 정상 궤도 |
| 1.00 | `#3E5F4D` (deep forest) | 강함 |
| — | `#D5D2CB` | 데이터 없음(dimmed) 셀 전용 |

원칙:
- 이 4색 + dimmed 회색은 **BranchRegionHeatmap의 연속 램프 보간에만** 쓴다. 위 §2 Status
  스케일(Danger/Warning/Success)이나 §2 확도 신호 토큰과 값이 겹치지 않도록 의도적으로
  분리된 팔레트다 — 다른 맥락(상태 뱃지·확도·팀 색)에 이 램프 색을 차용하지 않는다.
- 중간 구간(t 사이) 색은 RGB 선형 보간으로 계산되며 개별 상수로 하드코딩하지 않는다 —
  네 앵커 색만 SSOT다.
- 이산 카테고리 구분(팀·확도·상태)에는 이 램프 대신 §2의 해당 토큰 맵을 쓴다. 이 램프는
  "정도"를 표현하는 연속값 전용이다.

### 보더 & 섀도
- **Whisper Border** (`1px solid rgba(0,0,0,0.08)`): 기본 구분선
- **Card Shadow**: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px`
- **Deep Shadow**: 5레이어, 최대 opacity 0.05, 52px blur

---

## 3. 타이포그래피 (Notion 기반)

### 폰트 패밀리
- `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Arial, sans-serif`

### 계층

| 역할 | 크기 | 굵기 | Line Height | Letter Spacing |
|------|------|------|-------------|----------------|
| Display Hero | 64px | 700 | 1.00 | -2.125px |
| Display Secondary | 54px | 700 | 1.04 | -1.875px |
| Section Heading | 48px | 700 | 1.00 | -1.5px |
| Sub-heading | 40px | 700 | 1.5 | normal |
| Card Title | 22px | 700 | 1.27 | -0.25px |
| Body Large | 20px | 600 | 1.40 | -0.125px |
| Body | 16px | 400 | 1.50 | normal |
| Nav / Button | 15px | 600 | 1.33 | normal |
| Caption | 14px | 500 | 1.43 | normal |
| Badge | 12px | 600 | 1.33 | 0.125px |

### 원칙
- 헤딩 크기가 클수록 letter-spacing 더 음수 (압축감)
- 본문 16px에서는 letter-spacing normal
- 뱃지 12px에서만 양수 letter-spacing (가독성)

---

## 4. 컴포넌트 스타일

### 버튼
**Primary (Green)**
- Background: `#084734`
- Text: `#ffffff`
- Padding: `8px 20px`
- Radius: `6px`
- Hover: `#065c41`
- Active: `scale(0.97)`

**Secondary**
- Background: `rgba(0,0,0,0.05)`
- Text: `#111110`
- Radius: `6px`
- Hover: `rgba(0,0,0,0.08)`

**Ghost**
- Background: transparent
- Text: `#084734`
- Hover: underline

**Pill Badge**
- 공개/마케팅 화면의 단일 강조에만 사용한다. 밀집된 어드민 목록과 대시보드에서는 아래 단순화 원칙을 우선한다.
- Background: `#ECFDF5`
- Text: `#084734`
- Radius: `9999px`
- Padding: `4px 10px`
- Font: 12px weight 600

### 어드민 라벨 단순화
- 데이터 행과 밀집 대시보드에서 파스텔 채움과 둥근 pill/card 라벨을 기본값으로 쓰지 않는다.
- 상태와 범주는 텍스트 색, 아이콘, `1–2px` 선 중 한두 가지만 사용해 구분한다.
- 한 행에 여러 배지를 쌓지 않는다. 정보 순서는 `대상·제목 → 근거·담당·기한 → 상태·보조 행동`을 따른다.
- 배경 채움은 경고·오류, 주요 CTA, 명시적 선택 상태처럼 면이 꼭 필요한 경우에만 허용한다. 밀집 화면의 선택 상태도 밑줄·선·글자색을 우선한다.
- 버튼과 입력 등 실제 조작 컨트롤은 클릭 영역과 보더를 유지하되 분류 라벨처럼 보이지 않게 한다.

### 카드
- Background: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.08)`
- Radius: `12px` (표준), `16px` (피처/히어로)
- Shadow: Card Shadow 참조
- Hover: 섀도 강도 살짝 증가

### 인풋
- Border: `1px solid #E5E5E0`
- Radius: `6px`
- Focus: `2px solid #084734` outline

---

## 5. 레이아웃 원칙

### 간격
- Base unit: `8px`
- 섹션 간 수직 간격: `80px–120px` (Apple처럼 넉넉하게)
- 모바일 섹션 간격: `48px–64px`

### 컨테이너
- Max width: `1200px`, 중앙 정렬
- 히어로: 단일 컬럼, 상단 패딩 `80–120px`
- 피처: 2–3컬럼 그리드

### 배경 교차 리듬
- 흰 섹션(`#FFFFFF`) ↔ 웜 화이트 섹션(`#F6F5F4`) 교차
- 가끔 연한 그린 서피스(`#ECFDF5`) 강조 섹션 사용
- 섹션 간 하드 보더 없음 — 배경색 변화와 간격으로만 분리

### Border Radius 스케일
- `4px`: 인풋, 작은 기능성 UI
- `6px`: 버튼
- `8px`: 작은 카드, 인라인 요소
- `12px`: 표준 카드
- `16px`: 히어로 카드, 피처 블록
- `9999px`: 뱃지, 필 태그

---

## 6. 접근성

- 기본 텍스트(`#111110`) on `#FAFAF8`: 대비율 ~17:1 (WCAG AAA)
- 보조 텍스트(`#615D59`) on white: ~5.5:1 (WCAG AA)
- Green CTA(`#084734`) on white: ~9.7:1 (WCAG AAA)
- 모든 인터랙티브 요소: `2px solid` 포커스 링

---

## 7. AI 에이전트 프롬프트 가이드

컴포넌트 생성 시 이 룰을 항상 따른다:
1. 웜 뉴트럴 사용 — 블루-그레이 금지, 노란-갈색 언더톤 그레이 사용
2. 유일한 포화 컬러 = Classin Green(`#084734`) — 파랑/보라 절대 금지 (유일 예외: 확도 신호 전용 `#1E5DA8`, §2 확도 신호 토큰 참조)
3. 헤딩 letter-spacing: 64px → -2.125px, 48px → -1.5px, 26px → -0.625px, 16px → normal
4. 보더는 whisper: `1px solid rgba(0,0,0,0.08)` — 절대 두껍게 하지 않음
5. 섀도: 4–5레이어, 개별 opacity 0.01–0.05
6. 섹션 배경 교차: White ↔ `#F6F5F4` ↔ `#ECFDF5`
7. 뱃지/필: `9999px` radius, 그린 서피스 배경
8. CTA 버튼: 항상 `#084734`, radius `6px`
