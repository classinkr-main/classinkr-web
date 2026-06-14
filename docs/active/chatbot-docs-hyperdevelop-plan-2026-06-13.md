# 챗봇 × 가이드 문서 하이퍼디벨롭 기획

작성일: 2026-06-13
범위: 공개 챗봇([lib/chatbot/service.ts](../../lib/chatbot/service.ts))과 가이드 문서 센터([lib/docs.ts](../../lib/docs.ts), `docs_*` 테이블)를 하나의 "셀프서브 + 상담 전환" 시스템으로 끌어올리는 기획 + 필요 자료 총정리.
선행 기준 문서: [chatbot-knowledgebase-faq-analytics-plan.md](./chatbot-knowledgebase-faq-analytics-plan.md), [docs-center-content-guidelines.md](./docs-center-content-guidelines.md), [docs-center-db-design.md](./docs-center-db-design.md), [content-roadmap-blog-events-docs-2026-06-10.md](./content-roadmap-blog-events-docs-2026-06-10.md).

---

## 0. 현재 상태 (baseline) — 무엇이 이미 되어 있나

이 기획은 "처음부터"가 아니라 아래 위에 쌓는다.

| 영역 | 구현됨 | 위치 |
|---|---|---|
| 챗봇 검색 | 키워드(ilike/trgm) → **시맨틱(임베딩)** 우선, 정적 폴백 | [lib/chatbot/service.ts](../../lib/chatbot/service.ts) `searchSupabaseSources` |
| 챗봇 답변 | **Gemini RAG 답변 생성** + 템플릿 무중단 폴백 | [lib/chatbot/llm.ts](../../lib/chatbot/llm.ts), `handleChatbotQuery` |
| 임베딩 | `gemini-embedding-001`(1536d) + `match_docs_ai_chunks` RPC + 백필 스크립트 | [supabase/migrations/20260613_docs_chunk_vector_search.sql](../../supabase/migrations/20260613_docs_chunk_vector_search.sql), [scripts/embed-docs-chunks.ts](../../scripts/embed-docs-chunks.ts) |
| 답변 모드 | direct_answer / doc_suggestion / clarifying / handoff / fallback | `composeAnswer` |
| 분석 | answer_events, citations, feedback, exact-match question clusters | `chatbot_*` 테이블 |
| 어드민 | 질문 통계, 클러스터, 추천 질문, 재인덱스 | `app/api/admin/chatbot/*` |
| 문서 | 정적 54개 + Supabase 하이브리드, 버전/리다이렉트/관계/피드백/검색로그 | `docs_*` 테이블, [lib/docs-content.ts](../../lib/docs-content.ts) |
| 문서 검색 | `/docs` 인라인 + **`/docs/search` 전용 + zero-result 로깅** | [app/docs/search/page.tsx](../../app/docs/search/page.tsx) |

**아직 안 된 전제 2가지 (모든 고도화의 선행조건):**
- **D1 — 문서 Supabase 단일화**: 정적 [lib/docs.ts](../../lib/docs.ts)가 여전히 노출 원천일 수 있다. [scripts/seed-docs.ts](../../scripts/seed-docs.ts)는 준비됨, 적용은 보류 상태(운영 DB 확인 필요).
- **임베딩 백필 미실행**: 컬럼·RPC·스크립트는 있으나 `docs_ai_chunks.embedding`이 비어 있으면 시맨틱 검색은 키워드로 폴백한다. → 백필 1회 실행 필요.

> 결론: "하이퍼디벨롭"의 1순위는 새 기능이 아니라 **이 두 전제를 닫는 것**이다. 그래야 아래가 전부 효과를 낸다.

---

## 1. 비전 — 3개의 목표

1. **셀프서브 해결률(Deflection)↑**: 상담 없이 챗봇/문서로 끝나는 비율을 끌어올린다.
2. **상담 전환 품질↑**: 못 끝낼 질문은 *맥락(transcript+의도+연락처)*을 들고 상담으로 깔끔히 넘긴다.
3. **콘텐츠 자가증식 루프**: 고객 질문 → 문서 갭 감지 → 초안 생성 → 승인 → 해결률 재측정. 운영팀이 손으로 FAQ를 쫓지 않아도 시스템이 갭을 제안한다.

---

## 2. 챗봇 디벨롭 요소

### Tier A — 전제 (먼저)
- **A1. 임베딩 백필 실행 + 시맨틱 검색 검증**: [scripts/embed-docs-chunks.ts](../../scripts/embed-docs-chunks.ts) 실행 → `match_docs_ai_chunks` 실측(유사도 분포·floor 0.3 튜닝).
- **A2. 답변 품질 가드레일**: 생성 답변이 근거 chunk에 *함의(entailment)*되는지 경량 검증 — Gemini에 "근거에 없으면 모른다고 답하라" 지시는 했으나, **자기검증 패스**(answer ⊆ sources?) 추가로 환각 차단.

