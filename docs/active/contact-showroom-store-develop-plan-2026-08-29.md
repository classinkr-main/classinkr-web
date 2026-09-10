# 컨택 · 쇼룸 예약 · 구매 화면 디벨롭 실행 기획

기준 시점: 2026-08-29
문서 목적: 공개 사이트의 **문의(`/contact`) · 쇼룸 상담 예약 · 전자칠판/소프트웨어 구매** 세 화면을 하나의 전환 퍼널로 재정렬하기 위한 현황 진단과 실행 기준을 확정한다. 결제 활성화는 이 문서의 범위 밖이며, "결제 이전 단계"까지를 대상으로 한다.

관련 문서

- [prd.md](./prd.md) — §8-3 제품 페이지, §8-7 리드 수집, §11 CTA 수용 기준
- [classin-korea-positioning-guidelines.md](./classin-korea-positioning-guidelines.md) — §9 CTA 운영 기준(쇼룸 = 최강 CTA)
- [classin-operating-canon-2026-07-02.md](./classin-operating-canon-2026-07-02.md) — 세일즈 6단계 중 4단계 쇼룸 검증
- [team-operations-playbook-2026-07-03.md](./team-operations-playbook-2026-07-03.md) — 플레이 3 목동 쇼룸 초대, 쇼룸 예약 슬롯 요구
- [software-checkout-revamp-plan.md](./software-checkout-revamp-plan.md) — `/checkout` 구독형/충전형 확정 결정
- [classin-pre-adoption-question-matrix-2026-06-18.md](./classin-pre-adoption-question-matrix-2026-06-18.md) — 도입 전 22질문, 상담 6단계
- [classin-software-feature-inventory.md](./classin-software-feature-inventory.md) — 하드웨어 스펙·모델 라인업 SSOT
- [brand-canon/voice-charter.md](./brand-canon/voice-charter.md) — 표면별 톤 레인지
- [playbook/01-home-front.md](./playbook/01-home-front.md) — 홈/랜딩 파트 소유권
- [../../DESIGN.md](../../DESIGN.md) — UI 정본

---

## 1. 한 장 요약

세 화면 모두 **백엔드는 상당 부분 완성되어 있고, 비어 있는 것은 공개 화면과 데이터 계약**이다.

| 축 | 지금 있는 것 | 비어 있는 것 | 성격 |
|---|---|---|---|
| 쇼룸 예약 | 구글 캘린더 ICS 읽기 전용 연동([lib/showroom-ics-calendar.ts](../../lib/showroom-ics-calendar.ts)), 어드민 캘린더 노출, 구글 캘린더 **쓰기** 헬퍼([lib/google.ts](../../lib/google.ts)) | 공개 예약 화면, 예약 저장 테이블, 슬롯·영업일 개념 전부 | **신규 구축** |
| 구매 화면 | 무결제 신청 파이프라인 완성(`checkout_requests` + WeCom + 리드 미러), 토스 결제 코드 완성(플래그 OFF), 하드웨어 가격 SSOT | 가격·스펙 SSOT 단일화(6곳 중복), 카탈로그 결손(S110·S65·스탠드·벽걸이), `/checkout` 화면 완성도 | **정합성** |
| 문의 페이지 | 리드 캡처 파이프라인(저장·웹훅·CRM·서버전환·신원결합) | 개인정보 수집·이용 동의, 쇼룸 유형, 리드 자격 필드(`role`/`size`), 서버 allowlist | **결손 보완** |

전략 문서 3종이 "목동 쇼룸이 가장 강한 CTA"라고 명시하는데, 제품에는 쇼룸 예약 경로가 존재하지 않는다. 이번 작업의 최대 기대효과는 여기에 있다.

---

## 2. 현재 상태 (실측)

### 2-1. 문의 `/contact`

[app/contact/page.tsx](../../app/contact/page.tsx) 641줄 단일 클라이언트 컴포넌트. 전용 하위 컴포넌트 없음.

구성: 히어로 → FAST TRACK 배너(카카오 QR) → 2단 그리드(문의 폼 3/5 + 직접 연락하기 2/5 + 구글 지도).

폼 항목 9개:

