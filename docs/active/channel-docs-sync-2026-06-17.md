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
- 자동생성 제목 보정: `260407_코스 탈퇴 규정` → `코스 탈퇴 규정`, `한국어20260323_1109` → 본문 첫 제목에서 추출.
- `--published-only`로 채널 published 상태만 좁힐 수 있다.

## 3. 어디에 저장되나

- `docs_categories`: `admin` = "[관리자] 사용 가이드"
- `docs_articles`: slug `channel-talk-document-{articleId}`, `status=published`
  - visibility: 기본 `unlisted`(공개 색인 제외, 챗봇·관리자 가이드에서 사용). 채널 published 글은 `--public`으로 공개 승격 가능. draft는 항상 `unlisted`.
  - `updated_by=sync-channel-documents` — 관리자 수기 편집본(`classin-admin` 등)과 구분된다.
- `docs_ai_chunks`: 1800자 단위 청크 + 메타(sourceUrl, imageCount, fileCount, channelDocumentState)
- 정합성 reconcile: 전수 크롤 시, 이번 세트에 없는 **자동 동기화 문서**는 `archived`로 내리고 청크를 정리한다. 수기 편집본은 건드리지 않는다.

## 4. 어떻게 참조되나

- **챗봇(RAG)**: [lib/chatbot/service.ts](../../lib/chatbot/service.ts)가 `docs_ai_chunks`를 `status=published`, `visibility ∈ {public, unlisted}`, `noindex=false`로 조회 → 동기화 문서가 그대로 검색 대상. 임베딩 백필([scripts/embed-docs-chunks.ts](../../scripts/embed-docs-chunks.ts)) 후 시맨틱 검색, 그 전엔 키워드 폴백.
- **가이드(문서센터)**: 위 `admin` 카테고리 문서가 곧 관리자 사용 가이드 표면.
- **리드 마그넷**: [data/lead-magnets.json](../../data/lead-magnets.json)의 `sourceLinks`에 주제별 채널 헬프센터 공개 URL을 인용([app/resources/[slug]/page.tsx](../../app/resources/%5Bslug%5D/page.tsx)에서 렌더). 매핑: 운영 진단·90일 로드맵→회원가입/학생초대/수업참여, 전자칠판 체크리스트→배송·설치, SW 비교→사용자 가이드, 리소스 절감→수업 다시보기, 관리자 대시보드→채팅·할일·캘린더.

## 5. 필요한 env

```
CHANNEL_DOCS_ACCESS / CHANNEL_DOCS_ACCESS_SECRET   # Documents Open API (Space Settings > Integration)
  (없으면 CHANNEL_TALK_ACCESS / CHANNEL_TALK_ACCESS_SECRET로 폴백)
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_SECRET_KEY
GEMINI_API_KEY                                     # 임베딩 백필(gemini-embedding-001, 1536d)
```

## 6. 운영 절차 (헬프센터 갱신 시 재동기화)

```bash
# 1) 미리보기(쓰기 없음). --dump 로 추출 마크다운 전문 확인
npx tsx scripts/sync-channel-documents.ts --dry-run
npx tsx scripts/sync-channel-documents.ts --dry-run --ids <id> --dump

# 2) 전수 동기화 + 정합성 reconcile
npx tsx scripts/sync-channel-documents.ts

# 3) 임베딩 백필(누락분만, 멱등)
npx tsx scripts/embed-docs-chunks.ts

# 4) 확인: 챗봇에 "수업 참여 어떻게 해요?" → docs 출처로 답하는지
```

## 7. 현재 상태 (2026-06-17 동기화 결과)

- 동기화 문서: **57개** (내용 보유, 초안 포함 / 빈 스텁·테스트 제외)
- 이미지 보존: 51개 문서, **347장** / 첨부파일 포함
- 청크: **309개** → 임베딩 백필 적용
- 관리자 수기 편집본 6건(`classin-admin`) 보존 확인

## 8. 후속 (follow-up)

- **Cron 자동화**: 현재 문서 동기화는 수동 스크립트. 대화 동기화([app/api/cron/channel-talk-sync](../../app/api/cron/channel-talk-sync/route.ts))처럼 주기적 cron(동기화→임베딩)으로 승격 검토. (Documents API는 변경 webhook을 제공하지 않으므로 주기 동기화가 적합)
- **공개 승격 판단**: 채널 published 문서를 `--public`으로 공개 문서센터에 노출할지 콘텐츠 검수 후 결정.
- **영상 임베드**: 헬프센터에 실제 동영상 임베드가 추가되면 표현 방식(썸네일/링크) 보강.
