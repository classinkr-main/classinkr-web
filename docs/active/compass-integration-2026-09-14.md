# Compass ↔ 어드민 리드·CRM 연동 2차 — 변경·적용 순서·정렬 메모

- 작성: 2026-09-14
- 상태: 코드 커밋 완료, **마이그레이션은 아직 어느 DB 에도 적용하지 않음**
- 병합: 2026-09-15 main 에 병합·푸시(운영 배포 전). 병합 트리 게이트(typecheck·eslint·vitest·build)와 Vercel Preview 통과. `meta-single-receiver` 는 진행 중이라 포함하지 않았다.
- 근거: Compass 감사 R6(리드·CRM 연동, 설계 B 권고) · R2/R3/R5 · D-borrow-crm(전화 키 진리표)
- 짝 문서: [supabase-shared-db-consolidation-analysis-2026-09-02.md](./supabase-shared-db-consolidation-analysis-2026-09-02.md)(통폐합 판정),
  [neocrm-writeback-guide-2026-09-07.md](./neocrm-writeback-guide-2026-09-07.md)(NEO 되밀기),
  [../superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md](../superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md)(MKT 연락 반영 — `home_v4.42` 로 병합됨, 이 브랜치에 병합)

## 0. 한 줄 요약

테이블은 합치지 않는다(설계 B). 각 채널의 원본은 그대로 두고, **사람↔사람은 Compass 가 가진 링크(`crm.lead_refs`)로,
전화 조인은 Compass `normPhone` 과 같은 SQL 함수(`public.norm_phone_key`)로, "연락함"은 Compass 가 정의한 뷰
(`compass_lead_contact_v`)로** 읽는다. 어드민 쪽은 그 뷰·함수를 만드는 마이그레이션과, 브리지 소비 코드의 정합성 수정이다.

소유 경계(바뀌지 않음): `crm` DDL = Compass `scripts/schema.sql`, `public` 뷰·함수 = 이 저장소 `supabase/migrations`.
교차 쓰기 0건 — 어드민은 `crm` 에 쓰지 않고, Compass 는 `public` 에 쓰지 않는다.

## 1. 이번 변경 (커밋 단위, 해시는 작성 시점)

