# ADR-007: Admin identity, roles, capabilities, and actor snapshots

Status: Accepted  
Date: 2026-07-11

## Decision

- Production admin identity is Supabase Auth plus `admin_profiles`.
- There is at most one `SUPER_ADMIN`. `BRANCH` represents a branch director and `ADMIN` represents the remaining admin team.
- All three roles may read company-wide operational data. Ownership fields and the `__me` filter provide “내 리드” and “내 업무” views; branch is not a data-visibility boundary.
- Coarse roles are supplemented by per-account capabilities managed by `SUPER_ADMIN`. All active `ADMIN` and `BRANCH` accounts may edit hardware records; `hardware.finalize` is reserved for Lee Wangchan, with `SUPER_ADMIN` retaining implicit break-glass access.
- Safe read methods include `BRANCH` by default so branch directors can inspect company data. Unsafe methods remain `SUPER_ADMIN`/`ADMIN` by default, and identity, settings, quote-code, and developer internals explicitly keep staff-admin-only reads.
- Production rejects `ADMIN_PASSWORD`, `ADMIN_USERS`, and legacy `admin_session` authentication. They remain local-development compatibility only.
- Audit actors use the following contract:
  - `actor_user_id`: stable Supabase Auth user ID
  - `actor_display_name`: display-name snapshot at action time
  - `actor_role`: role snapshot at action time

Names and roles are historical snapshots, not identity keys. Runtime code should use `logAdminAudit()` so all three fields are written together.

## Enforcement

- [admin-auth.ts](../../lib/admin-auth.ts) resolves Supabase before local legacy auth and enforces capabilities.
- [admin-capabilities.ts](../../lib/admin-capabilities.ts) is the allow-list for assignable capabilities.
- [20260711_admin_rbac_actor_audit.sql](../../supabase/migrations/20260711_admin_rbac_actor_audit.sql) adds the single-super-admin constraint, capability storage, restricted profile-update RLS, and actor snapshots.
- `PATCH /api/admin/users` is limited to `SUPER_ADMIN` and changes only the target account's capability array.

## Operational note

Apply the migration before deploying code that selects `admin_profiles.capabilities`. A missing or unavailable production `admin_profiles` source fails closed; it must not fall back to environment-file users.