| name | 라벨 | 필수 | 비고 |
|---|---|---|---|
| `website` | honeypot | — | `aria-hidden`, 값 있으면 서버가 저장 없이 200 |
| `org-name` | 학원명/기관명 | O | |
| `name` | 담당자 성함 | O | |
| `phone` | 연락처 | O | 02 분기 포함 클라이언트 포맷·검증 |
| `email` | 이메일 | X | |
| `topic` | 문의 유형 | O | 7종 select |
| `event-slug` | 행사/세미나 | 조건부 | `행사 신청`·`세미나 신청`일 때만 |
| `message` | 문의 내용 | O | 길이 상한 없음 |
| `marketing-consent` | 마케팅 수신 동의 | X | |

문의 유형 7종: `도입 상담` / `수업 운영 상담` / `결제/영수증/계약` / `계정/접속/기술 지원` / `하드웨어/설치/AS` / `행사 신청` / `세미나 신청`.

제출은 [lib/submitLead.ts](../../lib/submitLead.ts) → `POST /api/lead` → [lib/server/lead-capture.ts](../../lib/server/lead-capture.ts). `topic`은 `leads.source_detail`에 실린다.

### 2-2. 구매 / 결제

- [app/checkout/page.tsx](../../app/checkout/page.tsx) — `robots: { index: false }`. [app/robots.ts](../../app/robots.ts)의 `DISALLOW_PATHS`에도 포함. [components/AppChrome.tsx](../../components/AppChrome.tsx)가 헤더·푸터를 제거한다.
- 소프트웨어: 구독형(Standard $99 / Plus $199, 계정·월) + 충전형(최소 ₩2,000,000, 증분 ₩500,000). 토스 위젯·`prepare`/`confirm`/`fail`·환율·프로모/견적 코드까지 **코드는 완성**이고 `NEXT_PUBLIC_SW_CHECKOUT_ENABLED=false`로 꺼져 있다.
- 하드웨어: 결제 경로가 **처음부터 없다**. [components/checkout/HardwareCheckoutPanel.tsx](../../components/checkout/HardwareCheckoutPanel.tsx) → [components/checkout/CheckoutRequestForm.tsx](../../components/checkout/CheckoutRequestForm.tsx) → `POST /api/checkout/request` → `checkout_requests` 저장 + WeCom 알림 + `leads` 미러.
- 공개 하드웨어 카탈로그 4종([lib/billing/hardware-catalog.ts](../../lib/billing/hardware-catalog.ts)): 75″ ₩5,400,000 / 86″ ₩6,300,000 / T1 카메라 ₩1,200,000 / AI Studio 패키지 ₩8,300,000.
- [app/pricing/page.tsx](../../app/pricing/page.tsx) — **가격 숫자 0개.** 3장 라우팅 카드뿐이고, 그중 하나가 robots로 차단된 `/checkout`을 가리킨다.
- [app/product/hw/page.tsx](../../app/product/hw/page.tsx) — **가격 0개.**
- 가격이 실제로 보이는 곳은 차단된 `/checkout`과 수기 정적 랜딩 `public/l/omo1/index.html` 둘뿐이다.

### 2-3. 쇼룸 예약

- `/showroom` 라우트 **없음**. 모든 쇼룸 CTA가 `/contact` 또는 `/contact?topic=하드웨어/설치/AS`로 흘러간다.
- 문의 폼 유형 7종에 쇼룸·방문·데모 항목이 **없다**.
- 예약의 현재 정본(SoR)은 구글 캘린더다. [lib/showroom-ics-calendar.ts](../../lib/showroom-ics-calendar.ts)가 `SHOWROOM_CALENDAR_ICS_URL`을 **읽기 전용**으로 가져와 어드민 캘린더에 `source: "showroom"`으로 표시한다. 우리 DB에는 예약이 한 건도 없다.
- 슬롯·영업시간·가용성 개념이 코드 전체에 없다. [lib/business-time.ts](../../lib/business-time.ts)는 타임존 변환만 한다.

---

## 3. 진단 — 고쳐야 하는 것

### P0 (컴플라이언스 · 데이터 정합)

1. **`/contact`에 개인정보 수집·이용 동의가 없다.** 유일한 체크박스는 마케팅 수신 동의이고 필수가 아니며 `/privacy` 링크도 폼 안에 없다. 반면 [components/checkout/CheckoutRequestForm.tsx](../../components/checkout/CheckoutRequestForm.tsx)는 동의를 필수 검증하고 방침을 링크한다. 사이트 최대 유입 폼이 결제 폼보다 약하다.
2. **서버에 `topic` allowlist가 없다.** `/api/lead`로 직접 POST하면 임의 문자열이 `leads.source_detail`에 그대로 들어가 상담 유형 통계를 오염시킨다. 컬럼에 CHECK 제약도 없다.
3. **하드웨어 스펙이 SSOT와 어긋난다.** [app/product/hw/page.tsx](../../app/product/hw/page.tsx)의 `specGroups`가 S86 모델명을 `BS86A`(SSOT: `BS86C`), S110 전체 길이를 `2,620.55mm`(SSOT: `2,520.55mm`, 오타로 명시)로 표기한다. 라인업도 라이브는 S110/S86/S75/S65인데 SSOT 한국 정책은 S75/S86/S98 Pro/S110이다.

