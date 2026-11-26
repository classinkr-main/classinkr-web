# CRM 활동 기록 수기 적재 형식 — 고객 이력(결제·견적·AS·API·CS 케이스)

- 상태: **형식만 정함. 적재는 사람이 한다**(이 문서를 쓴 작업은 DB 에 아무것도 넣지 않았다).
- 읽는 곳: 갈매봇 "고객 이력" 갈래(`lib/admin-ai/server/customer-history.ts`, 서버 연결 `customer-history-deps.ts`).
  "가나학원 결제·견적 문제 있었나? 누가 맡아?"에 이 행들과 NEO 스냅숏 담당(`crm_neo_customer_snapshots.owner_name`)으로 답한다.
- 표: `public.crm_customer_events`(만든 마이그레이션 `supabase/migrations/20260626_crm_customer_events.sql`).
  새 칸·새 색인·새 마이그레이션은 없다. 지금 있는 칸과 제약에 맞춘 형식이다.
- 예시의 기관·사람 이름은 가짜다("가나학원", "담당자 A"). 실제 고객 이름·연락처를 이 문서나 커밋에 적지 않는다.

## 1. 한 행의 형식

전달받은 정리본(고객사별 결제·견적·AS·API·CS 사건 기록) 한 건을 한 행으로 넣는다. 한 파일에 여러 건이면 여러 행이다.

| 칸 | 넣는 값 | 규칙·근거 |
|---|---|---|
| `target_type` | `'neo_account'` | CHECK `('lead','neo_account','customer','deal','unknown')`. 고객사 단위 기록은 NEO 계정에 단다. 아직 NEO 계정이 없는 리드면 `'lead'` + 리드 id |
| `target_id` | NEO 계정 id(`crm_neo_customer_snapshots.account_id`) | 고객 360·통합 고객 키 `neo:{account_id}` 와 같은 값. 이름으로 잇지 않는다 — 아래 적재 틀은 스냅숏에 있는 계정만 넣는다 |
| `target_label` | 계정 이름(`crm_neo_customer_snapshots.account_name`) | 기록 화면 목록 표시용 사본. 적재 틀이 스냅숏에서 채운다 |
| `source_type` | `'manual_note'` | CHECK 목록(최신 `20260717_crm_events_site_inflow.sql`) 안의 값. 수기 메모는 "연락"으로 치지 않는다 — 최초 응답·최근 연락 집계에 들어가지 않는다(`RESPONSE_SOURCE_TYPES`) |
| `source_id` | 전달본 **영문 파일 이름**(예: `gana-billing-2026-11.md`) | 영문·숫자·점·밑줄·대시만, 80자 이하. 갈매봇 카드의 "출처"에 그대로 보인다(`수기 기록 · gana-billing-2026-11.md`). 한글·공백·경로(`/`)는 쓰지 않는다 — 카드가 싣지 않는다 |
| `occurred_at` | 그 일이 **실제로 있었던** 날짜·시각(KST 오프셋을 붙인다, 예: `2026-11-20 10:00+09`) | NOT NULL. 적재한 날을 넣지 않는다 — 기록 화면 "이번 주 요약"이 이 값으로 센다 |
| `title` | 한 줄 제목(40자 안쪽이 보기 좋다) | NOT NULL. 갈매봇은 40자에서 자른다 |
| `summary` | 요지 한두 문장 | 갈매봇은 60자에서 자르고, 연락처·"○○ 원장님" 같은 호칭 앞 이름은 가린다. 그래도 고객 연락처·개인 이름은 처음부터 넣지 않는다 |
| `body` | 비워 둔다(`null`) 또는 내부 메모 원문 | 갈매봇은 읽지 않는다. 원문 전체가 필요하면 전달본 파일을 본다 |
| `tags` | 아래 2절의 태그 배열, 예: `'{billing,quote}'` | `TEXT[] NOT NULL DEFAULT '{}'`, GIN 색인 `crm_customer_events_tags_idx`. **태그가 없으면 갈매봇 고객 이력에 잡히지 않는다** |
| `next_actions` | `'[{"title":"새 카드 등록 안내","ownerName":"담당자 A","dueAt":"2026-11-28T00:00:00+09:00","done":false}]'` | `JSONB NOT NULL DEFAULT '[]'`. 키 이름은 `title`·`ownerName`·`dueAt`·`done`(읽는 쪽 `nextActionsFromJson`). 갈매봇은 아직 안 끝난 첫 건만 보인다. 없으면 `'[]'` |
| `owner_name` | 그 건을 맡은 사내 담당 표시 이름, 모르면 `null` | 담당 범위 목록(`withCompassOwner` — `owner_name`·`created_by`)이 이 값으로 거른다. 고객사의 영업 담당은 여기가 아니라 NEO 스냅숏에서 읽는다 |
| `created_by` | 적재한 사람의 어드민 표시 이름 | 화면 저장 경로와 같은 뜻(`adminActorName`) |
| `sentiment` | `'neutral'`(기본) 또는 `'risk'`(아직 풀리지 않은 문제) | CHECK `('positive','neutral','risk')`. `risk` 는 고객 360 위험 신호를 올린다 — 이미 해결된 과거 건은 `neutral` |
| 나머지 칸 | 넣지 않는다(기본값) | `attendees`·`decisions`·`blockers` 는 `'[]'`, `meeting_purpose`·`stage_signal`·`public_event_id`·`attendee_origin`·녹음 칸은 `null` |