| # | 커밋 | 무엇 | 행동 변화 |
|---|---|---|---|
| E1 | `5453e679` | `supabase/migrations/20260914_compass_integration_bridge.sql` — `norm_phone_key` 함수·표현식 인덱스 3개, `compass_lead_refs_v`·`compass_lead_contact_v`(crm 객체 있을 때만), 역브리지 `home_owner_directory_v`·`home_neo_accounts_v`·`home_site_leads_v`·`home_channel_contacts_v`. `lib/db/schema-contract.ts` 에 뷰 6개 warning 프로브 | 적용 전까지 없음. `check:db` 에 warning 6건이 뜬다(차단 아님) |
| E2 | `099c7d7f` | `lib/compass/normalize.ts` `normalizePhoneKey` 를 `normPhone` 등가로 | 원문 전화 `+82 010-…`·`0082-010-…`·`10-…`(앞 0 탈락)이 이제 Compass 리드와 조인된다. 저장값 기준 결과는 불변(테스트가 "옛 규칙과 다른 입력은 4개뿐" 고정). **어드민 끼리의 재유입 수도 오를 수 있다(정정)**: `lib/crm/lead-reinflow.ts` 가 같은 키로 어드민 리드끼리 묶으므로, 캠페인 허브 신규 리드 탭(`NewLeadsTab`)의 재유입 수가 `+82 010-…`/`0082-010-…`/`10-…` 와 `010-…` 로 따로 들어온 같은 번호 쌍에서 늘어난다 — 옛 키가 둘을 다른 사람으로 가르던 것을 바로잡은 결과다(`tests/compass/lead-reinflow.test.ts` 고정) |
| E3 | `1d57e3ee` | `bridge.ts` 기간 조회 4개(`getCompassAdsDaily`·`getCompassAdsetsDaily`·`getCompassDemos`·`getCompassCalEvents`) 페이지네이션, `truncated = count > rows`. 후속 수정: 브리지 전용 사본 `lib/compass/paginate.ts` 를 지우고 공용 `lib/supabase/pagination.ts` `fetchSupabasePages` 로 합쳤다(`concurrent: true`) — 공용 헬퍼가 count 를 알면서도 짧은 페이지(서버 클램프)에서 멈추고 `truncated=false` 를 내던 것도 같이 고쳤다 | PostgREST max-rows(1000) 조용한 절단 방지. 광고 라우트 절단 판정이 `>= 3000` 근사 → 실제 값. 공용 헬퍼를 쓰는 다른 호출부(첫 페이지에 count 를 청하는 곳)는 클램프된 짧은 페이지 뒤를 이어 읽고, 조회 중 행이 줄면 `truncated=true` 가 된다. count 없이 쓰는 곳은 그대로(짧은 페이지 = 끝) |
| E3 | `97774597` | `lib/crm/compass-demo-source.ts` 데모 역조회 — 전화 전량 청크 조회 → 데모 리드 id PK 조회 1회(`getCompassLeadPhoneKeysByIds`) | 데모 색인 결과 동일, 조회량 감소 |
| E4 | `fbf5eaa0` | `lib/crm/compass-timeline.ts` — sms·memo·action·alimtalk 표시, `system` 은 본문이 `폼 답변\n` 로 시작할 때만 "폼 답변" | 고객 360 타임라인에 빠지던 활동이 보인다. 기존 종류의 필터 축은 불변 |
| E4 | `796a6b5f` | `COMPASS_STAGE_LABEL` 을 Compass `lib/stages.ts` 정본으로(new=유입, quote=미팅, lost=종료) | 리드 보드 Compass 칩·등록 중복 경고의 단계 글자 |
| E5 | `339878d1` | 오늘 유입 카드 — Compass 리드를 `created_at` **또는** `last_inflow_at` 이 기간 안인 것으로 읽고 신규/재유입을 가른다(`lib/compass/inflow-window.ts` 신규) | Compass 신규 리드가 오늘 유입에 잡힌다(예전엔 재유입만). "신규 N · 재유입 k" 표시. 후속 수정: Compass 인바운드 채널(`channeltalk`·`direct`·`walkin`·`referral`)은 세지 않는다 — Compass 대시보드 "오늘"의 `mktLeadCond`(`coalesce(channel,'') <> all(…)`)와 같은 규칙(`lib/compass/normalize.ts` `isCompassMarketingChannel`). 이게 없으면 Compass 에 수동 등록한 워크인·채널톡 리드가 어드민 카드에만 +1 됐다 |
| E6 | `fb1a0131` | `lib/external-crm/xiaoshouyi-write.ts` lead **create** 닫기(§3) | 이 저장소 쓰기 큐로 NEO lead 를 만들 수 없다. 수정·담당 이전은 열려 있다 |

손대지 않은 것(다른 세션 소유 — `home_v4.42` 로 병합됨): `lib/compass/lead-contact-sync.ts`, `lib/server/lead-contact-compass-sync.ts`,
`app/api/cron/dispatch/[slot]/route.ts`, `lib/compass/overlay.ts`, `lib/repositories/leads.ts`, 챗봇.
`lib/crm/capture/matching.ts` 의 같은 이름 `normalizePhoneKey`(붙여넣기 내부 중복용, 국가번호 미처리)도 그대로다 — 이름 충돌만 인지.

## 2. 마이그레이션 적용 순서

대상은 **서울 운영 프로젝트 `pxbrsbovoobowpfarxmn`** 하나다. 싱가포르 원본은 쓰기 차단 상태라 거기 적용하면 운영에 반영되지 않는다
([supabase-korea-migration-status.md](./supabase-korea-migration-status.md)).

1. **Compass 배포** — Compass `scripts/schema.sql` 이 `crm.lead_refs`·`crm.lead_contact_facts_v` 와 `crm.leads.phone_key` 생성 컬럼을 만든다.
   crm DDL 은 Compass 소유라 이 저장소는 만들지 않는다.
