# Notification Architecture Plan

Base date: 2026-04-07
Document purpose: define a practical notification plan for `homepage`, `partner`, and `admin` around lead intake, schedule and confirmation updates, and system errors.
Scope: planning document only. No code changes are included here.

## 1. Why This Matters

Right now the product already contains many notification-like signals, but they are spread across separate screens:

- homepage lead intake via `/api/lead`
- admin CRM follow-up warnings and new lead banners
- partner schedule request and confirmation flows
- commercial overview alerts for outstanding payments and missing installation schedules
- bug report registration and webhook test errors
- partner `activity_logs` as an event history

This means the business logic already exists, but it is not yet unified as a real notification system.

The main risk if we add alerts screen-by-screen is duplication:

- the same event will be handled differently in admin and partner
- channel delivery rules will live inside route handlers
- unread and read state will be impossible to manage consistently
- later real-time support will require another rewrite

The safer direction is:

`domain event -> notification rule evaluation -> recipient fan-out -> delivery channel`

## 2. Product Principle

Treat `homepage`, `partner`, and `admin` differently.

### Homepage

The public homepage is mostly an event producer, not a notification inbox.

- A visitor submits a lead, inquiry, or newsletter request
- The visitor gets immediate success or failure feedback
- Internal teams get notified through admin or external channels

Recommendation:

- do not build a public bell or inbox on homepage
- keep homepage notifications limited to synchronous form feedback and optional follow-up email or SMS

### Partner

The partner portal is a real notification consumer.

Partners need to know:

- schedule request received
- schedule confirmed, changed, or cancelled
- contract or document action required
- deal moved to next stage
- payment or receipt status changed
- an internal request failed and needs retry

### Admin

Admin is the main operations inbox.

Admins need to know:

- new lead arrived
- follow-up overdue
- partner requested a schedule
- partner confirmed something or changed a stage
- contract, payment, or installation moved to a sensitive state
- webhook, email, automation, or system errors occurred

## 3. Current Code Signals

The current codebase already gives us strong event sources:

- `app/api/lead/route.ts`
  - new lead created
  - webhook delivery warnings
  - marketing automation trigger entrypoint
- `app/api/partner/schedules/route.ts`
  - partner schedule requested or updated
- `lib/partner-portal/repositories/deals-write.ts`
  - partner deal created
  - already writes `activity_logs`
- `lib/partner-portal/repositories/installations-write.ts`
  - partner installation scheduled
  - calendar event created
  - already writes `activity_logs`
- `app/api/admin/leads/[id]/route.ts`
  - lead status, owner, follow-up date changed
- `app/api/admin/leads/[id]/logs/route.ts`
  - contact log written
- `app/api/admin/bugs/route.ts`
  - bug or error issue recorded
- `lib/automation-engine.ts`
  - automation send success and failure signal exists
- `lib/repositories/settings.ts`
  - notification channel configuration already partly exists through webhook and email settings
- `lib/partner-portal/repositories/overview.ts`
  - admin commercial alerts already derive operational warnings from business state

Important observation:

- `activity_logs` is already a history stream
- `overview alerts` is already a derived warning layer
- what is missing is a unified notification event and recipient model

## 4. Event Taxonomy

Split events into three layers.

### A. Domain events

Facts that happened in the system.

Examples:

- `lead.created`
- `lead.assigned`
- `lead.follow_up_due`
- `lead.follow_up_overdue`
- `lead.converted`
- `partner.deal.created`
- `partner.deal.stage_changed`
- `partner.schedule.requested`
- `partner.schedule.confirmed`
- `partner.schedule.cancelled`
- `partner.installation.created`
- `document.contract.partner_signed`
- `document.contract.admin_signed`
- `payment.received`
- `receipt.issued`
- `bug.created`
- `automation.send_failed`
- `integration.webhook_failed`
- `system.job_failed`

### B. User notifications

Messages created for a recipient because of a domain event.

Examples:

- "New lead received"
- "3 leads need follow-up today"
- "Partner requested an installation schedule"
- "Contract signature completed"
- "Webhook delivery failed"

### C. Delivery attempts

