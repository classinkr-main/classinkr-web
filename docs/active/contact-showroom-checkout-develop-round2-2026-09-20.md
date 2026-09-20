# 컨택 · 쇼룸 예약 · 구매 신청 디벨롭 2차 기획

기준 시점: 2026-09-20
문서 목적: [1차 실행 기획(2026-08-29)](./contact-showroom-store-develop-plan-2026-08-29.md)이 만든 것을 실측해, **만들어졌지만 닿지 않는 것**과 **접수는 되지만 처리되지 않는 것**을 닫는다. 결제 활성화는 이 문서의 범위 밖이며, 1차와 동일하게 "결제 이전 단계"까지를 대상으로 한다.

시각 요약: [contact-showroom-checkout-funnel-2026-09-20.html](./mockups/contact-showroom-checkout-funnel-2026-09-20.html) — 진입 경로 지도, 금액 불일치 대조, 실행 순서를 한 장으로. 이 문서가 정본이고 시안은 요약이다.

관련 문서

- [contact-showroom-store-develop-plan-2026-08-29.md](./contact-showroom-store-develop-plan-2026-08-29.md) — 1차 기획. 진단 번호와 D1~D8 결정의 정본
- [prd.md](./prd.md) — §7 퍼널, §8-7 리드 수집, §8-8 트래킹, §11 수용 기준
- [classin-korea-positioning-guidelines.md](./classin-korea-positioning-guidelines.md) — §9 "목동 쇼룸 = 가장 강한 CTA"
- [playbook/01-home-front.md](./playbook/01-home-front.md) — 홈/랜딩 파트 소유권과 CTA 계측 의무
- [playbook/04-growth-crm.md](./playbook/04-growth-crm.md) — 리드·동의·추적 소유권
- [../../DESIGN.md](../../DESIGN.md) — UI 정본
- [../../AGENTS.md](../../AGENTS.md) — 리드 제출 / 컨택 폼 운영 규칙

---

## 1. 한 장 요약

1차 기획은 **백엔드를 거의 다 만들었다.** 쇼룸 예약은 슬롯·가용성·접수·알림·캘린더 어댑터까지, 구매 신청은 서버 단가 핀·상태 기계·중복 방지까지 동작한다. 이번 실측에서 드러난 것은 그 위에 얹힐 **세 개의 끊긴 고리**다.

| # | 끊긴 고리 | 증상 | 등급 |
|---|---|---|---|
| 1 | **쇼룸 예약에 도달할 방법이 없다** | `/showroom`을 가리키는 링크가 제품 전체에 2개뿐. 헤더·푸터·홈·모바일 CTA 전부 `/contact`로 간다 | P0 |
| 2 | **접수를 확정할 화면이 두 개 다 없다** | `showroom_bookings`·`checkout_requests` 모두 GET/PATCH API는 있는데 호출하는 어드민 UI가 0건. 접수가 `requested`/`new`에 영구히 머문다 | P0 |
| 3 | **퍼널 뒤쪽 두 단계가 데이터에서 사라진다** | 쇼룸·구매 리드가 `source: "contact_page"`를 빌려 쓰고, UTM·익명 ID가 안 붙고, 계측 파라미터가 서버에서 버려진다 | P1 |

여기에 화면별 마찰 3종이 더해진다 — 구매 화면의 **금액 불일치**(대당 ₩500,000), 쇼룸 캘린더의 **접근성·상태 표시 공백**, 문의 화면의 **작성 비용**.

**이번 라운드의 최대 기대효과는 1번이다.** 전략 문서가 "가장 강한 CTA"로 지목한 경로가 이미 구현되어 있는데 사이트가 그리로 보내지 않는다. 링크를 놓는 것은 저비용이고, 그 앞에 2번이 닫혀 있지 않으면 유입만 늘리고 떨어뜨린다. 그래서 1번과 2번은 **한 묶음**으로 간다.

---

## 2. 1차 계획 이후 실제로 달라진 것

실측 기준(2026-09-20). 1차 문서의 진단 번호를 그대로 쓴다.

### 적용됨

| 1차 진단 | 현재 상태 |
|---|---|
| 1. `/contact` 개인정보 동의 부재 | **해소.** 필수 체크박스 + 항목·목적·보유기간 고지 + `/privacy` 링크 ([app/contact/page.tsx](../../app/contact/page.tsx):567-604) |
| 2. 서버 `topic` allowlist 부재 | **해소.** [lib/contact/topics.ts](../../lib/contact/topics.ts) SSOT + [app/api/lead/route.ts](../../app/api/lead/route.ts):23-34 라우트 경계 검증 |
| 3. 하드웨어 스펙 SSOT 이탈 | **해소.** `lib/hardware/board-specs.ts` + 문서 대조 테스트 |
| 4. 쇼룸 의향이 AS 문의와 뭉개짐 | **해소.** `sourceDetail: "showroom_booking"` ([lib/showroom/bookings.ts](../../lib/showroom/bookings.ts):341) |
| 5. `role`·`size` 미수집 | **부분 해소.** `/contact`·`/showroom`은 받는다. **`/checkout`은 여전히 안 받는다**(§3-3) |
| 7. 설치 유형이 가격에 미반영 | **부분 해소.** 신청 모달 안에서는 단가·합계에 반영된다. **장바구니 합계에는 여전히 미반영**(§3-3) |
| Phase 1 쇼룸 도메인·API | **적용됨.** 슬롯·가용성·접수·알림·캘린더 어댑터 + 테스트 3종(`tests/showroom/`) |

1차 문서가 "공개 화면은 진행 중"이라 적은 쇼룸 화면은 **완성되어 있다.** `/showroom` 6개 섹션, 월 캘린더(`DesiredDateCalendar` 재사용), 슬롯 라디오그룹(`components/showroom/SlotPicker.tsx`), 409 슬롯 충돌 리커버리까지 동작한다. 1차 문서의 "신설 파일" 목록은 전부 존재한다.

### 미적용

| 1차 진단 | 현재 상태 |
|---|---|
| 9. 폼 스키마가 화면마다 독립 구현 | **그대로.** [components/ui/marketing-form.tsx](../../components/ui/marketing-form.tsx)는 스타일 프리미티브만 제공하고, 퍼널 3화면 중 **0곳**이 쓴다(사용처는 NewsletterSubscribe·DemoModal·EventSignupModal) |
| 10. `checkout_requests` 어드민 조회 화면 부재 | **절반만 닫힘.** API는 생겼으나 호출하는 UI가 없다. 1차 문서가 "같은 함정에 빠지지 않겠다"고 한 쇼룸도 **같은 상태로 만들어졌다** |
| 11. `/contact` DESIGN.md 위반 | **그대로.** `slate-*` 55회, `font-serif` 2회, `text-red-*` 3회. 자동 가드([scripts/check-design-tokens.mjs](../../scripts/check-design-tokens.mjs):20)는 `components/admin/branch` 한 폴더만 스캔 |
| 12. `/contact` 테스트 0건 | **부분 해소.** `tests/contact/`에 SSOT·라우트 가드 2건. **화면·폼 계약 테스트는 여전히 0건** |
| 13~16. P3 결함 4건 | **4건 전부 미적용**(§3-4) |
| D6. 부가세 표기 기준 | **보류 유지.** 세무 확인 대기 |

