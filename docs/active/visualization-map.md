# Classin Home 시각화 문서

기준 시점: 2026-03-19  
문서 목적: 구조, 전환 퍼널, 데이터 흐름, 페이지 구성을 빠르게 이해할 수 있도록 도식 중심으로 정리한다.

## 1. 문서 사용법

이 문서는 다음 용도로 본다.

- 기획: 현재 사이트 범위와 전환 동선을 빠르게 이해
- 디자인: 각 페이지의 역할과 섹션 흐름 확인
- 개발: 어느 컴포넌트가 어느 라우트와 연결되는지 파악
- 운영: 리드가 어디서 생성되고 어디로 전달되는지 확인

## 2. 사이트맵

```mermaid
graph TD
    HOME["/"] --> PRODUCT["/product"]
    PRODUCT --> PRODUCT_SW["/product/sw"]
    PRODUCT --> PRODUCT_HW["/product/hw"]
    HOME --> PRICING["/pricing"]
    HOME --> BLOG["/blog"]
    HOME --> EVENTS["/events"]
    HOME --> CONTACT["/contact"]

    BLOG --> BLOG_DETAIL["/blog/[id] (현재 미구현)"]
    CONTACT --> API["/api/lead"]
    HOME --> API
```

## 3. 전역 레이아웃 구조

```mermaid
flowchart TB
    RL["RootLayout"] --> H["Header"]
    RL --> M["Main Content"]
    RL --> FC["FloatingChatbot"]
    RL --> AP["AnalyticsProviders"]

    M --> PAGE["현재 라우트별 페이지"]
```

설명:

- 모든 페이지는 `RootLayout` 아래에 렌더된다
- `Header`, `FloatingChatbot`, `AnalyticsProviders` 는 전역 공통 요소다
- `Footer` 컴포넌트는 존재하지만 현재 전역 연결은 없다

## 4. 메인 랜딩 페이지 섹션 맵

```mermaid
flowchart TD
    HERO["Hero"] --> PROBLEM["ProblemCost"]
    PROBLEM --> BRIDGE["BridgeMoment"]
    BRIDGE --> OUTCOMES["Outcomes"]
    OUTCOMES --> SOLUTION["SolutionOverview"]
    SOLUTION --> USECASES["KeyUseCases"]
    USECASES --> DASHBOARD["DashboardPreview"]
    DASHBOARD --> SCIENCE["ScienceBased"]
    SCIENCE --> SATISFY["SatisfyingClass"]
    SATISFY --> CASES["CaseStudies"]
    CASES --> COMPARE["Comparison"]
    COMPARE --> FAQ["FAQ"]
    FAQ --> FINALCTA["FinalCTA"]
```

의미:

- 메인 랜딩은 전형적인 B2B 전환형 흐름을 가진다
- 구조상 “문제 인식 → 해결 방식 → 신뢰 근거 → 비교 → FAQ → 문의” 순서다

## 5. 제품 섹션 구조

```mermaid
graph TD
    PRODUCT_LAYOUT["/product layout"] --> TABNAV["ProductTabNav"]
    TABNAV --> SW["/product/sw"]
    TABNAV --> HW["/product/hw"]
```

### 화면 역할

| 페이지 | 역할 | 현재 상태 |
| --- | --- | --- |
| `/product/sw` | 소프트웨어 가치 제안, 사례, UI 중심 설득 | 내용 많음, 파일 큼 |
| `/product/hw` | 하드웨어 제품군 소개 | CTA 실동작 보강 필요 |

## 6. 전환 퍼널

```mermaid
flowchart LR
    VISIT["방문"] --> VIEW["페이지 탐색"]
    VIEW --> CTA["CTA 클릭"]
    CTA --> FORM["폼/모달 입력"]
    FORM --> SUBMIT["submitLead"]
    SUBMIT --> LEADAPI["/api/lead"]
    LEADAPI --> OPS["운영 채널 전달"]
    OPS --> FOLLOWUP["후속 상담"]
```

### 병목 가능 구간

1. CTA는 눌리지만 실제 액션이 없는 버튼
2. 폼 제출 성공처럼 보여도 실제 저장 안 되는 경우
3. 콘텐츠 페이지에서 전환으로 연결되지 않는 경우

## 7. 리드 수집 흐름

```mermaid
sequenceDiagram
    participant U as 사용자
    participant UI as 페이지/모달
    participant CL as submitLead
    participant API as /api/lead
    participant GS as Google Sheet
    participant WB as Lead Webhook
    participant CT as ChannelTalk

    U->>UI: 문의 정보 입력
    UI->>CL: submitLead(data)
    CL->>API: POST /api/lead
    API->>API: timestamp 생성
    API->>GS: 전송
    API->>WB: 전송
    API->>CT: 전송
    API-->>CL: ok / error
    CL-->>UI: 성공/실패 표시
```

