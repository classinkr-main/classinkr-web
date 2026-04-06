# Classin Home 에러 / 불안 요소 / 삽질 노트

기준 시점: 2026-03-18

## 0. 먼저 보는 요약

- `npm run build` 는 현재 통과한다
- `npm run lint` 는 결과를 그대로 믿기 어렵다
  - `.claude/worktrees/**`, 내부 `.next/**` 산출물까지 같이 검사해서 노이즈가 매우 크다
- 실제 소스만 분리해서 보면 `npx eslint app components lib` 기준
  - `33 errors`
  - `6 warnings`

즉, “빌드는 되지만 코드 품질 체크와 실제 사용자 동선은 아직 불안한 상태”라고 보면 된다.

## 1. 수정 시작 순서

1. `npm run lint` 대신 먼저 `npx eslint app components lib` 로 실제 소스만 확인
2. `/api/lead` 환경변수 3종이 실제로 모두 설정되어 있는지 확인
3. 블로그 카드 클릭 시 이동할 상세 페이지가 있는지 확인
4. 실제로 눌렀을 때 아무 동작 안 하는 CTA부터 정리
5. `events` 더미 데이터와 placeholder 이미지 제거

## 2. 지금 가장 중요한 이슈

### A. 리드 API가 “실제로는 저장 안 됐는데 성공”을 반환할 수 있음

관련 파일:

- `app/api/lead/route.ts`

핵심:

- `sendToGoogleSheet`, `sendToWebhook`, `sendToChannelTalk` 는 환경변수가 없으면 그냥 `return` 한다
- 이 경우 `Promise.allSettled` 에서는 실패가 아니라 성공(`fulfilled`)로 잡힌다
- 그래서 웹훅 URL이 하나도 없더라도 API 응답은 `ok: true` 가 될 수 있다

왜 위험한가:

- 폼 제출 성공 UI는 뜨는데 실제 리드 데이터는 아무 데도 안 남을 수 있다
- 운영자는 “리드가 안 들어온다”고 느끼고, 프론트/백엔드/광고를 전부 잘못 의심하게 된다

메모:

- 가장 먼저 막아야 할 운영 리스크다
- 최소 1개 이상 연동이 설정되어 있는지 사전 체크가 필요하다
- 환경변수가 없으면 500/503 또는 명확한 설정 오류 메시지를 내려주는 편이 안전하다

### B. 블로그 카드는 `/blog/[id]` 로 이동하지만 실제 상세 라우트가 없음

관련 파일:

- `app/blog/page.tsx`
- 현재 존재 라우트: `app/blog/page.tsx` 만 있음

핵심:

- 블로그 카드 링크는 `/blog/${id}` 형태
- 하지만 저장소에는 `app/blog/[id]/page.tsx` 또는 동적 상세 라우트가 없다

왜 위험한가:

- 목록은 멀쩡히 보이는데 클릭 시 404로 이어질 가능성이 높다
- 사용자는 “콘텐츠가 준비된 줄 알고 눌렀다가 깨진 페이지”를 만나게 된다

메모:

- 블로그를 공개 상태로 둘 거면 상세 라우트를 먼저 만들거나
- 상세가 없으면 링크를 제거하고 “준비 중” 처리하는 편이 낫다

### C. `npm run lint` 결과가 오염돼 있음

관련 파일:

- `eslint.config.mjs`
- `.gitignore`

핵심:

- 루트 `.next/**` 는 ignore 되어 있어도
- `.claude/worktrees/**` 내부의 `.next/**` 산출물까지 린트가 퍼져 들어간다
- 그래서 실제 소스 문제보다 빌드 산출물/서드파티 코드 경고가 훨씬 많이 나온다

왜 위험한가:

- 린트 결과를 믿고 수정하다가 완전히 다른 파일을 건드리게 된다
- 팀원이 “린트가 폭발했다”고 느끼지만 실제 소스 오류는 훨씬 적다

메모:

- `globalIgnores` 에 `.claude/**` 를 추가하거나
- 스크립트를 `eslint app components lib` 식으로 좁히는 게 실무적으로 낫다