### P1 (전환 · 리드 품질)

4. **쇼룸 의향이 데이터에서 소실된다.** 쇼룸 CTA가 `?topic=하드웨어/설치/AS`로 들어와 AS 문의와 같은 `source_detail` 값으로 뭉개진다. `idx_leads_source_detail` 인덱스가 있어도 분리 집계가 불가능하다.
5. **`/contact`가 `role`·`size`를 받지 않아 리드 스코어가 구조적으로 낮다.** [lib/crm/lead-ranking.ts](../../lib/crm/lead-ranking.ts)는 `size`만으로 최대 +34점을 준다. `leads.size`가 항상 NULL이라 같은 품질의 리드가 `demo_modal` 대비 항상 낮게 랭크된다.
6. **가격 정보가 6곳에 중복돼 있다.** 소프트웨어는 `lib/billing/plans.ts`·`app/product/sw/page.tsx`(JSX 하드코딩)·`components/sections/PricingCalculator.tsx`, 하드웨어는 `lib/billing/hardware-catalog.ts`·`lib/product-templates.ts`·`public/l/omo1/index.html`. 한 곳을 고치면 나머지가 조용히 어긋난다. (공개 가격 페이지 부재는 §6 D3 에서 **의도된 상태**로 확정했다.)
7. **설치 유형이 가격에 반영되지 않는다.** 스탠드/벽걸이는 [components/checkout/CheckoutRequestForm.tsx](../../components/checkout/CheckoutRequestForm.tsx)의 라디오일 뿐인데, [lib/product-templates.ts](../../lib/product-templates.ts)에는 각 ₩500,000으로 잡혀 있다. 공개 화면에서 무료처럼 보인다.
8. **카탈로그 결손.** S110·S65가 공개 카탈로그에 없어 `/product/hw`가 보여주는 4모델 중 2개만 신청 가능하다. 스탠드·벽걸이·녹화 1년권은 어드민 견적에만 있다.

### P2 (구조 · 운영)

9. **폼 스키마가 화면마다 독립 구현이다.** contact / DemoModal / EventSignupModal / ResourceDownloadForm / CheckoutRequestForm / meets-july 등 6곳이 각자 필드를 정의한다. [prd.md](./prd.md) §8-7의 "문의 폼과 데모 모달은 공통 스키마를 사용해야 한다"에 위배되며, 예약·구매 화면이 추가되면 8곳이 된다.
10. **`checkout_requests`에 어드민 조회 화면이 없다.** 신청 건이 `leads` 미러링으로만 발견된다. 쇼룸 예약을 같은 방식으로 만들면 같은 함정에 빠진다.
11. **`/contact`가 DESIGN.md를 위반한다.** `slate-*` 블루-그레이 전면 사용(§7-1 정면 위반), `font-serif`, `text-red-600`, 페이지 배경 `#EDF7F2`, `rounded-[24px]`/`[2rem]`. [scripts/check-design-tokens.mjs](../../scripts/check-design-tokens.mjs)는 `components/admin/branch/`만 스캔해 공개 화면에는 자동 가드가 없다.
12. **`/contact` 테스트 0건.** 폼 필드 계약(`org-name`↔`org` 매핑, 전화 포맷터, topic 분기, honeypot)이 회귀 테스트 없이 방치돼 있다.

### P3 (부수 결함)

13. `resetForm`이 `leadMagnet`을 초기화하지 않아 "추가 상담 남기기"로 남긴 두 번째 리드에 첫 제출의 슬러그가 재첨부된다.
14. 행사 목록 로딩 중 제출하면 `availableEvents.length === 0`이라 가드를 통과해 `event-slug` 없이 접수된다.
15. `NEXT_PUBLIC_CONTACT_KAKAO_URL`이 `.env.local.example`에 없다. 미설정 시 CTA는 "문의 폼 바로가기"인데 옆에 카톡 QR이 그대로 렌더된다.
16. 중복 방지가 프로세스 메모리 `Map`이라 서버리스에서 인스턴스가 갈리면 무력하다(코드 주석이 한계를 명시).