---

## 3. 이번 라운드의 진단

### 3-1. 공통 — 세 화면이 데이터에서 한 덩어리다

**(a) `LeadSource`에 쇼룸·구매 값이 없다.**

[lib/lead-types.ts](../../lib/lead-types.ts):1-5의 `LeadSource`는 `demo_modal` / `contact_page` / `newsletter` / `meta_lead_ads` 4종뿐이다. 쇼룸 미러([lib/showroom/bookings.ts](../../lib/showroom/bookings.ts):331)와 구매 미러([lib/checkout-requests.ts](../../lib/checkout-requests.ts):579)가 **둘 다 `contact_page`를 빌려 쓴다.** 결과:

- CRM에서 `source` 기준 집계를 하면 세 화면이 한 덩어리다. 구분은 `source_detail` 한 컬럼에만 남는다.
- [lib/crm/lead-ranking.ts](../../lib/crm/lead-ranking.ts):87의 `showroom: 14` 가중치는 **한 번도 실행되지 않는 죽은 코드**다. 쇼룸 리드의 `source`가 `contact_page`라 `contact_page: 22`가 적용된다.
- 구매 신청용 의도 가중치는 정의조차 없다.
- `source_detail` 한 컬럼에 한글 문의유형(`도입 상담`)과 영문 슬러그(`showroom_booking`, `checkout_request:hardware`)가 섞인다. 쇼룸·구매 미러는 `submitLeadCapture()`를 직접 호출해 라우트 경계의 allowlist를 우회하기 때문인데, 이는 [app/api/lead/route.ts](../../app/api/lead/route.ts):14-18이 명시한 **의도된 설계**다. 어휘가 둘이라는 사실만 남는다.

**(b) 가장 비싼 리드가 랭킹 바닥에 깔린다.**

[components/checkout/CheckoutRequestForm.tsx](../../components/checkout/CheckoutRequestForm.tsx):75-84의 `FormState`에 `role`·`size`가 없다. `scoreValue()`는 `size`만으로 최대 +34점(합성 환산 약 10.9점)을 주므로, 구매 신청 리드의 value 축은 컨택 전 기준 `contact_page 22 + phone 12 + org 8 = 42` 근처에 고정된다. **₩6,300,000짜리 전자칠판 주문 신청이 "300명"이라 적은 단순 문의보다 낮게 깔린다.** 같은 폼에 honeypot(`website`)도 유일하게 없다.

`size` 4단 enum(`100명 이하`/`100~300명`/`300~500명`/`500명 이상`)은 이미 `/contact`·`/showroom`·자료실이 공유하므로 같은 상수를 끌어다 쓰면 된다. 다만 `components/sections/DemoModal.tsx`만 자유 입력이라 `leads.size` 컬럼에 두 체계가 섞여 있다 — 이것도 함께 정렬해야 집계가 안 쪼개진다.

**(c) 쇼룸·구매 리드는 광고 귀속이 구조적으로 불가능하다.**

두 폼이 [lib/submitLead.ts](../../lib/submitLead.ts)를 거치지 않고 raw `fetch`를 쓴다. 그래서 `collectLeadAttribution()`(UTM/gclid/referrer)과 `getAnonymousId()`가 아예 붙지 않는다. 라우트도 `requestMeta`를 넘기지 않는다. 결과: **서버 전환(Meta/GA4) 미발화 + identity stitch 불가 + 광고 귀속 불가.** 퍼널의 뒤쪽 두 단계가 마케팅 성과 측정에서 통째로 빠져 있다.

**(d) 계측 파라미터가 서버에서 버려진다.**

세 화면 모두 `submit_demo_request` 한 이름으로 발화하고 `source` 파라미터로만 구분한다. 그런데 [app/api/track/event/route.ts](../../app/api/track/event/route.ts):40의 파라미터 allowlist는 `["event_id","source","lead_id","stored","event_slug","lead_magnet"]`뿐이다. 쇼룸의 `visit_date`·`visit_time`·`academy_size`, 구매의 `request_kind`·`value`·`currency`가 **내부 DB에 남지 않는다.** 클라이언트 타입([lib/analytics.ts](../../lib/analytics.ts):8-24)과 서버 allowlist가 수기로 이중 관리되는 구조라 한쪽만 고치면 조용히 드롭된다.

### 3-2. 쇼룸 — 도달 경로가 없고, 캘린더는 기본기 위에서 멈춰 있다

**(a) 진입 경로.** `/showroom`을 가리키는 링크는 제품 전체에서 2개다.

| 위치 | 형태 |
|---|---|
| [app/contact/page.tsx](../../app/contact/page.tsx):678 | 우측 사이드바 주소 블록 안의 작은 밑줄 텍스트 링크. 모바일에서는 폼 아래로 밀려 사실상 접히는 위치 |
| `app/l/test1/page.tsx`:18 | 실험용 랜딩(1차 문서가 "운영 정리 후보"로 분류) |

반면 문의 경로는 헤더([components/sections/Header.tsx](../../components/sections/Header.tsx):189,212)·푸터([components/sections/Footer.tsx](../../components/sections/Footer.tsx):39)·모바일 플로팅 CTA([components/ui/MobileFloatingCTA.tsx](../../components/ui/MobileFloatingCTA.tsx):97) 세 곳에 상시 노출된다. 홈 Hero와 FinalCTA는 둘 다 리드마그넷 다운로드로 간다. `/showroom`은 [app/sitemap.ts](../../app/sitemap.ts):23에 등록돼 검색 색인 대상이지만, **내부 유입 경로가 없다.**

**(b) 캘린더 UI/UX.** 기본기는 이미 있다 — 월 그리드, roving tabindex, 방향키/Home/End/PageUp/PageDown, 마감 슬롯 표시, 409 충돌 리커버리. 남은 틈은 다음이다.

