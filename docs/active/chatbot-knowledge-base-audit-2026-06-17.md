# 챗봇 지식베이스 마스터 감사 / 인벤토리 (2026-06-17)

연계 문서:
- [docs/superpowers/specs/2026-06-17-chatbot-knowledge-base-expansion-design.md](../superpowers/specs/2026-06-17-chatbot-knowledge-base-expansion-design.md) — 이 작업의 설계(백본)
- [docs/active/channel-docs-sync-2026-06-17.md](./channel-docs-sync-2026-06-17.md) — 채널톡 동기화 런북
- [docs/active/chatbot-docs-activation-runbook-2026-06-14.md](./chatbot-docs-activation-runbook-2026-06-14.md) — 챗봇 docs 활성화 런북

> 목적: "클래스인 관련 콘텐츠가 무엇이 / 어디에 / 챗봇이 검색 가능한 형태로 있는가"를 한 장에 정리한다. 빈 곳과 애매한 곳을 드러내고, 새 콘텐츠 추가 절차를 고정한다.

---

## 1. 개요

챗봇·하이브리드 RAG·시드·임베딩·핸드오프 파이프라인은 **이미 가동 중**이다. 그린필드가 아니라 기존 자산 위에 빈 레이어를 얹는 작업이다. 검색은 **하이브리드**로 동작한다 — 벡터 검색(Gemini 임베딩 + Supabase pgvector, `gemini-embedding-001`, 1536d), 키워드 검색(ILIKE), 그리고 임베딩 미적용 시 정적 폴백. 지식 원천(SSOT)은 [lib/docs.ts](../../lib/docs.ts)의 `DocArticle[]`이며, 파이프라인은 `lib/docs.ts → scripts/seed-docs.ts(Supabase 적재) → scripts/embed-docs-chunks.ts(Gemini 임베딩) → 하이브리드 검색`이다. 품질 게이트는 [data/chatbot-golden-set.json](../../data/chatbot-golden-set.json)과 [tests/chatbot/](../../tests/chatbot/)(classification / rag-relevance / quality-regression)으로 잡는다. 챗봇 조회 조건: `status=published`, `visibility ∈ {public, unlisted}`, `noindex=false`(참조: [lib/chatbot/service.ts](../../lib/chatbot/service.ts)).

---

## 2. 콘텐츠 인벤토리

"챗봇 검색 가능"의 기준 = `lib/docs.ts`(→ Supabase `docs_articles`/`docs_ai_chunks`) 또는 채널톡 동기화로 `docs_articles`에 적재된 콘텐츠. 코드/컴포넌트/JSON에만 있는 콘텐츠는 챗봇이 직접 검색하지 못한다(신규 DocArticle의 1차 원천으로만 쓰임).

| 콘텐츠 | 위치 | 분량(확인값) | 챗봇 검색 가능? |
|---|---|---|---|
| 공개 가이드 문서(SSOT) | [lib/docs.ts](../../lib/docs.ts) | **56개**(아래 카테고리별) | **예** — seed + embed로 검색 대상 |
| 포지셔닝/브랜드 보이스/가격 가이드 | [lib/classin-positioning.ts](../../lib/classin-positioning.ts) | 정체성·honest limits·90일 로드맵 등 | 아니오(코드 전용) → B2~B4의 원천 |
| 고객 후기 | [lib/testimonials.ts](../../lib/testimonials.ts) | **7개** | 아니오(코드 전용) → B1의 원천 |
| 케이스 스터디 | [components/sections/CaseStudies.tsx](../../components/sections/CaseStudies.tsx) | **7개** | 아니오(컴포넌트 전용) → B1의 원천 |
| 제품/페르소나/니즈 | [docs/active/prd.md](./prd.md) | 페르소나·문제정의 | 아니오(문서 전용) → B2의 원천 |
| 진단 리드마그넷 | [data/lead-magnets.json](../../data/lead-magnets.json) | 리드마그넷 7종(설계 인용: 46·49문항 진단 + red flags) | 아니오(데이터 전용) → B2/B4의 원천, 별도 트랙 |
| SW 기능 인벤토리(SSOT) | [docs/active/classin-software-feature-inventory.md](./classin-software-feature-inventory.md) | 기능 정의 + 금지어 목록 | 아니오(문서 전용) → B5의 원천 |
| 제품 템플릿 | [lib/product-templates.ts](../../lib/product-templates.ts) | 견적 구성 요소 | 아니오(코드 전용) → B3의 원천 |
| 요금제 데이터 | [lib/billing/plans.ts](../../lib/billing/plans.ts) | 플랜 정의 | 아니오(코드 전용) → B3의 원천 |
| 공개 FAQ | [lib/public-faq.ts](../../lib/public-faq.ts) | **18문항**(카테고리별 그룹) | 아니오(코드 전용) — 챗봇이 직접 색인하지 않음 |
| 채널톡 헬프센터 동기화본 | `docs_articles`(slug `channel-talk-document-{id}`) | 런북 기준 ~57문서 / 이미지 347장 / 청크 309개 임베딩(재확인 권장) | **예** — `visibility=unlisted` 기본, 챗봇 검색 대상 |

