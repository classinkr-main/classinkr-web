# 홈페이지 · Compass · NEO(어드민 CRM) 싱크 실패와 재로딩 정리 (2026-11-23)

브랜치 `fix/crm-sync-cache`. 운영 로그·DB 는 이번에 읽지 못했다(Vercel·Supabase 연결이 이 프로젝트 범위에 닿지 않음) — 아래 원인은 코드 근거다.

## 원인

1. **NEO 동기화가 함수 상한에 끊기면 30분 잠김** — `lib/external-crm/xiaoshouyi-sync.ts`
   - 두 동기화 라우트에 `maxDuration` 이 없고 체인에 시간 예산이 없었다. 객체 × 최대 20페이지 × (요청당 30초 타임아웃·재시도 3회)라
     큰 런은 300초를 넘길 수 있다. 끊기면 잠금 행이 `running` 으로 남는다.
   - 잠금 판정은 `running` 이면 무엇이든 30분, heartbeat 는 객체가 끝날 때만. 잠금 확인이 `force` 확인보다 먼저라 「강제」도 못 푼다.
   - 그 30분 동안 수동·크론 동기화는 HTTP 200 `{ ok: true, locked: true }` — 성공처럼 보이며 아무것도 안 한다.
2. **동기화 뒤에도 옛 화면** — `revalidateTag(tag, "max")` 는 Next 16 에서 "오래됨" 표시만 한다(다음 한 번은 옛 값).
   - 크론 경로는 매출 태그만 걸고 NEO 고객·지역 지도 캐시는 건드리지 않았다(`lib/admin-crm-customers-neo.ts` 주석에 적힌 빈칸).
   - NEO 값을 품은 바깥 캐시(통합 고객·우선순위 큐 스냅샷, os-summary 재연락 원천 300초, CRM 개요)는 어느 경로도 만료하지 않았다.
   - 소스 링크 확정·해제·생성, 쓰기 요청, 딜 라이트 라우트도 "max" — 버튼을 누르고 다시 불러온 화면이 옛 값.
3. **Compass 새로고침이 서버에 닿지 않음** — 화면은 `?force=1` 을 붙이지만 `compass-pipeline`·`compass-summary` 라우트가 읽지 않아
   브리지 60초 인스턴스 메모가 그대로 나갔다.
4. **5분 크론(리드 상태 MKT 반영)이 리드가 많으면 통째로 건너뜀** — 링크(`compass_lead_refs_v`)·id 조회를 100·200개 청크로 **순차** 조회하는데
   메모 마감이 10초라, 신규·연락함 리드가 수천 건이면 마감을 넘겨 `Compass read timeout` → 전체 `bridge_down`(503).
5. **홈페이지 → Compass 리드 전달**은 코드상 정상(실시간 + 매시 대조, event_id 멱등). Compass 는 `source` 를 거르지 않아 `chatbot` 도 받는다.
   다만 라벨이 없어 경로가 영문 `chatbot` 으로 찍혔다(crm 저장소에서 고침). 운영 실패는 주로 env(`COMPASS_BRIDGE_URL`·
   `COMPASS_LEAD_WEBHOOK_TOKEN` ↔ Compass `HOME_LEAD_TOKEN`) 불일치로 난다(11-06 토큰 누락 선례).

## 고친 것

- `xiaoshouyi-sync.ts`: 시간 예산(`XIAOSHOUYI_SYNC_TIME_BUDGET_MS`, 기본 240초)으로 페이지·객체를 멈추고 잠금을 정상으로 닫는다(남은 객체는
  `skipped: time-budget`, `complete: false`). heartbeat 를 페이지마다. 이 서버의 런은 heartbeat 6분 없으면 죽은 런으로 닫는다
  (로컬 MCP 스크립트 런은 30분 유지).
- 두 동기화 라우트 `maxDuration = 300`, 캐시는 `lib/external-crm/sync-cache.ts` → `sync-cache-tags.ts` 의 `neoSync`·`crmSourceLinks` 묶음을
  `{ expire: 0 }` 으로 즉시 만료(새 데이터가 있을 때만).
- 소스 링크·쓰기 요청·딜 라이트 라우트: `{ expire: 0 }`.
- `lib/compass/bridge.ts`: `runWithFreshCompassReads` — `?force=1` 이면 끝난 메모를 건너뛴다(진행 중 조회는 공유). 두 Compass 라우트에 배선.
  링크·id 청크는 4개씩 동시에.

## 운영에서 할 일(코드 밖)

- NEO: 운영 env `XIAOSHOUYI_BASE_URL` + 토큰(또는 서비스 OAuth 4종)이 있는지 설정 화면(연동 상태)에서 확인. 2026-09-14 문서 기준 운영 접속 설정이 없어
  크론이 건너뛰는 중이었다(`docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md` §3 표).
- Compass 전달: 홈페이지 `COMPASS_BRIDGE_URL`·`COMPASS_LEAD_WEBHOOK_TOKEN` 과 Compass `HOME_LEAD_TOKEN` 이 같은 값인지.
- 배포 뒤 확인: `/api/cron/lead-contact-sync?dryRun=true`(CRON_SECRET) 가 200 인지, NEO 수동 동기화 뒤 고객 목록·개요가 바로 바뀌는지.