2. **`20260914_compass_integration_bridge.sql` 적용.**
   - 적용 중 자기검증 DO 블록이 전화 진리표 23개를 PG 에서 실행해 보고, 하나라도 어긋나면 예외로 중단한다.
   - NOTICE 두 줄을 확인한다: `compass_lead_refs_v: created from crm.lead_refs`, `compass_lead_contact_v: created from crm.lead_contact_facts_v`.
     `… missing — deploy Compass …` 이 나오면 1번이 안 된 것이다. 나머지(함수·인덱스·역브리지 4개)는 만들어졌으니, Compass 배포 뒤 **같은 파일을 다시 실행**한다(멱등).
   - `CREATE INDEX`(CONCURRENTLY 아님)가 `public.leads`·`channel_conversations`·`crm_neo_customer_snapshots` 에 잠깐 SHARE 잠금을 건다. 표는 작지만 웹폼 유입이 적은 시간에 한다.
3. **`20260902_compass_leads_v_phone_key_column.sql` 재실행.** `crm.leads.phone_key` 컬럼이 생긴 뒤에야 `compass_leads_v.phone_key` 를
   정규식 계산에서 컬럼 읽기로 갈아 끼운다(컬럼이 없던 첫 실행은 NOTICE 만 남기고 옛 뷰를 뒀다). 2번과는 서로 독립이고 둘 다 멱등이다.

적용 뒤 확인(읽기 전용, 건수·존재만):

```sql
select to_regclass('public.compass_lead_refs_v'), to_regclass('public.compass_lead_contact_v'),
       to_regclass('public.home_neo_accounts_v'), to_regclass('public.home_site_leads_v');
select public.norm_phone_key('+82 10-1234-5678');   -- 01012345678
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('compass_lead_refs_v','compass_lead_contact_v','home_owner_directory_v',
       'home_neo_accounts_v','home_site_leads_v','home_channel_contacts_v') and grantee in ('anon','authenticated');  -- 0행
```

그다음 어드민 `npm run check:db` 에서 새 뷰 warning 6건이 사라지는지 본다. Compass 쪽 역브리지 소비(리드 상세 패널·푸시 전 NEO 중복 검사)는
`to_regclass` 로 뷰 존재를 확인하고 없으면 조용히 비활성이라, 적용 순서가 어긋나도 Compass 가 깨지지 않는다.

**되돌리기**: 뷰 → 인덱스 → 함수 순서로 drop(마이그레이션 머리 주석에 전체 문장). `norm_phone_key` 는 표현식 인덱스가 참조하므로 인덱스보다 먼저 지울 수 없다.

## 3. NEO lead 생성 닫기 (E6)

- **결정**: NEO `lead` 의 작성자는 Compass 하나(`scripts/push_neocrm.mjs`). 이 저장소 정책은 `create` 만 닫고
  `리드 생성은 Compass 단일 경로` 로 거절한다. `update`·`transfer_owner`·다른 객체(`activityrecord` 등)는 그대로다.
- **왜**: NEO 중복 사전 검사는 Compass 푸시에만 있다. 이 큐로 만든 lead(특히 `mobile` 필드)는 Compass 검사(phone SOQL)가 찾지 못해
  이중 등록이 된다(R6 G3·G4, 3-3 R6).
- **호출부 전수 grep(2026-09-14)**: lead create 를 보내는 UI·코드·스크립트 0건.
  `createCrmWriteRequest` 의 코드 호출부는 연락 기록 되밀기(`lib/crm/activity-record-writeback.ts`, `activityrecord`)뿐이고,
  딜 화면(`app/admin/crm/deals/page.tsx`)은 승인·취소·재시도·실행·메타데이터 점검만 한다. 남은 입구는 본문으로 객체를 받는
  범용 `POST /api/admin/crm/write-requests` 라서 정책(`validateWritePayload`)에서 닫았다 — 미리보기·큐 적재·실행이 같은 사유로 거절된다.
