# 챗봇 상위 1% 경험 재설계 (세그먼트 라우팅 2단계)

> 작성: 2026-06-24 · 상태: 설계 확정(구현 미착수) · 담당 파트: 챗봇(`.claude/agents/chatbot.md`)
> 검증 게이트: `npx eslint app components lib --max-warnings=0` + `npm run build` + `vitest run tests/chatbot/`
> 관련 SSOT: `lib/classin-positioning.ts`, `data/chatbot-golden-set.json`, 플레이북 [05-chatbot](playbook/05-chatbot.md)

## 0. 한 줄 정의

현재의 단일 패스 챗봇을 **세그먼트 라우팅 2단계 파이프라인**으로 진화시킨다. Stage1(UNDERSTAND)에서 4개 비즈니스 세그먼트·의도·clarify 여부를 빠르게 판별하고, Stage2(RESPOND)에서 세그먼트별로 검색 전략·페르소나 톤·답변 형태·CTA·핸드오프 정책을 분기한다. Gemini 스택은 유지하되 프롬프트·분류 로직·구조는 재설계한다.

## 1. 확정된 의사결정 (relitigate 금지)

- **접근**: Approach B = 세그먼트 라우팅 2단계. (A=단일패스 강화는 대화지능 부족, C=풀 에이전트는 쾌적도와 충돌하여 기각)
- **엔진**: Gemini 유지. fast=`gemini-2.5-flash`, reasoning/advanced=`gemini-2.5-pro`. **벤더·티어 변경 없음**. 프롬프트/분류/구조 재설계는 허용·권장.
- **4개 세그먼트**: `prospect`(신규 도입 검토) / `pricing`(가격·견적) / `existing_ops`(기존고객 운영·사용법) / `support_complaint`(기술지원·장애 + 컴플레인·불만).
- **기억**: 세션 한정 멀티턴. 교차 세션 기억·재방문자 인식·리드 식별 영속 **없음**.
- **취향 기준점**: 내용 = Intercom Fin(근거 기반·정확, 모르면 "모른다 → 상담 연결") + Claude(자연스러운 멀티턴·되묻기·매끄러운 스트리밍). UX = Linear/Vercel(극도로 매끄러운 모션·미니멀 고급·빠릿한 체감).
- **확정 사용자 결정**: ① 모호한 첫 질문에 한해 flash 1콜(≤1.2s, 킬스위치 가능) 허용. ② 신규 마이그레이션 작성 필요(`chatbot_answer_events` 컬럼 추가) — 예상된 비용으로 승인.

## 2. 절대 깨면 안 되는 것 (모든 변경이 호환 유지)

이 방어선은 7개 차원 설계 + 적대적 리뷰에서 직접 위반되지 않음을 확인했고, 본 설계는 그 안에서 동작한다.

- **raw-chunk 누출 방지**: Gemini 무음 실패 시 검색 raw 청크 노출 금지. `isUsableGeneratedAnswer`(앵커·종결·길이≥24) + `resolveModelChain` 폴백 + `clampAnswerToLength`(문장 경계 보존, naive slice 금지).
- **thinking-token drain 방지**: `gemini-2.5-flash`는 `thinkingBudget:0` 유지.
- **가격 가드레일**: OPS는 별도 견적 항목 아님(내장 강점). 최종 금액·견적 단정 금지 → 상담 연결. 학원비 결제/수납/정산 = "제공하지 않습니다".
- **민감 분기**(가격/계약/환불/계정/장애/장비상태/설치가능/API범위): "가능/지원" 단정 금지, "확인 필요/상담 연결" 유지. Gemini가 안전 초안을 완화 금지.
- **큐레이션=final**: 큐레이션 직답은 Gemini 재작성 스킵. 회귀 핵심 문구 보존.
- **캐시 버전 bump**: 답변/검색 스키마·프롬프트 변경 시 `ANSWER_CACHE_VERSION`/`RETRIEVAL_CACHE_VERSION` bump 필수(미적용 시 stale 5분).
- **pgvector 인자**: `match_docs_ai_chunks` 임베딩은 `JSON.stringify` 문자열 전달.
- **공개 답변 sanitize**: URL/마크다운/이미지/출처 누출 금지(`sanitizePublicAnswerText` + 클라 재정제). 어떤 신규 렌더 경로도 sanitize 우회 금지.

## 3. 성공 기준 (Top 1% 스코어카드)

- **첫 토큰 지연**: 스트리밍 p50 ≤600ms / p95 ≤1200ms (Stage1 휴리스틱이 스트림-블로킹 경로일 때 달성; LLM 정제는 스트림 비차단).
- **완료 답변 지연**: 전체 p95 ≤4500ms / 큐레이션·숏서킷 p95 ≤800ms / Stage1 p95 ≤900ms(자체 컬럼 분리 관측).
- **세그먼트 분류 정확도**: golden `expectSegment` 매치율 ≥92%. 라이브 프록시 = clarify-후-정정율 + 세그먼트별 not_helpful율.
- **세그먼트별 해결률**: 기존고객운영 ≥75% / 신규검토 ≥60%(핸드오프=성공) / 가격="상담 라우팅 정확도"로 측정(답변율 아님) / 기술·컴플레인 ≥50% 셀프서브 + 나머지 클린 핸드오프.
- **CSAT** (helpful/(helpful+not_helpful)) 세그먼트별 ≥80%. not_helpful 코멘트율을 선행지표로 추적.
- **충실도/환각**: golden LLM-judge faithfulRate ≥0.97, hallucinationRate ≤0.02, avgScore ≥4.3. **단, 하드 게이트는 결정론적 guardrails 블록**(raw-chunk 누출 0 / 가격 단정 0 / 민감 완화 0)이며 judge 단독 게이트 금지.
- **clarify-rate** 5~15% 밴드 + clarify→해결 리프트 양(+).