## 8. 분석 이벤트 흐름

```mermaid
flowchart TD
    BTN["CTA/Button Click"] --> TRACK["trackEvent(eventName, params)"]
    TRACK --> GA["gtag"]
    TRACK --> META["fbq"]
    TRACK --> KAKAO["kakaoPixel"]
```

현재 주요 이벤트:

- `click_cta`
- `submit_demo_request`
- `download_materials`
- `view_demo_video`

## 9. 콘텐츠 운영 구조

```mermaid
graph TD
    BLOG_PAGE["app/blog/page.tsx"] --> BLOG_DATA["blogPosts 배열"]
    EVENTS_PAGE["app/events/page.tsx"] --> EVENT_DATA["events 배열"]
    CONTACT_PAGE["app/contact/page.tsx"] --> CONTACT_INFO["전화/메일/주소 하드코딩"]
```

해석:

- 현재 콘텐츠 소스가 코드와 강하게 붙어 있다
- CMS 또는 별도 데이터 계층은 아직 없다

## 10. 화면별 CTA 맵

| 위치 | CTA | 현재 동작 |
| --- | --- | --- |
| Header | 자료 받아보기 | 이벤트 트래킹 중심 |
| Header | 도입 문의 | 데모 모달 |
| Hero | 제품 도입 문의 | 데모 모달 |
| Hero | 자료 받아보기 | 트래킹 중심 |
| Hero | 3분 투어 영상 | 트래킹 중심 |
| FinalCTA | 맞춤형 도입 플랜 받기 | 데모 모달 |
| FinalCTA | 서비스 소개서 다운로드 | 미구현에 가까움 |
| Product HW | 도입 문의하기 | 미구현에 가까움 |
| Contact | 문의 제출 | `/api/lead` 호출 |
| Blog Newsletter | 구독하기 | 현재 `alert` 중심 |

## 11. 페이지별 목적 맵

```mermaid
mindmap
  root((Classin Home))
    메인 랜딩
      첫인상 형성
      문제 인식
      가치 제안
      최종 문의 유도
    제품
      SW 소개
      HW 소개
      도입 비교
    요금
      비용 이해
      상담 연결
    블로그
      신뢰 형성
      유입 확장
      전환 보조
    이벤트
      캠페인/프로모션 전달
      기간성 전환
    문의
      직접 리드 수집
```

## 12. 운영 리스크 시각화

```mermaid
quadrantChart
    title 리스크 우선순위
    x-axis 낮은 영향 --> 높은 영향
    y-axis 쉬운 수정 --> 어려운 수정
    quadrant-1 즉시 처리
    quadrant-2 구조 개선
    quadrant-3 빠른 청소
    quadrant-4 나중 개선
    리드 API 오탐 성공: [0.9, 0.3]
    블로그 상세 404: [0.8, 0.25]
    CTA 미구현: [0.85, 0.35]
    events 더미 데이터: [0.7, 0.45]
    analytics any/ts-ignore: [0.55, 0.5]
    Footer 미연결: [0.3, 0.2]
    대형 파일 분리: [0.6, 0.8]
```

## 13. 구조 개선 방향 시각화

```mermaid
flowchart LR
    NOW["현재: 페이지 파일 내부에 데이터/카피/로직 혼합"] --> STEP1["CTA/Lead/API 안정화"]
    STEP1 --> STEP2["콘텐츠 데이터 분리"]
    STEP2 --> STEP3["analytics 타입 정리"]
    STEP3 --> STEP4["대형 페이지를 섹션 단위로 분해"]
    STEP4 --> FUTURE["향후: CMS/설정/데이터 계층 확장 가능"]
```

## 14. 추천 보는 순서

### 기획자가 볼 때

1. 사이트맵
2. 전환 퍼널
3. 화면별 CTA 맵
4. 운영 리스크 시각화

### 디자이너가 볼 때

1. 메인 랜딩 섹션 맵
2. 제품 섹션 구조
3. 페이지별 목적 맵

### 개발자가 볼 때

1. 전역 레이아웃 구조
2. 리드 수집 흐름
3. 분석 이벤트 흐름
4. 구조 개선 방향

## 15. 한 줄 요약

현재 `Classin Home`은 “메시지 전달형 랜딩”으로는 충분히 보이지만, 시각화 관점에서 보면 아직 “전환 제품”으로 완전히 닫히지 않은 지점들이 있다. 이 문서는 그 빈 구간을 빠르게 발견하기 위한 지도 역할을 한다.
