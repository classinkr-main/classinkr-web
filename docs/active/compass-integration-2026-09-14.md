# Compass ↔ 어드민 리드·CRM 연동 2차 — 변경·적용 순서·정렬 메모

- 작성: 2026-09-14
- 상태: 코드 커밋 완료, **마이그레이션은 아직 어느 DB 에도 적용하지 않음**
- 근거: Compass 감사 R6(리드·CRM 연동, 설계 B 권고) · R2/R3/R5 · D-borrow-crm(전화 키 진리표)
- 짝 문서: [supabase-shared-db-consolidation-analysis-2026-09-02.md](./supabase-shared-db-consolidation-analysis-2026-09-02.md)(통폐합 판정),
  [neocrm-writeback-guide-2026-09-07.md](./neocrm-writeback-guide-2026-09-07.md)(NEO 되밀기),
  [../superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md](../superpowers/specs/2026-09-14-lead-contact-compass-sync-design.md)(연락 상태 매시간 반영 — 작업 중)

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
| E2 | `099c7d7f` | `lib/compass/normalize.ts` `normalizePhoneKey` 를 `normPhone` 등가로 | 원문 전화 `+82 010-…`·`0082-010-…`·`10-…`(앞 0 탈락)이 이제 Compass 리드와 조인된다. 저장값 기준 결과는 불변(테스트가 "옛 규칙과 다른 입력은 4개뿐" 고정) |
| E3 | `1d57e3ee` | `lib/compass/paginate.ts`(신규) + `bridge.ts` 기간 조회 4개(`getCompassAdsDaily`·`getCompassAdsetsDaily`·`getCompassDemos`·`getCompassCalEvents`) 페이지네이션, `truncated = count > rows` | PostgREST max-rows(1000) 조용한 절단 방지. 광고 라우트 절단 판정이 `>= 3000` 근사 → 실제 값 |
| E3 | `97774597` | `lib/crm/compass-demo-source.ts` 데모 역조회 — 전화 전량 청크 조회 → 데모 리드 id PK 조회 1회(`getCompassLeadPhoneKeysByIds`) | 데모 색인 결과 동일, 조회량 감소 |
| E4 | `fbf5eaa0` | `lib/crm/compass-timeline.ts` — sms·memo·action·alimtalk 표시, `system` 은 본문이 `폼 답변\n` 로 시작할 때만 "폼 답변" | 고객 360 타임라인에 빠지던 활동이 보인다. 기존 종류의 필터 축은 불변 |
| E4 | `796a6b5f` | `COMPASS_STAGE_LABEL` 을 Compass `lib/stages.ts` 정본으로(new=유입, quote=미팅, lost=종료) | 리드 보드 Compass 칩·등록 중복 경고의 단계 글자 |
| E5 | `339878d1` | 오늘 유입 카드 — Compass 리드를 `created_at` **또는** `last_inflow_at` 이 기간 안인 것으로 읽고 신규/재유입을 가른다(`lib/compass/inflow-window.ts` 신규) | Compass 신규 리드가 오늘 유입에 잡힌다(예전엔 재유입만). "신규 N · 재유입 k" 표시 |
| E6 | `fb1a0131` | `lib/external-crm/xiaoshouyi-write.ts` lead **create** 닫기(§3) | 이 저장소 쓰기 큐로 NEO lead 를 만들 수 없다. 수정·담당 이전은 열려 있다 |

손대지 않은 것(다른 세션 작업 중): `lib/compass/lead-contact-sync.ts`, `lib/server/lead-contact-compass-sync.ts`,
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
- **이미 쌓인 요청**: 닫기 전에 만들어진 lead create 요청이 있다면, 실행 시 NEO 호출 없이 `failed`(같은 사유)로 끝난다. 배포 전에 규모를 본다.
  `select status, count(*) from public.crm_write_requests where object_api_key = 'lead' and operation = 'create' group by 1`
- 다시 열어야 하면 `lead.operations` 에 `create` 를 되돌리고 `closedOperationReasons` 를 지운다. 그 전에 Compass 푸시와 같은 NEO 중복 사전 검사를 이쪽에도 둔다.