- **이미 쌓인 요청**: 닫기 전에 만들어진 lead create 요청이 있다면, 실행 시 NEO 호출 없이 `failed`(같은 사유)로 끝난다. 배포 전에 규모를 본다. 2026-09-15 운영(서울) 확인: `crm_write_requests` 전체 0행 — 닫기로 실패할 대기 요청은 없다.
  `select status, count(*) from public.crm_write_requests where object_api_key = 'lead' and operation = 'create' group by 1`
- 다시 열어야 하면 `lead.operations` 에 `create` 를 되돌리고 `closedOperationReasons` 를 지운다. 그 전에 Compass 푸시와 같은 NEO 중복 사전 검사를 이쪽에도 둔다.

## 4. 병합된 MKT 연락 반영(`lead-contact-compass-sync`)과의 정렬 메모

그 작업(설계 `2026-09-14-lead-contact-compass-sync-design.md`, 코드 `lib/compass/lead-contact-sync.ts`·`lib/server/lead-contact-compass-sync.ts`)은
`home_v4.42` 로 병합됐고 이 브랜치에도 병합했다. 아래는 사실과 나중에 고를 수 있는 선택지다. **그 코드를 지금 바꾸라는 지시가 아니다** — 결정은 그 작업 소유자 몫이다.

### 4-1. "사람 손 활동" — 기계 작성자와 작성자 없음(null)

두 저장소의 계약은 이제 같다(2026-09-14 후속 수정으로 Compass 쪽을 병합된 동기화에 맞췄다).

- **기계 작성자** = `Claude`·`BD시트`·`시트 동기화`·`시트`·`시스템`·`system`. 병합된 동기화의 `COMPASS_AUTOMATED_ACTORS` 와 같은 목록이다.
  BD 설명회 적재는 신규 리드마다 `BD시트` note 를, 시트 크론은 closed 전파를 `시트 동기화` note 로, 백필·웹훅은 `Claude` 로,
  일회성 시트 백필·중복 병합 스크립트는 `시트` note(`…설명회에도 신청 — 중복 리드 #N 병합`)를 남긴다. 이 note 만 있는 리드는 연락이 아니다.
- **작성자가 비어 있는(null) 기록은 사람이다.** 시트 크론은 사람이 리드 시트에 적은 콜 메모를 actor 없이 `kind='note'` 로 옮긴다 —
  시트 시절에 실제로 통화한 기록이다. actor 없는 `부재중` 콜은 연결이 아니라 시도로만 잡힌다(본문으로 거른다).
- 초안(명세 §4-1 첫 판)의 "null = 기계"·3개 목록은 폐기됐다. 그 판대로라면 병합 메모(`시트`)가 연락으로 잡히고 시트 시절 콜 메모가 빠졌다.

Compass `lib/leadContact.ts` 조각(활동 별칭 `a`) — Compass `scripts/schema.sql` 의 `crm.lead_contact_facts_v` 가 글자 그대로 쓴다.

```sql
-- HUMAN_ACTOR(a) — 작성자 없음(시트 시절 사람 기록) 포함
(a.actor is null or a.actor not in ('Claude','BD시트','시트 동기화','시트','시스템','system'))
-- ATTEMPT(a) — 부재중 콜도 시도. 알림톡은 자동이라 제외
(a.kind in ('call','sms'))
-- CONNECTED(a) — 연결된 콜(부재중·재통화 예약 제외) · 미팅 · 사람이 쓴 자동 머리 아닌 메모
((a.kind = 'call' and coalesce(a.body,'') !~ '^(부재중|재통화)') or a.kind = 'meeting' or (a.kind = 'note' and (a.actor is null or a.actor not in ('Claude','BD시트','시트 동기화','시트','시스템','system')) and coalesce(a.body,'') !~ '^(데모 일정|고객관리 이관 취소|종료 처리|종료 취소|BD인계 취소)'))
-- MISSED_ATTEMPT(a)
(a.kind = 'call' and coalesce(a.body,'') ~ '^(부재중|재통화)')
```

### 4-2. `compass_lead_contact_v` 와 병합된 동기화의 관계