`lib/docs.ts` 카테고리 분포(현재 확인값, 56개):

| category | 개수 |
|---|---|
| admin | 14 |
| hardware | 10 |
| student | 10 |
| teacher | 10 |
| start | 6 (→ 이번 작업으로 증가) |
| software | 5 (→ 이번 작업으로 +1) |
| board | 1 |

> ⚠️ 수치 정합 메모
> - 설계 문서는 `lib/docs.ts`를 **58개**로 표기하나, 본 감사 시점 실제 코드는 **56개**다(카테고리 합 14+10+10+10+6+5+1=56). 설계 작성 후 통합/정리로 줄었을 가능성 → 신규 5종 추가 전 기준선은 **56**으로 본다.
> - 공개 FAQ는 설계 표기 16문항과 달리 현재 **18문항**(카테고리 그룹 구조).
> - 채널톡 수치(문서 ~57 / 이미지 347 / 청크 309)는 [channel-docs-sync-2026-06-17.md](./channel-docs-sync-2026-06-17.md) **런북 기준 인용**이다. (설계 본문에는 임베딩 454로 인용된 곳도 있어 불일치 → 실제 Supabase 카운트로 **재확인 권장**.)

---

## 3. 커버리지 매트릭스

"검색 가능 상태": 가능 = `lib/docs.ts`/채널톡으로 챗봇이 검색 / 부분 = 일부 주제만 / 코드전용 = 챗봇 미색인.

| 주제 | 주요 출처 | 검색 가능 상태(현재) | 이번 작업으로 보강? |
|---|---|---|---|
| 정체성(학원 OS·줌과 차이) | `academy-system-os-positioning`, classin-positioning.ts | 가능(핵심 doc 존재) | B2가 반론 대응 강화 |
| 제품 HW(전자칠판/카메라/마이크) | hardware 10종 docs | 가능 | — (S65 스펙은 갭) |
| 제품 SW(개요/교실도구/AI) | software 5종 docs | 가능 | **B5**가 전체 지도 추가 |
| 앱 기능("어디서 무엇을") | feature-inventory.md, teacher/student docs | 부분(개별 doc 산재, 통합 지도 없음) | **B5 신규** |
| 현장 사례/후기 | testimonials.ts, CaseStudies.tsx | **코드전용(검색 불가)** | **B1 신규** |
| 고객 니즈/페르소나/반론 | prd.md, lead-magnets.json | **코드전용** | **B2 신규** |
| 가격·가치·견적 | classin-positioning.ts, product-templates.ts, billing/plans.ts | **코드전용** | **B3 신규(unlisted)** |
| 도입 여정(기간/순서/효과) | positioning(90일), lead-magnets(액션플랜) | 부분(onboarding 일부) | **B4 신규** |
| FAQ | public-faq.ts | 코드전용(챗봇 직접 색인 X) | 미보강(공개 FAQ 표면용) |
| 관리자 운영 | admin 14종 docs | 가능 | — |
| 문제해결(로그인/화면공유 등) | troubleshooting 라우팅 + 관련 docs | 부분 | — (상세 워크플로는 갭) |

---

## 4. 이번 작업으로 추가되는 것 (신규 DocArticle 5종)

모두 [lib/docs.ts](../../lib/docs.ts)에 `updatedAt: "2026-06-17"`로 추가. 기존 56개와 겹치지 않는 빈 레이어.

| # | slug | category | visibility | 한 줄 정의 |
|---|---|---|---|---|
| B1 | `customer-stories` | start | public | 과목/유형별(국어·영어·과학·입시·온라인·하이브리드) 사례와 원장·강사 후기 요약 — "우리 같은 학원 사례?"에 답한다. |
| B2 | `why-classin-needs` | start | public | "흩어진 도구가 운영비·강사 리소스를 잡아먹는다"를 도입부로, 구형 전자칠판 페인과 "줌이면 충분?"류 반론 대응. |
| B3 | `value-and-cost-framing` | start | **unlisted** | 견적 구성요소와 "전자칠판 가격 ✕ → 학원 시스템 OS ◯" 프레이밍 — **하드 금액 단정 금지, 상담 연결**. |
| B4 | `adoption-journey-90days` | start | public | 진단 → 파일럿(쇼룸) → 온보딩 → 정착 → 90일/3개월 성공지표, 평균 도입 3개월. |
| B5 | `app-capabilities-map` | software | public | 학습활동·교실도구·AI·권한 기반 관리자 데이터 가시성·EDB·API 자동화 사례를 한 장으로 묶은 기능 지도(SSOT 용어 준수). |

