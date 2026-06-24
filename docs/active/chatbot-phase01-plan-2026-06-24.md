# Chatbot Phase 0+1 Implementation Plan (segment-routed 2-stage)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship observability-first instrumentation (Phase 0) and the Stage1 UNDERSTAND layer — heuristic segment classifier + ambiguous-band flash escalate + session carry + explicit Stage1/Stage2 boundary (Phase 1) — for the ClassIn chatbot, with zero behavior change in Phase 0 and no latency or guardrail regression in Phase 1.

**Architecture:** Phase 0 adds a `detected_segment` dimension + latency-split columns to `chatbot_answer_events`, three reporting views, a `chatbot_eval_runs` trend table, and a heuristic segment derivation that backfills the column — all without changing any answer. Phase 1 introduces `lib/chatbot/segment.ts` (the 4-segment SSOT + pure heuristic classifier), a defensive `gemini-2.5-flash` strict-JSON classifier that escalates only on the ambiguous band, session-only carry state stored in `chatbot_answer_events.metadata`, and refactors `buildChatbotCore` into an explicit Stage1 → Stage2 machine.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Supabase (pg + pgvector), Gemini (gemini-2.5-flash / 2.5-pro), vitest (node env). Spec: [docs/active/chatbot-top1pct-redesign-2026-06-24.md](docs/active/chatbot-top1pct-redesign-2026-06-24.md).

---

## §0. Canonical Decisions, Types & Naming (AUTHORITATIVE — overrides any divergent name in Areas A–F)

**Read this first.** The Area task sections (A–F) were drafted in parallel and contain a few cross-area naming collisions. Where an Area task disagrees with §0, **follow §0**. Each `⛔` is a correction to a specific Area task.

### 0.1 `segment.ts` ownership
`lib/chatbot/segment.ts` is created EXACTLY ONCE, by **Area C (segment)**, task "Define ChatbotSegment SSOT".
- SSOT: `export const CHATBOT_SEGMENTS = ["prospect","pricing","existing_ops","support_complaint"] as const; export type ChatbotSegment = (typeof CHATBOT_SEGMENTS)[number]`.
- `segmentFromClassification(...)` (full-signal, runtime) lives here.
- `mapCategoryToSegment(category)` (category-only) ALSO lives here, **eval/backfill-only** — never used for runtime `detected_segment`.
- ⛔ **Area F (eval)**: SKIP any task that creates `segment.ts` / `CHATBOT_SEGMENTS` / `mapCategoryToSegment`. Area F only IMPORTS them from Area C.

### 0.2 Single `detected_segment` derivation path
Runtime `detected_segment` = **`core.segment`** (heuristic, threaded through `ChatbotCore` by Area E).
- ⛔ **Area F**: do NOT separately rewrite `evaluateChatbotQuery` to derive `detectedSegment` via `mapCategoryToSegment`. eval's `mapCategoryToSegment` is only for computing `expectSegment` defaults in golden cases.

### 0.3 `classifyStage1Heuristic` signature (canonical)
`classifyStage1Heuristic(input: Stage1HeuristicInput): Stage1Result` — takes a STRUCT of precomputed primitives, not a raw `NormalizedQuestion`.
```ts
interface Stage1HeuristicInput {
  question: string
  category: ChatbotCategory
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  sentiment: "neutral" | "frustrated" | "angry"
  critical: boolean
  isCurated: boolean
  isPricing: boolean
  isSensitive: boolean
  isDomainRelated: boolean
  usedSourceFallback: boolean
  carry?: SegmentCarry
}
```
- ⛔ **Area E (pipeline)**: build this struct by evaluating the 9 exported predicates against `NormalizedQuestion`; do NOT call `classifyStage1Heuristic` positionally with a `NormalizedQuestion`.

### 0.4 `Stage1Result` fields + reconcile (canonical)
`Stage1Result` is a plain JSON-serializable interface (persists in carry):
```ts
interface Stage1Result {
  segment: ChatbotSegment
  segmentConfidence: number
  category: ChatbotCategory
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  sentiment: "neutral" | "frustrated" | "angry"
  critical: boolean
  escalate: boolean                                  // ambiguous-band gate → run flash
  clarify: { ask: false } | { ask: true; question: string; reason: string }
}
```
- The escalate-gate field is **`escalate`** (NOT `escalateEligible`).
- LLM reconciliation is a **pure exported FUNCTION** (not a method): `reconcileStage1WithLlm(heuristic, refined)` — authored below (after Area C). Area E calls the function; it must NOT call `heuristic.reconcileWithLlm(...)`.

### 0.5 `Stage1ClassifierResult` (Area D)
`classifyStage1WithGemini(...): Promise<Stage1ClassifierResult | null>`, `Stage1ClassifierResult = { segment, needsClarify, confidence, complaint, clarifyQuestion }`. Consumed ONLY via `reconcileStage1WithLlm`.