| # | 지점 | 사실 |
|---|---|---|
| S1 | 막힌 날짜의 이유가 캘린더에 없다 | 서버는 날짜별 `blockedReason`(`weekend`/`holiday`/`too_soon`/`too_far`/`full`)을 주는데, 셀은 전부 같은 회색이다. 사유 문구는 "`bookable:false`인 날을 고른 경우"에만 뜨는데 그 날짜들은 `disabledIsoDates`로 클릭이 막혀 있어 **사실상 도달할 수 없는 경로**다 |
| S2 | 남은 자리 밀도 신호가 없다 | `day.slots`에 5개 중 몇 개가 열렸는지 다 들어있지만 셀이 쓰지 않는다. 날짜를 하나씩 눌러봐야 안다 |
| S3 | `SlotPicker`가 radiogroup 패턴을 위반한다 | `role="radiogroup"`인데 `onKeyDown`도 `tabIndex` 관리도 없다(직접 확인). 슬롯 5개가 개별 탭 정지점이 된다. **같은 폼 안에서 캘린더는 roving tabindex를 제대로 하는데 슬롯만 어긋난다** |
| S4 | 마감 슬롯이 포커스를 못 받는다 | 캘린더는 "포커스 허용, 선택만 차단"을 의도적으로 택했는데 슬롯은 native `disabled`라 반대다. 스크린리더 사용자는 `aria-label`에 담긴 "마감" 정보에 도달하지 못한다 |
| S5 | 상태 전이 알림이 없다 | 날짜 선택 시 "그날 몇 시간이 열렸다"를 알리는 live region이 없다. 시간 블록이 새로 나타나도 포커스·스크롤·알림이 없다 |
| S6 | 로딩이 스켈레톤이 아니다 | 고정 높이 스피너 한 장이라 캘린더가 뜰 때 레이아웃이 튄다. `aria-busy`/`role="status"` 없음 |
| S7 | 에러에 재시도가 없다 | "잠시 후 새로고침하거나 문의하기" 텍스트만 있고, 제출 버튼은 `availabilityStatus !== "ready"`면 영구 비활성이라 **폼이 완전히 막힌다** |
| S8 | 데이터가 늙는다 | 가용성을 마운트 1회만 조회하고(`[]` deps) 409를 받을 때만 재조회한다. 폼을 5분 채우는 동안 마감 정보는 그대로다 |
| S9 | 원천이 조용히 비면 공휴일이 열린다 | `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY` 미설정 시 [lib/korea-holidays.ts](../../lib/korea-holidays.ts):118이 `[]`를 반환한다(직접 확인). `SHOWROOM_CALENDAR_ICS_URL` 미설정도 마찬가지. **설날·추석이 예약 가능일로 표시되고, 화면에 degradation 신호가 없다** |
| S10 | 월 이동 시 재조회 경로가 없다 | 현재는 예약 창 60일 < 응답 상한 62일이라 한 번에 들어오지만, 최대일수를 늘리는 순간 뒷부분이 캘린더에서 통째로 사라진다 |

S9는 **운영 리스크**다. 의도된 "덜 막는" 방침 자체는 타당하지만(원천 하나가 늦다고 화면을 닫으면 멀쩡한 리드를 잃는다), 그 방침이 **자격 미설정이라는 상시 상태**에도 똑같이 적용되면 연휴에 예약을 받는다.

**(c) 마이그레이션 적용 확인은 쇼룸만 되어 있다.** *(2026-09-20 구현 중 정정 — 최초 진단이 틀렸다.)* `20260829_showroom_bookings.sql`은 [lib/db/schema-contract.ts](../../lib/db/schema-contract.ts)에 테이블 프로브가 이미 있어 `npm run check:db`가 적용 여부를 확인한다. 실측 당시 `scripts/check-db-schema.ts`만 grep 해 놓친 것이다 — 계약은 스크립트가 아니라 `lib/db/schema-contract.ts`에 있다.

**실제 공백은 `checkout_requests` 쪽이었다.** 도입 신청 3개 마이그레이션이 계약에 아예 없어, 테이블이 없는 환경에서도 `check:db`가 통과했다. 어드민 접수 큐가 두 접수를 한 화면에서 다루면서 둘의 적용 여부가 같은 화면의 가용성을 결정하므로 같은 수준으로 맞춘다. 쇼룸 쪽은 RLS deny-all 을 확인하는 anon 프로브가 없어 그것만 보탠다.

### 3-3. 구매 신청 — 금액이 단계마다 다르고, 접수 이후가 비어 있다

**(a) 설치비가 장바구니 합계에 없다.** 좌측 합계는 `computeHardwareTotalKrw(quantities)`만 계산하고, `installUnitCount`는 안내 문구만 띄운다(직접 확인). 설치 유형 라디오는 **신청 모달 안에만** 있다. 그래서 86″ 1대(₩6,300,000)를 담은 고객이 사이드바에서 보는 합계는 실제 신청 합계(₩6,800,000)보다 **대당 ₩500,000 적다.** 1차 기획이 "설치를 가격에 반영"했다고 기록한 것은 **모달 안까지**였고, 그 앞 단계는 그대로다.

**(b) 부가세가 최종 금액 옆에 없다.** "부가세 별도" 문구는 좌측 카탈로그 하단 1곳뿐이다. 우측 합계 카드·모달 요약·접수 완료 화면에는 없다. 소프트웨어 쪽은 VAT 언급이 0건이고 USD 표기 + 환율 환산만 있다. **고객이 마지막으로 보는 숫자 옆에 부가세 표기가 없다.**

**(c) 희망일에 주말·공휴일 차단이 없다.** `DesiredDateCalendar`의 `disabledIsoDates`는 이미 구현돼 있는데 `/checkout`은 넘기지 않는다(직접 확인 — `todayIso`/`minIso`/`maxIso`만 전달). 일요일·추석 당일도 선택 가능해서, "실제 일정은 담당자와 조율합니다"라는 재조율 왕복이 기본 전제가 된다.

**(d) 장바구니가 100% 휘발한다.** 수량은 `useState`뿐이고 persist가 없다. 새로고침·뒤로가기·탭 전환(SW↔HW 전환 시 반대편 패널 언마운트) 어디서든 0으로 초기화된다. `?sku=`는 진입 시 1회 읽기 전용이라 수량 변경이 URL에 반영되지 않는다. 구성 저장·공유 링크·재방문 복귀 경로가 전무하다.

**(e) 신청 후 고객이 볼 수 있는 것이 거의 없다.** 접수 확인은 모달 안 1회성 화면뿐이고, "확인"을 누르면 `requestId`가 지워진다. 확인 이메일·문자 발송 코드가 없고(이메일은 애초에 선택 필드), 접수번호로 조회할 공개 페이지도 없다. 상태(`new`→`contacted`→`scheduled`→`done`)는 순수 내부 값이다. **고객이 받는 유일한 약속은 "담당자가 1영업일 내에 연락"이라는 문장 하나다.**

