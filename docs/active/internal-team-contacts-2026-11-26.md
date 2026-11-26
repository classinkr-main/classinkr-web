# 한국팀·본사 담당자 표(DB) — 갈매봇 담당자 안내 연결

상태: 구현(2026-11-26) · 마이그레이션 서울 프로젝트 **미적용**
범위: `internal_team_contacts` 표, 설정 › 담당자 표(`/admin/settings?tab=contacts`), `app/api/admin/team-contacts/*`,
`lib/internal-cs-chat/contact.ts`·`contact-deps.ts`의 한국 담당표 연결, 위컴 단체방 이름 가림

## 1. 왜

담당자 안내(`resolveContact`, 결정형 B2)의 한국 담당표는 코드의 빈 배열(`KR_CONTACT_ROWS`)이었다. 그래서 "견적 누구한테 물어?"
같은 한국 지사 업무 질문은 늘 역할 이름이나 어드민 계정 권한(`hardware.finalize` 등)으로만 답했다. 사람 이름·연락 방법은
저장소 밖 자료라 코드에 적을 수 없다 — 그래서 DB 표로 옮기고 어드민에서 사람이 채운다.

## 2. 무엇이 어디에

| 관심사 | 정본 |
| --- | --- |
| 표·제약·권한 | [20261126_internal_team_contacts.sql](../../supabase/migrations/20261126_internal_team_contacts.sql) (롤백 짝: `supabase/rollbacks/20261126_internal_team_contacts.rollback.sql`) |
| 행 모양·입력 검사(연락처 값 거절) | `lib/team-contacts/model.ts` |
| 업무 영역 목록(KR_TOPICS·HQ_DOMAINS에서 만든다) | `lib/team-contacts/areas.ts` |
| 저장소(목록·만들기·고치기·비활성화·확인일·CSV 넣기, 안내용 60초 캐시) | `lib/repositories/team-contacts.ts` |
| CSV 양식 읽기 | `lib/internal-cs-chat/contact.ts` `parseKrContactsCsv`(`readKrContacts`와 같은 양식) |
| CSV 가져오기 계획(만들기·고치기·그대로·건너뜀) | `lib/team-contacts/csv-import.ts` |
| 안내 연결 | `lib/internal-cs-chat/contact-deps.ts` `buildContactDeps` → `loadKrContacts` |
| 화면 | `components/admin/settings/TeamContactsPanel.tsx` (설정의 "담당자 표" 탭) |
| API | `app/api/admin/team-contacts/route.ts`·`[id]/route.ts`·`import/route.ts` |

표 칸: `id, org('KR'|'HQ'), area, role, name, deputy, channel, prep[], admin_link, note, confirmed_at, confirmed_by, active, sort_order, created_at, updated_at`.

- `area` — KR은 `KR_TOPICS` 키(견적 `quote`, 계약 `contract` …), HQ는 `HQ_DOMAINS` 키(`camera`, `network` …). 허용 목록은 코드가 정하고 API가 검사한다.
- `channel` — 연락 방법 **종류**만(위컴 1:1, KR 운영방 …). 전화번호·이메일 값 칸은 없고, 어느 칸에든 전화·이메일 꼴 값이 들어오면 API가 400으로 거절한다(`lib/ops-tools/redact.ts`의 가림 판정을 쓴다). 연락 방법 칸에는 주소(웹훅·링크)도 넣지 않는다.
- 조직·영역마다 활성 행은 하나(부분 유니크). 대리 담당은 `deputy` 칸. 비활성화는 `active=false`(물리 삭제 없음).
- RLS 켜고 정책 없음 + `anon`·`authenticated` 권한 회수 — 서버 service role만 읽고 쓴다.

## 3. 권한과 화면