### 0.6 `ChatbotCore` field additions (Area E)
Add `segment`, `clarify`, `stage1`, and **`carry: SegmentCarry`** to `ChatbotCore` in the **orchestration task (#25)** — where the context promise's carry first resolves, NOT the later persist task. Early returns supply `carry: { turnCount: 0 }`.

### 0.7 Model id constant
Area D exports `FAST_MODEL_ID` (alias of existing `DEFAULT_FAST_MODEL`). Area E imports it for `model_name` instead of the literal `"gemini-2.5-flash"`.

### 0.8 `chatbot_eval_runs` columns (canonical — db adopts eval's names)
Migration (Area A) and eval writer/reader (Area F) MUST agree on:
`id, created_at, run_label, scope_segment, total, duration_ms, category_match_rate, mode_ok_rate, source_rate, segment_match_rate, guardrail_raw_chunk_leak, guardrail_pricing_assertion, guardrail_sensitive_softening, faithful_rate, hallucination_rate, avg_score, judge_enabled, failure_count, report jsonb`.
- ⛔ **Area A**: use THESE names (not `total_cases`/`raw_chunk_leak_count`…). Update the alpha-db-contract probe to match.

### 0.9 View column names (canonical — match eval consumer)
`v_chatbot_segment_daily_stats` emits: `day, detected_segment, question_count, clarify_count, unresolved_count, handoff_count, avg_confidence, avg_first_token_ms, first_token_p95_ms, stage1_p95_ms`.
- ⛔ **Area A**: alias the percentiles `first_token_p95_ms` / `stage1_p95_ms` (NOT `p95_first_token_ms`). eval reads exactly these.

### 0.10 `v_chatbot_feedback_stats` — verify before recreate
Before recreating: (a) confirm `chatbot_feedback.answer_event_id` FK exists; (b) `grep -rn v_chatbot_feedback_stats app/admin` for consumers. If `question_label` is still consumed, KEEP it as an additional group key and only ADD `detected_segment` grouping. Do not silently drop columns.

### 0.11 Cache-version bump reconciliation (corrects spec §10 "Phase 1 bumps both")
- **Phase 0** = NO cache bump. The Phase 0 gate (#18) asserts both version constants are unchanged.
- **Phase 1** bumps **`ANSWER_CACHE_VERSION` only** (task #28). Justification: the clarify path changes output for ambiguous queries AND `CachedAnswerEntry` gains a `segment` field. `RETRIEVAL_CACHE_VERSION` is **deferred to Phase 2** (retrieval is unchanged in Phase 1). If task #28 as drafted bumps both, drop the RETRIEVAL bump. (Spec §10 already reconciled to match.)

### 0.12 Gap-fill tasks authored in this plan
- **reconcileStage1WithLlm** (Area C; lands after `classifyStage1Heuristic`, before pipeline orchestration #25) — see "Additional authored task" right after Area C.
- **clarify-compose wiring** (Area E; with/after #26) — see "Additional authored task" right after Area E.
- The **Phase 0 gate (#18)** MUST additionally assert `tests/chatbot/answer-policy-regression.test.ts` pinned substrings are unchanged (Phase 0 = no prompt change).

### 0.13 Prerequisite micro-task (already in order)
Export `createSupabaseAdminClient` + `hasSupabaseServerEnv` from `service.ts` (#7) before eval persist (#13).

---

## §0.5 Execution Order (authoritative — follow this sequence, not the Area grouping)

**Phase 0 — observability-first (no behavior change):**
1. [C] Define `ChatbotSegment` SSOT + sentiment/critical detectors (`segment.ts`)
2. [C] `segmentFromClassification` mapper with precedence (critical/complaint > pricing > existing_ops > prospect)
3. [C] Export Stage1 predicate functions from `service.ts` for the heuristic mapper
4. [A] Create Phase 0 observability migration (columns + `metadata` + indexes + 3 views + `chatbot_eval_runs`) — §0.8/0.9 column names
5. [A] Register migration + answer_events probe in alpha-db-contract
6. [A] Add `detected_segment` null-guard readiness check
7. [E] Export `createSupabaseAdminClient` + `hasSupabaseServerEnv` from service.ts (prereq)
8. [E] Thread heuristic `detected_segment` through `ChatbotCore` + `evaluateChatbotQuery` (no behavior change)
9. [E] Persist `detected_segment` + token/latency columns in `persistExchange` insert
10. [E] Capture `firstTokenAt` on first non-empty delta + thread `first_token_ms`; `model_name` from stream (cached path → null)
11. [F] Add `expectSegment` to `GoldenCase` + `segmentMatchRate` to eval report
12. [F] Deterministic guardrails block (rawChunkLeak/pricingAssertion/sensitiveSoftening) in eval
13. [F] Per-segment eval scope + persist last run to `chatbot_eval_runs` (§0.8 columns)
14. [F] Mechanically add `expectSegment` to all existing golden cases + golden-set schema test
15. [F] Add critical-incident handoff + clean pricing-consultation golden cases
16. [F] Extend `getChatbotStats` → `perSegment[]` + split latency `{firstTokenP95, completeP95}` (§0.9 names)
17. [F] Admin UI — segment distribution+performance table, split P95 card, regression-gate panel (lint+build only)
18. [A] **Phase 0 quality gate** — eslint + build + `vitest tests/chatbot` + `tests/db`; **assert NO cache bump**; **assert `answer-policy-regression.test.ts` pinned substrings unchanged** (§0.12); DB-apply + alpha-readiness green

**Phase 1 — Stage1 UNDERSTAND:**
19. [C] `computeHeuristicConfidence` + clarify/escalate thresholds
20. [C] `decideClarify` gating with loop-break (`lastClarifyAsked`) + safety guards (non-sensitive, non-critical)
21. [C] `classifyStage1Heuristic` assembler + `Stage1Result`/`SegmentCarry` contract (§0.3/0.4)
22. [C] **reconcileStage1WithLlm** pure function + unit test (§0.12 — authored after Area C)
23. [C] `SegmentPolicy` type stub (Phase 2 fills the table)
24. [D] `buildGenerationConfig` jsonMode + `classifyStage1WithGemini` (flash 1-call, thinkingBudget:0, null-on-fail) + flash budget guard
25. [E] `deriveCarryState(rows)` + `loadSessionContext` (history+carry in one round-trip)
26. [E] `classifyStage1` orchestration (heuristic + flash via `reconcileStage1WithLlm`) wired into core; `category` byte-compatible; add `carry` to ChatbotCore (§0.6)
27. [E] Explicit Stage1/Stage2 boundary + clarify gate in `shouldUseAiFinalAnswer`
28. [E] **clarify-compose wiring** — `answer = clarify.question`, `answerMode='clarifying_question'`, `clarify_offered=true`, skip retrieval+Gemini (§0.12 — authored after Area E)
29. [E] Persist `SegmentCarry` to `answer_events.metadata` + `CachedAnswerEntry.segment` field
30. [E] **Bump `ANSWER_CACHE_VERSION` only** (Phase 1 release-owned, LAST) — §0.11

---

---

# AREA A — DB Migration & Alpha-Readiness (Phase 0)

## Phase 0 — DB Migration + Alpha-Readiness (chatbot area)

> Verified against real source on 2026-06-24. CRITICAL CORRECTION to the spec: `chatbot_answer_events` has **NO `metadata` column** today (analytics migration `20260421_z_chatbot_analytics.sql:66-83`). The spec's "line 128" `metadata` is on `question_clusters`, not `chatbot_answer_events`. Phase 1 carry storage (a LOCKED requirement) depends on `chatbot_answer_events.metadata` existing, so this Phase 0 migration ADDS it now. `model_name/prompt_tokens/completion_tokens` DO already exist (lines 79-81). `v_chatbot_feedback_stats` is at lines 197-212 grouped by `detected_category, question_label`, using `with (security_invoker = true)`.
>
> **Verification note for all tasks in this section:** SQL migrations are NOT vitest-verifiable. They are verified by (a) applying the migration to the DB, (b) `scripts/check-alpha-db.ts` + the `/api/admin/docs/alpha-readiness` route turning green, and (c) the `tests/db/` + `tests/chatbot/` contract tests that assert the migration is *registered* and probe shapes are correct. Each task states which gate applies.

---

### Task: Create Phase 0 observability migration (columns + indexes + metadata + views + eval table)

**Files:**
- Create: `supabase/migrations/20260624_chatbot_segment_observability.sql`

- [ ] **Step 1: Write the failing test** — A migration `.sql` file cannot be unit-tested directly; the failing test is the registration+shape contract added in the next task plus the existing migration-presence test. For this task the "test" is a structural assertion that the file exists and contains the required DDL. Add to `tests/db/alpha-db-contract.test.ts`:
```ts
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

it("ships the Phase 0 chatbot segment observability migration with required DDL", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260624_chatbot_segment_observability.sql"),
    "utf8"
  )
  // new answer_events columns
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS detected_segment text")
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS first_token_ms integer")
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS stage1_ms integer")
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS clarify_offered boolean")
  // carry storage column (does NOT exist today — Phase 1 depends on it)
  expect(sql).toContain("ADD COLUMN IF NOT EXISTS metadata jsonb")
  // index on detected_segment
  expect(sql).toMatch(/create index if not exists chatbot_answer_events_segment_idx/i)
  // three views + eval table
  expect(sql).toMatch(/create or replace view public\.v_chatbot_segment_daily_stats/i)
  expect(sql).toMatch(/create or replace view public\.v_chatbot_feedback_stats/i)
  expect(sql).toContain("detected_segment") // feedback view regrouped by segment
  expect(sql).toMatch(/create or replace view public\.v_chatbot_handoff_funnel/i)
  expect(sql).toMatch(/create table if not exists public\.chatbot_eval_runs/i)
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/db/alpha-db-contract.test.ts` Expected: FAIL — `ENOENT: no such file ... 20260624_chatbot_segment_observability.sql` (the migration file does not exist yet).

- [ ] **Step 3: Implement** — Create `supabase/migrations/20260624_chatbot_segment_observability.sql`:
```sql
-- Phase 0 chatbot segment routing observability (no behavior change).
-- Adds segment + latency-split columns to chatbot_answer_events, a metadata
-- jsonb column for session-scoped carry state (Phase 1 dependency), a
-- per-segment index, three reporting views, and an eval-run trend table.
-- Depends on 20260421_z_chatbot_analytics.sql (chatbot_answer_events,
-- chatbot_feedback) and 20260616_chatbot_channel_talk_handoffs.sql.

-- ─── new columns on chatbot_answer_events ────────────────
ALTER TABLE public.chatbot_answer_events
  ADD COLUMN IF NOT EXISTS detected_segment text,
  ADD COLUMN IF NOT EXISTS first_token_ms integer,
  ADD COLUMN IF NOT EXISTS stage1_ms integer,
  ADD COLUMN IF NOT EXISTS clarify_offered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.chatbot_answer_events.detected_segment IS 'Heuristic business segment: prospect | pricing | existing_ops | support_complaint. May differ from detected_category (category stays byte-compatible).';
COMMENT ON COLUMN public.chatbot_answer_events.first_token_ms IS 'Time to first streamed token in ms. NULL for cached/short-circuit turns (no token stream).';
COMMENT ON COLUMN public.chatbot_answer_events.stage1_ms IS 'Stage1 UNDERSTAND duration in ms (heuristic + optional flash escalate).';
COMMENT ON COLUMN public.chatbot_answer_events.clarify_offered IS 'True when the turn returned a single clarifying question instead of an answer.';
COMMENT ON COLUMN public.chatbot_answer_events.metadata IS 'Session-scoped carry state (SegmentCarry) and other per-turn analytics. Phase 1 carry restoration reads the latest row metadata for this session.';

CREATE INDEX IF NOT EXISTS chatbot_answer_events_segment_idx
  ON public.chatbot_answer_events(detected_segment)
  WHERE detected_segment IS NOT NULL;

-- ─── v_chatbot_segment_daily_stats (day × segment) ───────
CREATE OR REPLACE VIEW public.v_chatbot_segment_daily_stats
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', e.created_at)::date AS day,
  coalesce(e.detected_segment, 'unsegmented') AS detected_segment,
  count(*) AS question_count,
  count(*) FILTER (WHERE e.clarify_offered) AS clarify_count,
  count(*) FILTER (WHERE e.unresolved) AS unresolved_count,
  count(*) FILTER (WHERE e.answer_mode = 'handoff') AS handoff_count,
  avg(e.confidence) AS avg_confidence,
  avg(e.first_token_ms) FILTER (WHERE e.first_token_ms IS NOT NULL) AS avg_first_token_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY e.first_token_ms)
    FILTER (WHERE e.first_token_ms IS NOT NULL) AS p95_first_token_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY e.stage1_ms)
    FILTER (WHERE e.stage1_ms IS NOT NULL) AS p95_stage1_ms
FROM public.chatbot_answer_events e
GROUP BY 1, 2;

COMMENT ON VIEW public.v_chatbot_segment_daily_stats IS 'Daily chatbot counts by detected_segment with clarify/unresolved/handoff counts and first-token / stage1 latency aggregates.';

-- ─── v_chatbot_feedback_stats (recreated: grouped by segment) ─
CREATE OR REPLACE VIEW public.v_chatbot_feedback_stats
WITH (security_invoker = true)
AS
SELECT
  coalesce(e.detected_segment, 'unsegmented') AS detected_segment,
  e.detected_category,
  count(f.id) AS feedback_count,
  count(f.id) FILTER (WHERE f.rating = 'helpful') AS helpful_count,
  count(f.id) FILTER (WHERE f.rating = 'not_helpful') AS not_helpful_count
FROM public.chatbot_answer_events e
LEFT JOIN public.chatbot_feedback f ON f.answer_event_id = e.id
GROUP BY 1, 2;

COMMENT ON VIEW public.v_chatbot_feedback_stats IS 'Chatbot helpful/not-helpful counts grouped by detected_segment and detected_category (regrouped from the original label/category view).';

-- ─── v_chatbot_handoff_funnel (events → answers → handoffs) ─
CREATE OR REPLACE VIEW public.v_chatbot_handoff_funnel
WITH (security_invoker = true)
AS
SELECT
  date_trunc('day', e.created_at)::date AS day,
  coalesce(e.detected_segment, 'unsegmented') AS detected_segment,
  count(*) AS answer_count,
  count(*) FILTER (WHERE e.answer_mode = 'handoff') AS handoff_answer_count,
  count(h.id) AS handoff_row_count,
  count(h.id) FILTER (WHERE h.status = 'sent') AS handoff_sent_count
FROM public.chatbot_answer_events e
LEFT JOIN public.chatbot_channel_handoffs h ON h.answer_event_id = e.id
GROUP BY 1, 2;

COMMENT ON VIEW public.v_chatbot_handoff_funnel IS 'Per-day, per-segment funnel from answer events to Channel Talk handoff rows (created and sent).';

-- ─── chatbot_eval_runs (golden eval trend persistence) ───
CREATE TABLE IF NOT EXISTS public.chatbot_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_label text,
  total_cases integer NOT NULL DEFAULT 0,
  segment_match_rate numeric(5,4),
  mode_ok_rate numeric(5,4),
  faithful_rate numeric(5,4),
  hallucination_rate numeric(5,4),
  avg_score numeric(5,2),
  raw_chunk_leak_count integer NOT NULL DEFAULT 0,
  pricing_assertion_count integer NOT NULL DEFAULT 0,
  sensitive_softening_count integer NOT NULL DEFAULT 0,
  judge_enabled boolean NOT NULL DEFAULT false,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chatbot_eval_runs IS 'One row per golden-set eval run for admin delta/trend display. Deterministic guardrail counts are the hard gate; judge metrics are advisory.';

CREATE INDEX IF NOT EXISTS chatbot_eval_runs_created_idx
  ON public.chatbot_eval_runs(created_at desc);

-- ─── RLS for chatbot_eval_runs (match existing chatbot tables) ─
ALTER TABLE public.chatbot_eval_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read chatbot eval runs"
  ON public.chatbot_eval_runs FOR SELECT
  USING (is_active_admin());

CREATE POLICY "Service role manage chatbot eval runs"
  ON public.chatbot_eval_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/db/alpha-db-contract.test.ts`. Then DB-apply verification (not vitest): apply the migration to staging and run `npx tsx scripts/check-alpha-db.ts` — expect no `chatbot_answer_events` probe error once the next task registers it.

- [ ] **Step 5: Commit** — `git add supabase/migrations/20260624_chatbot_segment_observability.sql tests/db/alpha-db-contract.test.ts && git commit -m "feat(chatbot): Phase 0 segment observability migration (columns, metadata, views, eval_runs)"`

---

### Task: Register migration + answer_events probe in alpha-db-contract

**Files:**
- Modify: `lib/chatbot/alpha-db-contract.ts`(:41-54 `ALPHA_DB_MIGRATIONS`, :56-144 `ALPHA_DB_TABLE_PROBES`)
- Test: `tests/db/alpha-db-contract.test.ts`

- [ ] **Step 1: Write the failing test** — Add to `tests/db/alpha-db-contract.test.ts` inside the existing `describe("alpha DB contract")`:
```ts
it("registers the Phase 0 segment observability migration", () => {
  expect(ALPHA_DB_MIGRATIONS).toContain(
    "supabase/migrations/20260624_chatbot_segment_observability.sql"
  )
})

it("probes chatbot_answer_events for the new segment + latency columns", () => {
  const probe = ALPHA_DB_TABLE_PROBES.find((p) => p.table === "chatbot_answer_events")
  expect(probe).toBeDefined()
  expect(probe!.migration).toBe(
    "supabase/migrations/20260624_chatbot_segment_observability.sql"
  )
  const select = buildAlphaDbProbeSelect(probe!)
  expect(select).toContain("detected_segment")
  expect(select).toContain("first_token_ms")
  expect(select).toContain("metadata")
  expect(select).not.toBe("*")
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/db/alpha-db-contract.test.ts` Expected: FAIL — `ALPHA_DB_MIGRATIONS` does not contain the new path and `ALPHA_DB_TABLE_PROBES.find(... "chatbot_answer_events")` is `undefined`.

- [ ] **Step 3: Implement** — Two edits in `lib/chatbot/alpha-db-contract.ts`.

Edit 1, append the migration to the `ALPHA_DB_MIGRATIONS` array (after the last entry `...20260616_chatbot_channel_talk_handoffs.sql",` on line 53):
```ts
  "supabase/migrations/20260616_chatbot_channel_talk_handoffs.sql",
  "supabase/migrations/20260624_chatbot_segment_observability.sql",
]
```

Edit 2, add a new probe object to `ALPHA_DB_TABLE_PROBES`. Insert it directly after the `chatbot_channel_handoffs` entry (which ends at line 119 `},`):
```ts
  {
    table: "chatbot_answer_events",
    label: "챗봇 답변 이벤트",
    columns: [
      "id",
      "session_id",
      "detected_category",
      "detected_segment",
      "answer_mode",
      "confidence",
      "first_token_ms",
      "stage1_ms",
      "clarify_offered",
      "metadata",
    ],
    migration: "supabase/migrations/20260624_chatbot_segment_observability.sql",
  },
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/db/alpha-db-contract.test.ts && vitest run tests/db/alpha-db-check-script.test.ts`. The targeted `select` (column list, not `*`) means a missing column on a stale DB fails fast through `scripts/check-alpha-db.ts`.

- [ ] **Step 5: Commit** — `git add lib/chatbot/alpha-db-contract.ts tests/db/alpha-db-contract.test.ts && git commit -m "feat(chatbot): register segment observability migration + answer_events probe"`

---

### Task: Add detected_segment null-guard readiness check

**Files:**
- Modify: `lib/chatbot/alpha-readiness.ts`(:5-16 input type, :71-133 checks array, add new builder near :245)
- Modify: `app/api/admin/docs/alpha-readiness/route.ts`(:25-41 helpers, :69-121 query batch + call)
- Test: `tests/chatbot/alpha-readiness.test.ts`

> The readiness route is verified by lint+build + the pure-function readiness test below. The actual DB count is supplied by the route at runtime; the pure builder is unit-tested with both inputs (recent rows present but unlabeled → warning; all labeled → ok). This separates the deterministic logic (testable) from the Supabase round-trip (lint+build only).

- [ ] **Step 1: Write the failing test** — Add to `tests/chatbot/alpha-readiness.test.ts`:
```ts
it("warns when recent answer events are missing detected_segment (logging not wired)", () => {
  const report = buildChatbotAlphaReadiness({
    hasSupabaseEnv: true,
    hasGeminiApiKey: true,
    docsArticleCount: 24,
    docsChunkCount: 120,
    embeddedChunkCount: 120,
    recommendedQuestionCount: 5,
    unresolvedGapCount: 0,
    zeroResultSearchCount: 0,
    recentAnswerEventCount: 50,
    recentSegmentLabeledCount: 0,
  })

  const segmentCheck = report.checks.find((check) => check.key === "segment_logging")
  expect(segmentCheck?.status).toBe("warning")
  expect(segmentCheck?.detail).toContain("detected_segment")
  expect(segmentCheck?.action).toContain("buildChatbotCore")
})

it("marks segment logging ok once recent events are labeled", () => {
  const report = buildChatbotAlphaReadiness({
    hasSupabaseEnv: true,
    hasGeminiApiKey: true,
    docsArticleCount: 24,
    docsChunkCount: 120,
    embeddedChunkCount: 120,
    recommendedQuestionCount: 5,
    unresolvedGapCount: 0,
    zeroResultSearchCount: 0,
    recentAnswerEventCount: 50,
    recentSegmentLabeledCount: 50,
  })

  expect(report.checks.find((check) => check.key === "segment_logging")?.status).toBe("ok")
})

it("skips the segment logging check when there are no recent events yet", () => {
  const report = buildChatbotAlphaReadiness({
    hasSupabaseEnv: true,
    hasGeminiApiKey: true,
    docsArticleCount: 24,
    docsChunkCount: 120,
    embeddedChunkCount: 120,
    recommendedQuestionCount: 5,
    unresolvedGapCount: 0,
    zeroResultSearchCount: 0,
    recentAnswerEventCount: 0,
    recentSegmentLabeledCount: 0,
  })

  expect(report.checks.find((check) => check.key === "segment_logging")?.status).toBe("ok")
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/alpha-readiness.test.ts` Expected: FAIL — `report.checks.find(... "segment_logging")` is `undefined` (no such check exists; the input fields are also not yet on the type).

- [ ] **Step 3: Implement** — Three edits.

Edit 1 — extend the input interface in `lib/chatbot/alpha-readiness.ts` (`ChatbotAlphaReadinessInput`, after `zeroResultSearchCount: number` on line 13):
```ts
  zeroResultSearchCount: number
  recentAnswerEventCount?: number
  recentSegmentLabeledCount?: number
```

Edit 2 — add the check to the `checks` array in `buildChatbotAlphaReadiness`. Insert after `buildGapBacklogCheck(unresolvedGapCount, zeroResultSearchCount),` (line 132):
```ts
    buildGapBacklogCheck(unresolvedGapCount, zeroResultSearchCount),
    buildSegmentLoggingCheck(
      clampCount(input.recentAnswerEventCount ?? 0),
      clampCount(input.recentSegmentLabeledCount ?? 0)
    ),
```

Edit 3 — add the builder function at the end of the file (after `buildGapBacklogCheck`, line 263):
```ts
function buildSegmentLoggingCheck(
  recentAnswerEventCount: number,
  recentSegmentLabeledCount: number
): ChatbotAlphaReadinessCheck {
  if (recentAnswerEventCount <= 0) {
    return {
      key: "segment_logging",
      label: "세그먼트 로깅",
      status: "ok",
      detail: "아직 집계할 최근 답변 이벤트가 없어 세그먼트 로깅을 평가하지 않았습니다.",
    }
  }

  const labeled = Math.min(recentSegmentLabeledCount, recentAnswerEventCount)
  if (labeled >= recentAnswerEventCount) {
    return {
      key: "segment_logging",
      label: "세그먼트 로깅",
      status: "ok",
      detail: `최근 ${recentAnswerEventCount}건 답변 이벤트에 detected_segment가 모두 기록되었습니다.`,
    }
  }

  return {
    key: "segment_logging",
    label: "세그먼트 로깅",
    status: "warning",
    detail: `최근 ${recentAnswerEventCount}건 중 ${labeled}건만 detected_segment가 채워졌습니다. 세그먼트 백필/로깅이 연결되지 않았을 수 있습니다.`,
    action: "buildChatbotCore 세그먼트 계산이 persistExchange insert로 detected_segment를 기록하는지 확인",
  }
}
```

Edit 4 — wire the route to supply the counts. In `app/api/admin/docs/alpha-readiness/route.ts`, add two `readCount` calls to the `Promise.all` batch (after the `chatbot_recommended_questions` readCount, line 102) and pass them through. Replace the destructured array and the `Promise.all` tail:

Change the destructure (lines 69-75) to add two names:
```ts
    const [
      docsArticleCount,
      docsChunkCount,
      embeddedChunkCount,
      recommendedQuestionCount,
      recentAnswerEventCount,
      recentSegmentLabeledCount,
      backlog,
    ] = await Promise.all([
```

Insert two `readCount` entries right after the `chatbot_recommended_questions` readCount block (after its closing `),` on line 102), before `listDocGapBacklog(...)`:
```ts
      readCount(
        "chatbot_answer_events.recent",
        supabase
          .from("chatbot_answer_events")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        warnings
      ),
      readCount(
        "chatbot_answer_events.detected_segment",
        supabase
          .from("chatbot_answer_events")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .not("detected_segment", "is", null),
        warnings
      ),
```

Pass them into the builder call (the `buildChatbotAlphaReadiness({...})` at lines 110-120), adding before `warnings,`:
```ts
        unresolvedGapCount: backlog.gapClusters.length,
        zeroResultSearchCount: backlog.zeroResultSearches.length,
        recentAnswerEventCount,
        recentSegmentLabeledCount,
        warnings,
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/alpha-readiness.test.ts`. Then route-level verification (not vitest): `npx eslint app components lib --max-warnings=0 && npm run build` (the route's Supabase round-trip is verified only by lint+build; the warning logic is covered by the pure-function test above). DB-apply verification: hit `/api/admin/docs/alpha-readiness` after applying the migration and confirm `segment_logging` resolves to warning (pre-Phase-1) → ok (post-Phase-1 logging).

- [ ] **Step 5: Commit** — `git add lib/chatbot/alpha-readiness.ts app/api/admin/docs/alpha-readiness/route.ts tests/chatbot/alpha-readiness.test.ts && git commit -m "feat(chatbot): alpha readiness detected_segment null-guard check"`

---

### Task: Quality gate for Phase 0 DB area

**Files:**
- (no source change) verification-only

- [ ] **Step 1: Write the failing test** — N/A (aggregate gate task).
- [ ] **Step 2: Run test, verify FAIL** — N/A.
- [ ] **Step 3: Implement** — N/A.
- [ ] **Step 4: Run all gates** — Run: `npx eslint app components lib --max-warnings=0 && npm run build && vitest run tests/chatbot/ tests/db/`. All green. Then manual DB-apply gate (Phase 0 exit criterion): apply `20260624_chatbot_segment_observability.sql`, run `npx tsx scripts/check-alpha-db.ts` (chatbot_answer_events probe ok), open `/api/admin/docs/alpha-readiness` (database_shape ok, segment_logging warning until Phase 1 logging lands). Confirm **no cache bump** was made (Phase 0 changes neither prompts nor answers — `ANSWER_CACHE_VERSION`/`RETRIEVAL_CACHE_VERSION` must be untouched).
- [ ] **Step 5: Commit** — N/A (no diff; gate only).

---

## DEPENDENCIES & TYPES

**This area DEFINES (other areas/phases consume):**
- DB columns `chatbot_answer_events.detected_segment` (text), `.first_token_ms` (int), `.stage1_ms` (int), `.clarify_offered` (bool), and **`.metadata` (jsonb)** — the metadata column did **not** previously exist; Phase 1 carry storage (`SegmentCarry` in `chatbot_answer_events.metadata`, a LOCKED requirement) **depends on this task**. The persistExchange insert at `lib/chatbot/service.ts:2691-2710` must be extended in the persistence/service area (Phase 0 service-write task, separate area) to populate these columns; this task only creates them and registers the probe.
- Views `v_chatbot_segment_daily_stats`, `v_chatbot_feedback_stats` (recreated, now keyed by `detected_segment`), `v_chatbot_handoff_funnel` — consumed by the admin `/admin/chatbot` area (segment table, P95 split, handoff funnel).
- Table `chatbot_eval_runs` — consumed by the eval-harness area (`lib/chatbot/eval.ts` last-run persistence) and the admin regression panel.
- `ChatbotAlphaReadinessInput.recentAnswerEventCount` / `.recentSegmentLabeledCount` (new optional fields) + the `segment_logging` check key — consumed by `app/api/admin/docs/alpha-readiness/route.ts` (wired here) and surfaced by the admin readiness UI.

**This area CONSUMES (must exist / unchanged):**
- `is_active_admin()` SQL function (defined in base admin schema) — used by `chatbot_eval_runs` RLS policy.
- Existing `chatbot_answer_events` (analytics migration), `chatbot_feedback`, `chatbot_channel_handoffs` tables — the views join against these; column names verified (`detected_category`, `answer_mode`, `unresolved`, `confidence`, `created_at`, handoffs `status`/`answer_event_id`).
- `with (security_invoker = true)` view convention + `gen_random_uuid()` — established by the analytics migration.

**Sequencing notes:**
- The `ChatbotSegment` SSOT type lives in NEW `lib/chatbot/segment.ts` (created by the Stage1 classifier area, not here). This DB area writes/reads `detected_segment` as a free `text` column and does NOT import that type — no compile-time dependency on `segment.ts`, so these migration tasks can land independently and **before** the classifier code.
- Phase 0 = **no cache bump** (asserted in the gate task). Cache bump belongs to Phase 1.
- Order within this area: migration file → contract registration → readiness check → gate. The contract test for the migration file (Task 1 Step 1) and the registration test (Task 2) both touch `tests/db/alpha-db-contract.test.ts`; land Task 1 before Task 2 to avoid a transient red on the registration assertions.

---

# AREA B — Test Harness Conventions (reference)

## Reference: Test Harness Conventions (chatbot area)

This section is a cross-cutting reference for all Phase 0/1 tasks. It documents how to run, write, and not-break the vitest suite. Other areas cite it instead of re-deriving the conventions.

### Runner config
- Config: `vitest.config.ts` — `environment: "node"` (NO DOM/jsdom). Vitest `^4.1.5` (`package.json`). UI/React components are NOT unit-tested; verify them with `npx eslint app components lib --max-warnings=0` + `npm run build` only.
- Path aliases (`vitest.config.ts:13-19`):
  - `@` → repo root (use `@/lib/chatbot/...` in every test import).
  - `server-only` → `tests/__mocks__/server-only.ts` (no-op `export {}`), so importing `lib/chatbot/service.ts` / `lib/chatbot/eval.ts` (which do `import "server-only"`) works in node env.
  - `@/lib/google` → `tests/__mocks__/lib-google.ts` (stubs `sheets`/`calendar`/`gmail`, `appendSheetRow`/`createCalendarEvent`/`sendGmail` → return null). Do not import the real Google client in tests.
- Worktrees are excluded (`vitest.config.ts:7-11`).

### Run commands (use these exact forms in plan task Step 2/4)
- Whole chatbot suite: `npx vitest run tests/chatbot/`
- Single file: `npx vitest run tests/chatbot/segment.test.ts`
- Single test by name: `npx vitest run tests/chatbot/segment.test.ts -t "classifies pricing wording as pricing"`
- Repo-wide gate (what `npm test` does): `npx vitest run --dir tests`
- Quality gate (always both, after any code change): `npx eslint app components lib --max-warnings=0` && `npm run build`.

### Import style + pure-function pattern
- Test header is uniformly: `import { describe, expect, it } from "vitest"` (add `afterEach, vi` only when stubbing — see below). Subject under test imported by `@` alias, e.g. `import { classifyChatbotQuestion } from "@/lib/chatbot/classification"`.
- Pure-function tests (the ONLY kind unit-tested) call the exported function and assert on the return value, no mocks. Canonical examples:
  - `tests/chatbot/classification.test.ts` — `classifyChatbotQuestion` / `detectChatbotCategory` / `detectChatbotHandoffIntent`, asserts on `result.category`/`result.intent`/`result.handoffIntent`.
  - `tests/chatbot/page-context.test.ts` — `resolvePageContext` / `mergeStarters`.
  - `tests/chatbot/teaser-policy.test.ts` — `shouldShowTeaser` with an exported constant (`TEASER_DWELL_THRESHOLD_MS`) asserted directly; copy this shape when exporting Phase-1 thresholds (e.g. an ambiguous-band similarity constant) so they get a pinned assertion.
  - `tests/chatbot/open-chatbot.test.ts`, `tests/chatbot/pricing-guardrail.test.ts` — small SSOT/constant guards. **New `lib/chatbot/segment.ts` SSOT type + classifier belongs in a new `tests/chatbot/segment.test.ts` following exactly this pure-function shape.**
- Data-driven guard pattern: `tests/chatbot/golden-set.test.ts` reads `data/chatbot-golden-set.json` via `readFileSync(join(process.cwd(), "data/chatbot-golden-set.json"), "utf8")` and asserts on case ids/fields. Use this for any golden-set additions (it locks id uniqueness and required headings).

### Service-level tests + mock conventions (for tasks that touch `service.ts` / carry persistence)
- `tests/chatbot/answer-policy-regression.test.ts` is the integration-style file. It does NOT hit the network or Supabase — it stubs them:
  - `disableExternalChatbotServices()` (`:5-11`) stubs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` to `""` → Supabase + Gemini are inert, so `chatbot_answer_events` writes are no-ops in test. **A Phase-0 carry-persistence unit test cannot assert a real DB write; assert the computed payload via a pure builder (e.g. a `buildAnswerEventMetadata`/`detectSegment` helper) instead, and reserve DB wiring for lint+build verification.**
  - `enableMockGemini()` (`:13-18`) sets `GEMINI_API_KEY` to a fake key and blanks model-name env vars.
  - Network is mocked with `vi.stubGlobal("fetch", fetchMock)`; Gemini generation calls are detected by URL substring `":generateContent"` (`:45-48`, `:147-149`). To assert "curated/blocked path skipped Gemini": `expect(generationCalls).toHaveLength(0)` or `expect(fetchMock).not.toHaveBeenCalled()`.
  - `evaluateChatbotQuery(question, { generateAnswer: false })` (`:208-211`) runs the deterministic path with NO Gemini — the cheapest way to assert classification/segment/answer-mode without network.
  - Teardown is mandatory: `afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })` (`:21-25`). Copy verbatim into any new stub-using test.
- Service exports already available to tests: `evaluateChatbotQuery` (`lib/chatbot/service.ts:3249`), `handleChatbotQuery`, `listChatbotRegressionEvalCases` (`lib/chatbot/service.ts:4004`).

### Answer-policy pinned-string pattern (Phase 1 prompt changes WILL trip this — handle deliberately)
`tests/chatbot/answer-policy-regression.test.ts` pins exact substrings of the **system instruction** and **final-generation prompt** that go to Gemini (`:156-166`). These are load-bearing assertions:
- systemInstruction must contain: `"답변은 먼저 상태를 정하고 쓴다"`, `"근거가 없는 기능명"`, `"안전 초안의 미지원"`, `"대화 이력은 맥락 참고용"`.
- prompt must contain: `"분류:"`, `"현재 응답 모드:"`, `"안전 초안(제약 조건"`, `"고객 질문:"`, `"문서, 출처, URL, 이미지 경로는 쓰지 마"`, `"가능/지원/기본 제공으로 완화하지 마"`.
- Curated/blocked-path guards also pin output substrings (e.g. `"S75"`, `"학원 결제 기능은 제공하지 않습니다"`, `"별도 결제/정산 연동"`, `"도와드리지 않습니다"`) and negative guards (`not.toContain("GEMINI가 재작성하면 안 됨")`, no `https?://|!\[|\.png|출처|문서` leakage).

**Phase 1 rule:** if a Phase 1 task injects a per-segment line into the prompt/systemInstruction, it must (a) keep all the above pinned substrings intact, and (b) add its own new pinned-substring assertion in the same file in the same task — never loosen an existing pin to "make room". If a new prompt token is added (e.g. `"세그먼트:"`), add a positive assertion for it alongside the existing `"분류:"`/`"현재 응답 모드:"` block. This is also the task that owns the `RETRIEVAL_CACHE_VERSION` + `ANSWER_CACHE_VERSION` bump (Phase 1 only — Phase 0 must not bump).

### Golden eval harness (NOT part of vitest — separate gate)
- `lib/chatbot/eval.ts` is `server-only` and runs the full `evaluateChatbotQuery` pipeline over `data/chatbot-golden-set.json`. It is invoked through the admin API route `app/api/admin/chatbot/eval/route.ts` (and surfaced in the `/admin/chatbot` console), NOT from `npx vitest`. Deterministic metrics (category hit / answer-mode fit / source coverage) always run; the LLM judge (Gemini, `JUDGE_MODEL` from `GEMINI_FAST_MODEL`) is skipped when `GEMINI_API_KEY` is unset.
- For plan steps: "golden eval" = run via the admin `/admin/chatbot` console / `POST /api/admin/chatbot/eval`, treated as a manual quality gate, separate from `npx vitest run tests/chatbot/`. The vitest-side golden coverage guard is only the static shape check in `tests/chatbot/golden-set.test.ts`.

### DEPENDENCIES & TYPES
This is a reference-only section and defines no symbols. It documents conventions the other areas **consume**:
- Run-command forms, `@`-alias import style, and the `afterEach` teardown block — consumed by every Phase 0/1 task's test steps.
- The stub helpers `disableExternalChatbotServices` / `enableMockGemini` and the `":generateContent"`-URL fetch-mock idiom — consumed by any task touching `service.ts` (segment detection, carry persistence into `chatbot_answer_events.metadata`).
- The `{ generateAnswer: false }` deterministic-path option on `evaluateChatbotQuery` — consumed by Phase 1 Stage1/Stage2 refactor tests that assert classification/segment without network.
- The pinned-string list (systemInstruction + prompt substrings) and the "add-don't-loosen" rule — a hard constraint the Phase 1 prompt/cache-bump task must satisfy.
- Reminder for the segment-classifier task: the new SSOT type `Segment = "prospect"|"pricing"|"existing_ops"|"support_complaint"` lives in **new** `lib/chatbot/segment.ts`, and its unit test belongs in **new** `tests/chatbot/segment.test.ts` following the `classification.test.ts` pure-function shape.

---

# AREA C — segment.ts SSOT + Heuristic Classifier (Phase 0+1)

## Phase 0 + Phase 1 — Segment SSOT & Stage1 Heuristic Classifier (`lib/chatbot/segment.ts` + `classification.ts`)

> Area scope: pure functions only, fully unit-tested in `tests/chatbot/segment.test.ts` (vitest, node env, no DOM). All tasks below are TDD-verifiable. No prompt/answer text changes in Phase 0 tasks → no cache bump in Phase 0. Cache bumps and the actual Stage1 wiring into `buildChatbotCore` live in the service.ts area's tasks (out of this file's scope), but the contract these functions define is consumed there.

---

### Task: Define ChatbotSegment SSOT type + sentiment/critical detectors (Phase 0)

**Files:**
- Create: `lib/chatbot/segment.ts`
- Create: `tests/chatbot/segment.test.ts`

- [ ] **Step 1: Write the failing test** — append to a new `tests/chatbot/segment.test.ts`:
```ts
import { describe, expect, it } from "vitest"

import {
  detectComplaintSentiment,
  detectCriticalIncident,
} from "@/lib/chatbot/segment"

describe("detectComplaintSentiment", () => {
  it("returns neutral for plain informational questions", () => {
    expect(detectComplaintSentiment("요금이 얼마예요?")).toBe("neutral")
    expect(detectComplaintSentiment("출결 기능 있나요?")).toBe("neutral")
  })

  it("returns frustrated for mild dissatisfaction signals", () => {
    expect(detectComplaintSentiment("로그인이 자꾸 안돼요 불편하네요")).toBe("frustrated")
    expect(detectComplaintSentiment("이거 또 안 되네요")).toBe("frustrated")
  })

  it("returns angry for strong anger/profanity/escalation signals", () => {
    expect(detectComplaintSentiment("진짜 최악이네요 환불해주세요")).toBe("angry")
    expect(detectComplaintSentiment("너무 화나요 당장 책임지세요")).toBe("angry")
  })

  it("prefers angry over frustrated when both bands match", () => {
    expect(detectComplaintSentiment("또 안되네 진짜 최악이야")).toBe("angry")
  })
})

describe("detectCriticalIncident", () => {
  it("flags live-class disruption as critical", () => {
    expect(detectCriticalIncident("수업 중인데 갑자기 끊겼어요")).toBe(true)
    expect(detectCriticalIncident("라이브 수업이 중단됐어요")).toBe(true)
    expect(detectCriticalIncident("수업 중 화면이 멈췄어요")).toBe(true)
  })

  it("flags login/access outage as critical", () => {
    expect(detectCriticalIncident("로그인이 안돼요 접속이 안됩니다")).toBe(true)
    expect(detectCriticalIncident("접속 장애가 났어요")).toBe(true)
  })

  it("does not flag non-urgent informational questions", () => {
    expect(detectCriticalIncident("요금제 알려주세요")).toBe(false)
    expect(detectCriticalIncident("전자칠판 사이즈 뭐 있어요?")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts`. Expected: fail with module-resolution error (`Cannot find module '@/lib/chatbot/segment'`) because the file does not exist yet.

- [ ] **Step 3: Implement** — create `lib/chatbot/segment.ts` with the type SSOT, sentiment detector, and critical-incident detector. The critical regex deliberately mirrors `service.ts` `LIVE_CLASS_TROUBLE_RE` (line 630) + `LOGIN_TROUBLE_RE` (line 627) shapes plus 화면 멈춤 / 접속 장애:
```ts
// lib/chatbot/segment.ts
// 챗봇 세그먼트 라우팅 단일 SSOT. 4개 비즈니스 세그먼트 + 휴리스틱 1차 프리미티브.
// classification.ts 의 검증된 정규식/카테고리에서 파생한다(병렬 분류기 아님).

export type ChatbotSegment = "prospect" | "pricing" | "existing_ops" | "support_complaint"

export type ComplaintSentiment = "neutral" | "frustrated" | "angry"

// angry: 분노·욕설·강한 에스컬레이션/보상 요구. frustrated: 가벼운 불만·반복 실패 토로.
const ANGRY_RE =
  /최악|진짜\s*(너무|짜증|화|열받)|화나|열받|빡쳐|미치겠|당장|책임\s*지|법적|소송|고소|환불\s*해|보상\s*해|짜증\s*나|짜증나|개\s*같|어이없|황당|실망/i
const FRUSTRATED_RE =
  /불편|불만|또\s*안|자꾸\s*안|아직(도)?\s*안|계속\s*안|왜\s*안|짜증|느려\s*터|답답|안\s*되네|안되네|안\s*돼요|안돼요|언제\s*(고쳐|해결)/i

export function detectComplaintSentiment(text: string): ComplaintSentiment {
  const lower = text.toLowerCase()
  if (ANGRY_RE.test(lower)) return "angry"
  if (FRUSTRATED_RE.test(lower)) return "frustrated"
  return "neutral"
}

// 긴급 운영 장애: 수업 끊김/라이브 중단·로그인 불가/접속 장애·수업 중 화면 멈춤.
// service.ts LIVE_CLASS_TROUBLE_RE / LOGIN_TROUBLE_RE 의 핵심 신호를 미러링한다.
const CRITICAL_LIVE_RE =
  /수업.*(끊김|끊겨|끊었|중단|나가|나감|튕김|튕겨|입장\s*안|접속\s*안|멈췄|멈춤|멈춰|먹통)|라이브\s*수업.*(끊김|끊겨|중단|멈췄|멈춤|안\s*됨|안\s*돼)|화면.*(멈췄|멈춤|멈춰|먹통)/i
const CRITICAL_ACCESS_RE =
  /로그인.*(안\s*됨|안\s*돼|안\s*되|불가|먹통)|접속.*(안\s*됨|안\s*돼|안\s*되|불가|장애|먹통)|(서비스|서버).*(다운|장애|먹통|안\s*됨)|접속\s*장애|로그인\s*불가/i

export function detectCriticalIncident(text: string): boolean {
  const lower = text.toLowerCase()
  return CRITICAL_LIVE_RE.test(lower) || CRITICAL_ACCESS_RE.test(lower)
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment.test.ts`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): segment SSOT type + sentiment/critical detectors (Phase 0)"`

---

### Task: Export Stage1 predicate functions from service.ts for the heuristic mapper (Phase 0)

**Files:**
- Modify: `lib/chatbot/service.ts` (:683, :701, :706, :758, :775, :783, :1874, :1881, :2913 — add `export` keyword to 9 predicates)
- Test: covered indirectly by Phase 1 classifier tests; this task itself is lint+build verified only (adding `export` to module-private fns introduces no behavior change).

> NOTE: This is a verification-by-build task — no new unit test. The predicates are pure but take `NormalizedQuestion` (a service-internal interface), so they are NOT directly tested in segment.test.ts; the Stage1 classifier (next task) consumes them through a thin adapter and is tested there. Verify only via lint+build.

- [ ] **Step 1: Write the failing test** — none (lint+build verified task). Confirm current state: Run `grep -n "^function isPricingInfoQuestion" lib/chatbot/service.ts` and confirm it is NOT exported.

- [ ] **Step 2: Run test, verify FAIL** — Run: `grep -cE "^export function (isPricingInfoQuestion|isSoftwarePricingQuestion|isWebLiveBillingQuestion|isS65QuoteQuestion|isComparisonQuestion|isIdentityQuestion|isSensitiveOrAccountSpecificQuestion|isCuratedTemplateQuestion|isDomainRelatedQuestion)\b" lib/chatbot/service.ts`. Expected: prints `0` (none exported yet).

- [ ] **Step 3: Implement** — add the `export` keyword to exactly these 9 declarations (leave bodies and the `NormalizedQuestion` parameter type unchanged):
  - `function isS65QuoteQuestion(` → `export function isS65QuoteQuestion(` (:683)
  - `function isComparisonQuestion(` → `export function isComparisonQuestion(` (:701)
  - `function isIdentityQuestion(` → `export function isIdentityQuestion(` (:706)
  - `function isWebLiveBillingQuestion(` → `export function isWebLiveBillingQuestion(` (:758)
  - `function isPricingInfoQuestion(` → `export function isPricingInfoQuestion(` (:775)
  - `function isSoftwarePricingQuestion(` → `export function isSoftwarePricingQuestion(` (:783)
  - `function isDomainRelatedQuestion(` → `export function isDomainRelatedQuestion(` (:1874)
  - `function isSensitiveOrAccountSpecificQuestion(` → `export function isSensitiveOrAccountSpecificQuestion(` (:1881)
  - `function isCuratedTemplateQuestion(` → `export function isCuratedTemplateQuestion(` (:2913)

  Also export the `NormalizedQuestion` interface (:104) so the Stage1 adapter can type its input:
  - `interface NormalizedQuestion {` → `export interface NormalizedQuestion {` (:104)

- [ ] **Step 4: Run test, verify PASS** — Run: `npx eslint app components lib --max-warnings=0 && npm run build`. Then `grep -cE "^export function (isPricingInfoQuestion|isSoftwarePricingQuestion|isWebLiveBillingQuestion|isS65QuoteQuestion|isComparisonQuestion|isIdentityQuestion|isSensitiveOrAccountSpecificQuestion|isCuratedTemplateQuestion|isDomainRelatedQuestion)\b" lib/chatbot/service.ts` → prints `9`.

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts && git commit -m "refactor(chatbot): export Stage1 predicate fns + NormalizedQuestion for segment mapper (Phase 0)"`

---

### Task: segmentFromClassification mapper with precedence (Phase 0)

**Files:**
- Modify: `lib/chatbot/segment.ts`
- Modify: `tests/chatbot/segment.test.ts`

> The mapper derives a segment from the EXISTING 8-category classifier output + sentiment + critical flag + a thin set of pricing/sensitivity predicate booleans, so it stays a pure function with primitive args (no `NormalizedQuestion` dependency leaked into segment.ts). Precedence is LOCKED: **critical/complaint > pricing > existing_ops > prospect**.

- [ ] **Step 1: Write the failing test** — append to `tests/chatbot/segment.test.ts`:
```ts
import { segmentFromClassification } from "@/lib/chatbot/segment"
import type { SegmentMapperInput } from "@/lib/chatbot/segment"

const base: SegmentMapperInput = {
  category: "general",
  intent: "docs_lookup",
  sentiment: "neutral",
  critical: false,
  isPricing: false,
  isSensitive: false,
}

describe("segmentFromClassification precedence", () => {
  it("angry billing complaint maps to support_complaint, NOT pricing", () => {
    expect(
      segmentFromClassification({
        ...base,
        category: "billing",
        intent: "billing_support",
        sentiment: "angry",
        isPricing: true,
        isSensitive: true,
      })
    ).toBe("support_complaint")
  })

  it("critical incident always maps to support_complaint regardless of category", () => {
    expect(
      segmentFromClassification({ ...base, category: "billing", critical: true, isPricing: true })
    ).toBe("support_complaint")
  })

  it("troubleshooting category maps to support_complaint", () => {
    expect(
      segmentFromClassification({ ...base, category: "troubleshooting", intent: "troubleshooting" })
    ).toBe("support_complaint")
  })

  it("neutral pricing question maps to pricing", () => {
    expect(
      segmentFromClassification({ ...base, category: "billing", intent: "billing_support", isPricing: true })
    ).toBe("pricing")
  })

  it("admin/classroom operations map to existing_ops", () => {
    expect(
      segmentFromClassification({ ...base, category: "admin", intent: "admin_operations" })
    ).toBe("existing_ops")
    expect(
      segmentFromClassification({ ...base, category: "classroom", intent: "classroom_consulting" })
    ).toBe("existing_ops")
  })

  it("onboarding/consultation map to prospect by default", () => {
    expect(
      segmentFromClassification({ ...base, category: "onboarding", intent: "onboarding" })
    ).toBe("prospect")
    expect(
      segmentFromClassification({ ...base, category: "consultation", intent: "sales_consulting" })
    ).toBe("prospect")
    expect(segmentFromClassification(base)).toBe("prospect")
  })

  it("hardware lineup/spec (non-trouble) maps to existing_ops", () => {
    expect(
      segmentFromClassification({ ...base, category: "hardware", intent: "hardware_support" })
    ).toBe("existing_ops")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts`. Expected: fail — `segmentFromClassification`/`SegmentMapperInput` not exported.

- [ ] **Step 3: Implement** — add to `lib/chatbot/segment.ts` (import the category/intent types from classification.ts; do not redefine them):
```ts
import type { ChatbotCategory, ChatbotIntent } from "@/lib/chatbot/classification"

export interface SegmentMapperInput {
  category: ChatbotCategory
  intent: ChatbotIntent
  sentiment: ComplaintSentiment
  critical: boolean
  isPricing: boolean   // service.ts isPricingInfoQuestion || isSoftwarePricingQuestion || isWebLiveBillingQuestion || isS65QuoteQuestion
  isSensitive: boolean // service.ts isSensitiveOrAccountSpecificQuestion
}

// 우선순위(LOCKED): critical/complaint > pricing > existing_ops > prospect.
// 세그먼트는 기존 8-category 에서 파생한다(병렬 분류기 아님) → golden category 단언 무변경.
export function segmentFromClassification(input: SegmentMapperInput): ChatbotSegment {
  // 1) critical/complaint: 긴급 장애 즉시 / 기술지원 카테고리 / angry·frustrated 컴플레인
  if (input.critical) return "support_complaint"
  if (input.category === "troubleshooting") return "support_complaint"
  if (input.sentiment !== "neutral") return "support_complaint"

  // 2) pricing: billing 카테고리거나 가격 술어 매치(컴플레인이 위에서 가로채지 못한 순수 가격 질문)
  if (input.isPricing) return "pricing"
  if (input.category === "billing") return "pricing"

  // 3) existing_ops: 도입 고객 운영/사용법(어드민·교실·하드웨어 라인업)
  if (input.category === "admin" || input.category === "classroom" || input.category === "hardware") {
    return "existing_ops"
  }

  // 4) prospect: 신규 도입 검토(온보딩·컨설팅·정체성·비교·general 폴백)
  return "prospect"
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment.test.ts`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): segmentFromClassification mapper with locked precedence (Phase 0)"`

---

### Task: computeHeuristicConfidence (Phase 1)

**Files:**
- Modify: `lib/chatbot/segment.ts`
- Modify: `tests/chatbot/segment.test.ts`

> Confidence drives clarify (`< CLARIFY_FLOOR`) and flash escalate (`CLARIFY_FLOOR ≤ c < ESCALATE_CEIL`). Tiers per spec §4.3-④: strong curated predicate 0.92 / keyword-category branch 0.80 / sourceCategories fallback 0.55 / general weak signal 0.30.

- [ ] **Step 1: Write the failing test** — append to `tests/chatbot/segment.test.ts`:
```ts
import {
  computeHeuristicConfidence,
  CLARIFY_FLOOR,
  ESCALATE_CEIL,
} from "@/lib/chatbot/segment"

describe("computeHeuristicConfidence", () => {
  it("gives strong confidence (0.92) to curated-template matches", () => {
    expect(
      computeHeuristicConfidence({ isCurated: true, category: "billing", usedSourceFallback: false })
    ).toBeCloseTo(0.92, 5)
  })

  it("gives keyword-branch confidence (0.80) to a confident non-general category", () => {
    expect(
      computeHeuristicConfidence({ isCurated: false, category: "admin", usedSourceFallback: false })
    ).toBeCloseTo(0.8, 5)
  })

  it("gives source-fallback confidence (0.55) when category came from sourceCategories", () => {
    expect(
      computeHeuristicConfidence({ isCurated: false, category: "classroom", usedSourceFallback: true })
    ).toBeCloseTo(0.55, 5)
  })

  it("gives weak confidence (0.30) to general-fallback questions", () => {
    expect(
      computeHeuristicConfidence({ isCurated: false, category: "general", usedSourceFallback: false })
    ).toBeCloseTo(0.3, 5)
  })

  it("weak general confidence sits below the clarify floor; curated sits above escalate ceiling", () => {
    const weak = computeHeuristicConfidence({ isCurated: false, category: "general", usedSourceFallback: false })
    const curated = computeHeuristicConfidence({ isCurated: true, category: "billing", usedSourceFallback: false })
    expect(weak).toBeLessThan(CLARIFY_FLOOR)
    expect(curated).toBeGreaterThanOrEqual(ESCALATE_CEIL)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts`. Expected: fail — `computeHeuristicConfidence`/`CLARIFY_FLOOR`/`ESCALATE_CEIL` not exported.

- [ ] **Step 3: Implement** — add to `lib/chatbot/segment.ts`:
```ts
// clarify·escalate 임계(LOCKED, §4.3).
export const CLARIFY_FLOOR = 0.45
export const ESCALATE_CEIL = 0.78
export const LLM_TRUST_FLOOR = 0.45 // LLM 정제가 휴리스틱을 오버라이드하려면 이 이상이어야 함(Phase1 LLM 경로 소비)

export interface HeuristicConfidenceInput {
  isCurated: boolean        // service.ts isCuratedTemplateQuestion(question)
  category: ChatbotCategory
  usedSourceFallback: boolean // category 가 sourceCategories 폴백에서 나왔는가
}

// §4.3-④: 강한 큐레이션 술어 0.92 / 키워드 분기 0.80 / sourceCategories 폴백 0.55 / general 약신호 0.30.
export function computeHeuristicConfidence(input: HeuristicConfidenceInput): number {
  if (input.isCurated) return 0.92
  if (input.category === "general") return 0.3
  if (input.usedSourceFallback) return 0.55
  return 0.8
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment.test.ts`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): computeHeuristicConfidence + clarify/escalate thresholds (Phase 1)"`

---

### Task: decideClarify gating (Phase 1)

**Files:**
- Modify: `lib/chatbot/segment.ts`
- Modify: `tests/chatbot/segment.test.ts`

> Clarify fires ONLY when ALL hold (§4.3-⑤): `confidence < CLARIFY_FLOOR` AND domain-related AND non-sensitive AND non-critical AND `lastClarifyAsked !== true`. Critical incidents are never re-asked (immediate handoff path). The returned `ClarifyDecision` is part of the locked Stage1 output contract.

- [ ] **Step 1: Write the failing test** — append to `tests/chatbot/segment.test.ts`:
```ts
import { decideClarify } from "@/lib/chatbot/segment"
import type { ClarifyInput } from "@/lib/chatbot/segment"

const clarifyBase: ClarifyInput = {
  confidence: 0.3,
  isDomainRelated: true,
  isSensitive: false,
  critical: false,
  lastClarifyAsked: false,
}

describe("decideClarify gating", () => {
  it("asks to clarify for an ambiguous, domain, non-sensitive, non-critical first turn", () => {
    const d = decideClarify(clarifyBase)
    expect(d.ask).toBe(true)
    if (d.ask) {
      expect(d.reason).toBe("ambiguous_segment")
      expect(typeof d.question).toBe("string")
      expect(d.question.length).toBeGreaterThan(0)
    }
  })

  it("does NOT clarify when confidence is at or above the floor", () => {
    expect(decideClarify({ ...clarifyBase, confidence: CLARIFY_FLOOR }).ask).toBe(false)
    expect(decideClarify({ ...clarifyBase, confidence: 0.8 }).ask).toBe(false)
  })

  it("never clarifies a critical incident (immediate handoff instead)", () => {
    expect(decideClarify({ ...clarifyBase, critical: true }).ask).toBe(false)
  })

  it("does not clarify sensitive/account-specific questions", () => {
    expect(decideClarify({ ...clarifyBase, isSensitive: true }).ask).toBe(false)
  })

  it("does not clarify off-domain noise", () => {
    expect(decideClarify({ ...clarifyBase, isDomainRelated: false }).ask).toBe(false)
  })

  it("never asks twice — breaks the clarify loop when already asked", () => {
    expect(decideClarify({ ...clarifyBase, lastClarifyAsked: true }).ask).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts`. Expected: fail — `decideClarify`/`ClarifyInput`/`ClarifyDecision` not exported.

- [ ] **Step 3: Implement** — add to `lib/chatbot/segment.ts`:
```ts
export type ClarifyDecision =
  | { ask: false }
  | { ask: true; question: string; reason: "ambiguous_segment" | "missing_slot" }

export interface ClarifyInput {
  confidence: number
  isDomainRelated: boolean   // service.ts isDomainRelatedQuestion(question, category)
  isSensitive: boolean       // service.ts isSensitiveOrAccountSpecificQuestion(question, category)
  critical: boolean          // detectCriticalIncident(question)
  lastClarifyAsked: boolean  // carry.lastClarifyAsked — 무한 clarify 루프 차단
}

// v1 clarify 문구는 결정론적 템플릿(큐레이션=final, Gemini 스킵).
const DEFAULT_CLARIFY_QUESTION =
  "조금만 더 구체적으로 알려주실 수 있을까요? 가격·기능·도입 절차 중 어떤 부분이 궁금하신가요?"

// §4.3-⑤: confidence<FLOOR AND 도메인관련 AND 비민감 AND 비긴급 AND lastClarifyAsked!==true 일 때만.
export function decideClarify(input: ClarifyInput): ClarifyDecision {
  if (input.critical) return { ask: false }
  if (input.isSensitive) return { ask: false }
  if (!input.isDomainRelated) return { ask: false }
  if (input.lastClarifyAsked) return { ask: false }
  if (input.confidence >= CLARIFY_FLOOR) return { ask: false }
  return { ask: true, question: DEFAULT_CLARIFY_QUESTION, reason: "ambiguous_segment" }
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment.test.ts`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): decideClarify gating with loop-break + safety guards (Phase 1)"`

---

### Task: classifyStage1Heuristic — Stage1Result/SegmentDecision contract assembler (Phase 1)

**Files:**
- Modify: `lib/chatbot/segment.ts`
- Modify: `tests/chatbot/segment.test.ts`

> Pure assembler that combines the prior detectors into the locked Stage1 output contract (§4.2/§4.3). Takes the EXISTING classifier output + precomputed predicate booleans (service.ts owns the `NormalizedQuestion` evaluation and passes primitives in — keeps segment.ts free of service-internal types) + carry state for the sticky bias. The `escalate` flag it computes is the gate the service.ts area uses to decide whether to fire the flash 1-call; the flash call itself + parsing live in the llm.ts/service.ts area. The `flush escalate` precise call wiring (timeout/schema) is out of this file's scope.

- [ ] **Step 1: Write the failing test** — append to `tests/chatbot/segment.test.ts`:
```ts
import { classifyStage1Heuristic } from "@/lib/chatbot/segment"
import type { Stage1HeuristicInput } from "@/lib/chatbot/segment"

const stage1Base: Stage1HeuristicInput = {
  question: "요금 알려주세요",
  category: "billing",
  intent: "billing_support",
  handoffIntent: "demo",
  isCurated: true,
  isPricing: true,
  isSensitive: true,
  isDomainRelated: true,
  usedSourceFallback: false,
  carry: undefined,
}

describe("classifyStage1Heuristic contract", () => {
  it("returns the full SegmentDecision contract shape", () => {
    const r = classifyStage1Heuristic(stage1Base)
    expect(r.segment).toBe("pricing")
    expect(r.category).toBe("billing")
    expect(r.intent).toBe("billing_support")
    expect(r.handoffIntent).toBe("demo")
    expect(r.clarify.ask).toBe(false)
    expect(r.segmentConfidence).toBeCloseTo(0.92, 5)
    expect(r.sentiment).toBe("neutral")
    expect(r.critical).toBe(false)
    expect(r.escalate).toBe(false)
  })

  it("angry billing complaint resolves to support_complaint, never pricing", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "환불 안해주면 진짜 최악이네요",
      category: "billing",
    })
    expect(r.segment).toBe("support_complaint")
    expect(r.sentiment).toBe("angry")
  })

  it("critical incident flags critical + never clarifies + never escalates", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "수업 중인데 갑자기 끊겼어요 로그인도 안돼요",
      category: "troubleshooting",
      intent: "troubleshooting",
      isCurated: false,
      isPricing: false,
    })
    expect(r.critical).toBe(true)
    expect(r.segment).toBe("support_complaint")
    expect(r.clarify.ask).toBe(false)
    expect(r.escalate).toBe(false)
  })

  it("ambiguous general question gates to clarify and does not escalate", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "그거 어떻게 해요?",
      category: "general",
      intent: "docs_lookup",
      isCurated: false,
      isPricing: false,
      isSensitive: false,
    })
    expect(r.segmentConfidence).toBeCloseTo(0.3, 5)
    expect(r.clarify.ask).toBe(true)
    expect(r.escalate).toBe(false)
  })

  it("mid-band confidence escalates (flash gate) when not curated/sensitive/critical", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "수업 운영 어떻게 하나요?",
      category: "admin",
      intent: "admin_operations",
      isCurated: false,
      isPricing: false,
      isSensitive: false,
      usedSourceFallback: true, // → 0.55 confidence, inside [0.45, 0.78)
    })
    expect(r.segmentConfidence).toBeCloseTo(0.55, 5)
    expect(r.escalate).toBe(true)
    expect(r.clarify.ask).toBe(false)
  })

  it("sensitive mid-band question does NOT escalate (heuristic owns sensitive)", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "계약 환불 조건 알려주세요",
      category: "billing",
      intent: "billing_support",
      isCurated: false,
      isPricing: false,
      isSensitive: true,
      usedSourceFallback: true,
    })
    expect(r.escalate).toBe(false)
  })

  it("sticky bias: weak follow-up keeps prior pricing segment over default prospect", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "그럼 그건 얼마예요?",
      category: "general",
      intent: "docs_lookup",
      isCurated: false,
      isPricing: false,
      isSensitive: false,
      carry: { lastSegment: "pricing", lastClarifyAsked: false, turnCount: 1 },
    })
    expect(r.segment).toBe("pricing")
  })

  it("sticky bias is overridden by a strong critical signal", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "수업이 또 끊겼어요",
      category: "troubleshooting",
      intent: "troubleshooting",
      isCurated: false,
      isPricing: false,
      isSensitive: false,
      carry: { lastSegment: "pricing", lastClarifyAsked: false, turnCount: 2 },
    })
    expect(r.critical).toBe(true)
    expect(r.segment).toBe("support_complaint")
  })

  it("does not clarify again when carry says clarify was already asked", () => {
    const r = classifyStage1Heuristic({
      ...stage1Base,
      question: "그거 어떻게 해요?",
      category: "general",
      intent: "docs_lookup",
      isCurated: false,
      isPricing: false,
      isSensitive: false,
      carry: { lastClarifyAsked: true, turnCount: 1 },
    })
    expect(r.clarify.ask).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts`. Expected: fail — `classifyStage1Heuristic`/`Stage1HeuristicInput` not exported.

- [ ] **Step 3: Implement** — add to `lib/chatbot/segment.ts`. This defines the locked `SegmentCarry`, `SegmentDecision`, and `Stage1Result` contracts plus the assembler. Sticky bias only applies to the low-signal `prospect`/`general` default (a weak follow-up keeps prior context); any strong signal (critical, complaint sentiment, pricing, confident category) wins:
```ts
import type { HandoffIntent } from "@/lib/chatbot/classification"

// 세션 한정 멀티턴 carry. chatbot_answer_events.metadata(jsonb)에 기록(chat_messages.metadata 는 실재 안 함).
export interface SegmentCarry {
  lastSegment?: ChatbotSegment
  lastClarifyAsked?: boolean
  unresolvedSupportTurns?: number // Phase 3
  turnCount: number
}

// Stage2 가 소비하는 잠금 출력 계약(§4.2).
export interface SegmentDecision {
  segment: ChatbotSegment
  category: ChatbotCategory
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  clarify: ClarifyDecision
  segmentConfidence: number
}

// 휴리스틱 Stage1 의 전체 결과(SegmentDecision + 관측·escalate 신호).
export interface Stage1Result extends SegmentDecision {
  sentiment: ComplaintSentiment
  critical: boolean
  escalate: boolean // 모호밴드 flash 1콜 게이트(실제 호출은 service/llm 영역)
}

export interface Stage1HeuristicInput {
  question: string
  category: ChatbotCategory
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  isCurated: boolean       // isCuratedTemplateQuestion
  isPricing: boolean       // isPricingInfoQuestion||isSoftwarePricingQuestion||isWebLiveBillingQuestion||isS65QuoteQuestion
  isSensitive: boolean     // isSensitiveOrAccountSpecificQuestion
  isDomainRelated: boolean // isDomainRelatedQuestion
  usedSourceFallback: boolean
  carry?: SegmentCarry
}

// 직전 세그먼트를 이어받는 스티키 바이어스(§4.4). 약신호 후속(prospect 기본값으로 떨어진 경우)에만 적용.
function applyStickyBias(resolved: ChatbotSegment, carry: SegmentCarry | undefined): ChatbotSegment {
  if (!carry?.lastSegment) return resolved
  // 강신호(complaint/critical→support_complaint, 명시 pricing, 운영 existing_ops)는 그대로 둔다.
  // prospect 로 떨어진 약신호 후속만 직전 맥락을 이어받는다.
  if (resolved === "prospect") return carry.lastSegment
  return resolved
}

export function classifyStage1Heuristic(input: Stage1HeuristicInput): Stage1Result {
  const sentiment = detectComplaintSentiment(input.question)
  const critical = detectCriticalIncident(input.question)

  const resolved = segmentFromClassification({
    category: input.category,
    intent: input.intent,
    sentiment,
    critical,
    isPricing: input.isPricing,
    isSensitive: input.isSensitive,
  })

  const segment = applyStickyBias(resolved, input.carry)

  const segmentConfidence = computeHeuristicConfidence({
    isCurated: input.isCurated,
    category: input.category,
    usedSourceFallback: input.usedSourceFallback,
  })

  const clarify = decideClarify({
    confidence: segmentConfidence,
    isDomainRelated: input.isDomainRelated,
    isSensitive: input.isSensitive,
    critical,
    lastClarifyAsked: input.carry?.lastClarifyAsked === true,
  })

  // flash escalate 게이트(§4.3): 모호밴드 [FLOOR, CEIL) AND 비큐레이션 AND 비민감 AND 비긴급 AND 비컴플레인 AND clarify 미요청.
  const inAmbiguousBand =
    segmentConfidence >= CLARIFY_FLOOR && segmentConfidence < ESCALATE_CEIL
  const escalate =
    inAmbiguousBand &&
    !input.isCurated &&
    !input.isSensitive &&
    !critical &&
    sentiment === "neutral" &&
    !clarify.ask

  return {
    segment,
    category: input.category,
    intent: input.intent,
    handoffIntent: input.handoffIntent,
    clarify,
    segmentConfidence,
    sentiment,
    critical,
    escalate,
  }
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment.test.ts`. Then run the full chatbot suite to confirm no regression: `vitest run tests/chatbot/`.

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): classifyStage1Heuristic assembler + Stage1Result/SegmentCarry contract (Phase 1)"`

---

### Task: Stub SEGMENT_POLICY shape (type-only, Phase 2 fills the table)

**Files:**
- Modify: `lib/chatbot/segment.ts`
- Test: lint+build verified only (type-only stub, no runtime table to assert).

> Per the constraint, the full SEGMENT_POLICY table is Phase 2. Here we ONLY declare the `SegmentPolicy` interface + an exported empty-by-default placeholder so Phase 1 consumers can reference the type without forcing Phase 2 content. No persona strings, no retrieval bias values yet.

- [ ] **Step 1: Write the failing test** — none (type-only stub). Optional compile guard in `tests/chatbot/segment.test.ts`:
```ts
import type { SegmentPolicy } from "@/lib/chatbot/segment"

describe("SegmentPolicy type stub", () => {
  it("is referenceable as a type (Phase 2 fills the table)", () => {
    const probe: Partial<SegmentPolicy> = {}
    expect(typeof probe).toBe("object")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts`. Expected: fail — `SegmentPolicy` type not exported.

- [ ] **Step 3: Implement** — add to `lib/chatbot/segment.ts` (type only; values are Phase 2):
```ts
// Phase 2 에서 채울 세그먼트별 응대 정책 테이블의 타입 계약(여기서는 타입만 선언).
// 페르소나 문자열 SSOT 는 CLASSIN_POSITIONING.chatbot 에서 주입한다(Phase 2).
export interface SegmentPolicy {
  retrievalBias: string[]
  leadWithEmpathy: boolean
  maxLines: number
  alwaysNextStep: boolean
  primaryCta: "demo" | "support"
  allowInference: boolean
}

// Phase 2 에서 Record<ChatbotSegment, SegmentPolicy> 로 채운다. Phase 1 에서는 미사용.
export const SEGMENT_POLICY: Partial<Record<ChatbotSegment, SegmentPolicy>> = {}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `npx eslint app components lib --max-warnings=0 && npm run build && vitest run tests/chatbot/segment.test.ts`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): SegmentPolicy type stub (Phase 2 fills table)"`

---

## DEPENDENCIES & TYPES

**This area DEFINES (other areas consume these):**
- `ChatbotSegment` (the 4-segment SSOT union) — `lib/chatbot/segment.ts`. Consumed by service.ts (ChatbotCore, cache key, persist `detected_segment`), llm.ts (segment fragment), FloatingChatbot.tsx (stream meta), eval.ts (`expectSegment`).
- `ComplaintSentiment`, `detectComplaintSentiment`, `detectCriticalIncident` — consumed by service.ts Phase 0 backfill + Phase 1/2 handoff `forceReason` computation (critical_incident / complaint_sentiment).
- `SegmentMapperInput` + `segmentFromClassification`, `HeuristicConfidenceInput` + `computeHeuristicConfidence`, `ClarifyInput`/`ClarifyDecision` + `decideClarify`, `Stage1HeuristicInput` + `classifyStage1Heuristic` + `Stage1Result` — consumed by service.ts `classifyStage1(...)` wrapper, which evaluates `NormalizedQuestion` predicates and feeds primitives in.
- `SegmentDecision`, `SegmentCarry` — the locked Stage1 output + carry contracts. `SegmentDecision` is consumed by service.ts `ChatbotCore`; `SegmentCarry` is consumed by service.ts `deriveCarryState(rows)` (reads/writes `chatbot_answer_events.metadata`).
- `CLARIFY_FLOOR`, `ESCALATE_CEIL`, `LLM_TRUST_FLOOR` — consumed by service.ts/llm.ts flash-escalate + LLM-override gating.
- `SegmentPolicy` type + `SEGMENT_POLICY` stub — Phase 2 fills; Phase 1 consumers may reference the type only.
- `export` added to 9 service.ts predicates + `NormalizedQuestion` interface — these are CONSUMED-FROM service.ts BY service.ts's own `classifyStage1(...)` adapter (the adapter lives in the service.ts area, but it needs these exports which this area provides).

**This area CONSUMES (defined by other areas / existing code):**
- `ChatbotCategory`, `ChatbotIntent`, `HandoffIntent` — imported as types from existing `lib/chatbot/classification.ts` (unchanged; no parallel classifier).
- `classifyChatbotQuestion` (classification.ts:164) — NOT called inside segment.ts; the service.ts adapter calls it and passes its `{category, intent, handoffIntent}` into `Stage1HeuristicInput`.
- The 9 service.ts predicates (`isPricingInfoQuestion` etc.) — evaluated in the service.ts adapter against `NormalizedQuestion`, results passed in as primitive booleans (segment.ts never imports `NormalizedQuestion`).

**Sequencing note:** "Define ChatbotSegment SSOT + detectors" must land first (everything depends on the type + detectors). "Export Stage1 predicates" is independent and can land in parallel (only the service.ts adapter consumes it, which is a different area). `segmentFromClassification` → `computeHeuristicConfidence` → `decideClarify` → `classifyStage1Heuristic` is a strict dependency chain (the assembler imports all three). The classification.ts `{segment, segmentConfidence}` extended return mentioned in spec §13-A:211 is OUT of this area's task list — it belongs to the service.ts adapter area and is not required for any pure-function test here; flag for the sequencing pass if that extended return is wanted (it would create a circular import classification.ts→segment.ts, so prefer keeping the mapper in segment.ts as done here).

### Additional authored task (Area C, gap-fill §0.12): `reconcileStage1WithLlm` pure function

**Files:**
- Modify: `lib/chatbot/segment.ts` (add exported function)
- Test: `tests/chatbot/segment.test.ts` (extend)

Safe reconciliation of the heuristic `Stage1Result` with the optional flash `Stage1ClassifierResult`. The LLM may only flip the segment among non-protected segments and may ADD a clarify ask. It may NEVER turn `critical`→non-critical, soften a `pricing`/sensitive classification, or flip `support_complaint` away. Returns a plain `Stage1Result` (serializable for carry).

- [ ] **Step 1: Write the failing test** — append to `tests/chatbot/segment.test.ts`:

```ts
import { reconcileStage1WithLlm } from "@/lib/chatbot/segment"
import type { Stage1Result } from "@/lib/chatbot/segment"

const base: Stage1Result = {
  segment: "prospect",
  segmentConfidence: 0.5,
  category: "general",
  intent: "info",
  handoffIntent: "none",
  sentiment: "neutral",
  critical: false,
  escalate: true,
  clarify: { ask: false },
}

describe("reconcileStage1WithLlm safety", () => {
  it("refined null → returns heuristic unchanged", () => {
    expect(reconcileStage1WithLlm(base, null)).toEqual(base)
  })

  it("critical incident is immutable — LLM cannot dilute", () => {
    const crit = { ...base, segment: "support_complaint" as const, critical: true }
    const out = reconcileStage1WithLlm(crit, { segment: "prospect", needsClarify: false, confidence: 0.9, complaint: "neutral", clarifyQuestion: "" })
    expect(out.segment).toBe("support_complaint")
    expect(out.critical).toBe(true)
  })

  it("pricing (sensitive) cannot be flipped away by LLM", () => {
    const pricing = { ...base, segment: "pricing" as const }
    const out = reconcileStage1WithLlm(pricing, { segment: "prospect", needsClarify: false, confidence: 0.95, complaint: "neutral", clarifyQuestion: "" })
    expect(out.segment).toBe("pricing")
  })

  it("support_complaint cannot be flipped away by LLM", () => {
    const support = { ...base, segment: "support_complaint" as const }
    const out = reconcileStage1WithLlm(support, { segment: "existing_ops", needsClarify: false, confidence: 0.9, complaint: "frustrated", clarifyQuestion: "" })
    expect(out.segment).toBe("support_complaint")
  })

  it("non-protected flip is allowed (prospect → existing_ops)", () => {
    const out = reconcileStage1WithLlm(base, { segment: "existing_ops", needsClarify: false, confidence: 0.8, complaint: "neutral", clarifyQuestion: "" })
    expect(out.segment).toBe("existing_ops")
    expect(out.segmentConfidence).toBeGreaterThanOrEqual(0.5)
  })

  it("LLM may ADD a clarify ask when heuristic had none", () => {
    const out = reconcileStage1WithLlm(base, { segment: "prospect", needsClarify: true, confidence: 0.4, complaint: "neutral", clarifyQuestion: "어떤 점이 궁금하세요?" })
    expect(out.clarify).toEqual({ ask: true, question: "어떤 점이 궁금하세요?", reason: "llm_ambiguous" })
  })

  it("LLM cannot remove a heuristic clarify", () => {
    const asking: Stage1Result = { ...base, clarify: { ask: true, question: "견적인가요 설치인가요?", reason: "ambiguous_segment" } }
    const out = reconcileStage1WithLlm(asking, { segment: "pricing", needsClarify: false, confidence: 0.9, complaint: "neutral", clarifyQuestion: "" })
    expect(out.clarify.ask).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment.test.ts -t "reconcileStage1WithLlm"` — Expected: FAIL — `reconcileStage1WithLlm` not exported.

- [ ] **Step 3: Implement** — add to `lib/chatbot/segment.ts` (import the classifier result type from llm or redeclare a structural type to avoid a circular import — prefer a local structural type since `segment.ts` must not import `llm.ts`):

```ts
// Structural shape of the flash classifier result (avoid importing llm.ts → no circular dep).
interface Stage1LlmRefinement {
  segment: ChatbotSegment
  needsClarify: boolean
  confidence: number
  complaint: "neutral" | "frustrated" | "angry"
  clarifyQuestion: string
}

/**
 * Safe reconcile: LLM may flip segment (non-protected only) and ADD a clarify ask.
 * It can NEVER dilute a critical incident, soften pricing/sensitive, flip support_complaint away,
 * or remove a heuristic clarify. Returns a plain (serializable) Stage1Result.
 */
export function reconcileStage1WithLlm(
  heuristic: Stage1Result,
  refined: Stage1LlmRefinement | null
): Stage1Result {
  if (!refined) return heuristic

  // critical is heuristic-owned and immutable.
  if (heuristic.critical) return heuristic

  const result: Stage1Result = { ...heuristic }

  // pricing (sensitive guardrail) and support_complaint cannot be flipped AWAY by the LLM.
  const protectedSegment = heuristic.segment === "pricing" || heuristic.segment === "support_complaint"
  if (!protectedSegment && CHATBOT_SEGMENTS.includes(refined.segment)) {
    result.segment = refined.segment
    result.segmentConfidence = Math.max(heuristic.segmentConfidence, refined.confidence)
  }

  // LLM may ADD a clarify ask, never remove one.
  if (heuristic.clarify.ask === false && refined.needsClarify && refined.clarifyQuestion) {
    result.clarify = { ask: true, question: refined.clarifyQuestion, reason: "llm_ambiguous" }
  }

  return result
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment.test.ts -t "reconcileStage1WithLlm" && npx eslint app components lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment.test.ts && git commit -m "feat(chatbot): reconcileStage1WithLlm safe heuristic↔flash reconciliation (critical/sensitive/complaint locked)"`

---

# Area D — `lib/chatbot/llm.ts` — Stage1 flash classifier + generation config (Phase 1)

> Verified against `lib/chatbot/llm.ts` this pass. `buildGenerationConfig(model, temperature)` at 236-259 (flash `thinkingBudget:0` at 254-256); `GEMINI_TIMEOUT_MS=2500` (42); `resolveModelChain` (75-79); `resolveModel("basic")`→`DEFAULT_FAST_MODEL="gemini-2.5-flash"` (24,67-70); `getGeminiApiKey()` (81); `embedText` null-on-failure (572-609). Tests: vitest `environment:"node"`, network mocked via `vi.stubGlobal("fetch", …)`. `lib/chatbot/segment.ts` does not exist yet — `ChatbotSegment` is CONSUMED (Area C must land its type task first).
> Quality gates each task: `npx eslint app components lib --max-warnings=0` && `npm run build` && `vitest run tests/chatbot/`.

### Task: Extend `buildGenerationConfig` with optional JSON/schema/maxTokens arg (flash thinkingBudget:0 preserved)

**Files:**
- Modify: `lib/chatbot/llm.ts`(:236-259)
- Test (new): `tests/chatbot/generation-config.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/chatbot/generation-config.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildGenerationConfig } from "@/lib/chatbot/llm"

describe("buildGenerationConfig", () => {
  it("(a) default call output is unchanged for a fast model", () => {
    expect(buildGenerationConfig("gemini-2.5-flash", 0.2)).toEqual({
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: 600,
      thinkingConfig: { thinkingBudget: 0 },
    })
  })

  it("(a) default call output is unchanged for a pro model", () => {
    expect(buildGenerationConfig("gemini-2.5-pro", 0.25)).toEqual({
      temperature: 0.25,
      topP: 0.9,
      maxOutputTokens: 2048,
    })
  })

  it("(b) json mode adds responseMimeType + responseSchema and applies maxTokensOverride", () => {
    const schema = { type: "object", properties: { segment: { type: "string" } } }
    const config = buildGenerationConfig("gemini-2.5-flash", 0, { json: true, schema, maxTokensOverride: 128 })
    expect(config.responseMimeType).toBe("application/json")
    expect(config.responseSchema).toBe(schema)
    expect(config.maxOutputTokens).toBe(128)
    expect(config.temperature).toBe(0)
  })

  it("(c) flash STILL has thinkingBudget:0 even in json mode (drain trap)", () => {
    const config = buildGenerationConfig("gemini-2.5-flash", 0, { json: true, maxTokensOverride: 128 })
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it("json omitted does not add response fields but override still applies", () => {
    const config = buildGenerationConfig("gemini-2.5-flash", 0.2, { maxTokensOverride: 99 })
    expect(config.responseMimeType).toBeUndefined()
    expect(config.responseSchema).toBeUndefined()
    expect(config.maxOutputTokens).toBe(99)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/generation-config.test.ts` — Expected: FAIL — `buildGenerationConfig` not exported / does not accept a third arg.

- [ ] **Step 3: Implement** — replace `buildGenerationConfig` (current lines 236-259). Add `export`, the optional `options` arg, widen the return type, set `thinkingConfig` before returning so json mode cannot strip it:

```ts
export function buildGenerationConfig(
  model: string,
  temperature: number,
  options: { json?: boolean; schema?: object; maxTokensOverride?: number } = {}
) {
  const lowerModel = model.toLowerCase()
  const isFastOutputModel = /flash|lite/.test(lowerModel)
  const generationConfig: {
    temperature: number
    topP: number
    maxOutputTokens: number
    thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: "minimal" | "low" }
    responseMimeType?: string
    responseSchema?: object
  } = {
    temperature,
    topP: 0.9,
    maxOutputTokens: options.maxTokensOverride ?? (isFastOutputModel ? 600 : 2048),
  }

  if (lowerModel.startsWith("gemini-3")) {
    generationConfig.thinkingConfig = { thinkingLevel: lowerModel.includes("pro") ? "low" : "minimal" }
  } else if (lowerModel.startsWith("gemini-2.5-flash")) {
    // thinking-token drain trap: 2.5-flash MUST keep thinkingBudget:0
    generationConfig.thinkingConfig = { thinkingBudget: 0 }
  }

  if (options.json) {
    generationConfig.responseMimeType = "application/json"
    if (options.schema) generationConfig.responseSchema = options.schema
  }

  return generationConfig
}
```

> `buildGeminiBody` (263-274) calls it with two args — unchanged, `options` defaults to `{}` → identical output. No other call site.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/generation-config.test.ts && npx eslint app components lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/llm.ts tests/chatbot/generation-config.test.ts && git commit -m "feat(chatbot): buildGenerationConfig optional json/schema/maxTokens arg; preserve flash thinkingBudget:0"`

---

### Task: Add `buildClassifierSystemInstruction()` strict-JSON Stage1 prompt

**Files:**
- Modify: `lib/chatbot/llm.ts` (add after `INFERENCE_SYSTEM_INSTRUCTION`, ~line 132)
- Test (new): `tests/chatbot/classifier-prompt.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/chatbot/classifier-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildClassifierSystemInstruction } from "@/lib/chatbot/llm"

describe("buildClassifierSystemInstruction", () => {
  const instruction = buildClassifierSystemInstruction()

  it("contains all 4 segment enum tokens", () => {
    for (const token of ["prospect", "pricing", "existing_ops", "support_complaint"]) {
      expect(instruction).toContain(token)
    }
  })

  it("instructs strict JSON only (no prose)", () => {
    expect(instruction).toContain("JSON")
    expect(instruction.toLowerCase()).toMatch(/json만|only json|순수 json|json 객체/)
  })

  it("names the output fields the schema/parser expect", () => {
    for (const field of ["segment", "needs_clarify", "confidence", "complaint", "clarify_question"]) {
      expect(instruction).toContain(field)
    }
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/classifier-prompt.test.ts` — Expected: FAIL — `buildClassifierSystemInstruction` not exported.

- [ ] **Step 3: Implement** — add after `INFERENCE_SYSTEM_INSTRUCTION` (~line 132):

```ts
// Stage1 분류기 전용 시스템 지시. 고객 답변이 아니라 순수 JSON 분류만 출력한다.
// 세그먼트 enum·필드명은 responseSchema 및 classifyStage1WithGemini 파서와 1:1로 맞춘다(드리프트 금지).
export function buildClassifierSystemInstruction(): string {
  return [
    "너는 Classin(학원·교육기관용 수업/운영 솔루션) 챗봇의 1단계 질문 분류기다. 고객에게 보일 답변을 쓰지 말고, 아래 규칙에 맞는 JSON 객체 하나만 출력한다.",
    "segment 은 정확히 다음 4개 중 하나다: prospect(신규 도입 검토), pricing(가격·견적·비용), existing_ops(기존 고객의 운영·사용법), support_complaint(기술지원·장애 또는 불만·컴플레인).",
    "needs_clarify 는 질문이 너무 모호해 세그먼트를 고를 수 없을 때만 true 인 boolean 이다.",
    "confidence 는 분류 확신도를 나타내는 0 이상 1 이하의 number 다.",
    "complaint 는 다음 3개 중 하나다: neutral, frustrated, angry.",
    "clarify_question 은 needs_clarify 가 true 일 때 한 문장으로 되물을 한국어 질문이고, 아니면 빈 문자열이다.",
    "추측으로 새 사실을 만들지 말고 분류만 한다. 설명·마크다운·코드펜스·접두문 없이 순수 JSON 객체만 출력한다.",
    '출력 형식 예시: {"segment":"pricing","needs_clarify":false,"confidence":0.82,"complaint":"neutral","clarify_question":""}',
  ].join("\n")
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/classifier-prompt.test.ts && npx eslint app components lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/llm.ts tests/chatbot/classifier-prompt.test.ts && git commit -m "feat(chatbot): buildClassifierSystemInstruction strict-JSON Stage1 prompt"`

---

### Task: Add `classifyStage1WithGemini()` — defensive flash classifier, null on any failure

**Files:**
- Modify: `lib/chatbot/llm.ts` (add `const CLASSIFIER_TIMEOUT_MS = 1200` after line 47; add the function near `embedText`, ~line 609)
- Test (new): `tests/chatbot/classifier-stage1.test.ts`

> CONSUMES `ChatbotSegment` from `./segment` — Area C's type task MUST land first.

- [ ] **Step 1: Write the failing test** — create `tests/chatbot/classifier-stage1.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"

import { classifyStage1WithGemini } from "@/lib/chatbot/llm"

function mockGeminiText(text: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
      text: async () => text,
    }))
  )
}

describe("classifyStage1WithGemini parse/validate/fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("returns null when no API key (no network attempt)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    expect(await classifyStage1WithGemini("얼마예요?", "pricing", [])).toBeNull()
  })

  it("valid JSON → parsed object", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k")
    mockGeminiText('{"segment":"pricing","needs_clarify":false,"confidence":0.82,"complaint":"neutral","clarify_question":""}')
    expect(await classifyStage1WithGemini("가격이 얼마인가요?", "pricing", [])).toEqual({
      segment: "pricing",
      needsClarify: false,
      confidence: 0.82,
      complaint: "neutral",
      clarifyQuestion: "",
    })
  })

  it("JSON wrapped in codefence → recovered via {…} extraction", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k")
    mockGeminiText('```json\n{"segment":"prospect","needs_clarify":true,"confidence":0.4,"complaint":"neutral","clarify_question":"어떤 점이 궁금하세요?"}\n```')
    const result = await classifyStage1WithGemini("클래스인 뭐예요", "prospect", [])
    expect(result?.segment).toBe("prospect")
    expect(result?.needsClarify).toBe(true)
    expect(result?.clarifyQuestion).toBe("어떤 점이 궁금하세요?")
  })

  it("garbage / no JSON → null", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k")
    mockGeminiText("죄송합니다 잘 모르겠어요")
    expect(await classifyStage1WithGemini("질문", "prospect", [])).toBeNull()
  })

  it("out-of-enum segment → null", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k")
    mockGeminiText('{"segment":"billing_xyz","needs_clarify":false,"confidence":0.9,"complaint":"neutral","clarify_question":""}')
    expect(await classifyStage1WithGemini("질문", "prospect", [])).toBeNull()
  })

  it("thrown/network error → null", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k")
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down") }))
    expect(await classifyStage1WithGemini("질문", "prospect", [])).toBeNull()
  })

  it("non-ok HTTP → null", async () => {
    vi.stubEnv("GEMINI_API_KEY", "k")
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, text: async () => "busy" })))
    expect(await classifyStage1WithGemini("질문", "prospect", [])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/classifier-stage1.test.ts` — Expected: FAIL — `classifyStage1WithGemini` not exported.

- [ ] **Step 3: Implement** — (1) add the timeout const after line 47 (`const EMBED_TIMEOUT_MS = 2000`):

```ts
// Stage1 모호밴드 분류기: 검색 타임아웃(2.8s) 아래에 숨어 지연 0이 성립하도록 1.2s 하드캡.
const CLASSIFIER_TIMEOUT_MS = 1200
```

(2) add at the end of the file (after `embedText`):

```ts
import type { ChatbotSegment } from "./segment"

const CLASSIFIER_SEGMENTS = new Set<ChatbotSegment>(["prospect", "pricing", "existing_ops", "support_complaint"])
const CLASSIFIER_COMPLAINTS = new Set(["neutral", "frustrated", "angry"])

export interface Stage1ClassifierResult {
  segment: ChatbotSegment
  needsClarify: boolean
  confidence: number
  complaint: "neutral" | "frustrated" | "angry"
  clarifyQuestion: string
}

const CLASSIFIER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    segment: { type: "string", enum: ["prospect", "pricing", "existing_ops", "support_complaint"] },
    needs_clarify: { type: "boolean" },
    confidence: { type: "number" },
    complaint: { type: "string", enum: ["neutral", "frustrated", "angry"] },
    clarify_question: { type: "string" },
  },
  required: ["segment", "needs_clarify", "confidence", "complaint", "clarify_question"],
} as const

