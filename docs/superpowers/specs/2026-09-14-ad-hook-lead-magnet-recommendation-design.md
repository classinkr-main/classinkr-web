# 광고 유입 방문자 맞춤 자료 추천 설계

작성일: 2026-09-14
상위 맥락: 블로그·리드마그넷 디벨롭. 하위 프로젝트 1(연결 작업, `2026-09-14-lead-magnet-wiring-design.md`)의 녹화 가이드 DB 반영이 끝난 뒤 적용한다.
사용자 결정: 브라우저에서 기존 추천 자리를 광고에 맞춰 바꾸고, 팝업(추천 카드)을 함께 띄운다. 전용 광고 랜딩은 만들지 않는다.

## 0. 실측 근거 (2026-09-14, 운영 DB 읽기 전용)

- `page_view`의 `params.path`에 쿼리스트링이 담긴다. 3/01 이후 광고 파라미터가 붙은 조회 **223회·방문자 123명**(5월 22 · 6월 33 · 7월 84 · 8월 64 · 9월 20). 분석 동의자만 적재되므로 실제는 더 많다.
- 착지: `/product/hw` 135 · `/` 80 · `/product/sw` 4.
- Google 광고는 `gclid`만 온다(131회, UTM 없음) → 광고 식별 불가, 착지 경로만 신호.
- Meta 트래픽 광고는 `utm_campaign`=캠페인 ID, `utm_term`=광고세트 ID, `utm_content`=광고 ID(숫자). 이름이 오지 않는다.
- 사이트 유입에서 나온 ID 28개 전부 `compass_ads_v`(ad_id·ad_name·adset_id·adset_name·campaign_id·campaign_name)로 이름 조회 성공.
- Meta 리드 광고 리드(363건)는 플랫폼 안 폼이라 사이트에 오지 않는다 → 이 기능의 대상이 아니다(하위 프로젝트 3에서 다룸).
- 기존 코드: `PageViewTracker`가 매 조회마다 `collectLeadAttribution()`으로 UTM을 localStorage(`classinkr.leadAttribution.v1`)에 병합 저장한다. 저장 시각이 없어 오래된 UTM이 영구히 남는다.

## 1. 훅 규칙

광고 이름에서 훅을 고른다. **광고 이름 → 광고세트 이름 → 캠페인 이름** 순으로 보고, 각 이름에 아래 규칙을 **위에서부터** 적용해 처음 맞는 것을 쓴다(개인칠판이 칠판보다 먼저 와야 한다).

| 순서 | 훅 id | 이름에 포함(대소문자 무시) | 추천 자료 slug | 모바일 짧은 문구 |
|---|---|---|---|---|
| 1 | `recording` | 녹화 | classroom-recording-replay-setup-guide | 녹화→복습 세팅 가이드 받기 |
| 2 | `student-solving` | 개인칠판, 풀이, [SW] | academy-software-selection-worksheet | 도입 비교 워크시트 받기 |
| 3 | `ai-evaluation` | 강의평가 | academy-system-checklist | 운영 누수 진단표 받기 |
| 4 | `briefing` | 설명회, Meets, 포럼 | classin-pre-adoption-questions-checklist | 도입 전 22질문 받기 |
| 5 | `whiteboard` | 칠판, HW, 프리미엄 | electronic-whiteboard-classroom-checklist | 전자칠판 체크리스트 받기 |

- 이름이 없거나 규칙에 안 맞으면 **착지 경로**: `/product/hw`로 시작 → `whiteboard`. 그 외 → 추천 없음(기존 화면 그대로).
- `ai-evaluation`·`student-solving`의 자료는 전용 자료(A2 샘플북·A3 수학 키트)가 나오면 교체한다. 규칙표는 코드 상수 한 곳(`lib/ad-hook/rules.ts`)에 둔다. 훅이 8개를 넘거나 마케터가 직접 바꿔야 할 때 어드민 편집으로 옮긴다.