## 4. 설계 — 2단계 파이프라인

### 4.1 전체 흐름

```
[질문] → Stage1 UNDERSTAND (휴리스틱 ~0ms, 모호시 flash ≤1.2s)
          ├─ 숏서킷(인사/정책가드/CS가이드/즉시핸드오프/캐시) 유지
          ├─ 세그먼트 + 의도 + clarify판단 + carry복원
          ↓ (clarify.ask → 검색·Gemini 스킵, 템플릿 verbatim 반환 = 지연 WIN)
        Stage2 RESPOND (세그먼트 파라미터화)
          ├─ 검색(휴리스틱 세그먼트 라우팅) + 정규화 relevance + abstain
          ├─ compose → Gemini(세그먼트 페르소나, 안전제약 우선) → usability 게이트
          └─ 세그먼트별 CTA/핸드오프/추천질문 + 매끄러운 스트리밍 UX
```

### 4.2 Stage1 UNDERSTAND — 휴리스틱 우선·동기·네트워크 0

- 입력: `question.redacted` + 세션 carry state만. **awaits 없는 순수 단계** → 지연 예산 미접촉.
- `buildChatbotCore`(service.ts:3043)의 암묵적 early-return 캐스케이드(인사 3050 / 정책가드 3074 / 즉시핸드오프 3086 / CS가이드 3098 / 캐시 3139)를 Stage1 숏서킷으로 명시화. 이후 `SegmentDecision` 계산.
- **출력 계약**(Stage2가 소비):
  ```ts
  // lib/chatbot/segment.ts (단일 SSOT)
  export type ChatbotSegment = "prospect" | "pricing" | "existing_ops" | "support_complaint"
  type ClarifyDecision = { ask: false } | { ask: true; question: string; reason: "ambiguous_segment" | "missing_slot" }
  interface SegmentDecision {
    segment: ChatbotSegment
    category: ChatbotCategory   // 기존 8-cat 유지(검색/CTA 재사용)
    intent: ChatbotIntent
    handoffIntent: HandoffIntent
    clarify: ClarifyDecision
    segmentConfidence: number   // 0..1, clarify·escalate 결정
  }
  ```
- **세그먼트는 기존 category에서 파생**(병렬 분류기 아님) → 검증된 정규식 재사용, golden category 단언 무변경.

### 4.3 Stage1 세그먼트 분류기 (휴리스틱 + 모호밴드 flash)

- **휴리스틱(~0ms)** `classifyStage1Heuristic`: ① 기존 `classifyChatbotQuestion`(classification.ts:164) 실행(무변경) → ② `detectComplaintSentiment(text)`→neutral|frustrated|angry **+ `detectCriticalIncident(text)`→bool**(수업 끊김·라이브 중단·로그인 불가·접속 장애 등 긴급 운영 차단, §5.1-A) → ③ `segmentFromClassification` 우선순위 **complaint/critical > pricing > existing_ops > prospect** → ④ `computeHeuristicConfidence`(강한 큐레이션 술어 0.92 / 키워드 분기 0.80 / sourceCategories 폴백 0.55 / general 약신호 0.30) → ⑤ `decideClarify`(confidence<0.45 AND 도메인관련 AND 비민감 AND **비긴급** AND `lastClarifyAsked!==true`일 때만 — 긴급 장애는 절대 되묻지 않고 즉시 핸드오프).
- **flash escalate**(모두 만족 시에만 gemini-2.5-flash 1회): shouldGenerateAnswer · 비숏서킷 · 비큐레이션 · `0.45 ≤ confidence < 0.78` OR 경쟁 세그먼트 동시매치 · 스코어링 토큰 ≥2 · `CHATBOT_STAGE1_LLM!=="0"` 킬스위치.
  - 호출 규격: tier `basic` 하드핀, **thinkingBudget:0 유지**, temperature 0, maxOutputTokens 128, **timeout 1200ms**, `responseMimeType:'application/json'` + responseSchema(segment enum / needs_clarify / confidence / complaint / clarify_question). 방어적 파싱 → 실패 시 null → 휴리스틱 폴백.
  - **검색과 병렬 실행**: 분류기 LLM 브랜치와 `searchKnowledgeSourcesWithinBudget`를 동시에 시작, compose 전 둘 다 await. 검색 타임아웃(2.8s) ≥ 분류기 타임아웃(1.2s)이므로 분류기는 검색 지연 아래에 숨음 → 지연 0 성립.
- **안전 화해 규칙**: LLM은 4개 세그먼트 플립·needs_clarify·clarify_question만 가능. 민감(billing/troubleshooting/consultation OR `isSensitiveOrAccountSpecific`)·complaint 플래그는 **휴리스틱 소유**로 LLM 해제 불가. `detected_category`는 휴리스틱 값으로 byte-호환 유지, `detected_segment`만 정제값(두 슬라이스가 다를 수 있음을 어드민에 명시).
- **clarify 작성자**: v1은 **결정론적 템플릿**(큐레이션=final, Gemini 스킵). `shouldUseAiFinalAnswer`를 `clarify.ask` 시 false로 확장 → 템플릿 verbatim. LLM 작성 clarify는 플래그 뒤 후속.

### 4.4 세션 한정 멀티턴 carry state