/**
 * Stage1 모호밴드 분류기. gemini-2.5-flash 1콜로 세그먼트/clarify/감정을 strict-JSON 으로 받는다.
 * embedText 와 동일 철학: 키 없음·타임아웃·네트워크·파싱·enum 미스 → 모두 null(호출부는 휴리스틱 폴백).
 */
export async function classifyStage1WithGemini(
  question: string,
  heuristicHint: ChatbotSegment | undefined,
  history: { role: "user" | "model"; parts: { text: string }[] }[] = []
): Promise<Stage1ClassifierResult | null> {
  const apiKey = getGeminiApiKey()
  if (!apiKey || !question.trim()) return null

  const model = resolveModel("basic")
  const hintLine = heuristicHint ? `휴리스틱 추정 세그먼트(참고용, 무시 가능): ${heuristicHint}` : ""
  const userText = [hintLine, `고객 질문: ${question}`].filter(Boolean).join("\n")
  const userContent = { role: "user" as const, parts: [{ text: userText }] }
  const contents = history.length > 0 ? [...history, userContent] : [userContent]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildClassifierSystemInstruction() }] },
          contents,
          generationConfig: buildGenerationConfig(model, 0, {
            json: true,
            schema: CLASSIFIER_RESPONSE_SCHEMA,
            maxTokensOverride: 128,
          }),
        }),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim()
    if (!raw) return null
    return parseStage1ClassifierJson(raw)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function parseStage1ClassifierJson(raw: string): Stage1ClassifierResult | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>
  const segment = obj.segment
  if (typeof segment !== "string" || !CLASSIFIER_SEGMENTS.has(segment as ChatbotSegment)) return null
  const complaint = typeof obj.complaint === "string" && CLASSIFIER_COMPLAINTS.has(obj.complaint)
    ? (obj.complaint as Stage1ClassifierResult["complaint"])
    : "neutral"
  const confidence = typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
    ? Math.min(1, Math.max(0, obj.confidence))
    : 0
  return {
    segment: segment as ChatbotSegment,
    needsClarify: obj.needs_clarify === true,
    confidence,
    complaint,
    clarifyQuestion: typeof obj.clarify_question === "string" ? obj.clarify_question : "",
  }
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/classifier-stage1.test.ts && npx eslint app components lib --max-warnings=0 && npm run build`. The live network path is covered by lint+build typecheck only.

- [ ] **Step 5: Commit** — `git add lib/chatbot/llm.ts tests/chatbot/classifier-stage1.test.ts && git commit -m "feat(chatbot): classifyStage1WithGemini flash strict-JSON classifier, defensive parse + null-on-failure"`

---

### Task: Standing regression guard — flash generationConfig keeps thinkingBudget:0 across modes

**Files:**
- Test (new): `tests/chatbot/flash-thinking-budget-regression.test.ts`

- [ ] **Step 1: Write the guard test:**

```ts
import { describe, expect, it } from "vitest"