## 2. 태그 낱말

갈매봇은 질문의 주제 말로 태그를 고른다(`customerHistoryTagsOf`). 주제 말이 없으면("가나학원 이슈 있었나?") 다섯 태그 전부를 본다.

| 태그 | 넣는 건 | 질문 주제 말 |
|---|---|---|
| `billing` | 결제 실패·입금 지연·미수·환불·정산·세금계산서 | 결제·입금·수금·미수·미납·정산·환불·청구·세금계산서 |
| `quote` | 견적 오류·재발행·금액 다툼·승인 지연 | 견적 |
| `as` | 하드웨어 고장·수리·교체·불량 | AS·A/S·수리·고장·파손·불량·교체 |
| `api` | API·연동 오류·키 발급 문제 | API·연동 |
| `cs-case` | 위 넷에 안 들어가는 CS 사건(에스컬레이션한 장애 등) | CS 케이스 |

- 소문자 그대로 쓴다(`cs-case` 는 대시). 한 건이 둘에 걸치면 둘 다 단다(`'{billing,quote}'`).
- 다른 태그(화면에서 쓰는 수기 라벨 등)를 같이 달아도 된다 — 갈매봇은 위 다섯 개 중 하나라도 있으면 잡는다(`tags && 배열`).

## 3. 제약과 다시 넣어도 되는지(마이그레이션 파일 확인 결과)

- 유니크 색인은 두 개뿐이고 둘 다 부분 색인이다.
  - `crm_customer_events_capture_source_uidx (source_type, source_id) WHERE source_type = 'sheet' AND source_id LIKE 'capture:%'`(`20260806_crm_capture_idempotency.sql`)
  - `crm_customer_events_channel_source_uidx (source_type, source_id) WHERE source_type = 'site_inflow' AND source_id LIKE 'channel:%'`(`20261125_crm_events_channel_source_unique.sql`)
- 그래서 `manual_note` 행에는 DB 가 막는 중복이 **없다**. 한 파일(`source_id`)에서 여러 행이 나와도 색인에 걸리지 않지만, 같은 파일을 두 번 넣으면 두 번 쌓인다.
  아래 적재 틀은 `(source_type, source_id, target_type, target_id, title)` 이 같은 행이 있으면 넣지 않는다 — 같은 파일 안에서 같은 고객의 제목은 겹치지 않게 쓴다.
- `getOrCreateCrmCustomerEventBySource`(코드의 멱등 만들기)는 `(source_type, source_id)` 하나로 찾으므로, 한 파일에 여러 행이 있는 수기 적재에는 쓰지 않는다.
- RLS 는 `is_active_admin()` 정책 하나다. 적재는 서비스 키 연결이나 SQL Editor(관리자)로 한다.
- 화면 저장 경로(`POST /api/admin/crm/events`)는 `next_actions` 로 할 일(`crm_tasks`)을 만들지만, SQL 적재는 만들지 않는다. 할 일이 필요하면 고객 화면에서 따로 만든다.
- 이 적재는 마이그레이션이 아니다. `docs/active/db-migration-runbook.md` 의 적용 목록에 넣지 않는다.