## 4. `lead-contact-compass-sync` 세션을 위한 정렬 메모

설계 문서(2026-09-14 매시간 반영)는 그대로 유효하다. 아래는 이번 변경과 어긋나지 않게 맞출 점이다. **결정은 그 세션 몫**이고, 여기서는 사실과 권고만 적는다.

### 4-1. "사람 손 활동"에서 기계 기록을 뺀다

설계 §3 은 `kind ∈ {call, sms, meeting, note, memo, stage_change}` 를 사람 손으로 본다. 그런데 **기계가 쓰는 `note` 가 있다** —
BD 설명회 적재는 신규 리드마다 actor `BD시트` note 를, 시트 크론은 시트 메모를 actor 없는 note 로·closed 전파를 actor `시트 동기화` note 로,
백필 스크립트는 actor `Claude` 로 남긴다. 이 note 들만 있는 리드가 `contacted` 로 잘못 넘어간다.

Compass 의 단일 정의(Compass `lib/leadContact.ts`, 활동 별칭 `a`)는 다음과 같다. 아래는 **명세 글자 그대로**이며, Compass 병합 뒤 실제 파일과 다시 대조한다.

```sql
-- HUMAN_ACTOR(a) — actor 가 null 인 기록도 기계로 본다
(a.actor is not null and a.actor not in ('Claude','BD시트','시트 동기화'))
-- ATTEMPT(a) — 부재중 콜도 시도. 알림톡은 자동이라 제외
(a.kind in ('call','sms'))
-- CONNECTED(a) — 연결된 콜(부재중·재통화 예약 제외) · 미팅 · 사람이 쓴 자동 머리 아닌 메모
((a.kind = 'call' and coalesce(a.body,'') !~ '^(부재중|재통화)') or a.kind = 'meeting' or (a.kind = 'note' and (a.actor is not null and a.actor not in ('Claude','BD시트','시트 동기화')) and coalesce(a.body,'') !~ '^(데모 일정|고객관리 이관 취소|종료 처리|종료 취소|BD인계 취소)'))
-- MISSED_ATTEMPT(a)
(a.kind = 'call' and coalesce(a.body,'') ~ '^(부재중|재통화)')
```

### 4-2. 판정은 `compass_lead_contact_v` 를 읽는다 (권고)

활동 `kind`·`body` 를 어드민에서 다시 해석하면 Compass 와 정의가 또 갈라진다(Compass 안에서도 이미 4벌이었다 — R6 G9).
§2 적용 뒤에는 `public.compass_lead_contact_v`(리드당 1행)를 읽는다.

| 컬럼 | 뜻 |
|---|---|
| `lead_id` | Compass 리드 id |
| `latest_inflow_at` | `coalesce(last_inflow_at, created_at)` |
| `first_attempt_at`·`last_attempt_at` | ATTEMPT 최초·최근 |
| `first_connected_at`·`last_connected_at` | CONNECTED 최초·최근 |
| `missed_since_inflow`·`sms_since_inflow` | 최신 유입 뒤 부재중 콜·문자 수 |

설계 §3 표에 대응시키면(제안): `contacted` = 매칭 행 중 하나라도 `stage ≠ new`, 또는 `first_attempt_at`·`first_connected_at` 중 하나가 not null.
뷰에 없는 kind: `stage_change` 는 `stage ≠ new` 가 덮는다. `memo`·`action`(고객관리 메모·액션)만 있고 단계가 `new` 인 리드가 있는지는
확인하지 않았다 — 필요하면 `compass_leads_v.care_stage is not null` 을 `contacted` 조건에 더한다.
설계 §6 "재유입" 러프함을 줄이고 싶으면 `last_attempt_at >= latest_inflow_at or last_connected_at >= latest_inflow_at` 로 "최신 유입 뒤 연락"만 셀 수 있다.

**뷰가 아직 없을 때(§2 이전)**: `compass_activities_v` 는 `actor`·`body` 를 내보내므로 4-1 조건을 걸 수는 있다. 다만 PostgREST 필터로는
`coalesce(body,'')` 의미(본문 null 인 사람 메모 포함)를 글자 그대로 옮기기 어렵다. 뷰 존재를 확인해 쓰고, 없으면 `bridge_down` 처럼 이번 실행을 건너뛰는 편이 정의가 갈라지지 않는다.
PostgREST 로 페이지를 끝까지 읽어야 하면 `lib/compass/paginate.ts` `fetchCompassPages`(E3)를 재사용한다 — 루프를 새로 쓰지 않는다.