- **저장소**: `chatbot_answer_events.metadata`(jsonb)에 기록. ⚠️ **정정(플랜 단계 검증)**: 이 컬럼은 현재 **존재하지 않음** — `chat_messages.metadata`도, `chatbot_answer_events.metadata`도 둘 다 없음(`question_clusters.metadata`만 존재). 따라서 **Phase 0 마이그레이션이 `chatbot_answer_events`에 `metadata jsonb` 컬럼을 신설**하고 거기에 carry를 기록한다.
- 히스토리 로드와 **같은 병렬 프로미스**에서 직전 answer_event 행을 읽어 복원(추가 라운드트립 0). 읽기 실패 → 빈 carry 폴백(기존 history 실패 패턴과 동일).
  ```ts
  interface SegmentCarry {
    lastSegment?: ChatbotSegment        // 스티키 바이어스(§12 Q3): 후속 턴이 직전 세그먼트 이어받음, 명확한 전환 신호면 오버라이드
    lastClarifyAsked?: boolean          // clarify 무한루프 차단의 유일한 근거 — 반드시 이 실재 컬럼에 저장
    unresolvedSupportTurns?: number     // §5.1-B 자체 해결 실패 escalate 카운터(Phase 3)
    turnCount: number
  }
  ```
- **스티키 바이어스 규칙**(§12 Q3 확정): `lastSegment`가 있으면 다음 턴은 그 세그먼트를 기본값으로 이어받되, ① 명확한 다른 세그먼트 강신호(예: support 스레드 중 "견적 주세요" → pricing) ② 긴급 장애 신호 ③ 새 도메인 토픽 전환이면 오버라이드. "얼마예요?" 같은 약신호 후속은 직전 맥락(pricing) 유지.

### 4.5 캐시 위치 (불변, 버전만 bump)

- 무세션 첫 턴만 캐시(service.ts:3139). Stage1이 빈 carry에서 순수함수이므로 캐시 정합 유지. 멀티턴은 절대 캐시 안 함.
- **`CachedAnswerEntry`에 `segment` 필드 추가 + 캐시 경로 `emitMeta`도 채움** — 안 하면 최다 트래픽인 캐시 첫턴이 전부 default-segment로 렌더됨.
- 캐시 첫턴은 토큰 스트림이 없으므로 `first_token_ms`는 0이 아닌 **null/cached-flag**로 기록(스코어카드 오염 방지).

## 5. 세그먼트별 응대 정책 매트릭스

`lib/chatbot/segment.ts`에 단일 `SEGMENT_POLICY: Record<ChatbotSegment, SegmentPolicy>` 테이블. 페르소나 문자열 SSOT는 `CLASSIN_POSITIONING.chatbot`에서 주입.

| 세그먼트 | 검색 전략 | 톤·형태 | CTA · 핸드오프 |
|---|---|---|---|
| **prospect** 신규리드 | onboarding+positioning 바이어스(`prioritizePositioning`) | 기대 키우되 단정 금지, 운영 흐름 설명, 3~4줄·6줄 상한, `leadWithEmpathy=false`, **항상 next-step 1줄** | demo — 목동 쇼룸 / 90일 로드맵 상담 |
| **pricing** 가격 | 큐레이션 **우선**(가드레일 템플릿 권위), billing 바이어스, **추론 금지**, abstainFloor 0.45 상향 | 구성항목만, **최종금액·견적 단정 금지 → 상담**, OPS는 내장강점(별도항목 아님), 학원비 결제/수납/정산 "제공하지 않습니다"(가드레일과 의도적 중복=다중 방어), 3~4줄 | demo — 구성 기준 맞춤 견적 상담(답변의 종착점) |
| **existing_ops** 기존운영 | classroom/admin/hardware 라인업 바이어스 | 도입 고객 가정, **영업 안 함**, 화면 기준 순서/체크리스트, 최대 6줄·번호목록(최대 4), **next-step 라인 생략** | support(셀프서브 부족 시에만) |
| **support_complaint** 기술·컴플레인 | troubleshooting 바이어스, 순수 컴플레인+매치無 → 공감+핸드오프 직행(억지 doc 금지) | 공감 1절(`leadWithEmpathy=true`) 후 원인 단정 없이 확인/조치 순서, ≤4줄, **해결·책임·보상·환불 단정 금지**. angry 톤이면 공감 1문장 강화 | support — 담당자 연결. **핸드오프 트리거는 §5.1 규칙**(긴급 상황 즉시 / 그 외 자체 해결 실패 시) |

### 5.1 support_complaint 핸드오프 트리거 (§12 Q2 확정)

감정(angry/frustrated)만으로 핸드오프하지 않는다. **상황 심각도 + 자체 해결 실패**를 1차 기준으로 한다.

- **A. 긴급 운영 장애 → 즉시 핸드오프**(셀프서브 강제 루프 금지): `detectCriticalIncident(text)` 신호 — **수업 끊김/라이브 수업 중단, 로그인 불가/접속 안됨/접속 장애, 수업 중 화면 멈춤** 등 시간 민감·고임팩트 차단. 학원이 수업 중일 수 있으므로 즉시 사람 연결이 최우선. (가장 빠른 셀프서브 팁 1개를 즉답할 수 있으면 첨부하되, 연결을 우선.) — **Phase 2에서 출시**(carry 불필요).
- **B. 비긴급 기술·컴플레인 → 자체 해결 우선, 실패 시 escalate**:
  - 셀프서브 답변을 먼저 제시하되, ① abstain/low-confidence(좋은 doc 없음)면 즉시 핸드오프 제안, ② 같은 이슈로 사용자가 다시 오거나("아직 안돼요/또 안됩니다") 세션 내 미해결 support 턴이 누적되면 핸드오프. 세션 carry `unresolvedSupportTurns` 사용 — **Phase 3에서 출시**(carry 의존).
- **C. angry 톤**: 1차 기준은 아니지만 부차 가속기 — 명백히 분노하면 B의 2턴 대기 없이 더 빨리 연결로 기운다(단, 책임·보상·환불 단정은 여전히 금지).

**핸드오프 단일 경로(티켓 더블파이어 차단)**: `forceReason`(`'critical_incident'` | `'support_unresolved'` | `'complaint_sentiment'`)를 `ChannelTalkHandoffCandidate` 필드로 추가해 **기존 `persistExchange`(service.ts:2749) 호출에만** 전달. route 레벨 신규 호출 절대 추가 금지 → 턴당 정확히 1회.