병합된 동기화는 활동을 직접 읽는다: 매칭 행 단계가 전부 `new` 인 Compass 리드만 골라 `getCompassActivitySignals`(`compass_activities_v` 에서
`lead_id·kind·actor`, lead id 100개 덩어리 × 1000행 페이지)로 읽고, `humanTouchedCompassLeadIds` 가
`kind ∈ {call, sms, meeting, note, memo, stage_change}` + 기계 작성자 아님으로 판정한다. §2 적용 뒤에 생기는 `public.compass_lead_contact_v`(리드당 1행)는
같은 질문에 Compass 가 정의한 답을 준다.

| 컬럼 | 뜻 |
|---|---|
| `lead_id` | Compass 리드 id |
| `latest_inflow_at` | `coalesce(last_inflow_at, created_at)` |
| `first_attempt_at`·`last_attempt_at` | ATTEMPT 최초·최근 |
| `first_connected_at`·`last_connected_at` | CONNECTED 최초·최근 |
| `missed_since_inflow`·`sms_since_inflow` | 최신 유입 뒤 부재중 콜·문자 수 |

**같은 점**: 기계 작성자 목록과 null 규칙(4-1). 대응시키면 동기화의 "사람 손 활동 있음" ≈ `first_attempt_at is not null or first_connected_at is not null`.

**다른 점**(바꾸기 전에 볼 것 — 오늘 결과가 달라지는 건수는 재지 않았다):

| 경우 | 병합된 동기화 | `compass_lead_contact_v` |
|---|---|---|
| 기계 작성자의 `call`·`sms` | 제외(작성자 필터를 모든 kind 에 건다) | 시도로 센다(ATTEMPT 는 작성자를 보지 않는다) |
| 기계 작성자의 `meeting` | 제외 | 연결로 센다 |
| 자동 머리 note(`데모 일정`·`종료 처리`·`종료 취소` 등)를 사람이 씀 | 사람 손 | 연결 아님. 대개 단계 이동이 함께라 `stage ≠ new` 가 덮지만, `종료 취소`·`고객관리 이관 취소`·`BD인계 취소` 로 `new` 에 돌아온 리드는 갈린다 |
| `memo`·`action`(고객관리)·`stage_change` | `memo`·`stage_change` 는 사람 손, `action` 은 아님 | 셋 다 없다. `stage_change` 는 `stage ≠ new` 가 덮고, `memo`·`action` 은 `compass_leads_v.care_stage is not null` 로 보탤 수 있다 |
| 작성자 앞뒤 공백 | `trim()` 뒤 비교 | 글자 그대로 비교 |

**나중에 줄일 수 있는 것**(§2 적용·Compass 배포 뒤, 위 차이를 받아들이기로 정한 경우):

- `getCompassActivitySignals` 의 손 페이지 루프(짧은 페이지 = 끝 — 공용 `fetchSupabasePages` 가 count 없이 쓰일 때와 같은 규칙)는
  뷰로 바꾸지 않더라도 공용 헬퍼로 옮길 수 있다(이번에는 그 함수·테스트를 건드리지 않았다).
- `getCompassActivitySignals` 의 손 페이지 루프 + `humanTouchedCompassLeadIds` + `COMPASS_AUTOMATED_ACTORS` 사본을
  `compass_lead_contact_v` 를 `lead_id in (…)` 로 읽는 조회 하나로 바꿀 수 있다. 결과가 리드당 1행이라 행 상한·페이지 문제가 없고,
  기계 작성자 목록의 원본이 Compass `lib/leadContact.ts` 하나로 준다(지금은 두 저장소에 사본이 있고 글자를 손으로 맞춘다).
- 설계 §6 "재유입" 러프함은 `last_attempt_at >= latest_inflow_at or last_connected_at >= latest_inflow_at`("최신 유입 뒤 연락")로 좁힐 수 있다.
- 뷰가 없을 때(§2 이전·Compass 미배포)는 지금 경로가 유일하다. 바꾼 뒤에는 뷰 부재를 `bridge_down` 으로 다뤄 이번 실행을 건너뛰는 편이 정의가 갈라지지 않는다.

### 4-3. 원문 전화에는 `norm_phone_key` 를 쓴다