### 4-3. 원문 전화에는 `norm_phone_key` 를 쓴다

- TS 에서 매칭하면 `lib/compass/normalize.ts` `normalizePhoneKey` 가 E2 로 이미 `normPhone` 등가다. 설계 §3 "`compass_leads_v.phone_key` 와 같은 식"은
  이제 "같은 결과(Compass 저장값 기준)"로 읽는다. **옛 K식(`^0082→82→^82→0`)을 원문 `public.leads.phone` 에 복사해 쓰지 않는다** —
  `+82 010…`·`0082-010…`·`10-…` 가 빠진다(R6 G7).
- SQL(RPC·뷰)에서 매칭하면 `public.norm_phone_key(l.phone)` 을 쓴다. `public.leads(public.norm_phone_key(phone)) where phone is not null` 표현식 인덱스가 있다 —
  조건에 `phone is not null` 을 같이 걸어야 플래너가 부분 인덱스를 쓴다.

### 4-4. 링크 우선, 전화 키 폴백 (이후)

R6 B-3 매칭 순서: ① `compass_lead_refs_v`(`system = 'home_lead'`, `external_id = public.leads.id`) ② 과도기에는 `public.leads.message` 의 `leadgen_id=` ↔ `meta_leadgen` ref
③ `norm_phone_key` 폴백. 지금 `home_lead` ref 는 0건이고(Compass 문의 인박스 이후에 생김) `meta_leadgen` ref 는 Compass 웹훅이 앞으로 쓴다.
그러니 이번 구현은 전화 키만으로 충분하되, 매칭 입력을 "후보 Compass lead id 목록"으로 받아 두면 링크를 끼우기 쉽다.

### 4-5. 병합 때 겹칠 수 있는 곳

- `tests/compass/overlay.test.ts` — E4(`796a6b5f`)가 기대 라벨 한 줄(옛 라벨 → 새 라벨)을 바꿨다. `overlay.ts` 의 대표 행 규칙을 내보내며 이 테스트를 고치면 그 줄에서 충돌한다.
- `lib/compass/bridge.ts` — E3·E5 가 기간 조회 5개 본문과 `getCompassLeadPhoneKeysByIds` 를 바꾸거나 더했다. 활동 kind 필터 조회는 새 함수로 더하면 겹치지 않는다.
- `COMPASS_STAGE_LABEL` 값이 바뀌었다(quote=미팅, lost=종료). 판정은 키(`lost`)로 하므로 영향 없음, 표시·감사 문구에서만 차이.

## 5. 이번에 하지 않은 것 / 미확인

- `lib/channel-talk-sync.ts` 전화 정규화(국가번호 미처리) 교체 — R6 B-3 권고. 역브리지 뷰는 `norm_phone_key` 로 흡수하지만 채널톡→리드 매칭 코드는 그대로다.
- `20260910_leads_contact_unique_dedupe.sql` 유니크 인덱스 — `saveLead` 재유입 업서트 전에는 적용 금지(재문의가 502·조용한 유실, R6 G8).
- Meta leadgen 단일 수신 전환, `home_neo_leads_v`(NEO 리드 상태 역류), Compass "홈페이지 문의" 인박스 — R6 B-5 3주+ 단계.
- 미확인: 마이그레이션은 로컬 임시 PG 17(스텁 테이블)로만 검증했다 — 서울 인스턴스(Supabase 기본 권한 포함)에서는 §2 확인 쿼리로 본다.
  `crm.lead_refs`·`crm.lead_contact_facts_v` 의 컬럼은 Compass 명세 기준이며, Compass 가 이름을 바꾸면 2번 재실행이 오류로 멈춘다(조용히 틀리지 않음).
  `crm_write_requests` 에 lead create 요청이 실제로 쌓인 적이 있는지는 DB 를 보지 않아 모른다(§3 쿼리).