- 읽기(GET): `SUPER_ADMIN`·`ADMIN`(사람 이름이 들어 있어 BRANCH·EDITOR는 막는다).
- 쓰기(행 추가·수정·비활성화·다시 켜기·확인일 찍기·CSV 넣기): `SUPER_ADMIN`만. 경계는 `app/api/admin/team-contacts/team-contacts-response.ts`의 역할 상수이고, 화면의 버튼 숨김은 편의다.
- 감사 기록(`audit_logs`)에는 조직·영역·바뀐 칸 이름만 남기고 사람 이름은 옮겨 적지 않는다.
- 화면: 한국 지사/본사 전환, 비활성 행 보기, "비어 있는 영역" 칩(그 영역 질문은 역할·계정 권한으로만 답한다), 행 카드(1차·대리·연락 방법·준비물·링크·확인일·확인자), 수정 폼, CSV 가져오기.
- 갈매봇 링크 목록·⌘K에 "담당자 표"(`/admin/settings?tab=contacts`)가 있다(쓰기 필요 역할 SUPER_ADMIN 표시).

### CSV 가져오기

회사 드라이브의 초안 CSV(양식: 업무 영역, 예시 질문, 1차 담당 역할, 1차 담당자, 대리 담당자, 연락 방법, 준비해 갈 것,
관련 어드민 화면 링크, 비고[, 확인일])를 올리면 미리보기 → "N행 넣기" 순서다.

- 한국 지사(KR) 행만. 영역마다 활성 행이 있으면 고치고 없으면 만든다. CSV에 없는 영역은 건드리지 않는다.
- **CSV의 빈 칸은 지금 값을 지우지 않는다.** 지우려면 화면에서 고친다.
- 건너뛰는 줄(이유를 줄 번호와 함께 보인다): 업무 영역 빈 줄·모르는 영역·1차 담당자 빈 줄(양식 행)·같은 영역 반복·연락처 값이 든 줄.
- 형식이 틀린 확인일(YYYY-MM-DD 아님)·`/admin`으로 시작하지 않는 링크는 비우고 알린다. CSV 확인일로 넣은 행의 확인자는 "가져온 사람 (CSV)".
- 따옴표 안의 쉼표·줄바꿈(구글 시트 내보내기 꼴)을 받는다. 200KB·200행 이하.

## 4. 안내 연결

```
갈매봇 어드민 위젯(/api/admin/ai/chat) ┐
위컴 수신구(lib/wecom/aibot-server.ts) ┴→ buildServerOrchestratorDeps → buildContactDeps → resolveContact
```

- 두 입구가 같은 `buildContactDeps`를 쓴다. 내부 CS 코파일럿(`/admin/cs-chatbot`)은 담당자 안내를 부르지 않는다(본사 라우팅은 `escalation-routing.ts`를 직접 쓴다). 상담 내역 연결(`lib/admin-ai/server/consultation-deps.ts`)은 고객 찾기만 빌려 쓴다.
- `loadKrContacts`는 한국 지사 업무 갈래(②)에서만 부른다. 활성 KR 행만 넘긴다(본사 행·비활성·모르는 영역은 뺀다).
- 읽기는 인스턴스 메모리 60초 캐시다. 쓰기 뒤에는 그 인스턴스 캐시를 비우고, 다른 인스턴스는 길어야 60초 뒤에 새 값을 본다.
- **실패**(표 미적용·timeout 등)는 캐시하지 않는다. 그때는 빈 표로 답하고(지금까지의 역할·계정 권한 답 그대로), 카드 `gaps` 맨 앞에 "한국 담당자 표를 읽지 못해 …"(미적용이면 미적용 안내)를 적는다 — 갈매봇 카드 메모 줄에 보인다.
- 행의 `role`이 있으면 카드의 역할로 쓰고, 없으면 `KR_TOPICS`의 역할을 쓴다.

### 위컴 단체방 — 이름 대신 역할만

단체방 답은 방 전체에 보이고, 방에는 연결표에 없는 사람도 있다. 이중 잠금이다.

1. 연결 단계: `aibot-server.ts`가 단체방이면 `buildServerOrchestratorDeps({ contactNames: false })` → `buildContactDeps({ names: false })` → `deps.roleOnly`.
   `resolveContact`는 한국 지사·모름 카드에 담당표 1차·대리 이름과 어드민 계정 이름(권한으로 찾은 사람·지사장)을 싣지 않고 역할만 싣는다(`namesHidden: true`).
   연락 방법·준비물 칸에 이름을 적어 둔 경우 그 글도 싣지 않는다.