**(f) `/checkout` 진입 자체가 계측되지 않는다.** [components/AppChrome.tsx](../../components/AppChrome.tsx)의 `showAnalytics = showPublicChrome`이라 `/checkout`(내부 경로)에서는 GTM·PageViewTracker·MetaPixel·ConsentBanner가 전부 마운트되지 않는다(직접 확인). 결과:

- `page_view` 미발화 → **"장바구니 진입 → 모달 오픈 → 제출" 퍼널의 첫 단계가 데이터에 없다.**
- Meta Pixel 미로드 → `InitiateCheckout`/`Lead` 매핑이 사문.
- `trackDemoRequestAdsConversion`이 `/checkout`에서 호출되지 않아 **가장 값비싼 전환이 Google Ads 최적화 신호로 돌아가지 않는다.**
- ConsentBanner가 없는데 내부 적재는 `consent.analytics` 기반이라, 캠페인 랜딩·광고 딥링크로 직행한 방문자의 이벤트는 내부 DB에도 안 쌓인다.

**(g) 플래그 OFF인데 카피가 결제를 약속한다.** `NEXT_PUBLIC_SW_CHECKOUT_ENABLED=false`면 토스 위젯이 통째로 숨겨지고 신청 버튼만 남는데, 페이지 제목은 그대로 "결제하기"이고 `/pricing` CTA는 "체크아웃 보기"다. **"지금은 온라인 결제를 제공하지 않는다"는 설명이 어디에도 없다.**

**(h) 어드민 견적 카탈로그와 공개 카탈로그가 갈라질 여지.** 겹치는 하드웨어 6개 항목의 금액 불일치는 없고 2건은 테스트로 고정돼 있다. 다만 키 네임스페이스가 분리돼 있고(`board-86` vs `hw-board-86`) 서로를 참조하지 않는다. 소프트웨어 구독은 어드민 견적이 원화 월 ₩400,000, 공개 체크아웃이 계정당 USD $99~ — **같은 "구독형"을 두 체계로 말한다.**

### 3-4. 문의 — 작성 비용이 마찰의 대부분이다

| # | 마찰 | 사실 |
|---|---|---|
| C1 | 자유서술 `message`가 필수다 | 필수 6개 중 하나가 textarea다. "전화 주세요" 하려는 사람도 작문해야 한다. **서버 계약은 이미 완화를 허용한다** — 클라이언트가 `문의 유형: {topic}` 접두를 붙여 조합하므로(page.tsx:244-250), 본문이 비어도 `message`는 비지 않는다. 서버 필수 검사([lib/server/lead-capture.ts](../../lib/server/lead-capture.ts):240)를 그대로 통과한다 |
| C2 | 자동완성이 사실상 꺼져 있다 | `autoComplete` 속성이 페이지 전체에 2개뿐(직접 확인). `name`·`email`·`org-name`·`role`에 없어 모바일에서 타이핑 비용이 그대로 든다 |
| C3 | 에러가 전부를 흔들고 아무 데도 데려가지 않는다 | `shake`가 6개 필드에 동시 적용되고 `aria-invalid`도 5개에 공통으로 붙는다. 어떤 에러든 모든 필드가 틀린 것처럼 보이고 스크린리더에도 그렇게 읽힌다. 에러 요소로의 `scrollIntoView`/`focus()`가 없어 711줄 폼에서 무엇이 막혔는지 모른 채 버튼만 다시 누른다 |
| C4 | 동의가 마지막 관문인데 증적이 안 남는다 | 검증 순서상 맨 마지막에 차단되어, 6개 필드를 다 채운 뒤에야 알 수 있다. 그런데 **동의값이 서버로 전송되지 않는다**(직접 확인 — 페이로드에 없고 저장소 전체에 `privacyConsent` 참조 0건). 사용자에겐 마찰이고 회사엔 증적이 안 남는 조합 |
| C5 | 행사 선택기가 "로딩 중 제출"에 무방비 | `/api/events`를 topic 선택 후 lazy fetch하는데, 로딩 중엔 `availableEvents.length === 0`이라 가드를 통과하고 `<select required>`도 렌더 전이라 **어떤 행사인지 없이 접수**된다 |
| C6 | 재제출이 오염된다 | `resetForm`이 `setLeadMagnet`을 호출하지 않는다(직접 확인). 2번째 리드에 첫 제출 슬러그가 재첨부되고, 중복키 context가 `eventSlug ?? leadMagnet ?? sourceDetail`이라 **topic이 달라져도 같은 키로 묶여** 60초 내 정상 재문의가 409로 막힐 수 있다 |
| C7 | 폼 위 배너가 미설정 상태일 수 있다 | `NEXT_PUBLIC_CONTACT_KAKAO_URL`이 [.env.local.example](../../.env.local.example)에 없다(직접 확인). 미설정 시 CTA는 앵커로 바뀌지만 **QR 이미지는 조건 없이 렌더**되어, 스캔해도 아무 일 없는 블록이 폼 위를 차지한다 |
| C8 | 이탈 지점이 데이터에 없다 | 검증 차단 3경로(행사 미선택·전화 포맷·동의 미체크)와 제출 실패에 계측이 없다. **어디서 이탈하는지 알 수 없다** |

---

## 4. 실행 계획

```
Phase A  도달과 신뢰      — 링크를 놓고, 금액을 맞추고, 손이 덜 가게 한다 (저비용·고효과)
   ↓
Phase B  운영 루프 닫기   — 접수를 확정할 화면과 고객이 확인할 경로
   ↓
Phase C  데이터 정합      — source 확장·귀속 배선·계측 allowlist
   ↓
Phase D  UX 심화          — 캘린더 접근성·상태 표시, 문의 화면 재구성, 디자인 가드
```

**A와 B를 붙여 가는 이유**: 유입만 늘리고 처리 화면이 없으면 "1영업일 내 연락" 약속이 구조적으로 깨진다. Phase A의 진입 경로 작업은 Phase B의 접수 큐가 같은 배포에 실리는 것을 전제로 한다.

**C를 D보다 먼저 두는 이유**: A·B의 효과를 재려면 계측이 먼저 서 있어야 한다. 지금은 `/checkout` 진입조차 데이터에 없어 개선 전후 비교가 불가능하다.

### Phase A — 도달과 신뢰