Actual sends by channel.

Examples:

- in-app bell item created
- email sent
- ChannelTalk or Slack webhook sent
- daily digest generated

This separation matters because one event may create:

- one admin in-app notification
- one admin email
- one partner notification
- one external webhook send

## 5. Recipient Model

Do not design notifications as "send to everyone".

Use explicit audiences.

### Admin audiences

- `admin:ops`
- `admin:sales`
- `admin:finance`
- `admin:marketing`
- `admin:all`
- specific admin user id

### Partner audiences

- partner account
- partner owner
- specific partner user id

### System audiences

- service inbox for critical errors
- optional external channel like Slack or ChannelTalk webhook

Recommended default mapping:

| Event | Primary recipient | Secondary recipient |
| --- | --- | --- |
| `lead.created` | `admin:sales` | `admin:ops` |
| `lead.follow_up_due` | assigned admin user | `admin:sales` |
| `partner.schedule.requested` | `admin:ops` | related account manager |
| `partner.schedule.confirmed` | partner account | `admin:ops` |
| `partner.deal.stage_changed` | partner account | related admin owner |
| `document.contract.partner_signed` | `admin:ops` | partner account |
| `payment.received` | `admin:finance` | partner account |
| `bug.created` | `admin:ops` | specific assignee |
| `integration.webhook_failed` | `admin:ops` | `admin:all` if critical |
| `automation.send_failed` | `admin:marketing` | `admin:ops` |

### Permission hierarchy

Notification visibility should follow an explicit hierarchy, not only raw table access.

Recommended hierarchy:

#### Tier 0: Public source

Who:

- homepage visitor
- anonymous lead submitter

What they can receive:

- submit success or failure
- optional acknowledgement message

What they must not receive:

- internal process state
- staff-only errors
- finance or ops updates

#### Tier 1: Personal or assignee scope

Who:

- specific admin assignee
- specific partner user

What they can receive:

- items explicitly assigned to them
- follow-up reminders
- document action required
- own task failures

#### Tier 2: Team or branch scope

Who:

- legacy `branch` admin
- ops team room
- finance team room
- marketing team room

What they can receive:

- branch-scoped leads
- installation and schedule operations
- payment or receipt operations
- campaign and automation operations

#### Tier 3: Organization-wide admin scope

Who:

- `ADMIN`
- selected `EDITOR` domains

What they can receive:

- operational notifications across the whole org
- role-based category feeds

Restriction:

- `EDITOR` should receive only content and marketing domain notifications by default
- `VIEWER` should be digest-only unless explicitly allowed

#### Tier 4: Critical control scope

Who:

- `SUPER_ADMIN`

What they can receive:

- integration failures
- security-sensitive alerts
- system incidents
- notification delivery failure storms

### Role policy

Use the existing role model as the base routing rule.

#### Admin side

- `SUPER_ADMIN`
  - receives all `critical`
  - can view all notification categories
  - default channels: `in_app`, `email`, `wecom_webhook`
- `ADMIN`
  - receives org-wide operational notifications in allowed categories
  - default channels: `in_app`, selected `email`, selected `wecom_webhook`
- `EDITOR`
  - receives content, blog, marketing, campaign, and approval-related notifications only
  - default channels: `in_app`, digest `email`
- `VIEWER`
  - receives no real-time operational alerts by default
  - can receive digest or explicitly subscribed read-only notifications
- legacy `branch`
  - receives only branch-scoped leads, follow-ups, and local ops items
  - no global system failures unless escalated

#### Partner side

- partner `admin`
  - receives all partner-account notifications
  - can receive document, schedule, payment, and member-management alerts
- partner `member`
  - receives only action-required and own-workflow notifications
  - should not receive account-wide finance summary or member-management alerts unless allowed

### Scope tags

Each notification should carry one scope tag so filtering and authorization stay simple:

- `global`
- `branch`
- `team`
- `assignee`
- `partner_account`
- `partner_user`
- `external_contact`

### Category tags

Each notification should also carry one business category:

- `lead`
- `crm`
- `schedule`
- `document`
- `finance`
- `marketing`
- `bug`
- `integration`
- `security`
- `system`