---

## 4. 실행 계획

### Phase 0 — 공통 기반 (선행)

폼이 8곳으로 늘기 전에 공통 계약을 먼저 세운다.

**P0 3건은 적용 완료(2026-08-29).**

| 항목 | 적용 내용 |
|---|---|
| 개인정보 수집·이용 동의 | `/contact` 폼에 필수 체크박스 추가. 항목·목적·보유 기간 문구는 `/privacy` 2·4·5절 값을 그대로 쓰고 방침을 링크한다. 미동의 시 제출 차단 |
| 문의 유형 SSOT + 서버 검증 | `lib/contact/topics.ts` 신설. 화면의 중복 정의(검증용 Set + 옵션 JSX)를 제거하고, 공개 무인증 `POST /api/lead` 경계에서 `contact_page` 리드의 유형을 검증한다 |
| 하드웨어 스펙 SSOT화 + 교정 | `lib/hardware/board-specs.ts` 신설. S86 모델명 `BS86A`→`BS86C`, S110 전체 길이 `2,620.55`→`2,520.55mm`, S75·S86 치수·두께 교정. S110 내장 마이크는 `—`(미탑재로 읽힘)→`별도 확인`. 문서 정본 표를 파싱해 대조하는 테스트를 걸었다 |

서버 검증을 **라우트 경계에만** 건 이유: `submitLeadCapture()` 자체를 조이면 서버 내부 호출자(`checkout_request:{kind}`, meets-july 랜딩의 `landing:...`, 외부 밀어넣기 `app/api/webhook/page`)가 함께 막힌다. 그들은 이 라우트를 거치지 않는다.

**리드 자격 필드도 적용 완료(2026-08-29).** `/contact`에 직책(`role`)·학원 규모(`size`) 선택 필드를 추가했다. 규모 옵션은 `ResourceDownloadForm`의 4단계를 그대로 써서 집계를 맞춘다.

곁들여 `lib/server/contact-field-validation.ts`를 만들어 공개 폼의 입력 정규화·검증 원시 함수를 공용화했다 — 같은 연락처인데 폼마다 통과 기준이 다르면 안 된다. `lib/checkout-requests.ts`가 갖고 있던 정의를 옮기고 재export로 기존 공개 API를 유지했다.

남은 항목:

| 항목 | 산출물 |
|---|---|
| 공용 폼 프리미티브 정착 | 신규 화면은 [components/ui/marketing-form.tsx](../../components/ui/marketing-form.tsx) + `CheckoutRequestForm` 클래스 조합을 따른다. `/contact`의 색·클래스는 참조하지 않는다 |

### Phase 1 — 쇼룸 상담 예약

**도메인·API 적용 완료(2026-08-29). 공개 화면은 진행 중.**

| 산출물 | 역할 |
|---|---|
| `lib/showroom/slots.ts` | 슬롯·영업일 판정(순수, I/O 없음). 서버와 화면이 같은 판정을 쓴다 |
| `lib/showroom/availability.ts` | 공휴일·쇼룸 ICS·우리 DB 예약을 모아 가용성을 만든다 |
| `lib/showroom/bookings.ts` | 접수 파이프라인. 저장 1순위 → 리드 미러 → ops 알림 1건 |
| `supabase/migrations/20260829_showroom_bookings.sql` | RLS deny-all + service_role 전용. **미적용 — 배포 전 적용 필요** |
| `app/api/showroom/availability` · `bookings` | 공개 무인증. same-origin·rate limit·본문 상한 |

설계에서 갈린 두 지점:

- **원천 장애의 방향.** 공휴일과 쇼룸 ICS는 실패해도 빈 값으로 진행한다 — 원천 하나가 늦다고 화면을 닫으면 멀쩡한 리드를 잃고, 열려 보인 슬롯은 담당자가 확정 단계에서 거를 수 있다. 반대로 **우리 DB 예약 조회 실패는 던진다** — 못 읽는 상태로 "비어 있음"을 보여주면 확정된 방문 위에 덧예약을 받는다.
- **ICS 일정은 우리 슬롯 격자에 맞춰 오지 않는다.** 10:30~11:30 같은 값이 온다. 시작 시각 일치가 아니라 구간 겹침으로 센다. 종일·시각 파싱 실패·자정 넘김은 그날 전체를 막는 쪽으로 기운다.