| # | 작업 | 대상 | 등급 |
|---|---|---|---|
| A1 | **쇼룸 진입 경로 신설** — 헤더·푸터·홈 FinalCTA·모바일 플로팅 CTA에 `/showroom` 노출 | §5-1 | P0 |
| A2 | **설치비를 장바구니 합계에 반영** — 설치 유형 선택을 모달에서 패널로 끌어올리거나, 합계 카드에 "설치 별도 ₩500,000 × N대" 라인을 명시 | §6-1 | P0 |
| A3 | **희망일에 주말·공휴일 차단** — `/checkout`이 `disabledIsoDates`를 넘긴다. 구현은 이미 있다 | §6-2 | P1 |
| A4 | **부가세 표기를 최종 금액 옆으로** — D6 확정 후. 미확정이면 "부가세 별도" 문구만 합계·모달 요약·완료 화면에 동일 배치 | §6-3 | P1 |
| A5 | **문의 폼 작성 비용 축소** — `message` 선택 전환, `autoComplete` 부착, 에러 포커스 이동 | §7-1 | P1 |
| A6 | **P3 결함 4건 정리** — `resetForm` leadMagnet, 행사 로딩 가드, Kakao env 등재 + 미설정 시 QR 숨김 | §7-3 | P2 |

### Phase B — 운영 루프 닫기

| # | 작업 | 등급 |
|---|---|---|
| B1 | **접수 큐 어드민 화면** — 쇼룸 예약·도입 신청 두 접수를 보고 상태를 올리는 화면. 위치는 §8 D9 결정 | P0 |
| B2 | **마이그레이션 계약 공백 마감** — `checkout_requests` 3종을 [lib/db/schema-contract.ts](../../lib/db/schema-contract.ts)에 등재하고, 두 접수 테이블에 RLS deny-all anon 프로브를 건다 | P0 |
| B3 | **고객 확인 경로** — 접수 확인 발송 또는 접수번호 조회. 범위는 §8 D10 결정 | P1 |
| B4 | **가용성 에러 시 재시도** — 폼이 영구 비활성으로 잠기지 않게 | P1 |
| B5 | **원천 degradation 신호** — 공휴일·ICS 원천이 비었을 때 화면과 운영 알림에 드러낸다 | P1 |

### Phase C — 데이터 정합

| # | 작업 | 등급 |
|---|---|---|
| C1 | **`LeadSource` 확장** — `showroom_booking`·`checkout_request` 추가. `source_detail`은 과거 리드 연속성 계약이 있으므로 **보존**하고 `source`만 넓힌다 | P1 |
| C2 | **리드 랭킹 정합** — `SOURCE_INTENT`에 구매 신청 키 추가. 확장 후에야 `showroom: 14`가 살아난다 | P1 |
| C3 | **구매 신청에 `role`·`size`·honeypot 추가** — `size`는 기존 4단 enum 상수 재사용 | P1 |
| C4 | **UTM·익명 ID 배선** — 쇼룸·구매 폼이 `collectLeadAttribution()`·`getAnonymousId()`를 태우고, 라우트가 `requestMeta`를 넘긴다 | P1 |
| C5 | **계측 파라미터 allowlist 확장** — 클라이언트 타입과 서버 allowlist를 함께 갱신. 한쪽만 고치면 조용히 드롭된다 | P1 |
| C6 | **`/checkout` 계측 복구** — §8 D11 결정 후 | P2 |
| C7 | **`DemoModal`의 `size` 자유입력을 4단 enum으로 정렬** | P2 |

### Phase D — UX 심화

| # | 작업 | 등급 |
|---|---|---|
| D1 | **캘린더 상태 표시** — 막힌 사유 구분, 남은 자리 밀도 | §5-2 |
| D2 | **`SlotPicker` radiogroup 패턴 정합** — roving tabindex + 화살표 키, 마감 슬롯 포커스 허용 | §5-3 |
| D3 | **상태 전이 알림** — 날짜 선택·시간 블록 등장·409 복구 시 live region과 포커스 | §5-4 |
| D4 | **로딩 스켈레톤** — 레이아웃 시프트 제거 | §5-5 |
| D5 | **문의 화면 재구성** — 711줄 단일 파일을 섹션 컴포넌트로 분리 + DESIGN.md 정합 | §7-2 |
| D6 | **공개 화면 디자인 가드** — `SCAN_ROOT` 확대 + `slate-` 패턴 추가 | §7-2 |
| D7 | **폼 계약 테스트** — 문의 폼 필드 매핑, 캘린더·슬롯 상호작용 | §9 |

---

## 5. 쇼룸 예약 캘린더 UI/UX 사양

### 5-1. 진입 경로

**원칙: 문의를 쇼룸으로 바꾸지 않는다. 쇼룸을 문의 옆에 세운다.** 문의는 CS·정산·행사까지 받는 넓은 입구고, 쇼룸은 도입 검토 단계의 좁고 강한 입구다. 하나로 합치면 1차 기획의 판단(쇼룸을 select 옵션으로 묻지 않는다)을 되돌리게 된다.

| 위치 | 제안 | 근거 |
|---|---|---|
| 헤더 | `/download`·`/contact` 옆에 3번째 항목 추가, 또는 `/contact` CTA를 2분할 | 상시 노출이 필요한 유일한 경로 |
| 푸터 | 회사/제품 링크 묶음에 "목동 쇼룸 방문 예약" | 저비용 |
| 홈 FinalCTA | 현재 리드마그넷 단일 CTA → 쇼룸 예약을 1순위로, 리드마그넷을 보조로 | [classin-korea-positioning-guidelines.md](./classin-korea-positioning-guidelines.md) §9 "도입 의향 있음 → 목동 쇼룸 상담" |
| 모바일 플로팅 CTA | 경로별 분기: 제품 페이지에서는 쇼룸, 그 외에는 문의 | 현재 전 경로 `/contact` 단일 |
| `/product/hw` | 모델 카드의 "상담 신청" 옆에 "쇼룸에서 직접 보기" | 가격 노출이 없는 화면이라 체험 CTA가 더 맞는다 |
| `showroom-demo-readiness-kit` | 마그넷 → `/showroom` 링크는 이미 있다. 반대 방향(쇼룸 → 준비 킷)도 이미 페이지에 있다 | 배선 완료, 추가 작업 없음 |

**계측 의무**: 신규 CTA는 전부 `TrackedLink` 또는 `trackEvent`를 단다([prd.md](./prd.md) §11 — 트래킹만 되고 동작 없는 버튼 금지). `ctaId`는 위치를 식별할 수 있게 짓는다(`header_showroom`, `home_final_showroom` 등).

### 5-2. 캘린더 상태 표시

**막힌 사유를 셀에서 구분한다.** 서버가 이미 날짜별 `blockedReason`을 준다.