## 3. 실제 소스 lint 에러 메모

### A. Hook 규칙 위반

관련 파일:

- `app/product/sw/page.tsx`

내용:

- `CountUpStat` 내부 `useEffect` 콜백 안에서 `useMotionValue` 를 호출한다
- Hook 은 컴포넌트 최상위에서만 호출해야 한다

왜 중요:

- 지금은 빌드가 되더라도 린트 규칙상 명확한 오류다
- 추후 React 규칙 강화나 리팩터링 시 버그 포인트가 된다

수정 힌트:

- `const mv = useMotionValue(0)` 를 `useEffect` 밖, 컴포넌트 최상위로 올리기

### B. `react/no-unescaped-entities` 다수

관련 파일:

- `app/product/sw/page.tsx`
- `components/sections/ScienceBased.tsx`

내용:

- 인용문 안의 `"`, `'` 가 JSX 텍스트로 직접 들어가 lint 에러 발생

메모:

- 문자열 자체가 잘못된 건 아니고 JSX 이스케이프 규칙 문제
- `&quot;`, `&apos;`, 혹은 배열/템플릿 문자열 처리로 정리하면 된다

### C. `lib/analytics.ts` 타입 약함

관련 파일:

- `lib/analytics.ts`

내용:

- `any` 다수 사용
- `@ts-ignore` 3개 사용

왜 중요:

- 분석 스크립트는 런타임에서 실패해도 UI가 안 깨져서 문제를 늦게 발견한다
- 추적 누락/이벤트 누락이 조용히 쌓일 수 있다

수정 힌트:

- `window.gtag`, `window.fbq`, `window.kakaoPixel` 타입 선언을 명시적으로 분리
- `@ts-ignore` 대신 정확한 함수 시그니처 선언으로 치환

## 4. 사용자 동선 기준 불안 요소

### A. CTA가 “보이기만 하고 실제 동작이 없는” 곳이 있음

관련 파일:

- `components/sections/Hero.tsx`
- `components/sections/Header.tsx`
- `components/sections/FinalCTA.tsx`
- `app/product/hw/page.tsx`

증상:

- `자료 받아보기` 는 현재 이벤트 트래킹만 하고 다운로드/이동이 없다
- `3분 투어 영상` 도 트래킹만 있고 영상 재생/이동이 없다
- `서비스 소개서 다운로드` 버튼은 액션이 없다
- 하드웨어 페이지 `도입 문의하기` 버튼도 액션이 없다

왜 위험한가:

- 광고/랜딩 관점에서 가장 손해가 큰 종류의 미구현이다
- 클릭은 잡히는데 전환은 안 되어서 퍼널 데이터가 왜곡될 수 있다

메모:

- 버튼마다 “실제 목적”을 먼저 확정해야 한다
  - 파일 다운로드
  - 모달 오픈
  - `/contact` 이동
  - 외부 Calendly/채널톡 이동

### B. 뉴스레터는 아직 진짜 구독이 아님

관련 파일:

- `app/blog/page.tsx`

증상:

- submit 시 `alert("뉴스레터 구독이 완료되었습니다.")` 만 뜬다
- API 호출, 저장, 메일링 툴 연동이 없다

추가 메모:

- `LeadPayload.source` 에는 `"newsletter"` 가 정의돼 있지만 실제 제출 경로는 없다

### C. 플로팅 챗봇은 현재 UI 목업에 가까움

관련 파일:

- `components/ui/FloatingChatbot.tsx`

증상:

- 빠른 답변 버튼들에 핸들러가 없다
- 입력창도 실제 `<input>` 이 아니라 시각적 placeholder 박스다

왜 위험한가:

- 사용자는 실제 상담 기능이라고 기대하기 쉽다
- 운영팀은 “채팅 도입했다”고 생각할 수 있지만 실제 문의 수집과 연결되지 않는다

## 5. 콘텐츠 / 운영 데이터 메모

### A. 행사 페이지는 코드 주석상 “전체 더미 데이터”

관련 파일:

