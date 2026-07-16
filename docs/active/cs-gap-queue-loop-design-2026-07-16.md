# CS 보강 큐 린 루프 — 설계 (2026-07-16)

목적: 챗봇 → 내부 CS → 보강 큐 라인에서 끊긴 두 지점을 잇는다.
① 내부 CS 미해결 신호가 보강 큐로 자동 유입되지 않음. ② 회귀 검수가 캡처만 되고 판정 UI가 없어 dead-end.

관련 문서: [event-attendee-tracking-plan-2026-06-29.md](event-attendee-tracking-plan-2026-06-29.md)와 무관, 챗봇 파트 단독.

## 현황 진단 (탐색 결과 요약)

- 보강 큐(`/admin/docs?tab=gaps`, `components/admin/docs/DocsGapsPanel.tsx`)는 공개 챗봇 신호만 수신: 미매핑 `question_clusters` + 무결과 `docs_search_events`.
- 내부 CS 워크스페이스(`components/admin/cs-chat/InternalCsChatWorkspace.tsx`)의 "문서 보강 · 회귀 검수"는 정적 링크 카드일 뿐 데이터/액션 없음.
- 회귀 루프 절반 구현: 검토 시 `regression_candidate`/`needs_fix` 캡처는 되지만 스키마의 `pass`/`promoted`/`excluded` 판정에 도달하는 UI 없음.
- 내부 CS는 공개 챗봇과 동일 문서 리트리버를 공유(`lib/internal-cs-chat/context.ts` → `evaluateChatbotQuery`) → 보강 큐에서 문서가 발행되면 내부 CS 품질도 자동 개선. 루프의 출구는 이미 존재.
- 무음 실패 2곳: (a) 초안 저장 후 클러스터 갱신 `.catch(() => null)` (`DocsGapsPanel.tsx`), (b) "추천 질문" 2단계 호출(등록 POST + 상태 PATCH)의 부분 실패.

## 결정 사항

- 접근안: **A안 (린 루프)** — 기존 `question_clusters` 큐를 멀티소스로 확장, 새 테이블 없음.
- 유입 정책: **폴백 + 수정요청 모두 자동**, 검토 패널에 "보강 큐 제외" 체크박스만 추가.

## 설계

### 1. 유입 — 내부 CS → question_clusters (마이그레이션 불필요)

- 신규 `lib/internal-cs-chat/gap-ingest.ts`. 기존 `upsertQuestionCluster`(`lib/chatbot/service.ts`)를 확장해 `metadata.source`와 `metadata.internalCs` 참조를 받는다.
- 훅 2곳:
  - `app/api/admin/cs-chat/conversations/[id]/generate/route.ts`: assistant 저장 후 응답 origin이 fallback이면 `source: internal_cs_fallback`으로 유입.
  - 메시지 검토 PATCH 라우트: 수정 요청(changes_requested) 시 `source: internal_cs_review`로 유입. 요청 body의 `excludeFromGapQueue: true`면 건너뜀.
- PII 가드: 공개 챗봇의 redaction 헬퍼를 유입 전 동일 적용 (내부 질문엔 고객 실명이 섞일 수 있음).
- 유입은 side-effect: 실패해도 생성/검토 본 흐름을 막지 않되 `console.error`로 관측 (무음 `.catch(() => null)` 금지).
- 중복: `canonical_question` unique 인덱스가 흡수. 기존 행이면 `last_seen_at` 갱신 + `metadata.internalCs` 참조 누적(최대 10개 캡).

### 2. 보강 큐 UI (DocsGapsPanel)

- gap 항목에 소스 배지: 챗봇 / 내부CS·폴백 / 내부CS·검토 (`metadata.source` 기준).
- 필터 칩: 전체 / 챗봇 / 내부CS.
- 내부 CS 발 항목에 "대화 열기" 딥링크 → `/admin/cs-chatbot?conversation={id}`.

### 3. 워크스페이스 검수 강화 (InternalCsChatWorkspace)

- tools 탭 정적 카드 → 라이브 위젯: 기존 `GET /api/admin/docs/gaps` 응답을 클라이언트에서 소스별 카운트 (표시 캡 "30+", 새 API 없음).
- 회귀 검수 미니 패널 (tools 탭 신규 섹션): 회귀 후보(미판정) 메시지 목록 + 판정 버튼 4종 `pass / needs_fix / promoted / excluded` → 기존 메시지 PATCH 재사용.
- 신규 라우트 1개: `GET /api/admin/cs-chat/regression-candidates` (부분 인덱스 기존재).
- `?conversation=<id>` 쿼리 파라미터로 대화 탭 자동 오픈.
- 검토 패널에 "보강 큐 제외" 체크박스 (기본 미체크 = 자동 유입).