| `blockedReason` | 현재 | 제안 |
|---|---|---|
| `weekend` | 회색 | 회색 유지 — 주말은 설명이 필요 없다 |
| `holiday` | 회색 | 회색 + 공휴일명 `title`/`aria-label`. "왜 평일인데 막혔나"에 답한다 |
| `too_soon` | 회색 | 회색 + "최소 2영업일 전" 안내. 오늘 근처가 막힌 이유는 반드시 설명한다 |
| `full` | 회색 | **다른 처리** — 마감은 "원래 없는 날"이 아니라 "찼던 날"이다. 취소선 또는 점 표시로 구분 |
| `too_far` | 회색 | 범위 밖이므로 현행 native `disabled` 유지 |

색은 [DESIGN.md](../../DESIGN.md) 팔레트 안에서만 쓴다. 상태 스케일(Danger `#B43E3E` 등)은 어드민 전용이므로 공개 화면에서는 **웜 뉴트럴 명도 차이와 타이포·아이콘**으로 구분한다. 플레이북 §4의 "AI 느낌의 파스텔 채움 박스 거부 → 아웃라인/타이포 강조" 취향을 따른다.

**남은 자리 밀도.** `day.slots`의 open 개수를 셀 하단에 점 또는 숫자로 표시한다. 5개 중 1~2개 남은 날을 먼저 누르게 하는 것이 목적이다. 밀도 표시는 **선택 가능한 날에만** 붙인다.

### 5-3. 슬롯 선택 접근성

`SlotPicker`를 WAI-ARIA radiogroup 패턴에 맞춘다. 캘린더가 이미 같은 패턴을 구현하고 있으므로 그 구현을 참조한다.

- 그룹 전체가 탭 정지점 1개. 선택된 슬롯(없으면 첫 선택 가능 슬롯)만 `tabIndex={0}`.
- ←/→ 및 ↑/↓로 슬롯 간 이동, Home/End로 처음·끝. 이동 시 선택도 함께 움직인다(radio 관례).
- **마감 슬롯을 native `disabled`에서 `aria-disabled`로 바꾼다.** 캘린더와 같은 판단이다 — 포커스는 허용하고 선택만 막아야 스크린리더가 "10:00 마감"을 읽을 수 있다. 실제 차단은 클릭/키 핸들러 안에서 한다.
- 점심 공백(12:00~13:00)이 UI에 드러나지 않는다. 오전/오후 소그룹으로 나누거나 구분선을 둔다.

### 5-4. 상태 전이 알림

| 시점 | 제안 |
|---|---|
| 날짜 선택 | live region에 "N월 N일 · 예약 가능한 시간 N개" |
| 시간 블록 등장 | 블록 컨테이너에 포커스 이동(모바일은 스크롤 동반). 지금은 아무 신호가 없다 |
| 409 슬롯 충돌 | 알림을 시간 블록 근처로 옮기고, 그 날짜가 전부 찼으면 캘린더로 포커스를 되돌린다 |
| 가용성 갱신 | 폼 체류가 길어지면 재조회. 최소한 제출 직전 재검증 결과를 화면에 반영한다 |

### 5-5. 로딩·에러·저하 상태

- **로딩**: 고정 높이 스피너 → 캘린더 격자 모양 스켈레톤(`#F0F0EC`, DESIGN.md 공식 토큰). `role="status"` + `aria-busy`.
- **에러**: 재시도 버튼을 둔다. 제출 버튼이 `availabilityStatus !== "ready"`로 영구 잠기는 현재 동작은 **재시도 경로가 생긴 뒤에도** 유지한다 — 가용성을 모르는 채 접수를 받으면 덧예약이 난다.
- **저하**: 공휴일·ICS 원천이 비어 있을 때 화면은 정상 동작하되(방침 유지), 운영에는 알린다. 자격 미설정은 일시 장애와 달리 **상시 상태**이므로 배포 전 점검 항목으로도 둔다.

### 5-6. 이번 범위에서 제외

- **확정형 예약(실시간 슬롯 잠금).** 1차 D2 결정(요청형)을 유지한다. 쇼룸 캘린더 정본이 구글이고 우리 쪽은 ICS 읽기 전용 5분 캐시라는 전제가 그대로다.
- **슬롯 배타 제약(`EXCLUDE USING gist`).** 요청형에서는 같은 슬롯 중복 요청을 담당자가 조정한다는 마이그레이션 주석의 판단을 유지한다.
- **구글 캘린더 쓰기 미러.** 1차 Phase 2 후보로 남긴다. B1의 확정 화면이 선행이다.

---

## 6. 구매 예약·신청 화면 보강 사양

### 6-1. 금액 일관성

**같은 화면 안에서 합계가 두 번 달라지면 안 된다.** 선택지는 둘이다.

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| (가) 설치 선택을 패널로 승격 | 설치 유형 라디오를 장바구니 사이드바로 올리고, 모달은 확인만 | 합계가 한 번만 계산된다. 고객이 최종 금액을 신청 전에 본다 | 설치가 필요 없는 구성(패키지·카메라 단품)에서 노이즈 |
| (나) 합계 카드에 설치 라인 명시 | 라디오는 모달에 두되, 사이드바 합계에 "설치 별도 ₩500,000 × N대 (신청 단계에서 선택)" 라인 추가 | 변경 범위가 작다 | 여전히 두 숫자를 보여준다 |

**권고: (가).** 설치가 필요한 대수는 이미 `countInstallRequiredUnits`로 계산되고 있어, 그 값이 0이면 블록을 감추면 된다. 이중 과금 방지(패키지는 벽걸이 포함이라 설치 라인을 만들지 않음)는 이미 서버·테스트로 고정돼 있으므로 로직 이전 부담이 작다.

### 6-2. 희망일

- `/checkout`이 `disabledIsoDates`를 넘긴다. 주말·공휴일은 쇼룸과 같은 원천을 쓴다.
- 쇼룸과 달리 **슬롯 개념은 두지 않는다.** 설치·상담 일정은 현장 조율이 필요하고, 여기서 시간을 약속하면 지킬 수 없다. 대신 오전/오후 선호만 선택지로 두는 것을 검토한다(§8 D12).
- 프론트 상한 180일 ⊂ 서버 365일은 의도된 포함관계이므로 유지한다.

### 6-3. 부가세

D6이 보류 상태이므로 **표기 기준 확정 전까지는 배치만 맞춘다** — "부가세 별도" 문구를 카탈로그 하단뿐 아니라 합계 카드·모달 요약·접수 완료 화면에 같은 문장으로 둔다. 소프트웨어는 USD 표기 + 환율 환산만 있고 VAT 언급이 0건이므로, 최소한 "원화 청구 시 부가세가 더해진다"는 사실을 환산 안내 옆에 둔다.