- `app/events/page.tsx`

상태:

- 파일 주석에 이미 `TODO [DUMMY DATA]` 명시
- `placehold.co` 외부 이미지 사용 중

메모:

- 정식 오픈 전 가장 확실하게 정리해야 할 페이지
- 실제 API/CMS가 없으면 최소한 로컬 JSON 분리라도 하는 편이 낫다

### B. 블로그도 사실상 정적 배열 기반

관련 파일:

- `app/blog/page.tsx`

상태:

- 포스트 메타데이터가 페이지 파일 안에 하드코딩
- CMS, markdown, contentlayer, DB 연동 없음

메모:

- 글이 늘어날수록 파일 자체가 커지고 수정 리스크가 커진다

### C. 연락처 정보가 하드코딩

관련 파일:

- `app/contact/page.tsx`

하드코딩 항목:

- 전화번호
- 이메일
- 주소
- 지도 embed 주소

메모:

- 운영 정보가 바뀌면 배포 없이 수정할 수 없는 구조다
- 최소 `config/site.ts` 같은 설정 파일로 분리하는 게 관리에 좋다

## 6. 레이아웃 / 전역 구성 메모

### A. Footer 컴포넌트는 존재하지만 실제로는 안 붙어 있음

관련 파일:

- `components/sections/Footer.tsx`
- `app/layout.tsx`

상태:

- 푸터 컴포넌트는 구현되어 있으나 `RootLayout` 에서 렌더하지 않는다
- 내부 링크도 대부분 `href="#"` placeholder 다

메모:

- “푸터를 붙일지”, “컴포넌트를 지울지”를 먼저 결정하는 편이 낫다

### B. 퍼블릭 분석 ID 미설정 시 placeholder 값 사용

관련 파일:

- `components/AnalyticsProviders.tsx`
- `lib/analytics.ts`

상태:

- `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_KAKAO_PIXEL_ID` 가 없으면 placeholder 문자열로 스크립트를 로드한다

메모:

- 개발 환경에서는 편할 수 있지만 운영 환경에서는 추적 오염 가능성이 있다
- 운영 배포에서는 미설정 시 스크립트 자체를 넣지 않는 쪽이 안전하다

## 7. 유지보수 관점 메모

현재 큰 파일:

- `app/product/sw/page.tsx` 664줄
- `app/blog/page.tsx` 518줄
- `app/events/page.tsx` 487줄
- `components/sections/PricingCalculator.tsx` 401줄

메모:

- 기능과 카피와 애니메이션이 한 파일에 섞여 있다
- 에러 수정 시 변경 영향 범위를 읽기가 어렵다
- 특히 `product/sw`, `blog`, `events` 는 섹션 분리만 해도 유지보수성이 확 좋아질 가능성이 크다

## 8. 빌드 / 검증 메모

### 현재 확인 결과

- `npm run build` 성공
- `npx eslint app components lib` 실패

### 이 프로젝트에서 먼저 믿어야 하는 체크

```bash
npx eslint app components lib
npm run build
```

### 지금은 덜 믿어야 하는 체크

```bash
npm run lint
```

이유:

- 산출물과 서브 워크트리까지 함께 검사해 실제 소스 상태를 가리는 중

## 9. 추천 우선순위

### 1순위

- `/api/lead` 의 “가짜 성공” 방지
- 블로그 상세 라우트 미구현 처리
- 실제 소스 lint 에러 정리

### 2순위

- CTA 실동작 연결
- 뉴스레터/챗봇 placeholder 정리
- 이벤트 더미 데이터 제거

### 3순위

- 연락처/사이트 설정값 외부 분리
- Footer 연결 여부 결정
- 대형 페이지 파일 섹션 단위 분리

## 10. 한 줄 결론

이 저장소는 “보이는 화면은 상당히 완성되어 있지만, 운영/전환/검증 레이어는 아직 임시 요소가 남아 있는 상태”다. 에러 수정이나 기능 보강은 화면보다 먼저 `lead`, `lint`, `CTA`, `dummy data` 순서로 보는 게 가장 효율적이다.