리드 미러의 `sourceDetail`이 `showroom_booking`이라 **§3 진단 4번(쇼룸 의향이 AS 문의와 뭉개짐)이 여기서 해소된다.**

**핵심 판단: 1차는 "요청형 예약"으로 간다.**

확정형(실시간 슬롯 잠금)을 1차에 넣지 않는 이유:

- 쇼룸 캘린더의 정본은 구글이고 우리 쪽은 ICS 읽기 전용 + 5분 캐시다. 실시간 확정을 약속하면 더블부킹이 난다.
- 팀원 개인 캘린더는 서비스 계정에 공유되지 않아(현재 전원 접근 불가) freeBusy 조회가 불가능하다.
- 화면에 "요청 접수 → 담당자 확인 → 확정 연락"을 명시하는 편이 정직하고, 운영이 조정할 여지를 남긴다.

**신설 라우트 `/showroom`** (공개·색인)

구성: 히어로 → 쇼룸에서 확인하는 것(EDB 교안 → 판서 → 녹화 → 복습/LMS 한 흐름) → 준비물 안내(대표 수업 자료 1개) → **예약 폼** → 오시는 길(지도) → [데모 준비 킷](../../data/lead-magnets.json) 링크.

카피는 [lib/classin-positioning.ts](../../lib/classin-positioning.ts)의 `primaryCtas[0]` "목동 쇼룸에서 실제 수업 흐름 보기"와 [classin-korea-positioning-guidelines.md](./classin-korea-positioning-guidelines.md) §9의 "단순 문의보다 '우리 학원 대표 수업 자료를 가져와 EDB·판서·녹화 흐름을 확인한다'는 맥락"을 따른다.

**슬롯 설계**

| 항목 | 값 | 근거 |
|---|---|---|
| 운영 요일 | 평일 (주말·공휴일 제외) | 공휴일은 [lib/korea-holidays.ts](../../lib/korea-holidays.ts) 재사용 |
| 슬롯 | 10:00 / 11:00 / 14:00 / 15:00 / 16:00 (60분) | 점심 12:00~13:00 제외. `/contact` 표기 운영시간(평일 09:00~18:00) 안쪽으로 준비·정리 시간 확보 |
| 예약 범위 | 내일 ~ +60일 | `checkout_requests`의 +180/+365보다 짧게 |
| 최소 리드타임 | 2 영업일 | 담당자 배정·자료 준비 시간 |

운영 확정이 필요한 값은 §6에 열린 결정으로 남긴다.

**신설 파일**

```
lib/showroom/slots.ts                  영업일·슬롯 생성·차단 판정 (순수 함수, 테스트 대상)
lib/showroom/bookings.ts               저장→리드 미러→알림 오케스트레이션 (checkout-requests.ts 패턴)
app/api/showroom/availability/route.ts GET 공개 — 날짜별 슬롯 상태
app/api/showroom/bookings/route.ts     POST 공개 — same-origin + rate limit 5/분 + 32KB 상한
app/showroom/page.tsx                  공개 쇼룸 소개 + 예약
app/showroom/layout.tsx                createPublicMetadata
components/showroom/ShowroomBookingForm.tsx
components/showroom/SlotPicker.tsx
supabase/migrations/YYYYMMDD_showroom_bookings.sql
```

**스키마 (`showroom_bookings`)**

`checkout_requests`의 규약을 그대로 따른다 — RLS enable + 정책 0개(deny-all), service role 전용, `lead_id` 미러, 상태 기계.

```
id uuid pk
visit_date date not null                       -- 방문일
visit_time text not null                       -- 'HH:mm' KST 벽시계 (admin_calendar_events 관례)
duration_minutes integer not null default 60
org / name / phone text not null
email / role text
visitor_count integer not null default 1
interests text[] not null default '{}'         -- 전자칠판 / 녹화 / LMS / 견적 / 설치
academy_size text                              -- 리드 스코어 입력
memo text
status text not null default 'requested'
  check (status in ('requested','confirmed','completed','no_show','canceled'))
assigned_to text                               -- admin_profiles.crm_owner_key
confirmed_at timestamptz
google_calendar_event_id text                  -- Phase 2 미러용
lead_id uuid references public.leads(id) on delete set null
source_page text
created_at / updated_at timestamptz
```

**가용성 판정** — ICS의 기존 쇼룸 일정과 우리 DB의 `requested`/`confirmed` 예약을 합쳐 "마감" 표시한다. 확정 권한은 담당자에게 있음을 화면에 명시한다.