**와이어업**: 세그먼트는 `buildChatbotCore`에서 1회 계산해 `composeAnswer`·Gemini에 전달. `personaFragment`는 **`FINAL_SYSTEM_INSTRUCTION` 뒤에** 연결(안전 초안 제약 항상 우선). 큐레이션/핸드오프/clarify는 Gemini 미도달(`shouldUseAiFinalAnswer` 차단) → fragment는 구조적으로 큐레이션 답변에 닿지 않음(테스트로 byte-동일 보증).

## 6. 프롬프트 재설계

- 단일 `.join(" ")` 블롭을 **이름 있는 블록**으로 분해: `IDENTITY_BLOCK / ANSWER_STATE_BLOCK / SHAPE_BLOCK / WARMTH_BLOCK / SAFETY_BLOCK` → `buildBaseSystemInstruction()`. 핀 문자열(answer-policy-regression.test.ts:156-165)은 **verbatim 보존**.
- **답변 상태 모델을 1급 섹션으로**(`ANSWER_STATE_BLOCK`): 확인됨(명확한 것만 단정) / 조건부가능("…에 따라 다릅니다" 조건 동반) / 확인필요(단정 금지, 확인 경로 종결) / 제공안함(없는 기능 만들지 않고 분리 안내) / 상담연결(해결했다 말하지 말고 담당자 확인 항목만).
- **세그먼트 블록 + Stage2 시스템 인스트럭션**: `SEGMENT_BLOCKS: Record<ChatbotSegment,string>`(2~4문장, 톤·형태·CTA·핸드오프 뉘앙스만, 새 사실 금지) → `buildSegmentedFinalSystemInstruction(segment)` = base + (이력 맥락 verbatim) + SEGMENT_BLOCK + **SAFE_DRAFT_CONSTRAINT_BLOCK**(완화 금지 verbatim) + HANDOFF_BLOCK + LENGTH_CONTRACT_BLOCK + SELF_CHECK_FOOTER.
- **길이·형태를 프롬프트로**(clamp 의존 축소): `LENGTH_CONTRACT_BLOCK` 6줄·약 500자 상한, 넓은 질문 3~4줄+next-step 1회, 사양 콕집을 때만 "- " 불릿 2~4개, 완결 문장 종결(clampAnswerToLength 520·usability 종결 체크 미러).
- **no-soften + 인프롬프트 셀프체크**: `SAFE_DRAFT_CONSTRAINT_BLOCK`(안전 초안이 "제공안함/확인필요"면 최종도 유지) + `SELF_CHECK_FOOTER`(1줄 비출력: 미지원→가능 안 바꿨나·근거없는 수치/가격/기능/API 안 만들었나·6줄 완결인가). **단일 패스 = 추가 라운드트립 0**. 실 백스톱은 여전히 `isUsableGeneratedAnswer` + 큐레이션/결정론 폴백.
- **빌더 de-dup(전제 작업)**: 중복 인라인 프롬프트(llm.ts:391-399, 520-528)를 **단일 `buildFinalUserPrompt(args)`**로 추출. "세그먼트:" 1줄 주입은 이 빌더에서만. 없으면 핀 문자열 깨지고 drift. generate·stream 양쪽 동일 빌더 사용 → drift 0.
- **Stage1 분류기 프롬프트**: `buildClassifierSystemInstruction()` + strict-JSON 스키마. `buildGenerationConfig`에 `jsonMode` 플래그 추가하되 **thinkingBudget:0(2.5-flash) 보존**. enum 검증 + null-on-failure → 정규식 폴백.

## 7. 검색·정확도 업그레이드 (Fin 정확도)

- **점수 스케일 충돌 해결**: 현재 큐레이션 250~420 / 벡터 sim×80(최대 80) / 키워드 raw가 한 축에 섞여 `score≥240→0.9` 점프가 벡터엔 구조적 도달 불가. **정규화 `relevance(0~1)`** 필드를 `ChatbotSource`에 추가:
  - 벡터: `clamp01((sim - 0.5)/(1-0.5))`(floor=0.5 앵커) · 키워드: `clamp01(scoreText/120)` · 큐레이션: `0.95` 고정 + `isCurated:true`.
  - 기존 `score`는 정렬/rerank/dedup용으로 유지(selectDiverseSources·merge 무변경). `relevance`는 confidence·abstain만 읽음.
- **연속 confidence**: `score≥240?0.9` 점프 제거 → `clamp(0.3,0.95, top.relevance*0.85 + 0.1 + agreement + curatedBoost)`. 큐레이션 ~0.95, 강한 벡터 ~0.86, 약한 벡터 ~0.32(이제 minConfidence 0.55 정상 트립). support 세그먼트는 confidence 0.6 하드캡(항상 핸드오프 가능 유지).
- **abstain 게이트(모른다 → 상담)**: `RELEVANCE_ANSWER_FLOOR=0.35`(golden 최소 정답 유사도 앵커). composeAnswer에서 non-curated `top.relevance<floor` AND 비민감 → 기존 zero-source abstain 분기로. 노이즈 키워드 단독 매치가 confident doc dump 대신 abstain/clarify.
- **rerank 바이어스(정규화 축에도)**: 기존 부호 유지(API −, positioning +, category ±)를 relevance에도 비례 적용(api −0.6, positioning +0.25, category ±0.12, clamp). 정렬용 score 무변경 → rag-relevance 테스트 그린.
- **세그먼트 검색 라우팅(휴리스틱 세그먼트 기반 — 모순 해소)**: `planRetrieval(heuristicSegment, question): RetrievalPlan { retrieverOrder, categoryBias, allowInference, abstainFloor, confidenceCap }`. 가격=큐레이션 우선·추론 금지·floor 0.45 / 기술·컴플레인=trouble 우선·추론 금지·floor 0.4·confidence 캡 0.6. 세그먼트 미지정 시 = 현행 동작(다크 출시 no-op).
- **클라이언트 벡터 폴백 수정**: `.limit(500)` 블라인드 → 토큰 `.or(ilike)` 사전필터 `.limit(120)`, <8행이면 무필터 `.limit(200)` 2차. JS 코사인 디코드 4~8x 절감. pgvector 인자 `JSON.stringify` 유지.

