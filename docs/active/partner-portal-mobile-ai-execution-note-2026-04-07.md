# Partner Portal Mobile AI Execution Note

Date: 2026-04-07

## Work Reason

- Partner users could already create customers, deals, meetings, and installations, but mobile usage was still slow because the write entry points were scattered.
- The business need was not a brand-new portal flow. It was a faster mobile action surface that lets partners add, adjust, and cancel work with fewer taps and less repeated input.
- The calendar especially needed a real mobile action path. Users could view events, but could not quickly adjust or cancel a selected schedule from the same mobile context.
- AI support had to be safe for operational use. Free-text input should not write immediately, so the flow was intentionally split into `plan -> preview -> execute`.

## What Was Implemented

### Mobile Action Launcher

- Added a shared mobile launcher used from home, workspace, and calendar.
- Reused existing customer, deal, meeting, and installation dialogs instead of replacing working CRUD flows.
- Passed selected customer, selected deal, selected date, and selected event context into the launcher so users can act with less typing.

### AI Action Flow

- Added partner AI routes for:
  - `POST /api/partner/ai-actions/plan`
  - `POST /api/partner/ai-actions/preview`
  - `POST /api/partner/ai-actions/execute`
- Added partner AI service modules for action planning, preview signing, and confirmed execution.
- Kept the supported intent set intentionally narrow:
  - `create_deal`
  - `create_meeting`
  - `create_installation`
  - `update_customer`
- Required preview confirmation before execution.

### Calendar Adjustment Flow

- Added partner PATCH routes for:
  - `PATCH /api/partner/calendar/[eventId]`
  - `PATCH /api/partner/installations/[installationId]`
- Added mobile quick-adjust UI for the selected calendar event.
- Supported time adjustment, memo updates, and soft cancellation through `status = cancelled`.
- Synced installation-related calendar updates with the linked installation record.

### Stability Work

- Aligned client and server contracts for the new AI flow.
- Cleaned up route typing and repository typing issues discovered during build.
- Verified the whole change set with lint and production build.

## Why This Scope Was Chosen

- The fastest MVP win was improving mobile execution speed, not rebuilding existing domain logic.
- Existing CRUD APIs already covered most business actions, so wrapping them with a mobile-first launcher created immediate value.
- Soft cancellation is operationally safer than hard delete because it preserves traceability and reduces accidental data loss risk.
- AI was deliberately scoped to a small, confirmed action set so the experience stays useful without becoming unsafe.

## Detailed Next Plan

1. Add AI audit persistence on top of existing `activity_logs`.
   - Record `request_id`, `intent`, `raw_input`, and execution payload summary alongside business mutations.
   - Make the operator-visible history clearer when AI actions are used.

2. Add durable idempotency storage.
   - Introduce a partner-scoped run table such as `partner_ai_action_runs`.
   - Enforce a unique key on `(partner_account_id, request_id)`.
   - Prevent double execution from repeated taps or flaky mobile networks.

3. Add voice input and STT.
   - Let field users dictate requests instead of typing.
   - Feed transcript results into the same `plan -> preview -> execute` path.

4. Improve calendar state visibility.
   - Show cancelled and completed states more clearly in the mobile calendar UI.
   - Reduce the chance that users think a cancelled schedule is still active.

5. Run focused mobile QA.
   - Validate on iPhone Safari, Android Chrome, and Samsung Internet.
   - Test creation, adjustment, cancellation, ambiguity handling, and failed-network retries.

## Commit Guidance

- This work should be committed as one mobile MVP slice because the launcher, AI routes, and calendar adjustment flow depend on each other to deliver the actual field-use experience.
- Follow-up persistence and STT work should be committed separately because they introduce schema and operational changes beyond the current UX slice.