**9/14 실데이터 검증표** (단위 테스트 입력으로 그대로 사용)

| 광고 이름 | 광고세트 | 캠페인 | 기대 훅 |
|---|---|---|---|
| [SW] 모든 학생의 풀이를 실시간으로 볼 수 있다면? | 개인칠판양식수집광고 | 개인칠판기능 | student-solving |
| 설명회 대구·울산 0611-12 | BD_설명회_대구울산_260611-12_양식수집광고 | BD_설명회_대구울산_260611-12 | briefing |
| [포럼] AI 시대 우리 학원은 10년 뒤에도 살아남을 수 있을까? | MKT_포럼_부산_0529 | MKT_포럼_부산_0529 | briefing |
| 프리미엄 전자칠판1 | 프리미엄 칠판_HW | 프리미엄_실험적_문 | whiteboard |
| ClassinMeets/목동설명회 | MKT_설명회_목동설명회_0819 | 설명회 | briefing |
| AI강의평가_슬라이드(서울) | AI강의평가 - 서울 | (임의) | ai-evaluation |
| 교실녹화기능광고 - 상담시 무료 사용권 제공 | 교실녹화기능광고 | 오프라인 HW/SW | recording |
| (이름 없음, gclid만) 착지 /product/hw | — | — | whiteboard |
| (이름 없음, gclid만) 착지 / | — | — | 없음 |

## 2. 구성 요소

### 2.1 광고 접점 저장 — `lib/ad-hook/ad-touch.ts` (클라이언트 전용 순수 함수 + 얇은 저장 래퍼)

- `parseAdTouch(url: URL, now: number): AdTouch | null` — URL에 `utm_source`·`utm_campaign`·`fbclid`·`gclid` 중 하나라도 있으면 만든다.
  - `utm_campaign`/`utm_term`/`utm_content`가 10자리 이상 숫자면 각각 `campaignId`/`adsetId`/`adId`, 아니면 `campaignName`/`adsetName`/`adName`(각 200자 절단).
  - `landingPath` = `url.pathname`, `clickIdType` = `"gclid" | "fbclid" | null`, `capturedAt` = now.
- `readAdTouch(raw: string | null, now: number, ttlDays = 30): AdTouch | null` — JSON 파싱 실패·만료면 null.
- 저장 키 `classinkr.adTouch.v1`. **기존 `classinkr.leadAttribution.v1`과 분리**해 리드 페이로드 모양을 바꾸지 않는다.
- 새 광고 접점이 오면 덮어쓴다(마지막 광고 기준). 광고 파라미터 없는 조회는 건드리지 않는다.
- `PageViewTracker`의 `collectLeadAttribution()` 옆에서 `captureAdTouch()` 호출. 데이터는 브라우저 밖으로 나가지 않고(추천 조회 요청의 쿼리로만 사용) 기존 어트리뷰션과 같은 기능성 저장이라 동의 흐름을 바꾸지 않는다.

### 2.2 훅 규칙 — `lib/ad-hook/rules.ts` (서버·클라이언트 공용 순수 모듈)

- `type AdHookId = "recording" | "student-solving" | "ai-evaluation" | "briefing" | "whiteboard"`
- `AD_HOOKS: Record<AdHookId, { slug: string; label: string; mobileCtaLabel: string }>` — label은 팝업 문구용("교실 녹화", "학생 풀이 실시간", "AI 강의평가", "설명회·포럼", "전자칠판").
- `matchAdHookByNames(names: { adName?: string; adsetName?: string; campaignName?: string }): AdHookId | null`
- `matchAdHookByLandingPath(path: string | undefined): AdHookId | null`

### 2.3 추천 조회 API — `GET /api/lead-magnets/recommendation`