This gives a stable permission formula:

`recipient role check + scope check + category check`

## 6. Notification Types

Severity is not enough. We also need a functional type.

Recommended types:

- `action_required`
  - someone must do something now or soon
  - example: partner signed contract, admin needs to confirm schedule
- `approval_required`
  - explicit review or approval step
  - example: publish request, document approval, exception approval
- `status_update`
  - notable state changed, but action may not be required
  - example: schedule confirmed, payment recorded
- `reminder`
  - deadline or follow-up reminder
  - example: follow-up due today, signature reminder
- `warning`
  - operational risk that should be seen
  - example: confirmed deal without installation date
- `incident`
  - system or integration problem
  - example: webhook failed, automation failed, repeated send failure
- `digest`
  - batched summary, not an interrupt
  - example: daily sales summary, daily ops digest

Recommended severity axis:

- `info`
- `warning`
- `critical`

Recommended pairing:

| Type | Typical severity | Default interrupt level |
| --- | --- | --- |
| `status_update` | `info` | low |
| `reminder` | `info` or `warning` | medium |
| `action_required` | `warning` | medium |
| `approval_required` | `warning` | medium |
| `warning` | `warning` | medium |
| `incident` | `critical` | high |
| `digest` | `info` | low |

### Visual semantics

Do not style each notification row manually.

Use a layered visual model:

- `notification_type`
  - defines interaction intent and base presentation
- `category_tag`
  - defines business identity and default icon family
- `severity`
  - defines escalation accent

Recommended rule:

- `type` decides layout emphasis
- `category` decides the default icon
- `severity` can override border, dot, and accent color

This avoids a bad pattern where every event invents its own icon and color.

### Recommended visual tokens

Use tokens, not raw arbitrary styles.

Recommended tone tokens:

- `neutral`
- `info`
- `success`
- `warning`
- `critical`
- `marketing`
- `finance`

Recommended icon keys:

- `bell-ring`
- `user-plus`
- `users`
- `calendar-days`
- `clock-3`
- `file-text`
- `file-signature`
- `receipt`
- `circle-dollar-sign`
- `triangle-alert`
- `octagon-alert`
- `bug`
- `shield-alert`
- `sparkles`
- `mail`
- `building-2`

Prefer a small curated icon set, ideally mapped to `lucide-react` names already used in the app.

### Default type-to-style mapping

| Notification type | Default icon | Default tone | Presentation note |
| --- | --- | --- | --- |
| `action_required` | `bell-ring` | `warning` | highlighted row, unread dot, CTA emphasis |
| `approval_required` | `shield-alert` | `info` | highlighted row, approval badge |
| `status_update` | `bell-ring` | `neutral` | standard row |
| `reminder` | `clock-3` | `info` | date-oriented chip |
| `warning` | `triangle-alert` | `warning` | caution border or accent |
| `incident` | `octagon-alert` | `critical` | strongest accent, always elevated |
| `digest` | `mail` | `neutral` | compressed summary card |

### Default category-to-style mapping

| Category | Default icon | Default tone |
| --- | --- | --- |
| `lead` | `user-plus` | `info` |
| `crm` | `users` | `info` |
| `schedule` | `calendar-days` | `warning` |
| `document` | `file-signature` | `info` |
| `finance` | `receipt` | `finance` |
| `marketing` | `sparkles` | `marketing` |
| `bug` | `bug` | `warning` |
| `integration` | `triangle-alert` | `critical` |
| `security` | `shield-alert` | `critical` |
| `system` | `octagon-alert` | `critical` |

### Severity override rule

Severity should be able to override the base tone when needed:

- `info`
  - keep category or type tone
- `warning`
  - upgrade accent to `warning`
- `critical`
  - upgrade accent to `critical`

Example:

- `payment.received`
  - category `finance`
  - type `status_update`
  - severity `info`
  - result: finance icon and finance tone
- `automation.send_failed`
  - category `marketing`
  - type `incident`
  - severity `critical`
  - result: incident icon or integration icon with critical tone

### UI states

Each notification row should support these visual states:

- `unread`
  - strong background or left border