세액 계산(10% 가산)은 D6 확정 후 별건으로 다룬다. 견적·영수증 쪽은 이미 세액을 계산하고 있어, 공개 화면만 문구 수준에 머물러 있는 현재 상태가 **상담 단계에서 말이 갈리는 원인**이다.

### 6-4. 장바구니 복원

| 안 | 내용 |
|---|---|
| (가) URL 동기화 | 수량 변경을 `?sku=hw-board-86:2,hw-camera-t1:1` 형태로 `replaceState`. 공유·북마크·뒤로가기가 전부 살아난다 |
| (나) sessionStorage | 새로고침만 방어. 공유는 안 된다 |

**권고: (가).** 진입 딥링크(`?sku=`)를 이미 읽고 있어 파서를 확장하는 형태가 되고, "구성을 상담원에게 보내기" 같은 후속으로 이어진다. 탭 전환 시 반대편 패널이 언마운트되어 수량이 날아가는 문제도 URL이 정본이 되면 함께 해소된다.

### 6-5. 접수 이후 고객 경험

현재 고객이 받는 것: 모달 안 1회성 확인 화면(닫으면 소실) + "1영업일 내 연락" 문장.

| 최소선 | 내용 |
|---|---|
| 접수번호 보존 | 완료 화면을 닫아도 접수번호가 남는 경로. URL 쿼리 또는 별도 완료 화면 |
| 확인 발송 | 이메일이 **선택 필드**라 전원 발송이 불가능하다. 이메일을 필수로 올리거나(마찰 증가), 알림톡 등 연락처 기반 경로를 검토한다(§8 D10) |
| 상태 가시성 | `new`/`contacted`/`scheduled`는 내부 값이다. 공개 조회를 만들 경우 노출 어휘를 따로 정의한다 |

**`/checkout/success`는 토스 결제 전용이므로 무결제 신청 완료 경로로 재사용하지 않는다.** 두 흐름이 섞이면 결제 활성화 시 되돌리기 어렵다.

### 6-6. 카피 정합

`NEXT_PUBLIC_SW_CHECKOUT_ENABLED=false`인 동안:

- 페이지 제목 "결제하기" → 신청 단계에 맞는 표현으로. 서버 가드(403 `checkout_disabled`)까지 걸려 있는 상태를 화면만 결제라고 말하고 있다.
- `/pricing` CTA "체크아웃 보기" → 같은 기준으로. 이 링크는 플래그와 무관하게 항상 노출된다.
- 결제 위젯이 숨겨진 자리에 **"지금은 온라인 결제를 제공하지 않습니다"에 해당하는 설명**을 둔다. 지금은 위젯이 조용히 사라지고 신청 버튼만 남는다.
- 카피는 [lib/classin-positioning.ts](../../lib/classin-positioning.ts)의 가격 답변 원칙("최종 견적과 구체 금액은 단정하지 않고 상담 연결")과 충돌하지 않는 선에서 쓴다.

### 6-7. 공개 노출

1차 D3(공개·색인하지 않는다, `/checkout` 디벨롭)을 **유지한다.** `robots` 차단과 `DISALLOW_PATHS`, 사이트맵 미등록도 그대로다. 다만 §3-3(f)의 계측 공백은 "내부 경로라 애널리틱스를 빼는" 현재 규칙의 부작용이므로, 노출 정책과 분리해 §8 D11에서 따로 판단한다.

---

## 7. 문의 화면 편의성 사양

### 7-1. 작성 비용 축소

| # | 작업 | 내용 |
|---|---|---|
| 1 | `message` 필수 해제 | textarea를 선택으로. **서버 변경 불필요** — 클라이언트가 `문의 유형: {topic}` 접두를 조합하므로 본문이 비어도 서버 필수 검사를 통과한다. placeholder는 [classin-pre-adoption-question-matrix-2026-06-18.md](./classin-pre-adoption-question-matrix-2026-06-18.md)의 상담 요청 문장 템플릿을 참고해 "안 써도 되지만 쓰면 좋은 것"으로 유도한다 |
| 2 | `autoComplete` 부착 | `name` → `name`, `email` → `email`, `org-name` → `organization`, `role` → `organization-title`. `phone`은 이미 `tel-national` |
| 3 | 에러 처리 분리 | 필드별 에러만 해당 필드에 `aria-invalid`와 shake를 적용한다. 지금은 어떤 에러든 6개 필드가 동시에 흔들린다 |
| 4 | 에러 포커스 이동 | 첫 에러 요소로 `focus()`. 711줄 폼에서 뷰포트 밖 에러는 보이지 않는다 |
| 5 | 동의 위치·검증 | 동의를 마지막 관문에서 빼거나(제출 버튼 직전 인라인 확인), 최소한 네이티브 검증에 참여시켜 브라우저가 먼저 잡게 한다 |
| 6 | `role` 옵션화 검토 | 현재 자유 입력이라 집계 키로 못 쓴다. `size`처럼 select로 올릴지 §8 D13 |

### 7-2. 구조·디자인 정합

- 711줄 단일 클라이언트 컴포넌트를 섹션 단위로 분리한다. 신규 화면(`/showroom`, `/checkout`)은 이미 분리돼 있고 `slate-*`가 0회다 — **문의 화면만 구 스타일에 남아 있다.**
- `slate-*` 55회 → 웜 뉴트럴, `font-serif` 2회 제거, `text-red-*` 3회 → 에러 토큰 통일(같은 폼 안에서 동의 에러만 토큰을 지키고 전화·폼 에러는 `text-red-600`인 상태), `rounded-[24px]`/`[2rem]` 등 → 6/8/12/16 스케일, 페이지 배경 `#EDF7F2` → 섹션 배경 3색 안으로.
- **자동 가드를 공개 화면까지 넓힌다.** `SCAN_ROOT`가 `components/admin/branch` 한 폴더뿐이고 검사 패턴에 `slate-`가 없다. 가드를 넓히지 않으면 같은 위반이 다음 화면에서 반복된다.
- 공용 프리미티브를 쓸 경우, [components/ui/marketing-form.tsx](../../components/ui/marketing-form.tsx)의 radius(`18px`/`28px`/`20px`)가 DESIGN.md 스케일(4/6/8/12/16/9999)에 없는 값이라는 점을 먼저 정리한다. 그대로 확산시키면 토큰 이탈이 고착된다.

### 7-3. 결함 정리