import { buildGenerationConfig } from "@/lib/chatbot/llm"

describe("flash thinkingBudget:0 regression", () => {
  it.each([
    ["default", undefined],
    ["json mode", { json: true, maxTokensOverride: 128 }],
    ["override only", { maxTokensOverride: 512 }],
  ])("gemini-2.5-flash keeps thinkingBudget:0 (%s)", (_label, opts) => {
    const config = buildGenerationConfig("gemini-2.5-flash", 0, opts as undefined)
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it("pro model never gets a thinkingBudget", () => {
    expect(buildGenerationConfig("gemini-2.5-pro", 0, { json: true }).thinkingConfig).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, verify PASS** — Run: `vitest run tests/chatbot/flash-thinking-budget-regression.test.ts`
- [ ] **Step 3: Implement** — none (guards existing behavior).
- [ ] **Step 4: Run full chatbot suite** — Run: `vitest run tests/chatbot/`
- [ ] **Step 5: Commit** — `git add tests/chatbot/flash-thinking-budget-regression.test.ts && git commit -m "test(chatbot): standing regression guard for flash thinkingBudget:0 across config modes"`

---

**DEPENDENCIES & TYPES (Area D)** — DEFINES: `buildGenerationConfig` (now exported, +optional options arg, +responseMimeType/responseSchema return fields), `buildClassifierSystemInstruction()`, `classifyStage1WithGemini(...)`, `Stage1ClassifierResult`, `FAST_MODEL_ID` (export `export const FAST_MODEL_ID = DEFAULT_FAST_MODEL` for Area E's model_name — see §0.7). CONSUMES: `ChatbotSegment` from `lib/chatbot/segment.ts` (Area C must precede the classifyStage1WithGemini task).

---

# AREA E — service.ts Pipeline (Phase 0 + Phase 1)

# Pipeline Area Plan — `lib/chatbot/service.ts` (Phase 0 observability + Phase 1 Stage1/Stage2 wiring + carry)

> Verified against `lib/chatbot/service.ts` (4053 lines), `lib/chatbot/classification.ts`, `supabase/migrations/20260421_z_chatbot_analytics.sql` on 2026-06-24. Spec line refs confirmed accurate: `persistExchange` 2642, answer_events insert 2691–2708, `ChatbotCore` 2869–2878, `shouldUseAiFinalAnswer` 2939–2951, `loadSessionHistory` 3019–3039, `buildChatbotCore` 3043–3211, cache versions 53 & 271, `streamAndApplyFinalAnswer` 3291–3344 (`onChunk` 3308), `streamChatbotQuery` 3352–3445, cached short-circuit persist 3391–3402.
>
> **CRITICAL PRE-DEP (must hold before Phase 0 Step 3):** `chatbot_answer_events` today has columns through `completion_tokens` + `created_at` (migration `20260421_z_chatbot_analytics.sql:79-82`) and has **NO `metadata` column**. The Phase 0 migration (observability area) MUST add `detected_segment text`, `first_token_ms int`, `stage1_ms int`, `clarify_offered bool default false`, **AND `metadata jsonb not null default '{}'::jsonb`** (carry storage in Phase 1 depends on it). If the migration lands without `metadata`, my Phase 1 carry-write/read silently no-ops. Flagging as a hard cross-area dependency.

---

## PHASE 0 — Observability backfill (NO behavior change, NO cache bump)

### Task: Phase0 — thread `detectedSegment` through ChatbotCore + evaluateChatbotQuery (no behavior change)

**Files:**
- Modify: `lib/chatbot/service.ts` (`ChatbotCore` interface :2869-2878; every `buildChatbotCore` return :3051-3071, :3076-3083, :3088-3095, :3109-3135, :3142-3151, :3201-3210; `evaluateChatbotQuery` :3249-3260)
- Test: `tests/chatbot/segment-backfill.test.ts` (new)

Depends on segment-area export `classifyStage1Heuristic(question, carry?)` returning at minimum `{ segment: ChatbotSegment }`, and the `ChatbotSegment` type from `lib/chatbot/segment.ts`. Phase 0 calls only the **heuristic** (no LLM, no carry) so it stays pure and behavior-neutral.

- [ ] **Step 1: Write the failing test** — assert `evaluateChatbotQuery` now surfaces a `detectedSegment` and the heuristic backfill agrees with category.
```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function offline() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("phase0 detected_segment backfill", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("exposes detectedSegment on evaluateChatbotQuery for a pricing question", async () => {
    offline()
    const result = await evaluateChatbotQuery("요금이 얼마예요?", { generateAnswer: false })
    expect(result.detectedSegment).toBe("pricing")
  })

  it("maps a critical incident question to support_complaint", async () => {
    offline()
    const result = await evaluateChatbotQuery("수업 중에 화면이 끊겨서 접속이 안돼요", { generateAnswer: false })
    expect(result.detectedSegment).toBe("support_complaint")
  })

  it("maps a positioning/identity question to prospect", async () => {
    offline()
    const result = await evaluateChatbotQuery("클래스인이 뭐예요?", { generateAnswer: false })
    expect(result.detectedSegment).toBe("prospect")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment-backfill.test.ts` Expected: TS/runtime error — `Property 'detectedSegment' does not exist` on the `evaluateChatbotQuery` result.

- [ ] **Step 3: Implement** — add `segment` to `ChatbotCore`, compute it once per return via the heuristic, and surface it on `evaluateChatbotQuery`.

Add import near the existing classification import block (after line 10):
```ts
import { classifyStage1Heuristic } from "@/lib/chatbot/segment"
import type { ChatbotSegment } from "@/lib/chatbot/segment"
```
Extend `ChatbotCore` (:2869-2878):
```ts
interface ChatbotCore {
  question: NormalizedQuestion
  response: ReturnType<typeof composeAnswer>
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  segment: ChatbotSegment
  warning?: string
  latencyMs: number
  retrievalCacheHit?: boolean
}
```
For every `return { question, response, category, intent, handoffIntent, ... }` inside `buildChatbotCore`, add a `segment` field. Because each early return already knows its `category` (and the question text), compute the heuristic from the resolved category. Add a tiny local helper right above `buildChatbotCore` (:3041) so each return is one line:
```ts
// Phase 0: backfill-only heuristic segment. Pure, no LLM, no carry → behavior-neutral.
function backfillSegment(question: NormalizedQuestion, category: string): ChatbotSegment {
  return classifyStage1Heuristic(question, category).segment
}
```
Then in each return object add e.g. for the greeting return (:3051):
```ts
      segment: backfillSegment(question, "general"),
```
for policyGuard (:3076): `segment: backfillSegment(question, policyGuard.category),`
for immediate handoff (:3088): `segment: backfillSegment(question, category),`
for CS figma guide (:3109): `segment: backfillSegment(question, category),`
for cached (:3142): `segment: backfillSegment(question, cached.category),`
for the final return (:3201): `segment: backfillSegment(question, category),`

> NOTE: `classifyStage1Heuristic`'s exact signature is owned by the segment area. This plan assumes `classifyStage1Heuristic(question: NormalizedQuestion, category: string, carry?: SegmentCarry)` returning `{ segment, ... }`. If the segment area instead derives category internally, drop the `category` arg here. Sequencing pass must align signatures.

Surface on `evaluateChatbotQuery` (:3252-3259):
```ts
export async function evaluateChatbotQuery(
  message: string,
  options: { generateAnswer?: boolean } = {}
): Promise<ChatbotQueryResponse & { detectedCategory: string; detectedSegment: ChatbotSegment }> {
  const core = await buildChatbotCore(message, { generateAnswer: options.generateAnswer })
  return {
    ...core.response,
    handoffIntent: core.handoffIntent,
    warning: core.warning,
    detectedCategory: core.category,
    detectedSegment: core.segment,
  }
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment-backfill.test.ts && npx eslint lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/segment-backfill.test.ts && git commit -m "feat(chatbot): phase0 thread heuristic detected_segment through core + eval"`

---

### Task: Phase0 — persist `detected_segment` + token/latency columns in persistExchange answer_events insert

**Files:**
- Modify: `lib/chatbot/service.ts` (`persistExchange` signature :2642-2653; answer_events insert object :2691-2702; both call sites :3222-3233 and :3433-3444; cached-path call site :3391-3402)

This task is **lint+build verified only** — `persistExchange` writes to Supabase and returns `{}` when `hasSupabaseServerEnv()` is false (:2654), so it is not unit-testable. No DOM. Verify via `npm run build` + the insert object shape review.

- [ ] **Step 1: Write the failing test** — N/A (DB write path, env-gated). Instead add a build/lint assertion in the commit's verification step. Document in the plan: this task has no vitest coverage; correctness is gated by `npm run build` (the insert object must reference fields that exist on the extended `persistExchange` signature) and by the Phase 0 alpha-readiness null-guard (observability area).

- [ ] **Step 2: Run test, verify FAIL** — Run: `npm run build` against the pre-change tree to confirm green baseline (so a later failure is attributable). Expected: passes (baseline).

- [ ] **Step 3: Implement** — extend the `persistExchange` signature with optional observability params and write them into the insert.

Signature (:2642-2653) — append optional params after `answerEventId`:
```ts
async function persistExchange(
  input: ChatbotQueryRequest,
  question: NormalizedQuestion,
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "handoffIntent">,
  meta: ChatbotRequestMeta,
  category: string,
  intent: string,
  handoffIntent: HandoffIntent,
  latencyMs?: number,
  sessionId?: string,
  answerEventId?: string,
  observability?: {
    detectedSegment?: ChatbotSegment | null
    firstTokenMs?: number | null
    stage1Ms?: number | null
    clarifyOffered?: boolean
    modelName?: string | null
  }
) {
```
Insert object (:2691-2702):
```ts
    const answerEventInsert: Record<string, unknown> = {
      session_id: resolvedSessionId,
      user_message_id: userMessage.id,
      assistant_message_id: assistantMessage.id,
      normalized_question: question.redacted,
      detected_intent: intent,
      detected_category: category,
      detected_segment: observability?.detectedSegment ?? null,
      answer_mode: response.answerMode,
      confidence: response.confidence,
      unresolved: response.unresolved,
      latency_ms: latencyMs ?? null,
      first_token_ms: observability?.firstTokenMs ?? null,
      stage1_ms: observability?.stage1Ms ?? null,
      clarify_offered: observability?.clarifyOffered ?? false,
      model_name: observability?.modelName ?? null,
    }
```
Update the two non-cached call sites to pass observability. `handleChatbotQuery` (:3222-3233):
```ts
  void persistExchange(
    input,
    core.question,
    core.response,
    meta,
    core.category,
    core.intent,
    core.handoffIntent,
    core.latencyMs,
    sessionId,
    answerEventId,
    { detectedSegment: core.segment }
  )
```
`streamChatbotQuery` non-cached call (:3433-3444) — `firstTokenMs`/`modelName` are threaded in the next task; for now pass segment + a null placeholder:
```ts
  void persistExchange(
    input,
    question,
    response,
    meta,
    category,
    intent,
    handoffIntent,
    elapsedSince(startedAt),
    sessionId,
    answerEventId,
    { detectedSegment: core.segment, firstTokenMs: null }
  )
```
Cached-path call (:3391-3402) — segment from cache (cache `segment` field is added in the next task; until then pass the recomputed heuristic so cached rows are not default-segment):
```ts
      void persistExchange(
        input,
        cachedQuestion,
        cached.response,
        meta,
        cached.category,
        cached.intent,
        cached.handoffIntent,
        elapsedSince(startedAt),
        sessionId,
        answerEventId,
        { detectedSegment: backfillSegment(cachedQuestion, cached.category), firstTokenMs: null }
      )
```

- [ ] **Step 4: Run test, verify PASS** — Run: `npx eslint app components lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts && git commit -m "feat(chatbot): phase0 persist detected_segment + observability columns in answer_events"`

---

### Task: Phase0 — capture firstTokenAt on first non-empty delta + thread first_token_ms; model_name from stream

**Files:**
- Modify: `lib/chatbot/service.ts` (`streamAndApplyFinalAnswer` :3291-3344 — `onChunk` :3308; `streamChatbotQuery` :3352-3445 — emitMeta/persist region)
- Test: `tests/chatbot/stream-query.test.ts` (extend :existing)

Pure-ish: the stream path runs offline (Gemini disabled) and short-circuits, so `first_token_ms` cannot be exercised end-to-end in vitest without a live model. The **firstToken capture logic** can be unit-tested by extracting it into a small pure helper. Cached-path `first_token_ms = null` is already covered by the prior task. The non-cached null-when-no-stream behavior is lint+build verified.

- [ ] **Step 1: Write the failing test** — test a pure `firstTokenElapsed` helper that returns the elapsed ms only on the first non-empty delta and `null` if no delta ever fired.
```ts
import { describe, expect, it } from "vitest"
import { __firstTokenTrackerForTest } from "@/lib/chatbot/service"

describe("phase0 first-token tracker", () => {
  it("records elapsed on the first non-empty delta and ignores later/empty deltas", () => {
    const t = __firstTokenTrackerForTest(1_000)
    expect(t.value()).toBeNull()
    t.mark("", 1_010)          // empty → no capture
    expect(t.value()).toBeNull()
    t.mark("안녕", 1_050)       // first real token → 50ms
    expect(t.value()).toBe(50)
    t.mark("하세요", 1_400)     // later token → unchanged
    expect(t.value()).toBe(50)
  })

  it("returns null when no token ever arrives (deterministic/cached path)", () => {
    const t = __firstTokenTrackerForTest(1_000)
    expect(t.value()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/stream-query.test.ts` Expected: `__firstTokenTrackerForTest is not a function` (not exported).

- [ ] **Step 3: Implement** — add the pure tracker, use it in `streamAndApplyFinalAnswer`, return the captured ms, and thread into the non-cached persist.

Add the pure helper near `elapsedSince` (:314):
```ts
// Phase 0 first-token observability: captures elapsed ms at the first non-empty delta only.
function __firstTokenTrackerForTest(startedAt: number) {
  let firstTokenMs: number | null = null
  return {
    mark(delta: string, now = Date.now()) {
      if (firstTokenMs === null && delta.length > 0) {
        firstTokenMs = Math.max(0, now - startedAt)
      }
    },
    value() {
      return firstTokenMs
    },
  }
}
export { __firstTokenTrackerForTest }
```
Change `streamAndApplyFinalAnswer` to accept `startedAt` and return `{ used: boolean; firstTokenMs: number | null }`. Update its destructured params (:3291-3303) to add `startedAt: number`, and rewrite `onChunk` (:3308-3316) to mark the tracker on the *emitted* delta (the first delta the user actually sees):
```ts
  const tracker = __firstTokenTrackerForTest(startedAt)
  const onChunk = (chunk: string) => {
    raw += chunk
    const sanitized = sanitizePublicAnswerText(raw)
    const safeEnd = lastSafeBoundary(sanitized)
    if (safeEnd > emittedLen) {
      const delta = sanitized.slice(emittedLen, safeEnd)
      tracker.mark(delta)
      emit({ type: "delta", text: delta })
      emittedLen = safeEnd
    }
  }
```
Change the two `return true/false` exits (:3340, :3343) to:
```ts
  if (!finalAnswer || !isUsableGeneratedAnswer(finalAnswer)) {
    return { used: false, firstTokenMs: tracker.value() }
  }
  applyGeneratedFinalAnswer(response, question, category, finalAnswer)
  return { used: true, firstTokenMs: tracker.value() }
```
(`return false` cases inside the timeout fallback stay as-is — they belong to `withTimeoutFallback`, not the outer function.) In `streamChatbotQuery`, capture the result and thread it. Replace the call (:3417-3419) and the final persist:
```ts
  let streamFirstTokenMs: number | null = null
  const isShortCircuited = isGreetingOnly(question) || Boolean(buildPolicyGuardResponse(question))
  if (!isShortCircuited && shouldUseAiFinalAnswer(response, question, category)) {
    const streamResult = await streamAndApplyFinalAnswer({
      question,
      category,
      response,
      historyPromise,
      emit,
      startedAt,
    })
    streamFirstTokenMs = streamResult.firstTokenMs
  }
```
Final non-cached persist (:3433-3444) — replace the placeholder `firstTokenMs: null`:
```ts
    { detectedSegment: core.segment, firstTokenMs: streamFirstTokenMs }
```
> `model_name`: the active tier in the stream path is hard-pinned `"basic"` → `gemini-2.5-flash` (`streamGeminiFinalAnswer` tier :3326). For Phase 0, pass `modelName: streamResult.used ? "gemini-2.5-flash" : null` in the same observability object. (The llm area owns the canonical model id constant; if it exports one, import and use it instead of the literal. Flagged in DEPENDENCIES.)

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/stream-query.test.ts && npx eslint lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/stream-query.test.ts && git commit -m "feat(chatbot): phase0 capture first_token_ms on first delta + model_name in stream path"`

---

## PHASE 1 — Stage1/Stage2 wiring + carry (DOES bump both cache versions)

### Task: Phase1 — deriveCarryState(rows) + return {history, carry} from the parallel history promise

**Files:**
- Modify: `lib/chatbot/service.ts` (`loadSessionHistory` :3019-3039; `historyPromise` construction :3156-3159 and the stream copy :3408; the `await historyPromise` consumers :3170, :3304)
- Test: `tests/chatbot/carry-state.test.ts` (new)

Consumes `SegmentCarry` type + `ChatbotSegment` from `lib/chatbot/segment.ts`. `deriveCarryState` is pure (operates on an array of rows) → fully unit-testable. The DB read that feeds it is env-gated, so only the parser is tested.

- [ ] **Step 1: Write the failing test** — `deriveCarryState` reads the most-recent answer_event row's `metadata.carry`, returns empty carry on missing/malformed metadata (try/catch contract).
```ts
import { describe, expect, it } from "vitest"
import { deriveCarryState } from "@/lib/chatbot/service"

describe("deriveCarryState", () => {
  it("returns empty carry for no rows", () => {
    expect(deriveCarryState([])).toEqual({ turnCount: 0 })
  })

  it("reads carry from the most recent row's metadata", () => {
    const carry = deriveCarryState([
      { created_at: "2026-06-24T00:00:02Z", metadata: { carry: { lastSegment: "pricing", lastClarifyAsked: true, turnCount: 3 } } },
      { created_at: "2026-06-24T00:00:01Z", metadata: { carry: { lastSegment: "prospect", turnCount: 1 } } },
    ])
    expect(carry).toEqual({ lastSegment: "pricing", lastClarifyAsked: true, turnCount: 3 })
  })

  it("falls back to empty carry when metadata is null or malformed", () => {
    expect(deriveCarryState([{ created_at: "x", metadata: null }])).toEqual({ turnCount: 0 })
    expect(deriveCarryState([{ created_at: "x", metadata: { carry: "oops" } }])).toEqual({ turnCount: 0 })
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/carry-state.test.ts` Expected: `deriveCarryState is not exported`.

- [ ] **Step 3: Implement** — add the pure parser + a `loadSessionContext` that does history + carry in one Supabase round-trip, replacing the bare `loadSessionHistory` promise.

Import the carry type (segment area) alongside the existing segment import:
```ts
import type { ChatbotSegment, SegmentCarry } from "@/lib/chatbot/segment"
```
Add the pure parser above `loadSessionHistory` (:3019):
```ts
interface AnswerEventCarryRow {
  created_at: string
  metadata: Record<string, unknown> | null
}

// 직전 answer_event.metadata.carry 에서 세션 carry 를 복원한다. 실패/누락 → 빈 carry.
export function deriveCarryState(rows: AnswerEventCarryRow[]): SegmentCarry {
  try {
    const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const latest = sorted[0]
    const raw = latest?.metadata?.carry
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { turnCount: 0 }
    const carry = raw as Partial<SegmentCarry>
    const out: SegmentCarry = { turnCount: typeof carry.turnCount === "number" ? carry.turnCount : 0 }
    if (typeof carry.lastSegment === "string") out.lastSegment = carry.lastSegment as ChatbotSegment
    if (typeof carry.lastClarifyAsked === "boolean") out.lastClarifyAsked = carry.lastClarifyAsked
    if (typeof carry.unresolvedSupportTurns === "number") out.unresolvedSupportTurns = carry.unresolvedSupportTurns
    return out
  } catch {
    return { turnCount: 0 }
  }
}
```
Add `loadSessionContext` right after `loadSessionHistory` (:3039) — same parallel-promise spirit, one extra select on the same client, both failures → safe defaults:
```ts
async function loadSessionContext(
  sessionId: string
): Promise<{ history: { role: "user" | "model"; parts: { text: string }[] }[]; carry: SegmentCarry }> {
  if (!hasSupabaseServerEnv()) return { history: [], carry: { turnCount: 0 } }
  try {
    const supabase = createSupabaseAdminClient()
    const [historyRes, carryRes] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("chatbot_answer_events")
        .select("created_at, metadata")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1),
    ])
    const history =
      historyRes.error || !historyRes.data
        ? []
        : normalizeSessionHistoryForGemini([...historyRes.data].reverse())
    const carry = carryRes.error || !carryRes.data ? { turnCount: 0 } : deriveCarryState(carryRes.data)
    return { history, carry }
  } catch (e) {
    console.warn("[chatbot] failed to load session context:", e)
    return { history: [], carry: { turnCount: 0 } }
  }
}
```
In `buildChatbotCore`, replace the `historyPromise` (:3156-3159) with a context promise:
```ts
  const contextPromise: Promise<{
    history: { role: "user" | "model"; parts: { text: string }[] }[]
    carry: SegmentCarry
  }> =
    shouldGenerateAnswer && options.sessionId
      ? loadSessionContext(options.sessionId)
      : Promise.resolve({ history: [], carry: { turnCount: 0 } })
```
At the `await historyPromise` consumer (:3170) replace with `const { history } = await contextPromise` (carry consumed by the Stage1 task below). In `streamChatbotQuery`, the local `historyPromise` (:3408) becomes `loadSessionContext(requestedSessionId)` returning `{history, carry}`; pass `.then(c => c.history)` into `streamAndApplyFinalAnswer` so its `historyPromise` param type is unchanged:
```ts
  const sessionContextPromise = requestedSessionId
    ? loadSessionContext(requestedSessionId)
    : Promise.resolve({ history: [], carry: { turnCount: 0 } })
```
and at the stream call pass `historyPromise: sessionContextPromise.then((c) => c.history)`.

> `loadSessionHistory` is now unused inside `buildChatbotCore` but is still imported by `tests/chatbot/session-history.test.ts`? Verify with `grep`. It is NOT exported (no `export` on :3019), and no test imports it. Safe to delete it after migration, OR keep it and have `loadSessionContext` reuse it. Keep it deleted to avoid dead code — confirm `grep -rn loadSessionHistory` shows zero other refs before removing.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/carry-state.test.ts tests/chatbot/session-history.test.ts && npx eslint lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/carry-state.test.ts && git commit -m "feat(chatbot): phase1 deriveCarryState + loadSessionContext (history+carry, one round-trip)"`

---

### Task: Phase1 — classifyStage1 orchestration replacing raw classifyChatbotQuestion; add segment/clarify/stage1 to ChatbotCore

**Files:**
- Modify: `lib/chatbot/service.ts` (`ChatbotCore` :2869-2878; main classify region :3161-3167; the `await contextPromise` :3170)
- Test: `tests/chatbot/carry-state.test.ts` or a new `tests/chatbot/stage1-orchestration.test.ts` (new) — via `evaluateChatbotQuery` offline (flash disabled → heuristic-only path).

Consumes from segment area: `classifyStage1(args)` (async orchestrator) OR composes `classifyStage1Heuristic` + the llm area's `classifyStage1WithGemini`. The decision per spec §4.3: the orchestrator lives in the **service** (`classifyStage1(...)`, spec App.B:223) and calls the heuristic (segment area) + optional flash (llm area). The flash branch runs **concurrently with retrieval**, both awaited before compose.

- [ ] **Step 1: Write the failing test** — offline (flash off via missing `GEMINI_API_KEY` + `CHATBOT_STAGE1_LLM=0`), Stage1 must still return a segment + a clarify decision and `evaluateChatbotQuery` must surface `detectedSegment` consistent with heuristic; `detected_category` (byte-compatible) unchanged vs before.
```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function offlineNoFlash() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.stubEnv("CHATBOT_STAGE1_LLM", "0")
}

describe("classifyStage1 orchestration (heuristic-only, flash off)", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("keeps detected_category byte-compatible with the heuristic for a pricing question", async () => {
    offlineNoFlash()
    const result = await evaluateChatbotQuery("소프트웨어 요금이 얼마예요?", { generateAnswer: false })
    expect(result.detectedCategory).toBe("billing")     // unchanged: heuristic owns category
    expect(result.detectedSegment).toBe("pricing")
  })

  it("routes a critical incident to support_complaint without flash", async () => {
    offlineNoFlash()
    const result = await evaluateChatbotQuery("수업 중에 로그인이 안돼요", { generateAnswer: false })
    expect(result.detectedSegment).toBe("support_complaint")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/stage1-orchestration.test.ts` Expected: `detectedSegment` not yet wired from `classifyStage1` (still backfill-only) OR the orchestrator absent. (If the prior backfill task already makes these pass, tighten the assertion to a clarify field check that does not yet exist, e.g. `expect(result).not.toHaveProperty('clarify')` inverted — but the canonical FAIL is the `clarify` plumbing below not existing on core.)

- [ ] **Step 3: Implement** — add `classifyStage1` orchestrator, run it concurrently with retrieval, fold into core. `detected_category` stays heuristic-owned (LLM may only flip segment/clarify per §4.3 reconciliation).

Extend `ChatbotCore` (:2869-2878) with clarify + stage1 timing:
```ts
interface ChatbotCore {
  question: NormalizedQuestion
  response: ReturnType<typeof composeAnswer>
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  segment: ChatbotSegment
  clarify: ClarifyDecision
  stage1Ms: number
  warning?: string
  latencyMs: number
  retrievalCacheHit?: boolean
}
```
Import the orchestrator pieces. Per spec, the async orchestrator is owned by service; the heuristic + LLM call are imported:
```ts
import {
  classifyStage1Heuristic,
  type ChatbotSegment,
  type ClarifyDecision,
  type SegmentCarry,
  type Stage1Result,
} from "@/lib/chatbot/segment"
import { classifyStage1WithGemini } from "@/lib/chatbot/llm"
```
Add the orchestrator above `buildChatbotCore` (:3041). It runs the heuristic synchronously, decides whether to escalate, and (if eligible) awaits the flash branch — but the **caller** starts it concurrently with retrieval:
```ts
async function classifyStage1(
  question: NormalizedQuestion,
  carry: SegmentCarry,
  opts: { shouldGenerateAnswer: boolean }
): Promise<Stage1Result & { stage1Ms: number }> {
  const startedAt = Date.now()
  const heuristic = classifyStage1Heuristic(question, carry)
  // 모호밴드 + 비숏서킷 + 생성경로 + 킬스위치 통과 시에만 flash 1콜.
  const shouldEscalate =
    opts.shouldGenerateAnswer &&
    process.env.CHATBOT_STAGE1_LLM !== "0" &&
    heuristic.escalateEligible &&
    Boolean(process.env.GEMINI_API_KEY?.trim())
  if (!shouldEscalate) {
    return { ...heuristic, stage1Ms: elapsedSince(startedAt) }
  }
  const refined = await classifyStage1WithGemini({
    question: question.redacted,
    heuristic,
  })
  // 안전 화해: LLM 은 segment 플립·clarify 만, 민감/complaint 는 휴리스틱 소유(segment area 가 머지).
  const merged = refined ? heuristic.reconcileWithLlm(refined) : heuristic
  return { ...merged, stage1Ms: elapsedSince(startedAt) }
}
```
In `buildChatbotCore`, start Stage1 + retrieval concurrently. Replace the classify region (:3161-3167). First derive carry from `contextPromise` (it must resolve before classify so sticky bias is applied — but carry load is part of the same parallel promise started at :3156, so `await` it alongside search):
```ts
  const [{ sources, warning, cacheHit }, { history, carry }] = await Promise.all([
    searchKnowledgeSourcesWithinBudget(question),
    contextPromise,
  ])
  const stage1 = await classifyStage1(question, carry, { shouldGenerateAnswer })
  const classificationSources = sources.filter((source) => source.score >= MIN_DIRECT_SOURCE_SCORE)
  // detected_category 는 휴리스틱 소유로 byte-호환 유지 — 기존 classifyChatbotQuestion 결과 사용.
  const { category, intent, handoffIntent } = classifyChatbotQuestion(
    question.redacted,
    classificationSources.map((source) => source.category)
  )
  const segment = stage1.segment
  const clarify = stage1.clarify
  const response = composeAnswer(question, sources, category)
```
> NOTE on concurrency: spec §4.3 wants the flash branch and retrieval to overlap. The cleanest correct form is to kick both promises off, then await. Refine Step 3 to:
> ```ts
> const stage1Promise = contextPromise.then(({ carry }) =>
>   classifyStage1(question, carry, { shouldGenerateAnswer })
> )
> const searchPromise = searchKnowledgeSourcesWithinBudget(question)
> const [{ sources, warning, cacheHit }, ctx, stage1] = await Promise.all([
>   searchPromise, contextPromise, stage1Promise,
> ])
> const { history } = ctx
> ```
> This keeps the flash 1.2s timeout hidden under the 2.8s retrieval budget. Use this overlapped form.

Replace the `await historyPromise` (:3170) with the already-resolved `history`. Update the final return (:3201-3210) to include `segment, clarify, stage1Ms: stage1.stage1Ms`. Update the **early returns** to supply `clarify: { ask: false }` and `stage1Ms: 0` (Stage1 short-circuits never clarify):
- greeting (:3051), policyGuard (:3076), immediate handoff (:3088), CS figma (:3109), cached (:3142): add `clarify: { ask: false }, stage1Ms: 0,` and keep the `segment: backfillSegment(...)` from Phase 0.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/stage1-orchestration.test.ts tests/chatbot/classification.test.ts tests/chatbot/stream-query.test.ts && npx eslint lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/stage1-orchestration.test.ts && git commit -m "feat(chatbot): phase1 classifyStage1 orchestrator (heuristic+flash) wired into core, category byte-compatible"`

---

### Task: Phase1 — refactor early-return cascade into explicit Stage1 short-circuits + Stage2; extend shouldUseAiFinalAnswer for clarify

**Files:**
- Modify: `lib/chatbot/service.ts` (`buildChatbotCore` cascade :3050-3211; `shouldUseAiFinalAnswer` :3939... actually :2939-2951; `isShortCircuited` :3416)
- Test: `tests/chatbot/clarify-gate.test.ts` (new)

`shouldUseAiFinalAnswer` is a pure function but not exported. Test via `evaluateChatbotQuery` for the observable effect: a clarify-decision turn keeps the deterministic template (no AI overwrite) — offline this is already the case, so the meaningful unit test targets the extracted predicate. Export a thin testable predicate.

- [ ] **Step 1: Write the failing test** — `shouldUseAiFinalAnswer` returns false when the resolved response carries a clarify ask.
```ts
import { describe, expect, it } from "vitest"
import { __shouldUseAiFinalAnswerForTest } from "@/lib/chatbot/service"

const baseQ = { original: "x", normalized: "x", redacted: "수업 운영이 궁금해요", piiRedacted: false, tokens: ["수업", "운영", "궁금"] }
const baseResp = {
  answer: "초안", answerMode: "direct_answer" as const, confidence: 0.5,
  needsHandoff: false, sources: [], suggestedQuestions: [], unresolved: false,
}

describe("shouldUseAiFinalAnswer + clarify gate", () => {
  it("returns false when clarify.ask is true (template verbatim, skip Gemini)", () => {
    expect(__shouldUseAiFinalAnswerForTest(baseResp, baseQ, "classroom", { ask: true, question: "어떤 부분이 궁금하세요?", reason: "ambiguous_segment" })).toBe(false)
  })

  it("returns true for an ordinary non-curated answerable question when clarify.ask is false", () => {
    expect(__shouldUseAiFinalAnswerForTest(baseResp, baseQ, "classroom", { ask: false })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/clarify-gate.test.ts` Expected: `__shouldUseAiFinalAnswerForTest is not a function`.

- [ ] **Step 3: Implement** — add a `clarify` param to `shouldUseAiFinalAnswer`, gate on it, export a test seam, and make the cascade explicit.

`shouldUseAiFinalAnswer` (:2939-2951):
```ts
function shouldUseAiFinalAnswer(
  response: Omit<ChatbotQueryResponse, "answerEventId" | "sessionId" | "warning" | "handoffIntent">,
  question: NormalizedQuestion,
  category: string,
  clarify: ClarifyDecision = { ask: false }
) {
  // clarify 턴은 결정론 템플릿 verbatim — Gemini 재작성 스킵.
  if (clarify.ask) return false
  if (category === "general" && !isDomainRelatedQuestion(question, category)) return false
  if (wantsImmediateHumanHandoff(question)) return false
  if (response.answerMode === "clarifying_question" && question.tokens.length < 2) return false
  if (response.answerMode === "direct_answer" && isCsFigmaGuideResponse(response)) return false
  if (response.answerMode === "direct_answer" && isCuratedTemplateQuestion(question)) return false
  return true
}
export { shouldUseAiFinalAnswer as __shouldUseAiFinalAnswerForTest }
```
In `buildChatbotCore` Stage2, pass `clarify` to the gate (:3169):
```ts
  if (shouldGenerateAnswer && shouldUseAiFinalAnswer(response, question, category, clarify)) {
```
Make the cascade explicit by adding a banner comment block (no logic change — the early returns ARE the Stage1 short-circuits; this documents and locks the boundary). Above the greeting check (:3050) add:
```ts
  // ── Stage1 UNDERSTAND: short-circuits (인사/정책가드/즉시핸드오프/CS가이드/캐시) ──
  // 아래 5개 early-return 은 검색·Gemini 이전에 종결되는 Stage1 숏서킷이다.
```
and above the search call (:3161) add:
```ts
  // ── Stage1 → Stage2 경계: 여기서부터 검색·세그먼트분류·compose·Gemini(RESPOND) ──
```
In `streamChatbotQuery`, the `isShortCircuited` clause (:3416) and the AI gate (:3417) must respect clarify too. After `const { question, response, category, intent, handoffIntent, warning } = core` add `const { clarify } = core` and update:
```ts
  const isShortCircuited =
    isGreetingOnly(question) || Boolean(buildPolicyGuardResponse(question)) || clarify.ask
  if (!isShortCircuited && shouldUseAiFinalAnswer(response, question, category, clarify)) {
```
> NOTE: when `clarify.ask` is true, the Stage2 compose has already produced a deterministic answer; the clarify template body itself is owned by the segment/compose area (Phase 1 spec §4.3 "clarify 작성자 = 결정론 템플릿"). This pipeline task only guarantees the **gate** (Gemini skipped, treated as short-circuited so the stream emits a single `replace` with no delta). The actual clarify-question string injection into `response`/`answerMode='clarifying_question'` is the segment/compose task — flagged in DEPENDENCIES.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/clarify-gate.test.ts tests/chatbot/stream-query.test.ts tests/chatbot/quality-regression.test.ts && npx eslint lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/clarify-gate.test.ts && git commit -m "feat(chatbot): phase1 explicit Stage1/Stage2 boundary + clarify gate in shouldUseAiFinalAnswer"`

---

### Task: Phase1 — persist carry on write (lastSegment/lastClarifyAsked/turnCount) into answer_events.metadata

**Files:**
- Modify: `lib/chatbot/service.ts` (`persistExchange` observability param :2642-2653 + insert :2691-2702; both call sites pass carry-to-write; add `CachedAnswerEntry.segment` :263-269 and cache writers/readers :198, :3198, :3428)
- Test: `tests/chatbot/carry-state.test.ts` (extend — pure `buildCarryToPersist` helper)

Carry **write** is DB-bound (lint+build verified), but the carry-shaping logic (`buildCarryToPersist(prevCarry, segment, clarifyOffered)`) is pure → unit-tested.

- [ ] **Step 1: Write the failing test** — `buildCarryToPersist` increments turnCount, sets lastSegment, and records lastClarifyAsked.
```ts
import { describe, expect, it } from "vitest"
import { buildCarryToPersist } from "@/lib/chatbot/service"

describe("buildCarryToPersist", () => {
  it("increments turnCount and records segment + clarify on a fresh session", () => {
    expect(buildCarryToPersist({ turnCount: 0 }, "pricing", false)).toEqual({
      turnCount: 1, lastSegment: "pricing", lastClarifyAsked: false,
    })
  })
  it("carries forward turnCount and flips lastClarifyAsked when clarify offered", () => {
    expect(buildCarryToPersist({ turnCount: 2, lastSegment: "prospect" }, "support_complaint", true)).toEqual({
      turnCount: 3, lastSegment: "support_complaint", lastClarifyAsked: true,
    })
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/carry-state.test.ts` Expected: `buildCarryToPersist is not exported`.

- [ ] **Step 3: Implement** — pure carry builder + thread carry into the insert metadata + cache `segment`.

Pure builder near `deriveCarryState`:
```ts
export function buildCarryToPersist(
  prev: SegmentCarry,
  segment: ChatbotSegment,
  clarifyOffered: boolean
): SegmentCarry {
  return {
    turnCount: (prev.turnCount ?? 0) + 1,
    lastSegment: segment,
    lastClarifyAsked: clarifyOffered,
    ...(typeof prev.unresolvedSupportTurns === "number"
      ? { unresolvedSupportTurns: prev.unresolvedSupportTurns }
      : {}),
  }
}
```
Extend the `persistExchange` observability object to accept `carry?: SegmentCarry` and `clarifyOffered`, and write `metadata: { carry }` into the insert. Add to the insert object (:2691-2702):
```ts
      metadata: observability?.carry ? { carry: observability.carry } : {},
```
> DEPENDS on the migration adding `metadata jsonb` to `chatbot_answer_events` (see top banner). Without it this key is silently dropped by Supabase.

`buildChatbotCore` must surface the previous carry so the writer can compute the next carry. Add `carry` to `ChatbotCore` (the *incoming* carry from `contextPromise`) and `clarify` is already present. In the final return add `carry,` (the resolved `ctx.carry`); early returns supply `carry: { turnCount: 0 }`. Then at the persist call sites compute and pass the next carry:

`handleChatbotQuery` (:3222-3233):
```ts
    {
      detectedSegment: core.segment,
      clarifyOffered: core.clarify.ask,
      carry: buildCarryToPersist(core.carry, core.segment, core.clarify.ask),
    }
```
`streamChatbotQuery` final persist (:3433-3444):
```ts
    {
      detectedSegment: core.segment,
      firstTokenMs: streamFirstTokenMs,
      clarifyOffered: core.clarify.ask,
      carry: buildCarryToPersist(core.carry, core.segment, core.clarify.ask),
      modelName: streamFirstTokenMs !== null ? "gemini-2.5-flash" : null,
    }
```
Cached path (:3391-3402) — cache now stores `segment`; add `segment` to `CachedAnswerEntry` (:263-269) and populate it at both cache writers (`setCachedAnswer` calls at :3198 and :3428) and read it at the cached returns. Cached path carry: cached first turns are no-session so carry stays empty:
```ts
      {
        detectedSegment: cached.segment,
        firstTokenMs: null,
        clarifyOffered: false,
        carry: buildCarryToPersist({ turnCount: 0 }, cached.segment, false),
      }
```
`CachedAnswerEntry` (:263-269):
```ts
interface CachedAnswerEntry {
  response: ReturnType<typeof composeAnswer>
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  segment: ChatbotSegment
  warning?: string
}
```
Both `setCachedAnswer({ response, category, intent, handoffIntent, warning })` calls (:3198, :3428) gain `segment`. The cached return in `buildChatbotCore` (:3142-3151) already reads `cached.category` etc — add `segment: cached.segment`.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/carry-state.test.ts && npx eslint app components lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/carry-state.test.ts && git commit -m "feat(chatbot): phase1 persist SegmentCarry to answer_events.metadata + cache segment field"`

---

### Task: Phase1 — bump RETRIEVAL_CACHE_VERSION + ANSWER_CACHE_VERSION

**Files:**
- Modify: `lib/chatbot/service.ts` (`RETRIEVAL_CACHE_VERSION` :53; `ANSWER_CACHE_VERSION` :271)
- Test: `tests/chatbot/cache-version.test.ts` (new — version-change assertion, release-scoped)

Pure constant change. Per spec §10 "캐시 버전 소유권" a version-change assertion test guards against duplicate bumps. Phase 1 changes prompts/schema/classification keys → both must bump.

- [ ] **Step 1: Write the failing test** — assert the new versions are present (locks the bump).
```ts
import { describe, expect, it } from "vitest"
import { ANSWER_CACHE_VERSION_FOR_TEST, RETRIEVAL_CACHE_VERSION_FOR_TEST } from "@/lib/chatbot/service"

describe("phase1 cache version bump", () => {
  it("retrieval cache version is the phase1 marker", () => {
    expect(RETRIEVAL_CACHE_VERSION_FOR_TEST).toBe("rag-rerank-20260624-v5")
  })
  it("answer cache version is the phase1 marker", () => {
    expect(ANSWER_CACHE_VERSION_FOR_TEST).toBe("answer-20260624-v6")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/cache-version.test.ts` Expected: exports missing + version mismatch (`rag-rerank-20260618-v4` / `answer-20260622-v5`).

- [ ] **Step 3: Implement** — bump both and export test seams.

Line 53:
```ts
const RETRIEVAL_CACHE_VERSION = "rag-rerank-20260624-v5"
```
Line 271:
```ts
const ANSWER_CACHE_VERSION = "answer-20260624-v6"
```
Add exports near them (a single block after :273):
```ts
export const RETRIEVAL_CACHE_VERSION_FOR_TEST = RETRIEVAL_CACHE_VERSION
export const ANSWER_CACHE_VERSION_FOR_TEST = ANSWER_CACHE_VERSION
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/cache-version.test.ts && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/cache-version.test.ts && git commit -m "chore(chatbot): phase1 bump RETRIEVAL+ANSWER cache versions to 20260624"`

---

## DEPENDENCIES & TYPES

**My tasks DEFINE (consumable by other areas / tests):**
- `service.ts`: `deriveCarryState(rows): SegmentCarry`, `buildCarryToPersist(prev, segment, clarifyOffered): SegmentCarry`, `loadSessionContext` (internal), `classifyStage1(question, carry, opts): Promise<Stage1Result & {stage1Ms}>` (internal orchestrator), `__firstTokenTrackerForTest`, `__shouldUseAiFinalAnswerForTest`, `RETRIEVAL_CACHE_VERSION_FOR_TEST`, `ANSWER_CACHE_VERSION_FOR_TEST`.
- `evaluateChatbotQuery` return now includes `detectedSegment: ChatbotSegment` (consumed by **eval area** for `segmentMatchRate`).
- `ChatbotCore` gains `segment`, `clarify`, `stage1Ms`, `carry`.
- `persistExchange` gains an `observability` param carrying `{detectedSegment, firstTokenMs, stage1Ms, clarifyOffered, modelName, carry}` (the **handoff/Phase 2 area** will later add `forceReason` onto this same single call — do NOT add a second `maybeCreateChannelTalkHandoff` call site).
- `CachedAnswerEntry` gains `segment`.

**My tasks CONSUME from other areas (must land first or co-land):**
- **segment area** (`lib/chatbot/segment.ts`, NEW): `ChatbotSegment`, `ClarifyDecision`, `SegmentCarry`, `Stage1Result`, `classifyStage1Heuristic(question, categoryOrCarry, ...)`, and on the heuristic result: `escalateEligible: boolean` + `reconcileWithLlm(refined): Stage1Result` (safe-reconciliation: LLM may flip segment/clarify only; sensitive/complaint heuristic-owned). **`Stage1Result` must expose `{ segment, clarify, ... }`.** If the segment area names these differently, the orchestrator wiring in "classifyStage1 orchestration" must be adjusted — sequencing pass align signatures.
- **llm area** (`lib/chatbot/llm.ts`): `classifyStage1WithGemini({question, heuristic}): Promise<RefinedStage1 | null>` (tier basic, thinkingBudget:0, temp 0, maxOutputTokens 128, timeout 1200ms, json schema, null-on-failure). Phase 0 has no llm dependency (heuristic-only). Optionally a canonical `FAST_MODEL_ID` constant for `model_name` (I currently hardcode `"gemini-2.5-flash"`).
- **migration/observability area** (`supabase/migrations/2026XXXX_chatbot_segment_observability.sql`): MUST add to `chatbot_answer_events`: `detected_segment text` (+index), `first_token_ms int`, `stage1_ms int`, `clarify_offered bool default false`, **and `metadata jsonb not null default '{}'::jsonb`** (carry storage — absent today, confirmed against `20260421_z_chatbot_analytics.sql`). My Phase 0 insert references these columns; without the migration the inserts fail (caught by `persistExchange` try/catch → silent no-op + console.warn).
- **segment/compose area** (Phase 1, separate): the actual clarify-question *string* injection into `response.answer` / `answerMode='clarifying_question'`. My pipeline only owns the **gate** (skip Gemini + treat as short-circuited). If clarify body is unwired, `clarify.ask` turns will gate Gemini but emit the existing deterministic compose output.

**Sequencing:** segment.ts type+heuristic → my Phase 0 (backfill + persist columns + firstToken) → migration applied → llm `classifyStage1WithGemini` → my Phase 1 (deriveCarry → classifyStage1 orchestration → clarify gate → carry persist → cache bump, in that order; cache bump LAST so all schema/prompt/key changes are covered by a single release-owned bump).

### Additional authored task (Area E, gap-fill §0.12): clarify-compose wiring (the user actually sees the question)

**Files:**
- Modify: `lib/chatbot/service.ts` (`buildChatbotCore`, right after Stage1 orchestration — before retrieval)
- Test: `tests/chatbot/segment.test.ts` (pure `decideClarify` already covers the decision) + golden case (below)
- Golden: `data/chatbot-golden-set.json`

`decideClarify` produces the question string, but nothing wires it into the response. Add a clarify short-circuit in `buildChatbotCore`: when `stage1.clarify.ask`, return a `ChatbotCore` whose answer IS the clarify question, with `answerMode='clarifying_question'`, `clarify_offered=true`, `needsHandoff=false`, `suggestedQuestions=[]`, and **skip retrieval + Gemini entirely** (a latency win — curated=final semantics). This pairs with #27 (`shouldUseAiFinalAnswer` returns false on clarify).

- [ ] **Step 1: Write the failing test** — clarify wiring is integration-level (buildChatbotCore needs no network on this branch since it short-circuits before retrieval/Gemini — but it does construct a ChatbotCore). Add a golden case asserting the mode, and a focused assertion via the eval harness. Append to `data/chatbot-golden-set.json` a case (exact shape: match the existing case schema in the file):

```json
{
  "id": "clarify-install-cost-collision",
  "question": "설치 비용",
  "expectMode": "clarifying_question",
  "expectSegment": "pricing",
  "note": "가격 vs 설치 세그먼트 충돌 → 단일 되묻기"
}
```

Then add an eval assertion (in the eval test that runs golden cases) that this case yields `answerMode === "clarifying_question"` and a non-empty answer equal to the deterministic template. If the project's golden harness already asserts `expectMode`, this case alone is the failing test.

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/` (the golden case fails: current pipeline answers "설치 비용" instead of asking the clarifying question). Or run the admin golden-eval. Expected: FAIL — mode is `direct_answer`/`doc_suggestion`, not `clarifying_question`.

- [ ] **Step 3: Implement** — in `buildChatbotCore`, immediately AFTER the Stage1 orchestration result (`stage1`) is computed and BEFORE `searchKnowledgeSourcesWithinBudget`, add:

```ts
if (stage1.clarify.ask) {
  return {
    ...baseCoreFields,            // mirror the existing early-return ChatbotCore shape used by greeting/policy guards
    answer: stage1.clarify.question,
    answerMode: "clarifying_question",
    confidence: 0.5,
    needsHandoff: false,
    handoffIntent: "none",
    sources: [],
    suggestedQuestions: [],
    segment: stage1.segment,
    clarify: stage1.clarify,
    stage1,
    carry: { ...ctx.carry, lastSegment: stage1.segment, lastClarifyAsked: true, turnCount: (ctx.carry?.turnCount ?? 0) + 1 },
    clarifyOffered: true,
    unresolved: false,
  }
}
```

> Mirror the EXACT field set of the existing greeting/policy-guard early returns in `buildChatbotCore` (copy that object's keys; `baseCoreFields` above is a stand-in for whatever the file already returns). The critical additions vs a normal core are `answerMode: "clarifying_question"`, `clarifyOffered: true`, and the carry with `lastClarifyAsked: true` (the loop-break guarantee from §4.4).

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/ && npx eslint app components lib --max-warnings=0 && npm run build`. Confirm the golden case now reports `clarifying_question`.

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts data/chatbot-golden-set.json && git commit -m "feat(chatbot): clarify short-circuit — emit single clarifying question, set lastClarifyAsked, skip retrieval+Gemini"`

---

---

# AREA F — Admin + Eval (Phase 0)

### Task: Define the Phase-0 segment SSOT type + pure `mapCategoryToSegment` mapper in `lib/chatbot/segment.ts`

> NOTE: `lib/chatbot/segment.ts` is the Stage1 author's file (Phase 1). Phase 0 needs only the SSOT type + the deterministic category→segment mapper to derive `detected_segment` for backfill and to compute `segmentMatchRate` in eval. This task creates ONLY those two pure exports; the Stage1 author extends the same file in Phase 1. If sequencing puts the Stage1 author first, this task collapses into a no-op import check.

**Files:**
- Create: `lib/chatbot/segment.ts`
- Test: `tests/chatbot/segment-map.test.ts`

- [ ] **Step 1: Write the failing test** — eval logic is vitest-testable.
```ts
// tests/chatbot/segment-map.test.ts
import { describe, expect, it } from "vitest"

import { CHATBOT_SEGMENTS, mapCategoryToSegment, type ChatbotSegment } from "@/lib/chatbot/segment"

describe("mapCategoryToSegment (Phase 0 deterministic derivation)", () => {
  it("exposes exactly the four SSOT segments", () => {
    expect([...CHATBOT_SEGMENTS].sort()).toEqual(
      ["existing_ops", "pricing", "prospect", "support_complaint"].sort()
    )
  })

  it("maps pricing/billing categories to pricing", () => {
    expect(mapCategoryToSegment("pricing")).toBe<ChatbotSegment>("pricing")
    expect(mapCategoryToSegment("billing")).toBe("pricing")
  })

  it("maps troubleshooting to support_complaint", () => {
    expect(mapCategoryToSegment("troubleshooting")).toBe("support_complaint")
  })

  it("maps onboarding to prospect", () => {
    expect(mapCategoryToSegment("onboarding")).toBe("prospect")
  })

  it("maps classroom/admin/hardware operations to existing_ops", () => {
    expect(mapCategoryToSegment("classroom")).toBe("existing_ops")
    expect(mapCategoryToSegment("admin")).toBe("existing_ops")
    expect(mapCategoryToSegment("hardware")).toBe("existing_ops")
  })

  it("falls back to prospect for unknown/general categories", () => {
    expect(mapCategoryToSegment("general")).toBe("prospect")
    expect(mapCategoryToSegment("totally-unknown")).toBe("prospect")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment-map.test.ts` Expected: FAIL — `Cannot find module '@/lib/chatbot/segment'`.

- [ ] **Step 3: Implement**
```ts
// lib/chatbot/segment.ts
/**
 * 챗봇 4개 비즈니스 세그먼트의 단일 SSOT.
 * Phase 0: 결정론적 category→segment 매퍼만 노출(detected_segment 백필·eval segmentMatchRate용).
 * Phase 1(Stage1 작성자): 같은 파일에 휴리스틱 분류기·confidence·clarify를 확장한다.
 */

export const CHATBOT_SEGMENTS = [
  "prospect",
  "pricing",
  "existing_ops",
  "support_complaint",
] as const

export type ChatbotSegment = (typeof CHATBOT_SEGMENTS)[number]

// 기존 8-cat 분류값 → 세그먼트. 우선순위(pricing > support > existing_ops > prospect)는
// Phase 1 휴리스틱이 complaint/critical 신호로 별도 오버라이드한다(여기는 순수 category 파생만).
const CATEGORY_TO_SEGMENT: Record<string, ChatbotSegment> = {
  pricing: "pricing",
  billing: "pricing",
  troubleshooting: "support_complaint",
  classroom: "existing_ops",
  admin: "existing_ops",
  hardware: "existing_ops",
  onboarding: "prospect",
}

export function mapCategoryToSegment(category: string | null | undefined): ChatbotSegment {
  if (!category) return "prospect"
  return CATEGORY_TO_SEGMENT[category.trim().toLowerCase()] ?? "prospect"
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment-map.test.ts`

- [ ] **Step 5: Commit** — `git add lib/chatbot/segment.ts tests/chatbot/segment-map.test.ts && git commit -m "feat(chatbot): segment SSOT type + deterministic category→segment mapper (Phase 0)"`

---

### Task: Expose `detectedSegment` on `evaluateChatbotQuery` (no behavior change)

> NOTE: `evaluateChatbotQuery` (service.ts:3249-3260) returns `detectedCategory` only. Phase 0 eval needs the derived segment per case. Since Phase 0 does NOT add a real Stage1, derive it deterministically from the already-computed `core.category` via `mapCategoryToSegment`. No prompt/answer change → NO cache bump.

**Files:**
- Modify: `lib/chatbot/service.ts`(:3249-3260)
- Test: `tests/chatbot/eval-segment.test.ts`

- [ ] **Step 1: Write the failing test** — vitest-testable (external services stubbed off → deterministic offline path).
```ts
// tests/chatbot/eval-segment.test.ts
import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import { mapCategoryToSegment } from "@/lib/chatbot/segment"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

afterEach(() => vi.unstubAllEnvs())

describe("evaluateChatbotQuery detectedSegment", () => {
  it("returns a detectedSegment consistent with the detected category", async () => {
    disableExternalChatbotServices()
    const result = await evaluateChatbotQuery("클래스인이 뭐야?", { generateAnswer: false })

    expect(result).toHaveProperty("detectedSegment")
    expect(result.detectedSegment).toBe(mapCategoryToSegment(result.detectedCategory))
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/eval-segment.test.ts` Expected: FAIL — `detectedSegment` is `undefined`.

- [ ] **Step 3: Implement** — Add the import near the other `lib/chatbot` imports at the top of `service.ts`, then extend the return shape.
```ts
// near top of lib/chatbot/service.ts (with the other intra-lib imports)
import { mapCategoryToSegment, type ChatbotSegment } from "@/lib/chatbot/segment"
```
```ts
// lib/chatbot/service.ts:3249-3260 — replace the function
export async function evaluateChatbotQuery(
  message: string,
  options: { generateAnswer?: boolean } = {}
): Promise<ChatbotQueryResponse & { detectedCategory: string; detectedSegment: ChatbotSegment }> {
  const core = await buildChatbotCore(message, { generateAnswer: options.generateAnswer })
  return {
    ...core.response,
    handoffIntent: core.handoffIntent,
    warning: core.warning,
    detectedCategory: core.category,
    detectedSegment: mapCategoryToSegment(core.category),
  }
}
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/eval-segment.test.ts && npx eslint lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/eval-segment.test.ts && git commit -m "feat(chatbot): expose detectedSegment from evaluateChatbotQuery (Phase 0, no behavior change)"`

---

### Task: Add `expectSegment` to `GoldenCase` + `segmentMatchRate` to the eval report

**Files:**
- Modify: `lib/chatbot/eval.ts`(:24-31 GoldenCase, :40-69 report types, :177-243 evaluateGoldenCase, :245-317 runGoldenEval)
- Test: `tests/chatbot/eval-report.test.ts`

- [ ] **Step 1: Write the failing test** — vitest-testable. Drive the pure aggregation through a tiny exported helper so we do NOT call the network. Add `summarizeGoldenResults` as a pure export in eval.ts and test it directly.
```ts
// tests/chatbot/eval-report.test.ts
import { describe, expect, it } from "vitest"

import { summarizeGoldenResults, type GoldenEvalCaseResult } from "@/lib/chatbot/eval"

function emptyResult(over: Partial<GoldenEvalCaseResult>): GoldenEvalCaseResult {
  return {
    categoryMatch: 0,
    modeOk: 0,
    withSources: 0,
    segmentMatch: 0,
    judged: 0,
    faithfulHits: 0,
    hallucinations: 0,
    addressesHits: 0,
    scoreSum: 0,
    guardrails: { rawChunkLeak: 0, pricingAssertion: 0, sensitiveSoftening: 0 },
    failure: null,
    ...over,
  }
}

describe("summarizeGoldenResults", () => {
  it("computes segmentMatchRate from per-case segmentMatch", () => {
    const report = summarizeGoldenResults(
      [emptyResult({ segmentMatch: 1 }), emptyResult({ segmentMatch: 0 }), emptyResult({ segmentMatch: 1 })],
      3,
      Date.now(),
      false
    )
    expect(report.deterministic.segmentMatchRate).toBeCloseTo(2 / 3, 5)
  })

  it("rolls up deterministic guardrail counts to a report-level block", () => {
    const report = summarizeGoldenResults(
      [
        emptyResult({ guardrails: { rawChunkLeak: 1, pricingAssertion: 0, sensitiveSoftening: 0 } }),
        emptyResult({ guardrails: { rawChunkLeak: 0, pricingAssertion: 1, sensitiveSoftening: 1 } }),
      ],
      2,
      Date.now(),
      false
    )
    expect(report.guardrails).toEqual({ rawChunkLeak: 1, pricingAssertion: 1, sensitiveSoftening: 1 })
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/eval-report.test.ts` Expected: FAIL — `summarizeGoldenResults`, `GoldenEvalCaseResult` (exported), `segmentMatch`, and `guardrails` do not exist.

- [ ] **Step 3: Implement** — Three edits in `lib/chatbot/eval.ts`.

(a) Import the mapper and extend `GoldenCase` + the result/report types (`:24-31`, `:40-81`):
```ts
// add to imports (line ~18, after the ./service import)
import { mapCategoryToSegment } from "./segment"
```
```ts
// replace GoldenCase (currently :24-31)
interface GoldenCase {
  id: string
  question: string
  expectCategory: string
  expectMode: string[]
  expectPathIncludes?: string
  expectHeadingIncludes?: string
  expectSegment?: string
}
```
```ts
// add to GoldenEvalFailure (currently :40-47) — extend flags only, no new field needed,
// but add detectedSegment for admin readability:
export interface GoldenEvalFailure {
  id: string
  question: string
  detectedCategory: string
  expectCategory: string
  detectedSegment: string
  expectSegment: string | null
  answerMode: string
  flags: string[]
}
```
```ts
// extend GoldenEvalReport.deterministic (currently :52-59) — add segmentMatch + rate,
// and add a top-level guardrails block (currently report ends at :68):
export interface GoldenEvalReport {
  total: number
  durationMs: number
  deterministic: {
    categoryMatch: number
    modeOk: number
    withSources: number
    segmentMatch: number
    categoryMatchRate: number
    modeOkRate: number
    sourceRate: number
    segmentMatchRate: number
  }
  guardrails: {
    rawChunkLeak: number
    pricingAssertion: number
    sensitiveSoftening: number
  }
  judge: {
    enabled: boolean
    judged: number
    faithfulRate: number | null
    hallucinationRate: number | null
    addressesRate: number | null
    avgScore: number | null
  }
  failures: GoldenEvalFailure[]
}
```
```ts
// export + extend GoldenEvalCaseResult (currently :71-81, change `interface` → `export interface`)
export interface GoldenEvalCaseResult {
  categoryMatch: number
  modeOk: number
  withSources: number
  segmentMatch: number
  judged: number
  faithfulHits: number
  hallucinations: number
  addressesHits: number
  scoreSum: number
  guardrails: { rawChunkLeak: number; pricingAssertion: number; sensitiveSoftening: number }
  failure: GoldenEvalFailure | null
}
```

(b) In `evaluateGoldenCase` (`:177-243`) compute `segmentMatch` and populate the new failure fields. Add after `const isCategoryMatch = ...` (`:182`):
```ts
  const detectedSegment = mapCategoryToSegment(result.detectedCategory)
  const isSegmentMatch = !testCase.expectSegment || detectedSegment === testCase.expectSegment
```
Then in the `flags` block (after `:218`) add:
```ts
  if (!isSegmentMatch) flags.push(`segment:${detectedSegment}≠${testCase.expectSegment}`)
```
And in the returned object add `segmentMatch`, a placeholder `guardrails` (the deterministic guardrails block lands in the next task), and the new failure fields:
```ts
  return {
    categoryMatch: isCategoryMatch ? 1 : 0,
    modeOk: isModeOk ? 1 : 0,
    withSources: hasSources ? 1 : 0,
    segmentMatch: isSegmentMatch ? 1 : 0,
    judged,
    faithfulHits,
    hallucinations,
    addressesHits,
    scoreSum,
    guardrails: { rawChunkLeak: 0, pricingAssertion: 0, sensitiveSoftening: 0 },
    failure:
      flags.length > 0
        ? {
            id: testCase.id,
            question: testCase.question,
            detectedCategory: result.detectedCategory,
            expectCategory: testCase.expectCategory,
            detectedSegment,
            expectSegment: testCase.expectSegment ?? null,
            answerMode: result.answerMode,
            flags,
          }
        : null,
  }
```

(c) Extract the reduce/return tail of `runGoldenEval` (`:267-316`) into a pure exported `summarizeGoldenResults` and call it. Add this function above `runGoldenEval`:
```ts
export function summarizeGoldenResults(
  results: GoldenEvalCaseResult[],
  total: number,
  startedAt: number,
  useJudge: boolean
): GoldenEvalReport {
  const totals = results.reduce(
    (acc, result) => ({
      categoryMatch: acc.categoryMatch + result.categoryMatch,
      modeOk: acc.modeOk + result.modeOk,
      withSources: acc.withSources + result.withSources,
      segmentMatch: acc.segmentMatch + result.segmentMatch,
      judged: acc.judged + result.judged,
      faithfulHits: acc.faithfulHits + result.faithfulHits,
      hallucinations: acc.hallucinations + result.hallucinations,
      addressesHits: acc.addressesHits + result.addressesHits,
      scoreSum: acc.scoreSum + result.scoreSum,
      rawChunkLeak: acc.rawChunkLeak + result.guardrails.rawChunkLeak,
      pricingAssertion: acc.pricingAssertion + result.guardrails.pricingAssertion,
      sensitiveSoftening: acc.sensitiveSoftening + result.guardrails.sensitiveSoftening,
    }),
    {
      categoryMatch: 0,
      modeOk: 0,
      withSources: 0,
      segmentMatch: 0,
      judged: 0,
      faithfulHits: 0,
      hallucinations: 0,
      addressesHits: 0,
      scoreSum: 0,
      rawChunkLeak: 0,
      pricingAssertion: 0,
      sensitiveSoftening: 0,
    }
  )
  const failures = results
    .map((result) => result.failure)
    .filter((failure): failure is GoldenEvalFailure => Boolean(failure))
  const rate = (value: number) => (total === 0 ? 0 : value / total)

  return {
    total,
    durationMs: Date.now() - startedAt,
    deterministic: {
      categoryMatch: totals.categoryMatch,
      modeOk: totals.modeOk,
      withSources: totals.withSources,
      segmentMatch: totals.segmentMatch,
      categoryMatchRate: rate(totals.categoryMatch),
      modeOkRate: rate(totals.modeOk),
      sourceRate: rate(totals.withSources),
      segmentMatchRate: rate(totals.segmentMatch),
    },
    guardrails: {
      rawChunkLeak: totals.rawChunkLeak,
      pricingAssertion: totals.pricingAssertion,
      sensitiveSoftening: totals.sensitiveSoftening,
    },
    judge: {
      enabled: useJudge,
      judged: totals.judged,
      faithfulRate: totals.judged === 0 ? null : totals.faithfulHits / totals.judged,
      hallucinationRate: totals.judged === 0 ? null : totals.hallucinations / totals.judged,
      addressesRate: totals.judged === 0 ? null : totals.addressesHits / totals.judged,
      avgScore: totals.judged === 0 ? null : totals.scoreSum / totals.judged,
    },
    failures,
  }
}
```
Then replace the reduce+return tail inside `runGoldenEval` (`:267-316`) with:
```ts
  return summarizeGoldenResults(results, cases.length, startedAt, useJudge)
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/eval-report.test.ts && npx eslint lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/eval.ts tests/chatbot/eval-report.test.ts && git commit -m "feat(chatbot): expectSegment + segmentMatchRate + guardrails block in golden eval"`

---

### Task: Deterministic guardrails block (`rawChunkLeak` / `pricingAssertion` / `sensitiveSoftening`) in eval

> These are judge-independent hard gates (spec §3, §9). Pure string/regex checks over the produced answer + expected mode — fully vitest-testable.

**Files:**
- Modify: `lib/chatbot/eval.ts`(new pure `evaluateGuardrails`, wired into `evaluateGoldenCase`)
- Test: `tests/chatbot/eval-guardrails.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// tests/chatbot/eval-guardrails.test.ts
import { describe, expect, it } from "vitest"

import { evaluateGuardrails } from "@/lib/chatbot/eval"

describe("evaluateGuardrails (deterministic hard gates)", () => {
  it("flags rawChunkLeak when answer leaks a URL after sanitize-shape (http link or markdown)", () => {
    const g = evaluateGuardrails({
      answer: "자세한 내용은 https://docs.channel.io/foo 를 보세요",
      answerMode: "direct_answer",
      expectMode: ["direct_answer"],
      expectSegment: "existing_ops",
    })
    expect(g.rawChunkLeak).toBe(1)
  })

  it("flags rawChunkLeak when answer is too short / lacks sentence terminator (truncated chunk)", () => {
    const g = evaluateGuardrails({
      answer: "수업 녹화 저장 위치는",
      answerMode: "direct_answer",
      expectMode: ["direct_answer"],
      expectSegment: "existing_ops",
    })
    expect(g.rawChunkLeak).toBe(1)
  })

  it("flags pricingAssertion when a pricing-segment answer states a concrete amount", () => {
    const g = evaluateGuardrails({
      answer: "S65 전자칠판은 350만원입니다.",
      answerMode: "direct_answer",
      expectMode: ["direct_answer", "handoff"],
      expectSegment: "pricing",
    })
    expect(g.pricingAssertion).toBe(1)
  })

  it("does not flag pricingAssertion for a clean consultation-routing pricing answer", () => {
    const g = evaluateGuardrails({
      answer: "구성에 따라 견적이 달라져 상담으로 안내드립니다. 담당자가 구성 기준으로 맞춤 견적을 드립니다.",
      answerMode: "handoff",
      expectMode: ["handoff"],
      expectSegment: "pricing",
    })
    expect(g.pricingAssertion).toBe(0)
  })

  it("flags sensitiveSoftening when a handoff-expected case answers directly instead", () => {
    const g = evaluateGuardrails({
      answer: "네, 지금 바로 해결됩니다.",
      answerMode: "direct_answer",
      expectMode: ["handoff"],
      expectSegment: "support_complaint",
    })
    expect(g.sensitiveSoftening).toBe(1)
  })

  it("returns all-zero for a clean in-policy answer", () => {
    const g = evaluateGuardrails({
      answer: "수업 녹화 파일은 관리자 콘솔의 저장 공간 메뉴에서 확인할 수 있습니다.",
      answerMode: "direct_answer",
      expectMode: ["direct_answer"],
      expectSegment: "existing_ops",
    })
    expect(g).toEqual({ rawChunkLeak: 0, pricingAssertion: 0, sensitiveSoftening: 0 })
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/eval-guardrails.test.ts` Expected: FAIL — `evaluateGuardrails` is not exported.

- [ ] **Step 3: Implement** — Add the pure function to `lib/chatbot/eval.ts` (above `evaluateGoldenCase`), then wire it into `evaluateGoldenCase`.
```ts
// lib/chatbot/eval.ts — pure deterministic guardrails (judge-independent hard gate)
const URL_OR_MARKDOWN_RE = /(https?:\/\/|\]\(|!\[|\bwww\.)/i
const SENTENCE_TERMINATOR_RE = /[.!?。…”"'\)\]]\s*$|(다|요|음|함|됨|죠|까요|세요)\s*$/
const PRICE_AMOUNT_RE = /\d[\d,]*\s*(원|만원|억|달러|usd|만|천)\b/i
const SOFTENED_DIRECT_RE = /(해결(됩니다|됐습니다|되었습니다)|지원(됩니다|합니다|가능합니다)|가능합니다|환불(해|됩니다|드립니다)|보상)/

export interface GuardrailEvalInput {
  answer: string
  answerMode: string
  expectMode: string[]
  expectSegment?: string | null
}

export function evaluateGuardrails(input: GuardrailEvalInput): {
  rawChunkLeak: number
  pricingAssertion: number
  sensitiveSoftening: number
} {
  const answer = (input.answer ?? "").trim()

  // rawChunkLeak: 공개 답변에 URL/마크다운 누출, 또는 종결어미 없는 너무 짧은(잘린 청크) 답변.
  const leaksUrl = URL_OR_MARKDOWN_RE.test(answer)
  const tooShortOrUnterminated = answer.length < 24 || !SENTENCE_TERMINATOR_RE.test(answer)
  const rawChunkLeak = leaksUrl || tooShortOrUnterminated ? 1 : 0

  // pricingAssertion: pricing 세그먼트 답변이 구체 금액을 단정.
  const pricingAssertion =
    input.expectSegment === "pricing" && PRICE_AMOUNT_RE.test(answer) ? 1 : 0

  // sensitiveSoftening: handoff만 기대한 케이스를 direct_answer로 완화 + 해결/지원/환불 단정.
  const expectsHandoffOnly =
    input.expectMode.length > 0 && input.expectMode.every((mode) => mode === "handoff")
  const sensitiveSoftening =
    expectsHandoffOnly && input.answerMode !== "handoff" && SOFTENED_DIRECT_RE.test(answer) ? 1 : 0

  return { rawChunkLeak, pricingAssertion, sensitiveSoftening }
}
```
Then in `evaluateGoldenCase`, replace the placeholder `guardrails: { rawChunkLeak: 0, ... }` (added in the previous task) with a real call, computed before the `return`:
```ts
  const guardrails = evaluateGuardrails({
    answer: result.answer,
    answerMode: result.answerMode,
    expectMode: testCase.expectMode,
    expectSegment: testCase.expectSegment ?? null,
  })
  if (guardrails.rawChunkLeak) flags.push("guardrail:rawChunkLeak")
  if (guardrails.pricingAssertion) flags.push("guardrail:pricingAssertion")
  if (guardrails.sensitiveSoftening) flags.push("guardrail:sensitiveSoftening")
```
(add these lines just before the `return {` and use `guardrails,` instead of the inline placeholder; ensure the `flags`-based `failure` still fires when a guardrail trips).

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/eval-guardrails.test.ts && vitest run tests/chatbot/eval-report.test.ts && npx eslint lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/eval.ts tests/chatbot/eval-guardrails.test.ts && git commit -m "feat(chatbot): deterministic guardrails (rawChunkLeak/pricingAssertion/sensitiveSoftening) in eval"`

---

### Task: Per-segment eval scope + persist last run to `chatbot_eval_runs`

> `runGoldenEval` gets an optional `segment` filter (admin "세그먼트별 실행") and persists each run to `chatbot_eval_runs` for the regression-gate panel. The `chatbot_eval_runs` table is created by the platform-data migration (G-section); this task only WRITES to it and is null-guarded so it is a no-op when the table/env is absent.

**Files:**
- Modify: `lib/chatbot/eval.ts`(`runGoldenEval` signature + filter + persist), `app/api/admin/chatbot/eval/route.ts`(:11-23 pass through `segment`)
- Test: `tests/chatbot/eval-scope.test.ts`

- [ ] **Step 1: Write the failing test** — test the pure case-filter helper (vitest-testable; no DB).
```ts
// tests/chatbot/eval-scope.test.ts
import { describe, expect, it } from "vitest"

import { filterCasesBySegment } from "@/lib/chatbot/eval"

const cases = [
  { id: "a", question: "q", expectCategory: "pricing", expectMode: ["handoff"], expectSegment: "pricing" },
  { id: "b", question: "q", expectCategory: "classroom", expectMode: ["direct_answer"], expectSegment: "existing_ops" },
  { id: "c", question: "q", expectCategory: "general", expectMode: ["direct_answer"] },
]

describe("filterCasesBySegment", () => {
  it("returns all cases when no segment scope is given", () => {
    expect(filterCasesBySegment(cases, undefined)).toHaveLength(3)
  })

  it("keeps only cases whose expectSegment matches the scope", () => {
    const filtered = filterCasesBySegment(cases, "pricing")
    expect(filtered.map((testCase) => testCase.id)).toEqual(["a"])
  })

  it("excludes cases without an expectSegment when a scope is set", () => {
    const filtered = filterCasesBySegment(cases, "existing_ops")
    expect(filtered.map((testCase) => testCase.id)).toEqual(["b"])
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/eval-scope.test.ts` Expected: FAIL — `filterCasesBySegment` not exported.

- [ ] **Step 3: Implement**

(a) Add the pure filter + persist helper + extend `runGoldenEval` in `lib/chatbot/eval.ts`. Imports needed (server-side supabase client + env guard — match how service.ts builds the admin client; import the existing helpers):
```ts
// add to imports
import { createSupabaseAdminClient, hasSupabaseServerEnv } from "./service"
```
> NOTE for sequencing: if `createSupabaseAdminClient`/`hasSupabaseServerEnv` are not already exported from `service.ts`, the platform-data/service author must export them (see DEPENDENCIES). They are used internally by `getChatbotStats` today.
```ts
export function filterCasesBySegment<T extends { expectSegment?: string }>(
  cases: T[],
  segment: string | undefined
): T[] {
  if (!segment) return cases
  return cases.filter((testCase) => testCase.expectSegment === segment)
}

async function persistEvalRun(report: GoldenEvalReport, segment: string | null): Promise<void> {
  if (!hasSupabaseServerEnv()) return
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from("chatbot_eval_runs").insert({
      scope_segment: segment,
      total: report.total,
      duration_ms: report.durationMs,
      category_match_rate: report.deterministic.categoryMatchRate,
      mode_ok_rate: report.deterministic.modeOkRate,
      source_rate: report.deterministic.sourceRate,
      segment_match_rate: report.deterministic.segmentMatchRate,
      guardrail_raw_chunk_leak: report.guardrails.rawChunkLeak,
      guardrail_pricing_assertion: report.guardrails.pricingAssertion,
      guardrail_sensitive_softening: report.guardrails.sensitiveSoftening,
      judge_enabled: report.judge.enabled,
      faithful_rate: report.judge.faithfulRate,
      hallucination_rate: report.judge.hallucinationRate,
      avg_score: report.judge.avgScore,
      failure_count: report.failures.length,
    })
    if (error) throw new Error(error.message)
  } catch (error) {
    console.warn(
      "[chatbot] failed to persist eval run:",
      error instanceof Error ? error.message : error
    )
  }
}
```
Extend `runGoldenEval` signature + filter + persist (`:245-266`):
```ts
export async function runGoldenEval(
  options: { judge?: boolean; limit?: number; segment?: string } = {}
): Promise<GoldenEvalReport> {
  const startedAt = Date.now()
  const useJudge = options.judge !== false && Boolean(GEMINI_API_KEY)
  const allCases = loadGoldenCases()
  const dbCases = await listChatbotRegressionEvalCases()
  const casesById = new Map<string, GoldenCase>()

  for (const testCase of [...allCases, ...dbCases]) {
    if (!testCase) continue
    casesById.set(testCase.id, testCase)
  }

  const scoped = filterCasesBySegment(Array.from(casesById.values()), options.segment)
  const cases = options.limit ? scoped.slice(0, options.limit) : scoped
  const results = await mapWithConcurrency(
    cases,
    useJudge ? 1 : 4,
    (testCase) => evaluateGoldenCase(testCase, useJudge)
  )
  const report = summarizeGoldenResults(results, cases.length, startedAt, useJudge)
  await persistEvalRun(report, options.segment ?? null)
  return report
}
```

(b) Pass `segment` through the API route (`app/api/admin/chatbot/eval/route.ts:11-23`):
```ts
  let body: { judge?: boolean; limit?: number; segment?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const report = await runGoldenEval({
      judge: body.judge,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      segment: typeof body.segment === "string" ? body.segment : undefined,
    })
    return NextResponse.json(report)
  } catch (error) {
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/eval-scope.test.ts && npx eslint app lib --max-warnings=0`

- [ ] **Step 5: Commit** — `git add lib/chatbot/eval.ts app/api/admin/chatbot/eval/route.ts tests/chatbot/eval-scope.test.ts && git commit -m "feat(chatbot): per-segment eval scope + persist runs to chatbot_eval_runs"`

---

### Task: Mechanically add `expectSegment` to all 68 existing golden cases + golden-set schema test

> JSON edit + a schema-coverage assertion (vitest-testable). Do NOT hand-edit 68 lines individually — apply a deterministic mapping from the case's existing `expectCategory` using the same `mapCategoryToSegment` rules.

**Files:**
- Modify: `data/chatbot-golden-set.json`
- Modify: `tests/chatbot/golden-set.test.ts`

- [ ] **Step 1: Write the failing test** — extend `golden-set.test.ts`.
```ts
// add to tests/chatbot/golden-set.test.ts inside the describe block
  it("assigns an expectSegment to every case", () => {
    for (const testCase of cases) {
      expect(typeof (testCase as { expectSegment?: string }).expectSegment).toBe("string")
    }
  })

  it("only uses the four SSOT segment values", () => {
    const allowed = new Set(["prospect", "pricing", "existing_ops", "support_complaint"])
    for (const testCase of cases) {
      expect(allowed.has((testCase as { expectSegment?: string }).expectSegment ?? "")).toBe(true)
    }
  })
```
(also add `expectSegment?: string` to the local `GoldenCase` interface at `golden-set.test.ts:6-11`.)

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/golden-set.test.ts` Expected: FAIL — existing cases have no `expectSegment`.

- [ ] **Step 3: Implement** — Mechanical edit of `data/chatbot-golden-set.json`. Apply this deterministic rule per case (derive from `expectCategory`, matching `mapCategoryToSegment`): `pricing`/`billing`→`"pricing"`; `troubleshooting`→`"support_complaint"`; `classroom`/`admin`/`hardware`→`"existing_ops"`; `onboarding`→`"prospect"`; anything else (`general`)→`"prospect"`. Add `"expectSegment": "<value>"` to each of the 68 case objects, immediately after `expectCategory`. Manual overrides required (these read as their segment regardless of category): the four `channel-*` pricing/quote cases (`channel-s65-quote`, `channel-board-only-sale`, `channel-platform-in-board`, `channel-camera-one-user` if pricing-shaped) → `"pricing"` only where the case is genuinely a price/quote ask; the six `pre-adoption-*` policy cases keep their category-derived segment (most are `prospect`). One JSON-shaped edit per object; preserve all existing fields and the trailing `_comment`.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/golden-set.test.ts && node -e "JSON.parse(require('fs').readFileSync('data/chatbot-golden-set.json','utf8'))"`

- [ ] **Step 5: Commit** — `git add data/chatbot-golden-set.json tests/chatbot/golden-set.test.ts && git commit -m "test(chatbot): backfill expectSegment on all golden cases + schema coverage"`

---

### Task: Add critical-incident handoff + clean pricing-consultation golden cases

> Spec §9: ~12 cases/segment, pricing+complaint first. This task adds the two highest-leverage clusters needed by the guardrails/segment gates: critical-incident handoff cases (`expectMode:["handoff"]`, `expectSegment:"support_complaint"`, must NOT clarify) and clean pricing-consultation-success cases (`expectMode:["handoff","doc_suggestion"]`, `expectSegment:"pricing"`).

**Files:**
- Modify: `data/chatbot-golden-set.json`
- Modify: `tests/chatbot/golden-set.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// add to tests/chatbot/golden-set.test.ts
  it("covers critical-incident support cases that must route to handoff", () => {
    const incident = cases.filter(
      (testCase) =>
        (testCase as { expectSegment?: string }).expectSegment === "support_complaint" &&
        testCase.id.startsWith("incident-")
    )
    expect(incident.length).toBeGreaterThanOrEqual(3)
    for (const testCase of incident) {
      expect((testCase as { expectMode: string[] }).expectMode).toEqual(["handoff"])
    }
    const ids = new Set(incident.map((testCase) => testCase.id))
    expect(ids).toContain("incident-live-class-dropped")
    expect(ids).toContain("incident-login-blocked")
    expect(ids).toContain("incident-connection-failure")
  })

  it("covers clean pricing cases that succeed via consultation routing", () => {
    const pricing = cases.filter(
      (testCase) =>
        (testCase as { expectSegment?: string }).expectSegment === "pricing" &&
        testCase.id.startsWith("pricing-consult-")
    )
    expect(pricing.length).toBeGreaterThanOrEqual(2)
    for (const testCase of pricing) {
      expect((testCase as { expectMode: string[] }).expectMode).toContain("handoff")
    }
  })
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/golden-set.test.ts` Expected: FAIL — `incident-*` / `pricing-consult-*` cases do not exist.

- [ ] **Step 3: Implement** — Append these case objects to the `cases` array in `data/chatbot-golden-set.json`.
```json
{ "id": "incident-live-class-dropped", "question": "수업 중인데 갑자기 라이브 수업이 끊겼어요. 지금 학생들 다 못 들어와요.", "expectCategory": "troubleshooting", "expectSegment": "support_complaint", "expectMode": ["handoff"] },
{ "id": "incident-login-blocked", "question": "로그인이 안 됩니다. 수업 시작인데 접속이 안 돼요.", "expectCategory": "troubleshooting", "expectSegment": "support_complaint", "expectMode": ["handoff"] },
{ "id": "incident-connection-failure", "question": "접속 장애인 것 같아요. 계속 접속이 안 됩니다.", "expectCategory": "troubleshooting", "expectSegment": "support_complaint", "expectMode": ["handoff"] },
{ "id": "incident-screen-frozen", "question": "수업 중에 화면이 멈췄어요. 학생들 화면이 안 넘어갑니다.", "expectCategory": "troubleshooting", "expectSegment": "support_complaint", "expectMode": ["handoff"] },
{ "id": "pricing-consult-quote-request", "question": "도입하려는데 견적 좀 받아볼 수 있을까요?", "expectCategory": "pricing", "expectSegment": "pricing", "expectMode": ["handoff", "doc_suggestion"] },
{ "id": "pricing-consult-total-cost", "question": "전체 비용이 얼마나 드나요? 우리 학원 규모로 견적 알려주세요.", "expectCategory": "pricing", "expectSegment": "pricing", "expectMode": ["handoff", "doc_suggestion"] }
```
> Each is a self-contained JSON object; ensure correct comma placement when appended after the current last case. The `incident-*` cases lock `expectMode:["handoff"]` so the `sensitiveSoftening` guardrail and (Phase 1) the no-clarify rule are both gated; the `pricing-consult-*` cases encode "clean consultation routing = success" (spec §12 Q1) so the `pricingAssertion` guardrail must stay 0 on a correct answer.

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/golden-set.test.ts && node -e "JSON.parse(require('fs').readFileSync('data/chatbot-golden-set.json','utf8'))"`

- [ ] **Step 5: Commit** — `git add data/chatbot-golden-set.json tests/chatbot/golden-set.test.ts && git commit -m "test(chatbot): add critical-incident handoff + clean pricing-consultation golden cases"`

---

### Task: Extend `getChatbotStats` → `perSegment[]` + split latency `{firstTokenP95, completeP95}`

> Reads the platform-data view `v_chatbot_segment_daily_stats` and the new `first_token_ms` column. Both come from the G-section migration (owned by platform-data). This task is null-guarded so it returns empty `perSegment`/null first-token when the view/column is absent → safe to land before or after the migration. Logic is testable via a pure aggregation helper; the live Supabase read path is build-only.

**Files:**
- Modify: `lib/chatbot/service.ts`(:3536-3546 add row type, :3696-3849 `getChatbotStats`)
- Test: `tests/chatbot/segment-stats.test.ts`

- [ ] **Step 1: Write the failing test** — pure aggregation helper.
```ts
// tests/chatbot/segment-stats.test.ts
import { describe, expect, it } from "vitest"

import { aggregateSegmentRows, type SegmentDailyStatsRow } from "@/lib/chatbot/service"

const rows: SegmentDailyStatsRow[] = [
  { day: "2026-06-23", detected_segment: "pricing", question_count: 4, clarify_count: 1, unresolved_count: 1, handoff_count: 2, avg_confidence: 0.6, first_token_p95_ms: 800 },
  { day: "2026-06-24", detected_segment: "pricing", question_count: 6, clarify_count: 1, unresolved_count: 0, handoff_count: 3, avg_confidence: 0.7, first_token_p95_ms: 900 },
  { day: "2026-06-24", detected_segment: "existing_ops", question_count: 10, clarify_count: 0, unresolved_count: 2, handoff_count: 0, avg_confidence: 0.8, first_token_p95_ms: 500 },
]

describe("aggregateSegmentRows", () => {
  it("rolls up per-segment counts across days", () => {
    const out = aggregateSegmentRows(rows)
    const pricing = out.find((item) => item.segment === "pricing")
    expect(pricing?.questionCount).toBe(10)
    expect(pricing?.handoffCount).toBe(5)
    expect(pricing?.clarifyCount).toBe(2)
  })

  it("computes worst-case (max) first-token p95 per segment", () => {
    const out = aggregateSegmentRows(rows)
    expect(out.find((item) => item.segment === "pricing")?.firstTokenP95Ms).toBe(900)
    expect(out.find((item) => item.segment === "existing_ops")?.firstTokenP95Ms).toBe(500)
  })

  it("sorts segments by question volume descending", () => {
    const out = aggregateSegmentRows(rows)
    expect(out[0].segment).toBe("existing_ops")
  })
})
```

- [ ] **Step 2: Run test, verify FAIL** — Run: `vitest run tests/chatbot/segment-stats.test.ts` Expected: FAIL — `aggregateSegmentRows` / `SegmentDailyStatsRow` not exported.

- [ ] **Step 3: Implement**

(a) Add the row type + exported pure aggregator near the other stats row types (`service.ts` after `:3546`):
```ts
export interface SegmentDailyStatsRow {
  day: string
  detected_segment: string | null
  question_count: number
  clarify_count: number
  unresolved_count: number
  handoff_count: number
  avg_confidence: number | null
  first_token_p95_ms: number | null
}

export function aggregateSegmentRows(rows: SegmentDailyStatsRow[]) {
  const map = new Map<
    string,
    {
      segment: string
      questionCount: number
      clarifyCount: number
      unresolvedCount: number
      handoffCount: number
      confidenceTotal: number
      confidenceRows: number
      firstTokenP95Ms: number | null
    }
  >()

  for (const row of rows) {
    const segment = row.detected_segment ?? "unsegmented"
    const current =
      map.get(segment) ?? {
        segment,
        questionCount: 0,
        clarifyCount: 0,
        unresolvedCount: 0,
        handoffCount: 0,
        confidenceTotal: 0,
        confidenceRows: 0,
        firstTokenP95Ms: null,
      }
    current.questionCount += Number(row.question_count) || 0
    current.clarifyCount += Number(row.clarify_count) || 0
    current.unresolvedCount += Number(row.unresolved_count) || 0
    current.handoffCount += Number(row.handoff_count) || 0
    if (row.avg_confidence != null && Number.isFinite(Number(row.avg_confidence))) {
      current.confidenceTotal += Number(row.avg_confidence)
      current.confidenceRows += 1
    }
    if (row.first_token_p95_ms != null && Number.isFinite(Number(row.first_token_p95_ms))) {
      current.firstTokenP95Ms = Math.max(current.firstTokenP95Ms ?? 0, Number(row.first_token_p95_ms))
    }
    map.set(segment, current)
  }

  return Array.from(map.values())
    .map((item) => ({
      segment: item.segment,
      questionCount: item.questionCount,
      clarifyCount: item.clarifyCount,
      unresolvedCount: item.unresolvedCount,
      handoffCount: item.handoffCount,
      clarifyRate: item.questionCount === 0 ? 0 : Number((item.clarifyCount / item.questionCount).toFixed(4)),
      handoffRate: item.questionCount === 0 ? 0 : Number((item.handoffCount / item.questionCount).toFixed(4)),
      avgConfidence:
        item.confidenceRows === 0 ? null : Number((item.confidenceTotal / item.confidenceRows).toFixed(4)),
      firstTokenP95Ms: item.firstTokenP95Ms,
    }))
    .sort((left, right) => right.questionCount - left.questionCount)
}
```

(b) In `getChatbotStats`: extend the no-env early return (`:3700-3722`) with `perSegment: []` and the split latency shape; extend the `answerQuery` select (`:3736`) to add `first_token_ms`; add a null-guarded `v_chatbot_segment_daily_stats` query alongside the `Promise.all` (`:3743-3755`); compute `firstTokenP95` from `answerEventRows`; and add `perSegment` + the split latency to the final return (`:3836-3849`). Concretely:

Extend `AnswerEventStatsRow` (`:3536-3541`) with `first_token_ms: number | null`.

Change the select at `:3736`:
```ts
    .select("detected_category, detected_segment, answer_mode, confidence, latency_ms, first_token_ms")
```
Add a segment-stats query inside the same `getChatbotStats` (null-guarded, modeled on the handoff try/catch at `:3765-3783`):
```ts
  let segmentRows: SegmentDailyStatsRow[] = []
  try {
    let segmentQuery = supabase
      .from("v_chatbot_segment_daily_stats")
      .select("*")
      .gte("day", from)
      .order("day", { ascending: false })
    if (to) segmentQuery = segmentQuery.lte("day", to)
    const { data, error } = await segmentQuery
    if (error) throw new Error(error.message)
    segmentRows = (data ?? []) as SegmentDailyStatsRow[]
  } catch (error) {
    console.warn(
      "[chatbot] failed to load segment daily stats:",
      error instanceof Error ? error.message : error
    )
  }
```
Compute first-token latencies near the existing `latencies` block (`:3818-3820`):
```ts
  const firstTokenLatencies = answerEventRows
    .map((row) => Number(row.first_token_ms))
    .filter((value) => Number.isFinite(value) && value > 0)
```
Replace the `latency` object in the return (`:3836-3840`) and add `perSegment`:
```ts
    latency: {
      avgMs: averageMetric(latencies),
      completeP95Ms: percentileMetric(latencies, 0.95),
      firstTokenP95Ms: percentileMetric(firstTokenLatencies, 0.95),
      sampleCount: latencies.length,
      firstTokenSampleCount: firstTokenLatencies.length,
    },
    perSegment: aggregateSegmentRows(segmentRows),
```
Mirror the new latency shape + `perSegment: []` in the no-env early return (`:3712-3721`):
```ts
      latency: {
        avgMs: null,
        completeP95Ms: null,
        firstTokenP95Ms: null,
        sampleCount: 0,
        firstTokenSampleCount: 0,
      },
      perSegment: [],
```

- [ ] **Step 4: Run test, verify PASS** — Run: `vitest run tests/chatbot/segment-stats.test.ts && npx eslint lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add lib/chatbot/service.ts tests/chatbot/segment-stats.test.ts && git commit -m "feat(chatbot): getChatbotStats perSegment[] + split first-token/complete latency"`

---

### Task: Admin UI — segment distribution+performance table, split P95 card, regression-gate panel (lint+build only)

> NOTE: This task is verified by `npx eslint app components lib --max-warnings=0` + `npm run build` ONLY (admin page is a `"use client"` React component; tests/chatbot is node env with NO DOM, so the table/card/panel are NOT unit-tested). The eval-run delta panel reads `chatbot_eval_runs` via a new admin endpoint; if the table is absent it renders an empty state.

**Files:**
- Modify: `app/admin/chatbot/page.tsx`(:42-79 `ChatbotStats` type, :125-149 `EvalReport` type, :369-400 metric cards, :316-326 `runEval`, :540-598 eval section)
- Create: `app/api/admin/chatbot/eval-runs/route.ts`
- Modify: `lib/chatbot/service.ts`(new `getRecentEvalRuns` reader)

- [ ] **Step 1: Write the failing test** — N/A (UI + thin admin route). Verification is lint+build (stated above). Record the expectation as a build assertion in the step below.

- [ ] **Step 2: Run test, verify FAIL** — Run: `npm run build` Expected: build currently has no `perSegment`/split-latency/`guardrails`/`segmentMatchRate` consumers; after editing the types to reference the new fields without the render wiring, `tsc` will error on missing properties — confirming the contract before wiring UI.

- [ ] **Step 3: Implement**

(a) Add a null-guarded eval-runs reader to `lib/chatbot/service.ts`:
```ts
export interface ChatbotEvalRunRow {
  id: string
  created_at: string
  scope_segment: string | null
  total: number
  category_match_rate: number | null
  mode_ok_rate: number | null
  source_rate: number | null
  segment_match_rate: number | null
  guardrail_raw_chunk_leak: number | null
  guardrail_pricing_assertion: number | null
  guardrail_sensitive_softening: number | null
  faithful_rate: number | null
  hallucination_rate: number | null
  failure_count: number | null
}

export async function getRecentEvalRuns(limit = 2): Promise<ChatbotEvalRunRow[]> {
  if (!hasSupabaseServerEnv()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("chatbot_eval_runs")
      .select("*")
      .is("scope_segment", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(10, Math.max(1, limit)))
    if (error) throw new Error(error.message)
    return (data ?? []) as ChatbotEvalRunRow[]
  } catch (error) {
    console.warn(
      "[chatbot] failed to load eval runs:",
      error instanceof Error ? error.message : error
    )
    return []
  }
}
```

(b) Create `app/api/admin/chatbot/eval-runs/route.ts` (mirror the existing stats route auth pattern):
```ts
import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { getRecentEvalRuns } from "@/lib/chatbot/service"

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const runs = await getRecentEvalRuns(2)
    return NextResponse.json({ runs })
  } catch (error) {
    console.error("[GET /api/admin/chatbot/eval-runs] error:", error)
    return NextResponse.json({ error: "회귀 게이트 데이터를 조회하지 못했습니다." }, { status: 500 })
  }
}
```

(c) `app/admin/chatbot/page.tsx`:
- Extend the `ChatbotStats.latency` type (`:59-63`) to `{ avgMs; completeP95Ms; firstTokenP95Ms; sampleCount; firstTokenSampleCount }` and add `perSegment: Array<{ segment: string; questionCount: number; clarifyCount: number; unresolvedCount: number; handoffCount: number; clarifyRate: number; handoffRate: number; avgConfidence: number | null; firstTokenP95Ms: number | null }>` to `ChatbotStats`.
- Extend `EvalReport` (`:125-149`) to add `deterministic.segmentMatchRate: number` and `guardrails: { rawChunkLeak: number; pricingAssertion: number; sensitiveSoftening: number }`.
- Split the single "P95 응답" `MetricCard` (`:388-393`) into two cards: "첫토큰 P95" (`stats?.latency.firstTokenP95Ms`, hint = `샘플 ${firstTokenSampleCount}건`) and "완료 P95" (`stats?.latency.completeP95Ms`, hint = `샘플 ${sampleCount}건`). Change the grid from `xl:grid-cols-5` to `xl:grid-cols-6` (`:369`).
- Add a "세그먼트 분포·성과" section (after the metric cards row, before the 질문 백로그 section at `:402`): a table over `stats?.perSegment` with columns 세그먼트 / 질문수 / 점유율 / 해결률(=1−unresolvedRate) / 핸드오프율 / clarify율 / 첫토큰P95 + a target chip per the spec §3 targets (existing_ops≥75%, prospect≥60%, etc.). Use the existing `EmptyState` when `perSegment.length === 0`. Reuse `formatRate`/`formatMs`/`formatNumber`.
- Add a "회귀 게이트" panel (inside the eval section, above the골든셋 평가 결과 grid): fetch `/api/admin/chatbot/eval-runs` in `load` (`:243-`), store `[last, previous]`, render last-vs-previous deltas for `segmentMatchRate`/`categoryMatchRate`/`modeOkRate` and a RED banner when any of `last.guardrail_raw_chunk_leak`/`guardrail_pricing_assertion`/`guardrail_sensitive_softening` > 0 OR `segment_match_rate` regressed vs previous. Empty state when fewer than 1 run exists.
- Add `segmentMatchRate` + guardrail counts to the existing 골든셋 평가 result grid (`:566-579`).
- Add a per-segment scope to `runEval` (`:316-326`): accept an optional `segment` arg and POST `{ judge: false, segment }`; add 4 small segment buttons next to the existing "20건 실행" button.

- [ ] **Step 4: Run** — Run: `npx eslint app components lib --max-warnings=0 && npm run build`

- [ ] **Step 5: Commit** — `git add app/admin/chatbot/page.tsx app/api/admin/chatbot/eval-runs/route.ts lib/chatbot/service.ts && git commit -m "feat(admin): chatbot segment table + split P95 cards + regression-gate panel"`

---

## DEPENDENCIES & TYPES

**My area DEFINES (other areas/sequencing consume):**
- `ChatbotSegment` + `CHATBOT_SEGMENTS` + `mapCategoryToSegment` in `lib/chatbot/segment.ts` — the SSOT segment type. The Phase-1 Stage1 author EXTENDS this same file (adds `segmentFromClassification`, `computeHeuristicConfidence`, `classifyStage1Heuristic`, `detectCriticalIncident`, `detectComplaintSentiment`). Sequencing: if the Stage1 author lands `segment.ts` first, my first task collapses to an import-only check — they must keep `mapCategoryToSegment` + `CHATBOT_SEGMENTS` exactly as defined here (the SSOT-type lock).
- `evaluateChatbotQuery` now returns `detectedSegment: ChatbotSegment` — golden eval + any future admin eval consumer reads it.
- `lib/chatbot/eval.ts` exports: `GoldenEvalCaseResult`, `summarizeGoldenResults`, `evaluateGuardrails`, `filterCasesBySegment`, and `GoldenEvalReport` now carrying `deterministic.segmentMatchRate` + top-level `guardrails`. The Phase-1 gate checklist (spec §10 item d/e) consumes `guardrails` (all-zero) + `segmentMatchRate ≥0.92`.
- `lib/chatbot/service.ts` exports: `SegmentDailyStatsRow`, `aggregateSegmentRows`, `getRecentEvalRuns`, `ChatbotEvalRunRow`, and `getChatbotStats` return now has `perSegment[]` + `latency.{firstTokenP95Ms, completeP95Ms, firstTokenSampleCount}`.

**My area CONSUMES (must exist for full live wiring; all reads are null-guarded so tasks land safely before the migration):**
- From platform-data (G-section migration `2026XXXX_chatbot_segment_observability.sql`): view `v_chatbot_segment_daily_stats` (columns `day, detected_segment, question_count, clarify_count, unresolved_count, handoff_count, avg_confidence, first_token_p95_ms`), table `chatbot_eval_runs` (columns enumerated in the persist/read tasks above — platform-data must match these column names), and `chatbot_answer_events.first_token_ms`. If the view/table column names differ, the persist-insert and the segment-stats query must be reconciled — flag to platform-data to use these exact names.
- From the service/platform-data author: `createSupabaseAdminClient` and `hasSupabaseServerEnv` must be EXPORTED from `lib/chatbot/service.ts` (currently used internally by `getChatbotStats`). My `eval.ts` persist task imports them; if not yet exported, that export is a prerequisite micro-task owned by whoever touches service.ts first.
- Phase 0 does NOT change prompts/answers → NO cache bump in any task here. The `RETRIEVAL_CACHE_VERSION` + `ANSWER_CACHE_VERSION` bumps belong to Phase 1 (Stage1 author), not this observability area.

---

## §Z. Self-Review (author checklist, run against the spec)

**Spec coverage (Phase 0+1 only):**
- §4.2/4.3 Stage1 pipeline + heuristic classifier → Areas C, E (#1-3, #19-21, #25-27) ✅
- §4.3 flash escalate → Area D (#24) ✅
- §4.4 carry state (`chatbot_answer_events.metadata`, `lastClarifyAsked` loop-break, stickiness) → Area A (#4 adds the column), Area E (#25, #29) ✅
- §4.5 cache (segment field, cached `first_token_ms`=null) → Area E (#29-30), §0.11 ✅
- §5.1 critical-incident + sentiment detection (Phase 0 detect+log; auto-handoff WIRING deferred to Phase 2) → Area C (#1) ✅ (handoff firing intentionally out of Phase 0/1 scope)
- §9 schema/views/eval_runs/admin/eval guardrails → Areas A, F ✅
- §10 Phase 0/1 gates → #18, #30; cache reconciliation §0.11 ✅
- §12 critical-incident & pricing-as-success golden cases → Area F (#15) ✅
- **Deferred (correct, NOT in this plan):** per-segment RESPOND policy table (Phase 2), `planRetrieval`/relevance/confidence recalibration (Phase 2), prompt block split / SEGMENT_BLOCKS (Phase 2), `unresolvedSupportTurns` escalation + complaint auto-handoff (Phase 2), UX/motion layer (Phase 2/3), `SegmentPolicy` body (Phase 2 — only the type stub is here, #23).

**Placeholder scan:** `baseCoreFields` in the clarify task is an explicit stand-in flagged to copy the file's real early-return shape — not a silent placeholder. All other code blocks are complete.

**Type consistency:** resolved in §0 (segment.ts ownership, `Stage1HeuristicInput` struct sig, `escalate` field, `reconcileStage1WithLlm` function-not-method, eval_runs columns, view aliases, `ChatbotCore.carry` placement, `FAST_MODEL_ID`).

**Open verification the executor must do (flagged in-task):** confirm `chatbot_feedback.answer_event_id` exists + grep `v_chatbot_feedback_stats` consumers (§0.10) before recreating that view.

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task (the §0.5 order), review between tasks, fast iteration. Best fit here because the plan crosses 6 files/areas with cross-area contracts that benefit from a review checkpoint per task.

**2. Inline Execution** — execute tasks in this session via executing-plans, batched with checkpoints.

Note: Phase 0 (#1-18) is safe to land end-to-end first (no behavior change); gate at #18 before starting Phase 1.