- `read`
  - muted version of same token
- `archived`
  - lowest contrast
- `failed_delivery`
  - critical badge on the delivery meta, not on the whole row unless user-facing

### Settings-managed appearance

This should be manageable in admin settings, but with guardrails.

Recommended rule:

- allow admins to choose from a token set
- do not allow arbitrary CSS or any SVG upload in MVP
- do not let each single event define totally custom visuals in settings

What should be configurable:

- default icon per `notification_type`
- default tone per `notification_type`
- default icon per `category_tag`
- default tone per `category_tag`
- whether severity overrides color
- unread marker style
- digest card style

What should not be configurable in MVP:

- arbitrary hex per individual event
- arbitrary uploaded icon assets
- per-user custom icon packs

### Settings UI recommendation

Inside `admin/settings`, split notification settings into three sub-sections:

- `Delivery`
  - channels, webhook endpoints, digest email list
- `Routing`
  - role, scope, and event routing rules
- `Appearance`
  - icon and color token mapping

Recommended `Appearance` UI:

- type mapping table
  - columns: `type`, `label`, `icon`, `tone`, `preview`
- category mapping table
  - columns: `category`, `icon`, `tone`, `preview`
- severity override toggles
  - `warning overrides tone`
  - `critical overrides tone`
- preview area
  - unread item
  - read item
  - incident item
  - partner-facing item
- restore defaults button

### Settings storage recommendation

Store this as structured JSON in the notification settings domain, not as many scattered fields.

Suggested shape:

```json
{
  "appearance": {
    "typeStyles": {
      "action_required": { "iconKey": "bell-ring", "tone": "warning" },
      "approval_required": { "iconKey": "shield-alert", "tone": "info" },
      "status_update": { "iconKey": "bell-ring", "tone": "neutral" },
      "reminder": { "iconKey": "clock-3", "tone": "info" },
      "warning": { "iconKey": "triangle-alert", "tone": "warning" },
      "incident": { "iconKey": "octagon-alert", "tone": "critical" },
      "digest": { "iconKey": "mail", "tone": "neutral" }
    },
    "categoryStyles": {
      "lead": { "iconKey": "user-plus", "tone": "info" },
      "schedule": { "iconKey": "calendar-days", "tone": "warning" },
      "document": { "iconKey": "file-signature", "tone": "info" },
      "finance": { "iconKey": "receipt", "tone": "finance" },
      "system": { "iconKey": "octagon-alert", "tone": "critical" }
    },
    "severityOverrides": {
      "warning": true,
      "critical": true
    }
  }
}
```

### Rendering recommendation

For flexibility, render visuals from semantic fields plus current settings:

- `notification_type`
- `category_tag`
- `severity`

Do not require storing raw `icon` or `hex color` on each notification row.

Optional:

- persist `resolved_icon_key` and `resolved_tone` only if historical visual consistency becomes important later

## 7. Channel Policy

Channels should depend on severity and audience, not on route handler convenience.

### In-app

Default channel for almost everything.

- admin bell and inbox
- partner bell and inbox
- unread count
- read, unread, and archived states
- deep link to the related screen

### Banner or inline warning

Use for derived urgency on dashboards.

- admin overview top banners
- CRM follow-up warnings
- commercial outstanding warnings
- partner workspace action cards

These should usually be generated from notification state or from the same source event, not reimplemented separately.

### Email or external webhook

Use only for:

- critical failures
- action-required events
- daily summary or digest
- off-session recipients

### Toast

Use only for immediate result of user actions.

Examples:

- "Schedule request saved"
- "Failed to save settings"

Toast is not a persistent notification system.

### Channel decisions

The channel set should be intentional, not just "whatever webhook exists".

Recommended channel inventory:

- `in_app`
  - default source of truth for internal users
- `email`
  - off-session follow-up, digest, fallback
- `wecom_webhook`
  - internal team-room delivery for operations and critical incidents
- `channel_talk_webhook`
  - fast lead-response and sales-facing room notifications
- `kakao_alimtalk`
  - external transactional notifications to partner or customer contacts

### Recommended use by audience

#### Internal admin and ops