| # | 결함 | 조치 |
|---|---|---|
| 1 | `resetForm`이 `leadMagnet`을 비우지 않음 | `setLeadMagnet("")` 추가. 중복키 오염까지 함께 해소된다 |
| 2 | 행사 로딩 중 제출 | 로딩 상태를 가드 조건에 포함하거나, 로딩 중 제출 버튼을 비활성화 |
| 3 | `NEXT_PUBLIC_CONTACT_KAKAO_URL` 미등재 | [.env.local.example](../../.env.local.example)에 추가 + **미설정 시 QR 블록 자체를 감춘다** |
| 4 | 중복 방지가 프로세스 메모리 Map | 서버리스에서 무력하다는 한계가 코드 주석에 명시돼 있다. 공유 저장소로 올리는 것은 [06-platform-data.md](./playbook/06-platform-data.md) 소유 영역이라 별건으로 넘긴다 |

### 7-4. 계측

현재 `/contact`의 `trackEvent`는 4건이고 `TrackedLink`는 0건이다. 추가할 것:

- 검증 차단 3경로(행사 미선택·전화 포맷·동의 미체크) — **어디서 이탈하는지가 지금 데이터에 없다**
- 제출 실패(catch 블록에 계측 없음)
- `topic` 선택 변경 — 유형별 퍼널 분해용
- 성공 화면의 "추가 상담 남기기" 클릭

이벤트명·파라미터는 §4 C5의 allowlist 확장과 같은 배포에 실어야 서버에서 드롭되지 않는다.

---

## 8. 확정이 필요한 결정

1차 문서의 D1~D8은 그대로 유효하다. 이번 라운드에서 새로 열린 결정만 적는다.

| # | 결정 | 기본 제안 | 판단 근거 |
|---|---|---|---|
| D9 | **접수 큐 어드민 화면의 위치** — ① CRM 리드 큐 안의 탭 ② `/admin/calendar` 레일 ③ 신규 상시 탭 ④ 쇼룸·구매를 한 화면에 통합 | **①+④** — 리드 큐에 "접수" 탭 하나를 만들어 쇼룸·구매를 함께 다룬다 | 알림 `routeUrl`이 이미 리드 큐를 가리키고, 두 접수 모두 리드로 미러링된다. 1차 D7은 캘린더 레일을 제안했으나, 캘린더는 **확정된 일정**을 보는 곳이고 접수는 **처리할 큐**다 |
| D10 | **고객 확인 발송 범위** — ① 없음(현행) ② 이메일(선택 필드라 일부만) ③ 이메일 필수화 ④ 연락처 기반 알림톡 | **②로 시작** | 이메일 필수화는 마찰을 늘린다. 알림톡은 외부 발송이라 [operational-failure-handling-guidelines.md](./operational-failure-handling-guidelines.md)의 발송 상한·멱등 키 요건이 따라붙는다 |
| D11 | **`/checkout` 계측 복구 여부** — 내부 경로라 GTM·PageViewTracker·ConsentBanner가 전부 빠져 있다 | **복구한다** | 가장 값비싼 전환이 광고 최적화 신호로 돌아가지 않는다. 다만 ConsentBanner를 띄우면 터널 UX가 바뀌므로, 동의 없는 방문자의 내부 적재를 어떻게 다룰지 함께 정해야 한다 |
| D12 | **구매 신청 희망일에 오전/오후 선호를 받을지** | **받는다** | 지금은 시간대 정보가 없어 설치 조율에 최소 1회 통화가 더 든다. 슬롯 확정은 하지 않는다 |
| D13 | **문의 폼 `role`을 select로 올릴지** | **올린다** | 자유 입력이라 집계 키로 못 쓴다. 다만 `role`은 리드 스코어에 0점이므로 집계·검색 목적에 한정된 이득이다 |
| D14 | **쇼룸 진입 경로를 헤더에 넣는 방식** — ① 3번째 항목 추가 ② `/contact` CTA 2분할 | **운영 합의 필요** | 헤더는 모든 화면에 걸리고 모바일 폭 제약이 있다. 플레이북 §4가 "시안을 먼저 보여주고 합의 후 진행"을 요구한다 |

**공휴일 자격 미설정(§3-2 S9)은 결정 사항이 아니라 운영 점검 항목이다.** `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY`가 운영 환경에 설정돼 있는지 먼저 확인한다. 설정돼 있다면 화면 저하 신호만 추가하면 되고, 아니라면 연휴 예약을 받고 있었다는 뜻이므로 즉시 조치 대상이다.

---

## 9. 검증 기준

기본 품질 게이트([AGENTS.md](../../AGENTS.md)):

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

영역별 추가 검증:

| 변경 영역 | 명령 |
|---|---|
| 리드 저장·전달 흐름 | `npx vitest run tests/api/lead-capture.test.ts` |
| 리드 저장소 모드 | `npx vitest run tests/repositories/leads-mode.test.ts` |
| 문의 유형 SSOT·라우트 가드 | `npx vitest run tests/contact` |
| 쇼룸 슬롯·접수·어드민 전이 | `npx vitest run tests/showroom` |
| 구매 신청 계약·카탈로그·설치·희망일 | `npx vitest run tests/checkout` |
| 스키마 변경 | `npm run check:db` |
| 디자인 토큰 | `npm run check:design-tokens` (가드 범위를 넓힌 뒤에는 공개 화면도 포함) |

신설이 필요한 테스트:

- **문의 폼 계약** — `org-name` → `org` 매핑, 전화 포맷터, topic 분기, honeypot, `resetForm`, URL 프리필. 현재 화면 테스트 0건이라 §7의 변경을 지킬 안전망이 없다.
- **캘린더·슬롯 상호작용** — 키보드 이동, `aria-disabled` 클릭 차단, 슬롯 선택, 로딩·에러·409 렌더. 현재 `tests/`에 `DesiredDateCalendar`·`SlotPicker` 문자열이 없다.
- **공개 API 라우트** — `/api/showroom/*`, `/api/checkout/request`의 rate limit·403·413 경로.

수동 확인:

- 신규 CTA는 전부 `TrackedLink` 또는 `trackEvent` 계측([prd.md](./prd.md) §11)
- 신규 공개 라우트는 `createPublicMetadata`(canonical) + [app/sitemap.ts](../../app/sitemap.ts) 등록 둘 다
- 공개 화면 팔레트는 가드 확대 전까지 수동 검토 필수
- 디자인 QA는 [design-qa.md](../../design-qa.md) 형식으로 1536×1024 / 390×844 두 뷰포트에서 기록
- 쇼룸 가용성은 **공휴일·ICS 원천이 살아 있는 상태**와 **비어 있는 상태** 양쪽에서 확인