**컴포넌트 재사용** — [components/checkout/DesiredDateCalendar.tsx](../../components/checkout/DesiredDateCalendar.tsx)는 의존성 없는 접근성 월 그리드(roving tabindex, 방향키/Home/End/PageUp/PageDown)다. `disabledIsoDates?: ReadonlySet<string>` 인자를 추가해 `/checkout`과 `/showroom`이 공유한다. 날짜 산술은 [components/checkout/request-date.ts](../../components/checkout/request-date.ts)를 그대로 쓴다.

**운영 연결**

- WeCom 알림 `showroom.booking_requested` 신설 ([lib/notifications/emit-event.ts](../../lib/notifications/emit-event.ts)의 `checkout.request_created` 패턴)
- 리드 미러 `source: "contact_page"`, `sourceDetail: "showroom_booking"` → 진단 4번이 여기서 해결된다
- **어드민 조회 화면을 함께 만든다.** 진단 10번(`checkout_requests` 함정)을 반복하지 않는다. 확정 시 `admin_calendar_events`에 `type: 'meeting'`으로 미러해 기존 캘린더에 노출한다.

**Phase 2 후보** — 확정 시 [lib/google.ts](../../lib/google.ts)의 `createCalendarEvent()`로 구글 쇼룸 캘린더에 직접 쓰기(스코프는 이미 확보), 방문 전 리마인더, 슬롯 배타 제약(`EXCLUDE USING gist`).

### Phase 2 — 전자칠판 · 소프트웨어 구매 화면

**확정(2026-08-29): 구매 화면은 공개·색인하지 않는다. 기존 `/checkout`을 디벨롭한다.**

즉 §3의 진단 6번(가격을 볼 수 있는 공개 페이지가 없음)은 **고칠 문제가 아니라 의도된 상태**로 확정한다. 가격 노출은 캠페인 랜딩(`public/l/omo1/index.html`)과 상담 경로가 계속 담당하고, `/pricing`은 현행 라우팅 카드 역할로 둔다. `/checkout`의 `robots: noindex` + `DISALLOW_PATHS`도 그대로 유지한다.

`lib/classin-positioning.ts`의 가격 답변 원칙("최종 견적과 구체 금액은 단정하지 않고 상담 연결")과도 이 방향이 맞는다.

**따라서 작업 범위는 노출 확대가 아니라 정합성과 화면 완성도다.**

**P0·P1 적용 완료(2026-08-29).**

가장 큰 건은 **설치비를 잘못 말하고 있던 것**이다. 패키지 전용 문구 `"설치 배송비 포함 · 12개월 할부 가능"`이 합계 카드와 신청 폼 요약에 그대로 달려 있어, 86″ 단품만 담은 사람에게도 설치가 포함된다고 말했다. 견적 카탈로그([lib/product-templates.ts](../../lib/product-templates.ts))는 같은 설치를 스탠드·벽걸이 각 ₩500,000으로 잡고 있어 실제 청구와 어긋났다(패키지 단가 계산이 근거: 630+120+**50**만원).

운영 확인 결과 **단품은 설치 별도**가 맞아, 다음을 적용했다.

| 항목 | 적용 내용 |
|---|---|
| 설치 문구 분리 | `HARDWARE_PACKAGE_NOTE`(패키지 전용, omo1 랜딩과 같은 값)와 `HARDWARE_ORDER_NOTE`("12개월 할부 가능")를 갈랐다. 설치 포함 주장은 패키지 카드에만 남는다 |
| 설치를 가격에 반영 | 신청 폼의 설치 유형 라디오가 단가(₩500,000)와 대수를 함께 보여주고, 고르면 요약 합계가 즉시 늘어난다. 주문 라인으로도 실린다 |
| 이중 과금 방지 | `requiresInstall` 플래그로 전자칠판 단품만 센다. 패키지는 벽걸이를 이미 포함해 설치 라인을 만들지 않는다 |
| 서버 단가 핀 | 설치 sku 를 `getHardwareItem()`이 찾게 해 서버가 카탈로그 값으로 단가를 고정한다. 클라이언트가 낮춰 보내도 되돌린다 |
| 소프트웨어 가격 SSOT | `/product/sw`의 JSX 하드코딩과 `PricingCalculator`의 `SUBSCRIPTION_TIERS` 단가를 [lib/billing/plans.ts](../../lib/billing/plans.ts)에서 파생. 시뮬레이터 전용 한도(온스테이지·스토리지)는 그대로 뒀다 |
| 도입 신청 어드민 면 | `lib/repositories/checkout-requests-admin.ts` + `app/api/admin/checkout-requests/`. 신청이 리드 미러링으로만 발견되던 함정을 닫았다. `assigned_to` 컬럼이 스키마에 없어 상태 전이만 다룬다 |