- 쿼리: `adId`·`adsetId`·`campaignId`(숫자만, 최대 25자), `adName`·`adsetName`·`campaignName`(최대 200자), `path`(`/`로 시작, 최대 200자). 형식이 틀린 값은 무시.
- 처리 순서:
  1. ID가 있으면 `compass_ads_v`에서 이름 조회(`ad_id` → `adset_id` → `campaign_id` 순, 각 `limit 1`). admin 클라이언트 사용. 결과는 `unstable_cache`(키 `ad-hook-names:v1:<id종류>:<id>`, 6시간, **JSON 문자열/평문 객체만**).
  2. 조회한 이름 또는 쿼리로 받은 이름에 `matchAdHookByNames`.
  3. 없으면 `matchAdHookByLandingPath(path)`.
  4. 훅이 있으면 `getLeadMagnetBySlugFromStore(slug)`로 카드 생성. **자료가 없거나 비공개면 추천 없음**(상세 페이지와 같은 저장소라 404 추천이 생기지 않는다).
- 응답: `{ hook: null }` 또는 `{ hook, card }`. `card = { slug, title, summary(140자 절단), formatLabel, estimatedMinutes, itemCount, bullets(checklistBullets 앞 3개), hookLabel, mobileCtaLabel }`.
- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. DB 오류 시 `{ hook: null }` + 200(추천은 부가 기능이라 화면을 깨지 않는다), 서버 로그만 남김.

### 2.4 클라이언트 훅 — `useAdHookRecommendation()`

- 저장된 광고 접점이 없으면 아무것도 요청하지 않는다(광고 유입이 아닌 대부분 방문자는 추가 요청 0).
- 있으면 API 1회 호출, 결과를 sessionStorage `classinkr.adReco.v1`에 접점 `capturedAt` 기준으로 캐시. 반환 `{ card: RecommendationCard | null, hook: AdHookId | null }`.

## 3. 노출 자리

기본 원칙: 추천이 없으면 지금 화면과 완전히 같다. 추천이 있으면 자리의 문구·링크만 바뀐다.

1. **홈 `HomeLeadMagnet`** — 서버가 기본(누수 진단표) 내용을 그대로 렌더하고, 클라이언트 자식이 추천이 있을 때 제목·설명·앞 3개 항목·CTA를 카드 값으로 바꾼다. 윗줄 문구 "광고에서 보신 {hookLabel}, 바로 적용하는 자료". CTA `ctaId="home_ad_reco_lead_magnet"`, `tracking={{ source: "ad_reco_home", lead_magnet }}`. 섹션이 첫 화면 아래라 교체 순간이 거의 보이지 않는다.
2. **블로그·행사 상세 `ResourcesRecommendation`** — 추천이 있으면 제목을 자료명으로, 링크를 `/resources/<slug>#download`로. `ctaId="resources_ad_reco_<surface>"`.
3. **자료실 허브 `ResourcesHubClient`** — 추천 자료를 대표(첫 번째) 자리로 올리고 윗줄에 "광고에서 보신 내용과 연결된 자료". 나머지 순서는 유지.
4. **데스크톱 팝업 `AdHookRecommendationPopup`** (md 이상만)
   - 위치: 왼쪽 아래(`md:left-6 md:bottom-6`, z-50). 챗봇은 오른쪽 아래라 겹치지 않는다. 동의 배너도 왼쪽 아래(z-[120])이므로 **`useConsent().decided`가 true일 때만** 띄운다.
   - 표시 조건(순수 함수 `shouldShowAdRecoPopup`): 카드 있음 · 동의 결정됨 · 경로 제외 목록 아님 · (체류 8초 이상 또는 스크롤 40% 이상) · 이 훅을 7일 안에 닫은 적 없음 · 이번 세션에 아직 안 띄움.
   - 경로 제외: `/admin` `/checkout` `/receipt` `/contact` `/pricing` `/showroom` `/l/` `/login` `/signup` `/account`, 그리고 추천 자료 자신의 상세 `/resources/<slug>`.
   - 모양: 폭 360px, 흰 배경, `border-black/[0.08]`, radius 12px, DESIGN.md Card Shadow, 파스텔 채움 없음. 윗줄 "광고에서 보신 {hookLabel}" · 자료명 · 요약 1줄 · `{formatLabel} · 약 {estimatedMinutes}분` · 초록 CTA(radius 6px) "무료로 받기" · 닫기 버튼(44px 터치 영역, `aria-label="닫기"`, Esc로도 닫힘).
   - 접근성: 비모달, 포커스를 뺏지 않음, `role="complementary"` + `aria-label="추천 자료"`. `prefers-reduced-motion`이면 애니메이션 없음.
   - 닫으면 localStorage `classinkr.adRecoPopup.v1`에 `{ [hook]: dismissedAt }`.
   - `AppChrome`의 `showPublicChrome` 안, 챗봇과 같은 `readyPath === pathname` 지연 조건으로 마운트.