Preferred:

- `in_app`
- `wecom_webhook`
- selective `email`

Do not use by default:

- `kakao_alimtalk`

Reason:

- internal ops alerts should stay auditable and team-visible
- WeCom room webhooks are better for shared operational response than personal Kakao messages

#### Internal sales lead response

Preferred:

- `in_app`
- `channel_talk_webhook`
- selective `email`

Reason:

- the codebase already has `channelTalkWebhookUrl`
- lead intake is the one place where very fast human pickup matters

#### External partner or customer-facing

Preferred:

- `in_app` for logged-in partner users
- `kakao_alimtalk` for transactional outbound
- fallback `email`

Reason:

- Kakao is best used as a formal transactional channel, not as a generic internal ops feed
- use template-based AlimTalk, not freeform personal chat, for auditability and consistency

### Concrete recommendation: Kakao vs WeCom

If we have to decide now:

- use `WeCom webhook` for internal admin and ops notifications
- keep `ChannelTalk webhook` for inbound lead and quick sales-response notifications
- use `Kakao AlimTalk` only for external partner or customer transactional messages

Recommended examples:

#### Send to WeCom webhook

- webhook failure
- automation failure
- schedule requested by partner
- urgent outstanding payment escalation
- installation collision or missing confirmation

#### Send to ChannelTalk webhook

- new homepage lead
- demo request
- high-score lead
- contact form submitted outside business hours

#### Send to Kakao AlimTalk

- schedule confirmed to partner contact
- contract signing reminder
- receipt issued
- appointment reminder

Do not send to Kakao first:

- raw system incidents
- internal bug tickets
- noisy status-only updates

### Channel fallback policy

Recommended fallback order:

#### Internal notifications

`in_app -> wecom_webhook -> email`

#### External partner notifications

`in_app -> kakao_alimtalk -> email`

#### Lead acknowledgements

`email` first, optional `kakao_alimtalk` later only if phone and consent are valid

### Configuration recommendation

The current settings already include:

- `leadWebhookUrl`
- `channelTalkWebhookUrl`
- `emailWebhookUrl`

Recommended additions:

- `wecomOpsWebhookUrl`
- `wecomCriticalWebhookUrl`
- `kakaoAlimtalkWebhookUrl` or provider config
- `kakaoTemplateMapJson`
- `notificationDigestEmailList`

## 8. Recommended Data Model

Minimum durable structure:

### `notification_events`

Append-only fact table.

Suggested fields:

- `id`
- `event_type`
- `event_group`
- `source_app` (`homepage`, `partner`, `admin`, `system`)
- `actor_type` (`admin`, `partner`, `system`, `public`)
- `actor_id`
- `entity_type`
- `entity_id`
- `partner_account_id`
- `lead_id`
- `deal_id`
- `severity` (`info`, `warning`, `critical`)
- `title`
- `message`
- `payload_json`
- `dedupe_key`
- `occurred_at`

### `notifications`

Recipient-level inbox items.

Suggested fields:

- `id`
- `event_id`
- `recipient_type` (`admin_user`, `admin_role`, `partner_user`, `partner_account`)
- `recipient_id`
- `channel` (`in_app`, `email`, `webhook`, `digest`)
- `status` (`pending`, `delivered`, `read`, `archived`, `failed`)
- `route_url`
- `read_at`
- `archived_at`
- `delivered_at`
- `delivery_error`
- `created_at`

Additional recommended fields:

- `notification_type`
- `scope_tag`
- `category_tag`

### `notification_preferences`

Phase 2 or later.

Suggested fields:

- `recipient_type`
- `recipient_id`
- `event_type`
- `channel`
- `enabled`
- `digest_only`

### `notification_delivery_logs`

Optional at MVP, but useful if external send reliability matters.

Suggested fields:

- `notification_id`
- `attempt_no`
- `channel`
- `request_json`
- `response_code`
- `response_body`
- `status`
- `created_at`

## 9. Event Emission Rules

The key design rule:

Do not send email or webhook directly inside every route as the final logic.

Instead:

