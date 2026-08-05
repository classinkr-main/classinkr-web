# 채널톡 헬프센터 → 문서센터·챗봇·리드마그넷 동기화

작성일: 2026-06-17
연계: [chatbot-docs-activation-runbook-2026-06-14.md](./chatbot-docs-activation-runbook-2026-06-14.md)
목적: 채널톡(Channel Talk) 헬프센터 문서를 우리 DB·문서센터·챗봇·리드마그넷에 반영하는 파이프라인의 현재 상태와 운영 절차를 정리.

원문 헬프센터: https://docs.channel.io/classinkorea/ko

---

## 1. 무엇이 들어오나 (텍스트 + 이미지 + 표 + 첨부)

[scripts/sync-channel-documents.ts](../../scripts/sync-channel-documents.ts)가 Channel **Documents Open API**(`document-api.channel.io/open/v1`)에서 아티클을 받아 문서센터 테이블로 동기화한다. 구조화된 `body` 블록을 우선 사용해 다음을 마크다운으로 **보존**한다.

- 이미지(`image`) — `![alt](cdn)` (블록에 없고 `bodyHtml`에만 있는 콘텐츠 이미지는 추가 보강. 이모지/아이콘 자산은 노이즈로 제외)
- 표(`table`/`tableRow`/`tableCell`) — 마크다운 표로 변환
- 첨부파일(`file`) — `[📎 파일명](cdn)` (파일명 대괄호 제거)
- 콜아웃/인용(`callout`/`blockquote`) — `>` 인용
- 마크(굵게/기울임/인라인코드/하이퍼링크), 리스트, 헤딩, 구분선
- 표지 이미지(`coverImageUrl`)

> "영상"은 헬프센터에서 대부분 화면 캡처 이미지/GIF로 들어오며 이미지 경로로 보존된다. 실제 `<video>`/`<iframe>` 임베드가 등장하면 `htmlToMarkdown`이 링크로 보존한다.

## 2. 무엇을 거르나

- 채널 `state`(published/draft/unpublished) **전수 크롤이 기본** — 내용이 있는 초안(예: PC 설치, 교사 추가, AI 기능)은 유용하므로 포함한다.
- 빈 "작성중" 스텁(본문 < 24자)과 정확히 `테스트`/`test`/`샘플`/`sample` 제목은 제외(챗봇 답변 품질).
- 채널톡 Documents 자체 메타 문서(`8472`, `8473`)와 짧은 중복 스텁(`44553`)은 제외한다. 챗봇은 ClassIn Korea 운영 자료만 검색하도록 유지한다.
- 자동생성 제목 보정: `260407_코스 탈퇴 규정` → `코스 탈퇴 규정`, `한국어20260323_1109` → 본문 첫 제목에서 추출.
- `--published-only`로 채널 published 상태만 좁힐 수 있다.

## 3. 어디에 저장되나

- `docs_categories`: `admin` = "[관리자] 사용 가이드"
- `docs_articles`: slug `channel-talk-document-{articleId}`, `status=published`
  - visibility: 기본 `unlisted`(공개 색인 제외, 챗봇·관리자 가이드에서 사용). 채널 published 글은 `--public`으로 공개 승격 가능. draft는 항상 `unlisted`.
  - `updated_by=sync-channel-documents` — 관리자 수기 편집본(`classin-admin` 등)과 구분된다.
  - 본문에는 원문 URL을 넣지 않는다. 외부 원문 추적값은 `content_json.sourceUrl`/chunk metadata에만 보관해 챗봇 답변은 자체 운영 자료처럼 읽히게 한다.
- `docs_ai_chunks`: 1800자 단위 청크 + 메타(sourceUrl, imageCount, fileCount, channelDocumentState)
- 정합성 reconcile: 전수 크롤 시, 이번 세트에 없는 **자동 동기화 문서**는 `archived`로 내리고 청크를 정리한다. 수기 편집본은 건드리지 않는다.

## 4. 어떻게 참조되나