- TS 에서 매칭하면 `lib/compass/normalize.ts` `normalizePhoneKey` 가 E2 로 이미 `normPhone` 등가다. 설계 §3 "`compass_leads_v.phone_key` 와 같은 식"은
  이제 "같은 결과(Compass 저장값 기준)"로 읽는다. **옛 K식(`^0082→82→^82→0`)을 원문 `public.leads.phone` 에 복사해 쓰지 않는다** —
  `+82 010…`·`0082-010…`·`10-…` 가 빠진다(R6 G7).
- SQL(RPC·뷰)에서 매칭하면 `public.norm_phone_key(l.phone)` 을 쓴다. `public.leads(public.norm_phone_key(phone)) where phone is not null and length(public.norm_phone_key(phone)) >= 9`
  표현식 인덱스가 있다 — 조건에 `phone is not null` 과 길이 가드를 같이 걸어야 플래너가 부분 인덱스를 쓴다.
- **조인 가능 키만 붙인다**: 정규화 키가 9자리 미만(`'0'`·`'000'`·`'-'` 같은 자리표시 번호, `1588-…` 대표번호)이면 전화 키로 매칭하지 않는다.
  병합된 동기화 `lib/compass/lead-contact-sync.ts` 의 `MIN_PHONE_KEY_LENGTH`(9)와 같은 경계이고, 역브리지 뷰 3개·표현식 인덱스 3개가 같은 가드를 건다
  (`home_neo_accounts_v` 는 행을 남기고 `phone_key` 만 null).

### 4-4. 링크 우선, 전화 키 폴백 (이후)

R6 B-3 매칭 순서: ① `compass_lead_refs_v`(`system = 'home_lead'`, `external_id = public.leads.id`) ② 과도기에는 `public.leads.message` 의 `leadgen_id=` ↔ `meta_leadgen` ref
③ `norm_phone_key` 폴백. 지금 `home_lead` ref 는 0건이고(Compass 문의 인박스 이후에 생김) `meta_leadgen` ref 는 Compass 웹훅이 앞으로 쓴다.
그러니 이번 구현은 전화 키만으로 충분하되, 매칭 입력을 "후보 Compass lead id 목록"으로 받아 두면 링크를 끼우기 쉽다.

### 4-5. 병합 결과

- `home_v4.42`(MKT 연락 반영 포함)를 이 브랜치에 충돌 없이 병합했다. `lib/compass/bridge.ts`·`lib/db/schema-contract.ts` 는 양쪽 변경이 자동 병합됐고,
  병합 트리에서 typecheck·관련 vitest 가 통과했다.
- `COMPASS_STAGE_LABEL` 값이 바뀌었다(quote=미팅, lost=종료). 동기화 판정은 키(`lost`)로 하므로 영향 없음, 표시·감사 문구에서만 차이.

## 5. 이번에 하지 않은 것 / 미확인

- `lib/channel-talk-sync.ts` 전화 정규화(국가번호 미처리) 교체 — R6 B-3 권고. 역브리지 뷰는 `norm_phone_key` 로 흡수하지만 채널톡→리드 매칭 코드는 그대로다.
- `20260910_leads_contact_unique_dedupe.sql` 유니크 인덱스 — `saveLead` 재유입 업서트 전에는 적용 금지(재문의가 502·조용한 유실, R6 G8).
- Meta leadgen 단일 수신 전환, `home_neo_leads_v`(NEO 리드 상태 역류), Compass "홈페이지 문의" 인박스 — R6 B-5 3주+ 단계.
- 미확인: 마이그레이션은 로컬 임시 PG 17(스텁 테이블)로만 검증했다 — 서울 인스턴스(Supabase 기본 권한 포함)에서는 §2 확인 쿼리로 본다.
  `crm.lead_refs`·`crm.lead_contact_facts_v` 의 컬럼은 Compass 명세 기준이며, Compass 가 이름을 바꾸면 2번 재실행이 오류로 멈춘다(조용히 틀리지 않음).
  `crm_write_requests` 에 lead create 요청이 실제로 쌓인 적이 있는지는 DB 를 보지 않아 모른다(§3 쿼리).