### 4. 루프 닫기 + 무음 실패 수리

- 클러스터가 문서에 매핑(approved + mappedArticleId)될 때 `metadata.internalCs` 참조가 있으면 questions PATCH 핸들러(서버)에서 원 메시지들 `regression_outcome = promoted` 자동 반영. 단 현재 outcome이 `not_evaluated`/`needs_fix`인 경우에만.
- 수리 (a): 초안 저장 후 클러스터 갱신 실패를 화면 표시 + 재시도 버튼.
- 수리 (b): recommended-questions POST가 `clusterId`를 받아 한 핸들러에서 등록+클러스터 published 처리. 클라이언트의 별도 PATCH 호출 제거.

## 인터페이스 계약 (구현 병렬화 기준)

1. `question_clusters.metadata.source`: `"chatbot_mvp_exact_match" | "internal_cs_fallback" | "internal_cs_review"`.
2. `question_clusters.metadata.internalCs`: `Array<{ conversationId: string; messageId: string }>` (최대 10, 최신 우선).
3. 메시지 검토 PATCH body 추가 필드: `excludeFromGapQueue?: boolean`.
4. recommended-questions POST body 추가 필드: `clusterId?: string` — 있으면 서버가 클러스터 `status=published`까지 처리.
5. `GET /api/admin/cs-chat/regression-candidates` → `{ items: Array<{ id, conversationId, excerpt, capturedAt, outcome, reviewState }> }` (limit 50, 미판정 우선 정렬).
6. 딥링크: `/admin/cs-chatbot?conversation=<uuid>` → chat 탭 + 해당 대화 선택.
7. questions PATCH: `mappedArticleId` 설정 + `metadata.internalCs` 존재 시 서버 측 promoted 전파.

## 테스트 / 검증

- vitest: gap-ingest(폴백/검토 훅, 중복, 제외 플래그, redaction), promoted 전파, 통합 추천 질문 엔드포인트, regression-candidates 라우트. 기존 `tests/internal-cs-chat/` 패턴 준수.
- 게이트: `npx eslint app components lib --max-warnings=0` + `npm run build`.

## 동시성 하드닝 (2026-07-16, Codex 독립 리뷰 P1 반영)

- 추천 질문 발행 멱등: `chatbot_recommended_questions.cluster_id` 전용 컬럼 + unique 인덱스로 SELECT-then-INSERT 레이스 제거 ([supabase/migrations/20260716_chatbot_recommended_questions_cluster_id.sql](../../supabase/migrations/20260716_chatbot_recommended_questions_cluster_id.sql) — 백필·기존 중복 정리 포함, 적용 필요). POST 는 ON CONFLICT DO NOTHING upsert 로 전환, 충돌 시 승자 행을 재조회해 선착 우선으로 재사용한다. 마이그레이션 미적용 환경에서는 기존 비원자 경로로 폴백하며 `console.error` 로 관측된다. `metadata.clusterId` 는 API/표시 계약으로 유지하고 `cluster_id` 는 중복 방지 키로만 쓴다.
- `upsertQuestionCluster` 병합 레이스: 신규 insert 가 `canonical_question` unique 경합에서 지면 승자 행에 재조회→재병합하고, `metadata.internalCs` 병합(read-modify-write)은 읽은 스냅샷을 jsonb 동등 필터(낙관적 가드)로 걸어 끼어든 쓰기를 감지한다. 두 경우 모두 재시도 1회, 최종 시도는 가드 없이 커밋해 종료를 보장한다. unique 인덱스 전제는 [supabase/migrations/20260716_question_clusters_canonical_unique_guard.sql](../../supabase/migrations/20260716_question_clusters_canonical_unique_guard.sql)로 방어적 재선언(기적용 환경 no-op).

## 비범위 (이번에 안 함)

- 큐레이션 지식(knowledge.ts) DB화 및 corrected_content 지식 승격.
- 무결과 검색어의 상태화(클러스터 승격).
- 워크스페이스 5번째 탭 (통합 작업대).
- 의미적(임베딩) 클러스터링.