5. **모바일 떠 있는 CTA `MobileFloatingCTA`** — 새 떠 있는 요소를 만들지 않는다(하단에 챗봇·CTA가 이미 있음). 추천이 있으면 문구를 `mobileCtaLabel`로, 링크를 `/resources/<slug>#download`로, `ctaId="mobile_floating_ad_reco"`. 표시 규칙(위로 스크롤 시 노출·닫기)은 그대로.

## 4. 측정

- 노출: 기존 이벤트 `view_resource_card` `{ source: "ad_reco_<surface>", lead_magnet }` — `/api/track/event` 허용 이벤트·파라미터(`source`, `lead_magnet`)에 이미 있어 서버 변경 없음. 자리마다 세션당 1회.
- 클릭: `TrackedLink`의 `click_cta`(ctaId로 자리 구분).
- 다운로드·리드: 기존 흐름이 어트리뷰션을 이미 싣는다.
- 판단 지표: 광고 파라미터가 있는 방문자 중 추천 클릭률, 추천 경유 자료 신청 수. 월 유입이 수십 명 규모라 **4주 누적**으로 본다.

## 5. 오류·예외

- localStorage/sessionStorage 접근 예외: 모든 읽기·쓰기 try/catch, 실패 시 추천 없음.
- API 실패·지연: 추천 없음, 기존 화면 유지. 요청 타임아웃 3초.
- 자료가 비공개로 바뀜: API가 null → 모든 자리 기본값.
- 같은 방문자가 다른 광고로 재유입: 마지막 접점으로 교체, 세션 캐시 키가 `capturedAt`이라 자동 갱신.

## 6. 테스트

- `tests/ad-hook/rules.test.ts` — §1 실데이터 검증표 전 행, 규칙 우선순위(개인칠판 vs 칠판), 착지 경로.
- `tests/ad-hook/ad-touch.test.ts` — 숫자 ID/이름 분기, 파라미터 없음 → null, 30일 만료, 잘못된 JSON.
- `tests/api/lead-magnet-recommendation.test.ts` — ID → 이름 조회 → 카드, 이름 직접, 착지 경로, 자료 비공개 → null, DB 오류 → `{hook:null}` 200, 잘못된 쿼리 무시. Supabase·저장소는 목킹.
- `tests/ad-hook/popup-policy.test.ts` — `shouldShowAdRecoPopup` 조건 조합.
- 화면: dev 서버에서 `/?utm_source=fb&utm_campaign=120260263022880059&utm_term=120260263022890059&utm_content=120260263022900059`로 들어가 홈 섹션·자료실 대표·데스크톱 팝업·모바일 CTA가 전자칠판 체크리스트로 바뀌는지 확인, 파라미터 없는 새 브라우저에서는 변화 없음 확인.
- 품질 게이트: typecheck + eslint + build.

## 7. 하지 않는 것

- 광고별 전용 랜딩(`/l/<hook>`)
- 규칙표 어드민 편집 화면
- Google 광고 `gclid` → 캠페인 이름 해석(착지 경로만 사용)
- 서버 렌더에서 분기(홈 정적 캐시 유지)
- `page_view` 수집 구조 변경