> 추가 후 start는 6→11, software는 5→6, 전체 56→61이 된다.

---

## 5. 남은 갭 (다음 후보)

- **학생/학부모 목소리**: 현재 후기·사례는 원장·강사 중심. 학생/학부모 관점 콘텐츠 부재.
- **경쟁 전환(마이그레이션) 스토리**: 타 전자칠판/툴 → ClassIn 전환 경험을 별도 doc으로 뺄지 미정(현재 B2/B3에 흡수).
- **S65 전자칠판 스펙**: 미확정 → 단정 금지. board-lineup-specs에 추가 불가, 확정 시 보강.
- **상세 LMS 워크플로**: 출석·성적 리포트 추출 등 단계별 실무 흐름이 얕음(채널톡 측 다수 "작성중").
- **회사 소개서**: repo 밖 외부 자료(Google 공유 드라이브/클래스인 폴더) 대기. 받으면 별도 DocArticle 또는 B-시리즈에 흡수.
- **리드마그넷**: [data/lead-magnets.json](../../data/lead-magnets.json) 기반 산출물은 챗봇 KB와 **별도 트랙**. 이번 범위 포함 여부는 사용자 결정 대기.

---

## 6. 오픈 퀘스천 / 애매한 것들

설계의 오픈 퀘스천 절을 옮기고 운영 메모를 더한다.

1. **회사 소개서**: repo에 없음 → 사용자 파일 제공 예정. 받으면 흡수.
2. **현장 대화 노트**: 2026-06-17 전사 반영 완료 → 설계의 "현장 지식" 절로 흡수, B1~B5의 1차 원천.
3. **리드마그넷 별도 트랙**: 리드 스코어링/후속 자동화 포함 여부 미정(사용자 확인 대기).
4. **경쟁 비교 전용 문서**: 안드로이드 디스플레이형 vs 윈도우/OPS 내장 통합형 비교를 별도 doc으로 뺄지 — 현재 기본은 B2/B3 흡수.
5. **S65 스펙 미확정**: 단정 금지, 갭으로 표기.
6. **한국 결제·정산 경계**: 포지셔닝상 약한 영역 → B3에서 "결제·리포트·오프라인 출석은 API/외부 연동"으로 솔직히 안내.
7. **채널톡 vs 수기 문서 중복**: 회원가입/유료전환/학생초대/채팅·할일 등이 기존 doc과 채널톡판으로 중복. 슬러그가 달라 충돌은 없고, 채널톡판은 스크린샷 포함이 강점. 리랭커의 "doc당 1개·총 2개" 다양성 선택으로 완화. 정책은 미확정.
8. **채널톡 메타글 노이즈**: 채널톡 자체 메타글(스페이스/아티클 알아보기)과 스텁은 답변 품질에 노이즈 → 설계의 `EXCLUDE_ARTICLE_IDS`(8472, 8473, 44553) 제외 검토. 미래의 새 ClassIn 글은 자동 포함 유지가 목표.
9. **B3 visibility(unlisted vs public)**: 가격 민감성 때문에 `unlisted`(챗봇·상담 참고, 공개 색인 제외) 기본. 공개 원하면 `public` 승격.
10. **가격 표현 정책**: 정확한 금액·계약 조건은 **항상 상담 연결**. 견적 구성요소·비교 관점만 정성적으로. 챗봇 답변에 하드 금액 단정 금지.

---

## 7. 운영 런북

### 7-1. 새 콘텐츠(DocArticle) 추가 절차

1. [lib/docs.ts](../../lib/docs.ts)에 `DocArticle` 객체 추가 — slug 유일·category 유효(`start/software/hardware/teacher/student/admin/board`) 확인. 작성 계약(브랜드 보이스, SSOT 용어, 수치·후기 창작 금지, `chatbotSummary` 1~2문장, `relatedSlugs` 상호 링크) 준수.
2. Supabase 적재:
   ```bash
   npx tsx scripts/seed-docs.ts
   ```
3. 임베딩 백필(누락분만, 멱등):
   ```bash
   npx tsx scripts/embed-docs-chunks.ts
   ```
4. [data/chatbot-golden-set.json](../../data/chatbot-golden-set.json)에 신규 케이스 추가(`expectCategory` / `expectMode` / 선택 `expectPathIncludes`).
5. 챗봇 테스트 + 품질 게이트:
   ```bash
   # tests/chatbot/{classification,rag-relevance,quality-regression}
   npx eslint app components lib --max-warnings=0
   npm run build
   ```