## 8. UX / 쾌적도 레이어 (Linear/Vercel 체감)

- **모션 토큰 SSOT**: `lib/chatbot/motion.ts` 신설 + DESIGN.md "8. 모션 토큰". enter `{0.26, cubic-bezier(0.22,1,0.36,1)}` / exit `{0.16, cubic-bezier(0.4,0,1,1)}` / surface 스프링 `{380/32/0.9}` / micro `{0.12}` tap 0.97 / token-fade `{0.14 easeOut}` / ambient 1.1·2.6·3.8s / reduced → `{0.01}`(단일 `m()` 헬퍼로 누락 방지).
- **스트리밍 폴리시**: ① 토큰 페이드인(글자별 애니 금지) + 깜빡이는 캐럿(2px) → 라이브 타이핑 체감, reduced 시 solid. ② thinking→stream 크로스페이드(`popLayout`), 단 **활성 스트리밍 버블 자체는 layout 애니 제외**(토큰마다 리사이즈=메인스레드 thrash 방지). ③ preview→final 무플리커: 전환 판단을 prefix-match가 아닌 **서버 신호**로 — "replace" 텍스트가 누적 delta와 다르면 항상 크로스페이드(0.18). in-place 경로도 반드시 `sanitizeVisibleAssistantText` 통과.
- **세그먼트 인지 UI**: 스트림 meta에 `segment` 추가(캐시 경로 emitMeta도 채움 → 공개 contract 변경, 서버·클라 타입 동시 이동 + 캐시 bump). 칩 액센트: 리드/운영=그린 아웃라인 / 가격=상담-lean / **분노 사용자엔 영업 그린 지양**(중립 웜). 핸드오프 카드: support는 추천질문 위 + 좌측 2px 액센트 레일 + enter+40ms / 가격은 아래·상담 버튼 filled(금액 단정 없음). 단일 clarify: `answerMode='clarifying_question'` 시 가로 스냅 칩 스트립("골라주세요").
- **접근성**: delta 스팸 차단(로그 컨테이너 `aria-live='off'`), 완료 시에만 sr-only `aria-live='polite' aria-atomic`로 최종 sanitized 답변 1회 announce + "상담 연결 준비됨". `aria-busy={isSending}`, 모바일 풀블리드 소프트 Tab 루프, 기존 `focus-visible:ring-2 ring-[#084734]/25` 재사용.
- **sanitize 불변**: 모든 신규 렌더 경로(캐럿·크로스페이드 inner·clarify 스트립·scroll-pill)는 `MessageContent → sanitizeVisibleAssistantText`만 통과 → URL/마크다운/출처 누출 0 구조적 보증.

## 9. 계측·관측

- **스키마(마이그레이션 필수)**: `supabase/migrations/20260624_chatbot_segment_observability.sql` — `chatbot_answer_events`에 `detected_segment text`(+인덱스)·`first_token_ms int`·`stage1_ms int`·`clarify_offered bool default false` **+ `metadata jsonb`(carry용, 신설 — 현재 미존재)** 추가, 기존 `model_name/prompt_tokens/completion_tokens` 기록 시작. 뷰: `v_chatbot_segment_daily_stats`(day×segment: counts, clarify_count, avg_confidence, first_token_p95_ms/stage1_p95_ms), `v_chatbot_feedback_stats`(세그먼트별 재구성 — `answer_event_id` FK·기존 consumer 확인 후), `v_chatbot_handoff_funnel`. **+ `chatbot_eval_runs` 테이블**(eval 트렌드).
- **어드민**(`/admin/chatbot`): 세그먼트 분포+성과 테이블(share/해결률/CSAT/clarify-rate/handoff-conversion/첫토큰 p95 + target chip), P95 카드 분리(첫토큰/완료), **회귀 게이트 패널**(직전 golden-eval vs 그 이전, 델타 + guardrail 회귀 시 적색 배너). `runEval`에 세그먼트 스코프 + 마지막 리포트 영속.
- **eval(judge 비의존 하드 게이트)**: golden에 `expectSegment` 추가, `segmentMatchRate` 산출. **결정론적 guardrails 블록**: `rawChunkLeak`(앵커/종결/sanitize 후 URL) · `pricingAssertion`(세그2 금액/원 또는 민감어 "지원/가능") · `sensitiveSoftening`(handoff 기대를 direct로). 세그먼트당 ~12 케이스 추가(가격·컴플레인 최우선, 68→~110). **긴급 장애 케이스**(수업 끊김·로그인 불가 → `expectMode=handoff` + `forceReason='critical_incident'` + 되묻지 않음) 필수 포함. **가격 케이스는 클린 상담 라우팅을 성공으로 단언**(§12 Q1). LLM-judge는 자문일 뿐 하드 게이트 아님. 마지막 런은 **`chatbot_eval_runs` 테이블**(§12 Q5)에 영속해 어드민 델타·트렌드 표시.
- **알파 레디니스**: 신규 마이그레이션을 `ALPHA_DB_MIGRATIONS`에 추가, `detected_segment` null 가드(로깅 미연결 경고).

## 10. 4단계 롤아웃 (위험 순서대로)