### Tier B — 핵심 UX
- **B1. 멀티턴 대화**: 현재 `handleChatbotQuery`는 사실상 단발. 직전 N턴을 컨텍스트로 넣어 후속질문("그럼 그건 얼마예요?") 이해. → `chat_messages` 히스토리를 프롬프트에 주입.
- **B2. 스트리밍 응답**: `generateContent` → `streamGenerateContent`(SSE). 체감 지연 대폭 개선. 폴백 경로는 그대로.
- **B3. 인용 UI 고도화**: 답변 문장 ↔ 출처 chunk 매핑 표시, 신뢰도 배지, "이 문서 열기" 인라인 카드.
- **B4. 컨텍스트 트리거**: 페이지 인지형 추천질문(가격 페이지→요금 FAQ, /docs→관련 가이드), 체류·이탈 의도 기반 프로액티브 노출.

### Tier C — 고도화
- **C1. 시맨틱 질문 클러스터링**: 현재 *정확일치* 클러스터 → 질문 임베딩 기반 클러스터로 교체/보강. 진짜 FAQ 마이닝 가능.
- **C2. 에이전트형 액션(tool-use)**: 단순 답변을 넘어 *행동* — 데모 신청 폼 프리필, 견적 링크 생성, 행사 신청, 상담 예약. 도구는 화이트리스트 + 서버 검증.
- **C3. 모델 라우팅 + 캐시**: 쉬운 질문은 flash, 복잡/민감은 상위 모델. 자주 묻는 질문의 (질문 임베딩→답변) 캐시로 비용·지연 절감.
- **C4. 다국어**: 한/영/중(ClassIn 특성). `docs_articles`에 `locale` 컬럼(별도 테이블 불필요), 질문 언어 감지 → 해당 locale 문서 우선.
- **C5. 채널 확장**: KakaoTalk 채널 / ChannelTalk 딥 연동(전체 transcript+의도 동봉 핸드오프).

---

## 3. 가이드 문서 디벨롭 요소

### Tier A — 전제
- **A3. 문서 Supabase 단일화(D1)**: 어드민 편집이 실제 노출에 반영되도록 split-brain 종료. 이후 [lib/docs.ts](../../lib/docs.ts)는 타입/경로 헬퍼만.
- **A4. 구조화 콘텐츠 표준**: `content_json`에 steps/faq-item/media 블록 표준 → chunk 품질↑(섹션·FAQ 단위), 답변 카드화 가능.

### Tier B — 콘텐츠 자가증식 루프
- **B5. 문서 갭 자동 감지**: 매핑 문서 없는 질문 클러스터 + zero-result 검색어를 "문서 보강 큐"로 자동 적재(`/docs/search` 로깅 + `docs_search_events` 이미 수집 중).
- **B6. AI 초안 생성**: 갭 클러스터의 대표 질문 + 유사 답변 로그 + 인접 문서로 Gemini가 **문서 초안** 생성 → 어드민 승인 게이트(`draft` 상태) → 게시. 자동 게시 금지.
- **B7. 관계 그래프 자동 제안**: `docs_article_relations`를 임베딩 유사도로 자동 추천(수동 확정).

### Tier C — 운영 품질
- **C6. 문서 품질 스코어**: 조회수 × 낮은 helpful × 높은 챗봇 unresolved = 최우선 개선 큐(데이터는 이미 수집 중, 조인만).
- **C7. 신선도 운영**: 검토 기한 초과 문서 알림(`DOCS_REVIEW_STALE_DAYS` 이미 환경변수화됨).
- **C8. 변경 영향 재검증**: 문서가 바뀌면 그 문서를 인용하던 골든 질문을 재평가(아래 eval 루프).

---

## 4. 영역 공통 — 평가 루프 (가장 중요한 한 가지)

하이퍼디벨롭의 코어는 **측정 가능한 답변 품질**이다. 이게 없으면 "좋아진 것 같다"에서 못 벗어난다.

- **골든 Q&A 셋**: 대표 질문 50~100개 + 기대 출처 문서/정답 요지. 운영팀이 큐레이션.
- **자동 평가(LLM-as-judge)**: 골든 질문을 챗봇에 돌려 (검색 정확도 / 답변 충실도 / 환각 여부)를 LLM 심판이 채점. 회귀 게이트.
- **온라인 지표**: deflection rate, unresolved rate, not_helpful rate, handoff 사유 분포 — `chatbot-knowledgebase-faq-analytics-plan.md` §6의 view 위에 대시보드.
- **A/B**: 프롬프트·모델·floor·top-k 변경을 골든셋 + 온라인 지표로 비교.

---

## 5. 필요 자료 총정리 ("싹다 정리")

### 5.1 콘텐츠 자료 (운영팀이 채워야 할 것)
| 자료 | 용도 | 현재 | 액션 |
|---|---|---|---|
| 요금/결제/세금계산서 정책 | billing 답변 근거 | 부분 | `doc_type=reference`로 문서화 |
| 도입·온보딩 절차 | onboarding 답변 | 부분 | 가이드 보강 |
| 하드웨어/전자칠판 설치·A/S | hardware 답변 | 매뉴얼 일부 | reference/manual 정리 |
| 수업 장애·긴급 지원 | troubleshooting | 부분 | 증상(symptoms) 태깅 |
| FAQ 시드 | 초기 클러스터 | 없음 | 자주 묻는 30~50개 시드 |
| **골든 Q&A 셋** | 품질 평가 | **없음** | 50~100개 큐레이션(최우선) |
| 내부 상담 정책 | 핸드오프 기준 | 부분 | `visibility=internal` 문서 |