부가세 표기(D6)는 세무 확인이 필요해 이번 범위에서 뺐다.

| # | 작업 | 등급 |
|---|---|---|
| 1 | **하드웨어 스펙 SSOT화 + 교정** — `/product/hw`가 스펙을 페이지 안에 들고 있어 규격서 교정을 놓쳤다. 구조화 정본 모듈로 내리고 문서 정본과 대조하는 테스트를 건다 | P0 |
| 2 | **가격 SSOT 단일화** — 소프트웨어 가격이 3곳(`lib/billing/plans.ts` / `app/product/sw/page.tsx` JSX 하드코딩 / `components/sections/PricingCalculator.tsx`), 하드웨어 가격이 3곳(`lib/billing/hardware-catalog.ts` / `lib/product-templates.ts` / `public/l/omo1/index.html`)에 중복된다 | P1 |
| 3 | **설치 유형을 가격에 반영** — 스탠드/벽걸이가 라디오일 뿐인데 `lib/product-templates.ts`에는 각 ₩500,000이다. 공개 화면에서 무료처럼 보인다 | P1 |
| 4 | **카탈로그 결손 정리** — S110·S65가 공개 카탈로그에 없어 `/product/hw`가 보여주는 4모델 중 2개만 신청 가능하다. 스탠드·벽걸이·녹화 1년권도 어드민 견적에만 있다 | P1 |
| 5 | **`/checkout` 화면 완성도** — 장바구니 상태가 `useState`뿐이라 새로고침하면 사라진다. SW+HW 혼합 주문 불가(`kind`가 택1) | P2 |
| 6 | **부가세 표기 기준** — 소프트웨어는 VAT 언급 자체가 없고 하드웨어는 "부가세 별도" 한 줄뿐이다 | P2 |
| 7 | **`checkout_requests` 어드민 조회 화면** — 신청 건이 리드 미러링으로만 발견된다 | P2 |

카피는 [brand-canon/voice-charter.md](./brand-canon/voice-charter.md)의 제품 표면 톤("자신감 있는 차별화 / 운영 흐름 중심 / 스펙 나열만 금지")을 따른다.

### Phase 3 — 문의 페이지 항목 정리

**핵심 판단: 쇼룸은 문의 폼의 select 옵션이 아니라 별도 예약 화면으로 둔다.**

- 예약은 날짜·시간·인원·목적이 필요해 일반 문의와 필드가 다르다.
- "최강 CTA"가 7개 select 중 1개로 묻히면 전환이 떨어진다.
- DB에서 예약과 문의를 분리해야 집계·운영이 가능하다.

다만 이미 `/contact`에 들어온 사람을 놓치지 않도록, 문의 유형에 **쇼룸 방문 예약**을 두되 선택 시 `/showroom`으로 안내하는 브릿지를 노출한다.

**문의 유형 재편안**

현행 7종은 영업·CS·행사가 평면으로 섞여 라우팅과 SLA가 구분되지 않는다.

| 그룹 | 유형 | 조건부 필드 | 처리 |
|---|---|---|---|
| 도입 검토 | 도입 상담 / 견적 요청 | 규모, 직책, 관심 제품(HW/SW/둘 다) | 영업 |
| 방문·체험 | 쇼룸 방문 예약 | → `/showroom` 브릿지 | 영업 |
| 구매 | 구매·주문 문의 | → `/checkout` 브릿지 | 영업 |
| 사용 중 | 수업 운영 상담 / 계정·기술 지원 / 하드웨어 설치·AS | — | CS |
| 정산 | 결제·영수증·계약 | — | CS |
| 행사 | 행사 신청 / 세미나 신청 | 행사 선택(현행) | 마케팅 |

`message` placeholder는 [classin-pre-adoption-question-matrix-2026-06-18.md](./classin-pre-adoption-question-matrix-2026-06-18.md)의 상담 요청 문장 템플릿을 참고해 구체화한다.

**추가 작업**