2. 브리지: `groupScopedDeps`가 `namesHidden`이 없는 한국 지사·모름 카드를 `groupRoleOnlyContact`로 비운다(담당·대리·연락 방법·근거 없이 갈래와 준비물만).

확인 전 상태(2026-11-26 이전): 단체방의 한국 지사 카드는 어드민 계정 권한으로 찾은 사람 이름과 지사장 이름을 그대로 냈다. 표가 채워지면 담당표 이름까지 나갈 자리였다 — 위 1·2로 막았다.

본사 카드는 그대로다 — 문서의 본사 담당 표(`HQ_DOMAINS`, 위컴 멘션 대상)라 단체방에서도 이름과 멘션이 나간다(이전 결정 유지).
이것도 가릴지는 사람이 정할 일이다.

## 5. 본사(HQ) 행 — 덮지 않고 보충만(설계 메모, 미구현)

지금은 HQ 행을 **저장만** 한다. 본사 카드는 계속 코드의 `HQ_DOMAINS`(정본: `docs/active/cs-error-cases-workflow-rules-2026-10-02.md` §7, 문서 줄 근거·기준일 포함)를 쓴다.

덮지 않는 이유: `HQ_DOMAINS`는 문서 줄 근거·기준일·위컴 멘션을 함께 들고 있고 본사 분류(`classifyHqDomain`)와 엮여 있다. 한국 쪽 SUPER_ADMIN의 표 편집이 본사 라우팅을 조용히 바꾸면 안 된다.

보충 규칙(다음 단계 구현안):

1. `ResolveContactDeps`에 `loadHqSupplements?: () => Promise<{ rows; failed; warning }>`를 더하고 `hqCard(domain, candidates, supplement)`가 받는다. 본사 갈래(③)에서만 부른다.
2. **바꾸지 않는 칸**: `who`(primaryContact), 위컴 멘션, `evidence`의 문서 근거, `verifiedAt`(문서 기준일).
3. **더하는 칸**: 근거에 "담당자 표 보충: {역할} (확인 {confirmed_at})" 한 줄, `prepare` 뒤에 `prep`(중복 제거), 문서에 `channelNote`가 없을 때만 `channel` 종류, `HQ_DOMAINS`에 2차 담당이 없을 때만 `deputy`를 `backup`으로.
4. **어긋남 알림**: 표의 `name`이 문서 `primaryContact`에 없고 `confirmed_at`이 문서 기준일보다 늦으면 `gaps`에 "문서 담당과 담당자 표가 다릅니다 — 업무규칙 §7 갱신 필요"를 적는다(조용히 바꾸지 않고 드러낸다).
5. 단체방(`roleOnly`)에서는 표에서 온 이름(name·deputy)은 싣지 않는다. 문서 이름은 지금처럼.
6. 시험: 보충이 `who`·멘션을 바꾸지 않는다 · 어긋남이면 gaps · 실패면 지금과 같은 카드 · 단체방에서 표 이름이 없다.

## 6. 마이그레이션 적용(하지 않음)

이 작업에서는 파일만 만들었고 어느 DB에도 적용하지 않았다. 적용 절차·확인 조회는 [DB 마이그레이션 런북](db-migration-runbook.md)의
"2026-11-26 한국팀·본사 담당자 표" 절이 정본이다. 코드는 미적용 DB에서도 돈다(안내는 빈 표 + 실패 표시, 화면은 적용 안내, 쓰기 503).

## 7. 검증

```bash
npx vitest run tests/internal-cs-chat/contact-team-table.test.ts tests/internal-cs-chat/contact-deps.test.ts \
  tests/repositories/team-contacts.test.ts tests/lib/team-contacts.test.ts tests/api/admin-team-contacts-route.test.ts \
  tests/api/wecom-aibot-bridge.test.ts tests/db/internal-team-contacts-migration.test.ts
```