1. perform the domain write
2. emit a domain event
3. evaluate notification rules
4. fan out notifications
5. deliver channels asynchronously when possible

### Recommended helper

Create a single service, for example:

`lib/notifications/emit-event.ts`

Responsibilities:

- validate event shape
- write `notification_events`
- generate recipient notifications
- optionally enqueue async delivery

### Example flow: homepage lead

1. `/api/lead` saves the lead
2. route emits `lead.created`
3. recipients resolved:
   - `admin:sales`
   - assigned branch or manager if known later
4. create in-app notifications
5. if configured, send external webhook or email
6. if webhook send fails, emit new event `integration.webhook_failed`

### Example flow: partner schedule request

1. partner creates schedule request
2. emit `partner.schedule.requested`
3. recipients resolved:
   - `admin:ops`
   - related account manager
4. admin sees unread bell and deep link to commercial or schedule screen

### Example flow: admin schedule confirmation

1. admin confirms schedule
2. emit `partner.schedule.confirmed`
3. recipient resolved:
   - partner account or partner owner
4. partner sees bell item and workspace action card

### Example flow: system error

1. webhook or automation send fails
2. emit `integration.webhook_failed` or `automation.send_failed`
3. create critical admin notification
4. optionally send external alert immediately

## 10. Derived vs Direct Notifications

Some alerts should be direct event notifications.

Examples:

- new lead
- partner requested a schedule
- contract signed
- webhook failed

Some alerts should be derived state notifications.

Examples:

- follow-up due today
- follow-up overdue
- confirmed deal without installation schedule
- outstanding payment over threshold

Recommendation:

- direct events go into `notification_events`
- derived alerts run from a scheduled evaluator every few minutes or hourly
- derived alerts must use `dedupe_key` so the same overdue warning is not recreated every refresh

Example dedupe keys:

- `lead-followup-due:{lead_id}:{yyyy-mm-dd}`
- `lead-followup-overdue:{lead_id}:{yyyy-mm-dd}`
- `deal-installation-missing:{deal_id}`
- `outstanding-payment:{deal_id}:{bucket}`

## 11. UX by Surface

### Admin UX

Add a real bell or inbox at global layout level.

Needed features:

- unread count
- filter by category: lead, schedule, finance, system
- filter by severity
- mark read
- mark all read
- deep link into CRM, commercial, contracts, settings, or bugs

Keep current overview banners, but back them with the same event model where possible.

### Partner UX

Add a lighter bell or inbox in partner shell.

Needed features:

- only own partner account notifications
- action-required first
- links into workspace, documents, calendar, and payments
- compact summary inside workspace home

### Homepage UX

Only immediate submission feedback.

Needed features:

- success toast or inline success state
- clear failure reason on submit failure
- optional automatic acknowledgement email

Not needed:

- public notification center

## 12. Routing Matrix

Recommended first-pass routing policy:

| Event | Type | Severity | Scope | Primary channels |
| --- | --- | --- | --- | --- |
| `lead.created` | `action_required` | `warning` | `branch` or `team` | `in_app`, `channel_talk_webhook` |
| `lead.follow_up_due` | `reminder` | `info` | `assignee` | `in_app` |
| `lead.follow_up_overdue` | `warning` | `warning` | `assignee` | `in_app`, `email` |
| `partner.schedule.requested` | `action_required` | `warning` | `team` | `in_app`, `wecom_webhook` |
| `partner.schedule.confirmed` | `status_update` | `info` | `partner_account` | `in_app`, `kakao_alimtalk` |
| `document.contract.partner_signed` | `action_required` | `warning` | `team` | `in_app`, `wecom_webhook` |
| `payment.received` | `status_update` | `info` | `partner_account` | `in_app`, `email` |
| `receipt.issued` | `status_update` | `info` | `partner_account` | `in_app`, `kakao_alimtalk`, `email` |
| `bug.created` | `warning` | `warning` | `team` | `in_app` |
| `integration.webhook_failed` | `incident` | `critical` | `global` | `in_app`, `wecom_webhook`, `email` |
| `automation.send_failed` | `incident` | `critical` | `team` | `in_app`, `wecom_webhook`, `email` |