| Phase | 범위 | 출시 게이트(exit) |
|---|---|---|
| **0. 관측 우선**(행동변화 0) | 컬럼·인덱스·뷰 추가(마이그 필수), 토큰 컬럼 기록 시작, `detected_segment` 휴리스틱(category→segment + `detectComplaintSentiment`)으로 백필, 첫토큰 측정, 어드민 세그먼트 테이블 + P95 분리 + 회귀 패널, `lib/chatbot/segment.ts` 정규 타입 단독 신설. **프롬프트·답변 무변경 → 캐시 bump 불필요** | 마이그 적용 + 모든 신규행 `detected_segment` 채워짐(alpha-readiness null 가드 통과) + 4세그먼트 베이스라인 관측 + eslint/build/vitest 그린 |
| **1. Stage1**(섀도우→라이브) | `classifyStage1Heuristic` + 모호밴드 flash strict-JSON(thinkingBudget:0, timeout 1200ms, 폴백). **검색은 항상 휴리스틱 세그먼트로 라우팅**, LLM은 톤/CTA/답변형만 정제. carry는 `answer_events.metadata`에서 복원. 섀도우 로깅 먼저, 검증 후 라이브 플립. **ANSWER_CACHE_VERSION bump**(clarify 출력 변화 + CachedAnswerEntry segment 필드 추가). RETRIEVAL bump은 Phase 2(planRetrieval 도입 시)로 연기 — Phase 1은 검색 미변경 | 섀도우 `segmentMatchRate ≥0.92`, `stage1_ms p95 ≤900ms`, 비스트림 직렬 worst-case ≤11.5s(13s 내), clarify 루프방지 단위테스트 통과, 라이브 후 not_helpful 비악화 |
| **2. Stage2 세그먼트별**(1개씩) | 정책 매트릭스 적용(retrievalBias·personaFragment·answerShape·suggestedQuestions·primaryCta·handoffPolicy). 순서 **기존고객운영 → 신규리드 → 기술·컴플레인(persistExchange:2749 forceReason 단일 경로) → 가격(최후·최대 주의)**. 정규화 relevance + 연속 confidence + abstain + `planRetrieval` 동반 출시. 세그먼트 플립마다 자체 캐시 bump + 자체 golden 서브셋 게이트 | 세그먼트별 guardrails(rawChunkLeak/pricingAssertion/sensitiveSoftening) 전부 0, handoff-rate 델타 설명가능, 가격 최종금액 단정 0·OPS 별도항목 0, UX 칩/핸드오프 카드 정상 |
| **3. Clarify + 멀티턴** | 단일 clarifying-question 라이브(템플릿=큐레이션 final). 세션 carry(lastSegment 스티키·lastClarifyAsked·turnCount)로 멀티턴 맥락. 가격 슬롯 메모리(hasSize/hasCount)는 **v1 범위 외**(가격 사인오프 전 보류) | clarify-rate 5~15% 안착 + clarify→해결 리프트 양(+), 더블-clarify 0건, 토픽 전환 시 스티키 오버라이드 정상 |

**Phase별 사전 출시 게이트(순서대로)**: (a) 프롬프트/스키마/분류/검색키 변경 → 캐시 bump (b) `npx eslint app components lib --max-warnings=0` && `npm run build` (c) `vitest run tests/chatbot/` 그린(answer-policy-regression·pricing-guardrail·answer-clamp·quality-regression·stream-query) (d) judge:true 전체 golden: segmentMatchRate≥0.92, modeOkRate≥0.95, faithfulRate≥0.97, hallucinationRate≤0.02, **guardrails 전부 0** (e) 직전 대비 guardrail 무회귀. (d)/(e) 실패 = 출시 차단.

**캐시 버전 소유권**: `ANSWER/RETRIEVAL_CACHE_VERSION`은 단일 문자열, **릴리스당 1인 소유** + bump를 Phase별 체크리스트 항목으로 + 버전-변경 단언 테스트(릴리스 스코프). 동시 PR 중복 주장 방지.

## 11. 리스크 & 완화 (적대적 리뷰 반영)

| 리스크 | 완화 |
|---|---|
| **검색 순서 모순** — LLM-정제 세그먼트가 검색 조종 시 "동시실행=지연0" 붕괴, 비스트림 직렬이 13s에 ~2s 여유밖에 안 남음 | 검색을 조종하는 세그먼트는 **휴리스틱 전용**. LLM 정제는 톤/CTA/답변형에만. 분류기 timeout 1200ms + 휴리스틱 폴백으로 예산 초과 불가 |
| **carry 저장소 부재** — `chat_messages.metadata`도 `chatbot_answer_events.metadata`도 실재 안 함(플랜 검증) → lastClarifyAsked 저장 불가 | **Phase 0 마이그이 `chatbot_answer_events.metadata jsonb` 신설**, 거기에 SegmentCarry 기록, 히스토리와 같은 병렬 프로미스 복원, try/catch 빈 carry 폴백 |
| **핸드오프 더블파이어** — route.ts 추가 호출이 persistExchange:2749와 겹쳐 티켓 2건 | forceReason를 candidate 필드로 추가, 기존 단일 호출 경로로만 → 턴당 1회. route 신규 호출 금지 |
| **enum/캐시 5중 분기 충돌** | 정규 타입 단일 SSOT(`lib/chatbot/segment.ts`), classification.ts는 휴리스틱 프리미티브 유지, 캐시 상수 릴리스당 1인 소유 + 단언 테스트 |
| **preview→final prefix-match가 raw-chunk 안전치환 무력화** + in-place sanitize 우회 | 전환을 서버 신호로(replace≠delta면 항상 크로스페이드), in-place도 반드시 sanitize 통과 |
| **confidence 재보정이 핸드오프 폭발** | `CHANNEL_TALK_HANDOFF_MIN_CONFIDENCE` env 뒤 스테이징, Phase2 관측과 동반. Dim4 confidence와 Dim3 컴플레인 자동핸드오프 **동시 출시 금지** |
| **Stage1 LLM 빈/잘린 JSON 또는 5번째 세그먼트 환각** | tier 'basic' 하드핀 + thinkingBudget:0 단언, 방어적 파싱+enum 검증+null→휴리스틱 폴백, 민감/complaint는 휴리스틱 소유 |
| **Phase0 백필이 complaint 신호 없이 오라벨** | Phase0 백필에 `detectComplaintSentiment` 동반 적용, 어드민 트렌드에 Phase1 컷오버 주석 |
| **노이즈 매치가 confident doc dump** | 정규화 relevance + abstain 게이트(non-curated <0.35 → 모른다/상담), 큐레이션 0.95 고정 우선, abstainFloor golden 분포 앵커 |
| **프롬프트 빌더 동시편집 핀 문자열 파손** | `buildFinalUserPrompt` 단일 빌더 선행 de-dup(전제 작업), 핀 verbatim, 주입은 단일 빌더에서만 |