- **챗봇(RAG)**: [lib/chatbot/service.ts](../../lib/chatbot/service.ts)가 `docs_ai_chunks`를 `status=published`, `visibility ∈ {public, unlisted}`, `noindex=false`로 조회 → 동기화 문서가 그대로 검색 대상. 임베딩 백필([scripts/embed-docs-chunks.ts](../../scripts/embed-docs-chunks.ts)) 후 시맨틱 검색, 그 전엔 키워드 폴백.
- **가이드(문서센터)**: 위 `admin` 카테고리 문서가 곧 관리자 사용 가이드 표면.
- **리드 마그넷**: [data/lead-magnets.json](../../data/lead-magnets.json)의 `sourceLinks`에 주제별 채널 헬프센터 공개 URL을 인용([app/resources/[slug]/page.tsx](../../app/resources/%5Bslug%5D/page.tsx)에서 렌더). 매핑: 운영 진단·90일 로드맵→회원가입/학생초대/수업참여, 전자칠판 체크리스트→배송·설치, SW 비교→사용자 가이드, 리소스 절감→수업 다시보기, 관리자 대시보드→채팅·할일·캘린더.

## 5. 필요한 env & 변수/옵션 가이드

```bash
# 채널톡 Documents API 인증 키 (Space Settings > Integration > API Authentication Key Management)
CHANNEL_DOCS_ACCESS=...
CHANNEL_DOCS_ACCESS_SECRET=...
# (없으면 CHANNEL_DOCUMENTS_ACCESS 또는 CHANNEL_TALK_ACCESS 로 자동 폴백)

# Supabase 연동 변수
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=... # 또는 SUPABASE_SECRET_KEY

# Gemini 임베딩 연동 변수 (gemini-embedding-001, 1536d)
GEMINI_API_KEY=...
GEMINI_EMBED_MODEL=gemini-embedding-001 # 선택 사항 (기본값: gemini-embedding-001)
GEMINI_EMBED_DIM=1536                   # 선택 사항 (기본값: 1536)
```

CLI 실행 옵션:
- `--dry-run`: 쓰기 없이 파싱/동기화 미리보기
- `--dump`: 추출된 마크다운 전문 스탬프 확인
- `--published-only`: 채널 published 상태 아티클만 선택
- `--public`: published 글의 visibility를 public으로 승격 (기본값: unlisted)
- `--ids <id1,id2>`: 특정 아티클 ID만 핀포인트 동기화

---

## 6. 운영 절차 (헬프센터 갱신 시 재동기화)

```bash
# 1) 미리보기(쓰기 없음). --dump 로 추출 마크다운 전문 확인
npx tsx scripts/sync-channel-documents.ts --dry-run
npx tsx scripts/sync-channel-documents.ts --dry-run --ids <id> --dump

# 2) 전수 동기화 + 정합성 reconcile
npx tsx scripts/sync-channel-documents.ts

# 3) 임베딩 백필(누락분만, 멱등)
npx tsx scripts/embed-docs-chunks.ts

# 4) DB 파이프라인 계약 및 RAG 쿼리 검증
npm run check:alpha-db
npx vitest run tests/chatbot/
```

---

## 7. 현재 상태 (2026-08-05 동기화 실행 결과)

- 동기화 문서: **54개** (전체 67개 아티클 중 빈 스텁·작성중 10개, 테스트 1개, 메타 문서 2개 제외)
- 청크: **297개** (임베딩 백필 297/297 100% 완료, `gemini-embedding-001` 1536차원)
- DB 정합성: `npm run check:alpha-db` 파이프라인 검증 통과 (`docs_articles` 140개 중 54개, `docs_ai_chunks` 889개 중 297개)
- 단위/통합 테스트: `tests/chatbot/` 38개 테스트 파일 (184개 테스트) 100% Pass

---

## 8. 후속 (follow-up)

- **Cron 자동화**: 현재 문서 동기화는 수동 스크립트. 대화 동기화([app/api/cron/channel-talk-sync](../../app/api/cron/channel-talk-sync/route.ts))처럼 주기적 cron(동기화→임베딩)으로 승격 검토. (Documents API는 변경 webhook을 제공하지 않으므로 주기 동기화가 적합)
- **공개 승격 판단**: 채널 published 문서를 `--public`으로 공개 문서센터에 노출할지 콘텐츠 검수 후 결정.
- **영상 임베드**: 헬프센터에 실제 동영상 임베드가 추가되면 표현 방식(썸네일/링크) 보강.