- 641줄 단일 파일을 섹션 컴포넌트로 분리
- DESIGN.md 정합: `slate-*` → 웜 뉴트럴, `font-serif` 제거, `text-red-600` → `#B43E3E`, radius를 6/12/16px 스케일로
- "오피스 위치" → "목동 쇼룸 · 한국 지사"로 재표기 + 예약 CTA
- P3 결함 4건(13~16번) 정리
- `/contact` 폼 계약 테스트 신설

---

## 5. 단계 순서와 근거

```
Phase 0  공통 기반          — 폼이 8곳으로 늘기 전에 계약을 세운다
   ↓
Phase 1  쇼룸 예약          — 기대효과 최대. 전략 문서가 요구하는데 제품에 없다
   ↓
Phase 2  구매 화면          — 가격·스펙 SSOT 를 모아야 화면이 다시 안 어긋난다
   ↓
Phase 3  문의 폼 재구성      — 1·2가 있어야 "어디로 보낼지"가 정해진다
```

Phase 0의 P0 3건(개인정보 동의 · 서버 allowlist · 하드웨어 스펙 교정)은 나머지와 독립적이므로 먼저 처리할 수 있다.

---

## 6. 확정된 결정과 남은 결정

### 확정 (2026-08-29)

| # | 결정 | 확정 내용 |
|---|---|---|
| D2 | 쇼룸 예약 확정 방식 | **요청형** — 고객이 날짜·시간대를 고르면 접수되고, 담당자가 확인 후 확정 연락. ICS가 읽기 전용 5분 캐시라 실시간 확정은 더블부킹 위험 |
| D3 | 구매 화면 노출 | **공개하지 않는다.** `/pricing` 승격도 `/store` 신설도 하지 않고, 기존 `/checkout`을 디벨롭한다. noindex·robots 차단 유지 |
| — | 착수 순서 | Phase 0의 P0 3건(개인정보 동의 · 서버 allowlist · 하드웨어 스펙 교정) 먼저 |
| D1 | 쇼룸 운영 슬롯 | **가정으로 진행** — 평일 10/11/14/15/16시, 60분, 동시 1팀, 최소 2영업일 전, 최대 60일 이내. 값은 전부 `lib/showroom/slots.ts` 상단 상수라 운영 확인 후 한 곳만 고치면 된다. **운영 확인 필요** |

### 남은 결정

| # | 결정 | 기본 제안 |
|---|---|---|
| D4 | S110·S65 공개 카탈로그 취급 여부 | 상담 전용 유지(현행) |
| D5 | 스탠드·벽걸이를 `/checkout` 주문 라인에 노출할지 | **확정·적용** — 설치 유형 라디오가 단가를 표기하고 합계·주문 라인에 반영된다. 녹화 1년권은 패키지에만 있어 별도 노출하지 않았다 |
| D6 | 공개 가격의 부가세 표기 — 별도 vs 포함 | **보류** — 세무 확인 후 별건으로 처리 |
| D7 | 쇼룸 예약 어드민 화면 위치 — `/admin/crm` vs `/admin/calendar` 레일 | 캘린더 레일에 요청 큐 + CRM 리드 미러 |
| D8 | S65 스펙 — 규격서 미확보로 미검증인 수치를 계속 공개할지 | 규격서 확보 후 갱신, 그전까지 현행 유지 |

## 7. 검증 기준

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
| 하드웨어 가격 | `npx vitest run tests/checkout/hardware-catalog.test.ts` (정적 랜딩 가격과 대조) |
| 신청 계약 | `npx vitest run tests/checkout/checkout-request.test.ts` |
| 스키마 변경 | `npm run check:db` |
| 신규 슬롯 로직 | `tests/showroom/slots.test.ts` 신설 |

디자인 QA는 [design-qa.md](../../design-qa.md) 형식(P0~P3 + 5개 충실도 표면 + 수정 후 증거)으로, 1536×1024 / 390×844 두 뷰포트에서 기록한다.

수동 확인:

- 신규 공개 라우트는 `createPublicMetadata`(canonical) + [app/sitemap.ts](../../app/sitemap.ts) 등록 둘 다
- 신규 컨택형 화면은 [components/ui/MobileFloatingCTA.tsx](../../components/ui/MobileFloatingCTA.tsx)의 제외 경로에 추가(CTA 중복 방지)
- 신규 CTA는 `TrackedLink` 또는 `trackEvent` 계측([prd.md](./prd.md) §11: 트래킹만 되고 동작 없는 버튼 금지)
- 공개 화면 팔레트는 자동 가드가 없으므로 수동 검토 필수