## 13. MVP Recommendation

Start small and durable.

### Phase 1: Admin Inbox First

Goal: make internal operations visible immediately.

Implement:

- `notification_events`
- `notifications`
- admin bell or inbox UI
- events:
  - `lead.created`
  - `partner.schedule.requested`
  - `integration.webhook_failed`
  - `automation.send_failed`
  - `bug.created`
  - `lead.follow_up_due`
  - `lead.follow_up_overdue`

Why first:

- highest business value
- easiest to validate
- most current pain is likely internal reaction time

### Phase 2: Partner Inbox

Implement:

- partner bell or inbox UI
- events:
  - `partner.schedule.confirmed`
  - `partner.schedule.cancelled`
  - `document.contract.partner_signed`
- `payment.received`
- `receipt.issued`
- `partner.deal.stage_changed`

### Phase 3: Preferences and External Channels

Implement:

- `notification_preferences`
- severity routing
- digest email
- Slack or ChannelTalk webhook

### Phase 4: Real-time

Implement only after durable inbox works.

Possible approach:

- Supabase Realtime on `notifications`
- or server-sent events if needed

Important:

- real-time is a delivery enhancement
- it should not be the source of truth

## 14. Recommended Integration Points in Current Code

These are the first places to instrument.

### Immediate P0 integration points

- `app/api/lead/route.ts`
  - emit `lead.created`
  - emit `integration.webhook_failed` on any failed delivery
- `app/api/partner/schedules/route.ts`
  - emit `partner.schedule.requested`
  - emit update events on status changes
- `app/api/admin/leads/[id]/route.ts`
  - emit `lead.assigned`
  - emit `lead.follow_up_due` change event when date changes
  - emit `lead.converted`
- `app/api/admin/leads/[id]/logs/route.ts`
  - emit `lead.contacted` when first contact log is added
- `app/api/admin/bugs/route.ts`
  - emit `bug.created`
- `lib/automation-engine.ts`
  - emit `automation.send_failed`

### Secondary integration points

- `lib/partner-portal/repositories/deals-write.ts`
  - emit `partner.deal.created`
- `lib/partner-portal/repositories/installations-write.ts`
  - emit `partner.installation.created`
- `app/api/admin/install-schedules/route.ts`
  - emit admin-created schedule events

## 15. Suggested Implementation Order

### Step 1

Create notification domain layer:

- `lib/notifications/types.ts`
- `lib/notifications/emit-event.ts`
- `lib/notifications/resolve-recipients.ts`
- `lib/notifications/create-notifications.ts`

### Step 2

Create migrations:

- `notification_events`
- `notifications`
- indexes on `recipient`, `status`, `created_at`, `event_type`, `dedupe_key`

### Step 3

Instrument only 3 event sources first:

- lead created
- partner schedule requested
- webhook or automation failed

### Step 4

Build admin inbox UI and unread badge

### Step 5

Add scheduled derived alerts:

- follow-up due
- overdue
- missing installation after confirmed

### Step 6

Expand to partner inbox

## 16. Guardrails

### Deduplication

Without dedupe, warnings will explode.

Always support `dedupe_key` for:

- same overdue reminder
- same integration failure during retry storms
- same missing schedule warning

### Severity

Use severity consistently:

- `info`
  - normal state change
- `warning`
  - action needed soon
- `critical`
  - system failure or business blocking issue

### Deep link route

Every in-app notification should include a destination.

Examples:

- `/admin/crm`
- `/admin/commercial`
- `/admin/contracts`
- `/admin/settings`
- `/partner/workspace`
- `/partner/calendar`

### Read state ownership

Read state belongs to the recipient-level notification, not the event.

One event can be read by one person and unread by another.

## 17. Final Recommendation

The best fit for this codebase is not "add a few bells".

The best fit is:

- keep homepage as event source
- make admin the main operations inbox
- make partner a scoped action inbox
- unify everything behind a single domain-event notification layer

If we do only one thing first, it should be:

`lead.created + partner.schedule.requested + system failure` into a durable admin inbox.

That gives immediate operational value, matches current business flow, and creates the right foundation for everything after that.