### 5.2 데이터 자료 (이미 쌓이는 것 — 활용)
- `chatbot_answer_events`(질문·모드·신뢰도·unresolved), `chatbot_feedback`(helpful), `chatbot_answer_citations`(근거 문서), `question_clusters`, `docs_search_events`(zero-result 포함), `docs_feedback`, `client_events`(조회수). → **마이닝 원천**. 신규 수집 거의 불필요, 조인·집계 중심.

### 5.3 스키마 (신규/변경 후보 — 마이그레이션 먼저)
- `docs_articles.locale`(다국어, C4) — 컬럼 추가.
- `docs_drafts` 또는 `docs_articles.status='draft'` 활용(AI 초안, B6) — 기존 status 재사용 권장.
- `chatbot_eval_runs` / `chatbot_eval_cases`(골든셋 평가 기록, §4) — 신규.
- `question_clusters`에 임베딩 컬럼(시맨틱 클러스터, C1).
- 답변 캐시 테이블 또는 KV(C3).
- 모든 변경은 `supabase/migrations/`에 파일 선작성(저장소 규칙).

### 5.4 인프라/설정 (자료라기보다 스위치)
| 항목 | 상태 | 필요 |
|---|---|---|
| `GEMINI_API_KEY` | 답변 생성에 사용 중 | 임베딩에도 동일 키 재사용 |
| `GEMINI_FAST_MODEL` | `gemini-2.5-flash` | 챗봇 기본 |
| 임베딩 백필 | 미실행 | `scripts/embed-docs-chunks.ts` 1회 |
| `USE_SUPABASE_DOCS` | 확인 필요 | D1 단일화 전제 |
| pgvector / HNSW | 마이그레이션 작성됨 | 적용 |
| 스트리밍(SSE) | 미구현 | B2 |

### 5.5 운영 자료 (사람/프로세스)
- 콘텐츠 오너(영역별 담당), 문서 검토 주기, FAQ 승인자, 핸드오프 후속 SLA.
- 갭 큐 → 초안 → 승인 → 게시 → 재측정 주간 리추얼.

---

## 6. 우선순위 로드맵

| 순위 | 항목 | 이유 | 노력 |
|---|---|---|---|
| 1 | A1 임베딩 백필 + A3 문서 단일화 | 모든 고도화의 전제 | S~L |
| 2 | §4 골든셋 + 자동 평가 | 품질을 *측정*해야 나머지가 의미 | M |
| 3 | B5 갭 감지 + B6 AI 초안 | 콘텐츠 자가증식 루프 시동 | M |
| 4 | B1 멀티턴 + B2 스트리밍 | 체감 품질 직결 | M |
| 5 | C1 시맨틱 클러스터 | 진짜 FAQ 마이닝 | M |
| 6 | A2 환각 가드레일 + B3 인용 UI | 신뢰 | S~M |
| 7 | C2 에이전트 액션 | 답변→행동 전환 | L |
| 8 | C4 다국어 / C5 채널 | 도달 확장 | L |

---

## 7. 지표 (KPI)
- Deflection rate(상담 없이 해결), Unresolved rate, not_helpful rate.
- 검색 정확도(골든셋 top-k 적중), 답변 충실도(judge 점수), 환각률.
- 문서 커버리지(클러스터 대비 매핑 문서 비율), zero-result 추이.
- 평균 지연/비용(모델 라우팅·캐시 효과).

## 8. 리스크 / 가드레일
- **환각**: 근거 기반 강제 + 자기검증(A2) + 민감 주제(결제·계약·장애) 저신뢰 시 강제 핸드오프(기구현).
- **PII**: 외부(Gemini) 전송은 `redacted` 질문만(기구현). 로그·클러스터는 정규화본.
- **비용**: flash 기본 + 캐시 + top-k 제한.
- **자동 게시 금지**: AI 초안은 항상 어드민 승인 게이트.
- **마이그레이션 선작성**: 스키마 변경은 `supabase/migrations/` 파일 먼저.

---

## 9. 첫 실행 슬라이스 (이번 분기 최소 단위)
1. 임베딩 백필 실행 → 시맨틱 검색 실측(A1).
2. 골든 Q&A 30개 + 자동 평가 스크립트(§4) → 현재 점수 baseline.
3. zero-result/무매핑 클러스터를 어드민 "문서 보강 큐"로 노출(B5).
4. 큐 1건을 AI 초안→승인→게시로 한 바퀴 돌려 루프 검증(B6).

이 슬라이스가 끝나면 "질문 → 갭 → 문서 → 재측정" 루프의 뼈대와 품질 baseline이 동시에 생긴다.