## 12. 열린 질문 — 전부 확정됨 (2026-06-24)

| # | 질문 | 확정 |
|---|---|---|
| 1 | 가격 해결률 정의 | **클린한 상담 라우팅 = 성공**으로 집계("상담 라우팅 정확도"). 가격 답변은 정책상 금지이므로 올바른 상담 연결이 곧 성공. |
| 2 | 컴플레인 자동 핸드오프 타이밍 | **감정 기준 아님 → 상황 심각도 + 자체 해결 실패 기준**(§5.1). 긴급 장애(수업 끊김·로그인 불가·접속 장애)=즉시 / 그 외=셀프서브 실패 시 escalate / angry=부차 가속기. |
| 3 | 세그먼트 스티키 vs 재분류 | **스티키 바이어스**(§4.4). 직전 세그먼트 이어받되 강신호·긴급·토픽전환이면 오버라이드. |
| 4 | 가격 슬롯 메모리 | **v1 범위 외**. Phase 3에서 가격 사인오프 후 검토. |
| 5 | eval 런 영속 | **`chatbot_eval_runs` 테이블**(트렌드 추적). |
| 6 | LLM-judge CI | **결정론 guardrails만 CI 하드게이트**. judge는 어드민 버튼 + nightly cron(자문). |
| 7 | 핸드오프 전환 최종 단계 | **"핸드오프 생성"까지만 정직 측정**. 세션 한정 메모리라 answer_event→lead 링크는 신뢰 낮음 → 리드 캡처는 추적 안 함. |

## 13. 부록 — 차원별 구체 변경 목록 (file:line)

### A. 파이프라인 (2단계 spine)
- `lib/chatbot/classification.ts:1-21` — `ChatbotSegment`/`SegmentDecision`/`ClarifyDecision` 타입 + 순수 `mapCategoryToSegment`/`decideClarify`.
- `lib/chatbot/classification.ts:164-172` — `classifyChatbotQuestion`이 `{segment, segmentConfidence}` 추가 반환(기존 필드 유지 → 모든 호출부 무변경 컴파일).
- `lib/chatbot/service.ts:3041-3211` — `buildChatbotCore`를 명시적 Stage1/Stage2로 리팩터(early-return 캐스케이드를 Stage1 숏서킷으로, 이후 SegmentDecision 계산, clarify면 검색+Gemini 스킵).
- `lib/chatbot/service.ts:2869-2878` — `ChatbotCore`에 `segment`/`clarify`/`stage1` 추가.
- `lib/chatbot/service.ts:3019-3039` — `deriveCarryState(rows)` 추가, 같은 병렬 프로미스(3156)에서 `{history, carry}` 반환.
- `lib/chatbot/service.ts:2939-2951` — `shouldUseAiFinalAnswer`가 `clarify.ask` 시 false.
- `lib/chatbot/service.ts:3416-3419` — clarify 턴을 `isShortCircuited`에 포함(토큰 스트림 없이 단일 replace).
- `lib/chatbot/service.ts:271 & 53` — `ANSWER_CACHE_VERSION`/`RETRIEVAL_CACHE_VERSION` bump.
- `lib/chatbot/service.ts:1785-1830` — segment→suggestedQuestions/CTA 오버라이드 레이어.

### B. Stage1 분류기
- `lib/chatbot/segment.ts`(신규) — `ChatbotSegment` 타입, `Stage1Result`, `CLARIFY_FLOOR/ESCALATE_CEIL/LLM_TRUST_FLOOR`, `COMPLAINT_RE`, `segmentFromClassification()`, `computeHeuristicConfidence()`, `classifyStage1Heuristic()`.
- `lib/chatbot/service.ts` — 좁은 술어 export(`isPricingInfoQuestion:775`, `isSoftwarePricingQuestion:783`, `isWebLiveBillingQuestion:758`, `isS65QuoteQuestion:683`, `isComparisonQuestion:701`, `isIdentityQuestion:706`, `isSensitiveOrAccountSpecificQuestion:1881`, `isCuratedTemplateQuestion:2913`, `isDomainRelatedQuestion:1874`).
- `lib/chatbot/service.ts` — async `classifyStage1(...)` 추가, `classifyChatbotQuestion`(3163-3166) 대체, `stage1` to ChatbotCore.
- `lib/chatbot/llm.ts` — `classifyStage1WithGemini(...)`(tier basic, temp 0, maxOutputTokens 128, responseMimeType json + responseSchema, thinkingBudget:0 보존, null-on-failure).
- `lib/chatbot/llm.ts:236` — `buildGenerationConfig`에 `{ json?, schema?, maxTokensOverride? }`(기본값 무변경).
- `tests/chatbot/segment.test.ts`(신규) — `segmentFromClassification`+`classifyStage1Heuristic` 순수함수 테스트(LLM 경로 모킹/스킵).

