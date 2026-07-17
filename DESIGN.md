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
- Background: `#ECFDF5`
- Text: `#084734`
- Radius: `9999px`
- Padding: `4px 10px`
- Font: 12px weight 600

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