### 7-2. 채널톡 갱신 시 재동기화

```bash
# 전수 동기화 (초안 포함) + 임베딩
npx tsx scripts/sync-channel-documents.ts --include-unpublished
npx tsx scripts/embed-docs-chunks.ts
```

- ⚠️ **반드시 `--include-unpublished`로 실행**한다. 기본 published-only로 돌리면 정합성 reconcile가 채널 초안(예: PC 설치, 교사 추가, AI 기능) 문서를 `archived`로 내려 **커버리지가 퇴행**한다.
- 수기 편집본 보존: `updated_by=classin-admin`인 관리자 수기 편집 문서는 sync가 건드리지 않는다(`updated_by=sync-channel-documents`와 구분).
- 미리보기는 `--dry-run`(+ `--dump`로 추출 마크다운 확인), 공개 승격은 `--public`. 자세한 동작은 [channel-docs-sync-2026-06-17.md](./channel-docs-sync-2026-06-17.md) 참조.

---

## 8. 적용 결과 (2026-06-17 실행)

- **신규 DocArticle 5종 추가 완료** → [lib/docs.ts](../../lib/docs.ts) 56 → **61개**(start 6→11, software 5→6). seed dry-run·eslint·build 모두 통과(슬러그 유일·relatedSlug 전부 해소).
- **Supabase 적재·임베딩(신규분 한정)**: `seed-docs.ts --slugs`(수기편집본 보호 위해 전체 seed 회피) → 5 articles / **48 chunks** 적재 → `embed-docs-chunks.ts`로 **48 chunks 임베딩(0 실패)**. 신규 doc이 벡터 검색 활성.
  - 비고: `--slugs` 사용으로 신규 doc → 기존 doc 관계(`docs_article_relations`)는 미생성(관련문서 UI 링크만 영향, 챗봇 검색은 청크 기반이라 무관). 전체 관계가 필요하면 full seed — 단 `updated_by=classin-admin` 수기편집본 덮어쓰기 주의.
- **골든셋 +12 케이스** 추가([data/chatbot-golden-set.json](../../data/chatbot-golden-set.json)) + **게이트 테스트 +5**([tests/chatbot/new-docs-relevance.test.ts](../../tests/chatbot/new-docs-relevance.test.ts)). `npx vitest run tests/chatbot` = **48/48 통과**.
- **채널톡**: 본 세션에서 재동기화/좁히기 **하지 않음**. 오늘자 전수 크롤(런북 기준 ~57문서)이 이미 적재·임베딩된 상태였고, published-only로 좁혔다면 reconcile가 초안 문서를 archived로 내려 **퇴행**했을 것 — 의도적 전수 크롤 결정을 그대로 유지.
- **품질 게이트**: `npx eslint app components lib --max-warnings=0` clean / `npm run build` 성공(61개 docs 정적 프리렌더, customer-stories 등 포함).

### 8-1. 검색 라우팅 실측(정적 폴백 기준) — 후속 판단 필요

신규 doc이 **top 소스로 잘 잡히는** 질문: 도입 사례/후기(`customer-stories`), 도입 순서·기간(`adoption-journey-90days`), 앱 기능 전체(`app-capabilities-map`), 견적 구성(`value-and-cost-framing`은 "견적 구성" 표현에서), 도입 전 고민(`why-classin-needs`는 "흔한 고민" 표현에서).

신규 doc이 **1순위가 안 되는**(기존 동작이 가로챔) 케이스 — 의도적 동작이라 이번에 손대지 않음:
1. "왜 필요?", "줌이면 충분?", "전자칠판 있는데 왜 바꿔?" → 하드코딩 **curated positioning** 라우트가 `academy-system-os-positioning`(또는 hardware) 우선. `why-classin-needs`로 보내려면 `buildCuratedSources()`(service.ts) 조정 필요.
2. "도입 비용?", "비싸?" → `adoption-journey-90days`/positioning이 우선, `value-and-cost-framing`은 "견적 구성" 표현에서만 1순위.
3. "무슨 기능 있어?", "효과 언제?" 같은 **도메인 키워드 없는** 질문 → `isDomainRelatedQuestion` 필터로 `general`/`fallback` 처리(검색 전 차단).

→ 위 질문들을 신규 doc으로 라우팅하려면 `buildCuratedSources()`/도메인 키워드 사전 보강이 후속 작업 후보. 단, "왜 필요?"에 포지셔닝 doc이 답하는 것도 타당하므로 변경은 가치 판단 사안.