### C. 세그먼트 정책 매트릭스
- `lib/chatbot/segment.ts` — `detectComplaintSentiment`, **`detectCriticalIncident`(수업 끊김·라이브 중단·로그인 불가·접속 장애 정규식, §5.1-A)**, `resolveSegment`(precedence **critical/complaint > pricing > existing_ops > prospect** — §4.3과 동일, 정규 명칭 사용), `SEGMENT_POLICY` 테이블.
- `lib/chatbot/service.ts` — classify 후 sentiment+segment 계산, composeAnswer/Gemini에 전달, suggestedQuestions를 SEGMENT_POLICY로 교체(2574/2974/1869), 캐시 bump.
- `lib/chatbot/llm.ts` — `segmentFragment`를 `FINAL_SYSTEM_INSTRUCTION`(108-119) 뒤 연결, thinkingBudget:0(255)·모델체인(75-79) 무변경.
- `lib/chatbot/service.ts:1285-1322` — `rerankSources`가 segment retrievalBias 읽음.
- `app/api/chatbot/query/route.ts` 또는 `persistExchange` — `maybeCreateChannelTalkHandoff(candidate, forceReason)` **단일 경로(2749)**. `forceReason` ∈ `'critical_incident'`(즉시, Phase2) | `'support_unresolved'`(자체해결 실패, Phase3 carry) | `'complaint_sentiment'`(angry 가속기).
- `lib/classin-positioning.ts` — `chatbot.segmentPersonas`(SSOT, 선택).

### D. 프롬프트
- `lib/chatbot/llm.ts` — `BASE_SYSTEM_INSTRUCTION`(85-106) 블록 분해 + `buildBaseSystemInstruction()`, `SEGMENT_BLOCKS` + `buildSegmentedFinalSystemInstruction()`, `SAFE_DRAFT_CONSTRAINT_BLOCK/HANDOFF_BLOCK/LENGTH_CONTRACT_BLOCK/SELF_CHECK_FOOTER`.
- `lib/chatbot/llm.ts` — `buildFinalUserPrompt(args)` 추출(391-399, 520-528 중복 제거), `buildClassifierSystemInstruction()`.
- `lib/chatbot/service.ts:271,276-279` — `ANSWER_CACHE_VERSION` bump + `getAnswerCacheKey`에 segment 반영.
- `tests/chatbot/answer-policy-regression.test.ts:156-165` — 새 블록 경계로 단언 갱신(핀 보존 + 세그먼트 블록·LENGTH 마커 추가).

### E. 검색·정확도
- `lib/chatbot/service.ts:77-86` — `ChatbotSource`에 `relevance?`/`isCurated?`.
- `service.ts:1613-1624`(vector)·`1545-1554`(keyword)·`856-875`+`3117-3126`(curated) — relevance 세팅.
- `service.ts:2556-2558` — 연속 confidence + support 0.6 캡.
- `service.ts:2503-2553` — abstain 게이트(`RELEVANCE_ANSWER_FLOOR=0.35`).
- `service.ts:1285-1322` — rerank를 relevance에도 비례 적용.
- `service.ts`(신규) — `planRetrieval(segment, question)` + searchSupabaseSources/searchKnowledgeSources/composeAnswer로 스레드.
- `service.ts:1641-1677` — 클라 폴백 `.limit(500)`→토큰 narrowed `.limit(120)`, <8행 시 `.limit(200)`.
- `service.ts:53,271` — 캐시 bump.
- `tests/chatbot/rag-relevance.test.ts`, `quality-regression.test.ts` — 노이즈 abstain·confidence monotonicity 케이스.

### F. UX/모션
- `DESIGN.md` — "8. 모션 토큰" 섹션.
- `lib/chatbot/motion.ts`(신규) — MOTION 토큰 + `reducedMotionVariant`.
- `components/ui/FloatingChatbot.tsx:880-909` — `streamingMessageId` + 캐럿 + replace 시 diff-only/크로스페이드.
- `FloatingChatbot.tsx:1104-1178` — thinking+버블 `AnimatePresence popLayout`, 세그먼트 칩, clarify 스트립.
- `FloatingChatbot.tsx:80-91` + `service.ts:90-102` — `ChatbotStreamMeta`에 segment + 서버 meta + 캐시 bump.
- `FloatingChatbot.tsx:1167-1169` — support는 ConsultationBridge를 추천질문 위 액센트 레일, pricing은 아래 filled.
- `FloatingChatbot.tsx:1097-1102` — `aria-live='off'` + sr-only polite 1개(완료 시만) + `aria-busy`.
- `FloatingChatbot.tsx:692-722,748-766` — 칩 스켈레톤 + scroll-to-latest pill.
- `FloatingChatbot.tsx:1256-1257` — tap 0.96→0.97, MOTION.micro.
- `components/ui/ChatbotTeaser.tsx:19-23` — 인라인 duration→MOTION.

### G. 계측·롤아웃
- `supabase/migrations/2026XXXX_chatbot_segment_observability.sql`(신규) — 컬럼·인덱스·뷰 3종 + **`chatbot_eval_runs` 테이블**(§12 Q5, eval 트렌드 영속).
- `lib/chatbot/service.ts` — detected_segment/stage1_ms 스레드, persistExchange(2691) insert 확장, firstTokenAt 캡처(3308), getChatbotStats(3825) perSegment+latency split, 캐시 bump.
- `lib/chatbot/eval.ts` — `expectSegment`·`segmentMatchRate`·guardrails 블록·세그먼트 스코프 + **긴급장애/가격-상담성공 케이스** + 마지막 런 `chatbot_eval_runs` 영속.
- `data/chatbot-golden-set.json` — 기존 68에 expectSegment + 세그먼트당 ~12(가격·컴플레인 우선).
- `app/admin/chatbot/page.tsx` — 세그먼트 테이블 + P95 분리(388-393) + 회귀 게이트 패널 + runEval(316) 세그먼트 스코프.
- `lib/chatbot/alpha-readiness.ts` + `alpha-db-contract.ts` — 마이그 등록 + null 가드.