## 4. 적재 틀(사람이 실행 — 같은 파일을 다시 돌려도 안전)

`values` 의 값만 바꾼다. 스냅숏에 없는 계정 id 는 넣지 않는다(고아 행 방지).

```sql
-- 전달본: gana-billing-2026-11.md (가짜 예시)
insert into public.crm_customer_events
  (target_type, target_id, target_label, source_type, source_id, occurred_at, title, summary,
   tags, next_actions, owner_name, created_by, sentiment)
select 'neo_account', v.account_id, s.account_name, 'manual_note', v.source_id, v.occurred_at::timestamptz, v.title, v.summary,
       v.tags::text[], v.next_actions::jsonb, v.owner_name, v.created_by, v.sentiment
  from (values
    ('acc-100', 'gana-billing-2026-11.md', '2026-11-20 10:00+09', '카드 결제 실패 재처리',
     '정기 결제 카드가 만료돼 두 번 실패했다.', '{billing}',
     '[{"title":"새 카드 등록 안내","ownerName":"담당자 A","dueAt":"2026-11-28T00:00:00+09:00","done":false}]',
     '담당자 A', '담당자 A', 'neutral'),
    ('acc-100', 'gana-billing-2026-11.md', '2026-11-05 15:30+09', '견적 금액 재발행',
     '부가세 포함 여부가 달라 견적을 다시 냈다.', '{quote,billing}', '[]', '담당자 A', '담당자 A', 'neutral')
  ) as v(account_id, source_id, occurred_at, title, summary, tags, next_actions, owner_name, created_by, sentiment)
  join public.crm_neo_customer_snapshots s
    on s.source_system = 'xiaoshouyi' and s.account_id = v.account_id
 where not exists (
   select 1 from public.crm_customer_events e
    where e.source_type = 'manual_note'
      and e.source_id = v.source_id
      and e.target_type = 'neo_account'
      and e.target_id = v.account_id
      and e.title = v.title
 );
```

- 넣은 뒤 확인(파일별 건수·태그):

```sql
select e.source_id, e.target_id, count(distinct e.id) as rows, array_agg(distinct t) as tags
  from public.crm_customer_events e
  cross join lateral unnest(e.tags) as t
 where e.source_type = 'manual_note' and e.source_id = 'gana-billing-2026-11.md'
 group by e.source_id, e.target_id;
```

- 되돌리기(그 파일에서 넣은 행 전부를 지운다 — 같은 `source_id` 로 사람이 화면에서 만든 행은 없다는 것을 먼저 확인한다):

```sql
delete from public.crm_customer_events
 where source_type = 'manual_note' and source_id = 'gana-billing-2026-11.md';
```

## 5. 갈매봇이 읽는 방식

- 고객: 질문 속 이름을 통합 고객 이름과 맞춘다(담당자 찾기와 같은 `findCustomersInText`), 없으면 열린 고객 화면. 여럿이면 첫 고객만 읽고 나머지 이름을 밝힌다.
- 기록: 그 고객 키의 대상(`neo:{id}` → `neo_account`, `lead:{id}` → `lead` + 확정 연결된 NEO 계정)에서 태그가 겹치는 최근 5건(`listCrmCustomerEventsByTags` — 제목·요지·다음 할 일·출처 칸만, 본문·녹음은 읽지 않는다)과 전체 건수.
- 담당 영업: NEO 계정은 `crm_neo_customer_snapshots.owner_name`(기본값 `담당 미지정`은 "지정되지 않음"), 리드는 `leads.assigned_to`. UID(`uid`)가 있으면 카드에 싣는다.
- 권한: 기록 글(제목·요지·다음 할 일)은 상담 내역 찾기와 같은 역할(`canReadConsultationContent`)만 본다. 아니면 건수와 담당 영업만.
- 위컴: 단체방은 이 갈래를 통째로 막는다("1:1 로 물어봐 주세요" — `groupScopedDeps`, 서버 연결도 단체방에서는 고객 이력을 싣지 않는다). 1:1 답은 맨 앞에 "내부용 — 그대로 보내지 마세요" 줄을 단다.
- 판정 표: `tests/admin-ai/fixtures/customer-history-table.ts`(상담 내역 갈래·CRM 상담 단계·조회·담당자 질문과 겹치지 않는지 `tests/admin-ai/server/customer-history-router.test.ts` 가 고정한다).
