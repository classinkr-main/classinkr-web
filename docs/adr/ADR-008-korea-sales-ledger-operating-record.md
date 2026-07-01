# ADR-008 Korea Sales Ledger As Operating Record

## Context

The FY26-27 Korea sales ledger currently lives in a Google Spreadsheet with several tabs. The first productization scope is limited to:

- `1. DSH`
- `2. REV`
- `3. KPI`

The current app already has overlapping surfaces:

- `/admin/overview` for executive summary.
- `/admin/crm/**` for CRM, customer records, source matching, tasks, and money flow.
- `/admin/branch` for KR Team pacing, pipeline, regional, hardware, campaign, and KPI views.

The codebase also already has useful ledger infrastructure:

- `branch_rev_deals` as a full-replaced REV sheet cache.
- DSH/KPI parsers and branch APIs.
- `crm_source_links` for matching external/source rows to app customers and deals.
- CRM revenue code that treats REV sheet money as comparison/supporting data, not canonical CRM revenue.
- External CRM sync infrastructure that can refresh derived read models after source snapshots are updated.

Without an explicit boundary, productizing the sheet could create three competing dashboards with inconsistent totals.

## Decision

Treat the Korea Sales Ledger as an internal operating record, not as the final recognized revenue book-of-record.

1. CRM is the canonical workbench for ledger operations, matching, source health, reconciliation, and audit.
2. KR Team is a goal-vs-execution lens over the same ledger data.
3. Overview only shows thin summary cards and deep links.
4. `branch_rev_sheet` / `branch_rev_deals` remains a supporting source until explicit matching/dedupe rules promote values into a canonical CRM/account revenue model.
5. CRM performance should move toward an owned `crm_orders` read model derived from external CRM source snapshots. The first slice should ingest only `SalesPerformance__c` records to reduce double-counting risk.
6. REV sheet values must not be summed with app V1/V2 deals, contracts, receipts, or external CRM money unless a confirmed source-link and dedupe rule exists.
7. `1. DSH`, `2. REV`, and `3. KPI` should become DB-native active imports. Google Sheet, CSV, and XLSX files are import sources; admin routes should read the latest active DB import first and only use sheet read-through as an explicit fallback.
8. REV input/edit changes start in an admin-owned `branch_sales_ledger_drafts` review queue. Drafts preserve source row snapshots and do not mutate `branch_rev_deals` or recognized revenue.
9. Applying a checked draft creates an append-only `branch_sales_ledger_entries` internal ledger entry. The workbench may show additive `new-row` entries as the operator-owned ledger layer so users can validate self-entered additions before the underlying source is updated. `edit-row` entries are replacement/delta candidates and must not be summed as additive revenue until that contract is explicit.
10. Local fallback drafts are temporary client-side recovery state. They must never count as applied ledger revenue.
11. Applied drafts and ledger entries are immutable. Later corrections require reversal/new-entry workflows and auditable events.
12. Fiscal period logic is fixed for FY26-27: April 2026 through March 2027, Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.

## Consequences

Positive:

- Prevents duplicate dashboards from becoming conflicting products.
- Keeps existing `/admin/crm/deals`, `/admin/branch`, and `/admin/overview` roles clear.
- Allows safe incremental productization using existing parsers, repositories, and tests.
- Keeps source freshness, matching coverage, and data-quality issues visible.
- Lets operators capture sheet-like edits inside the app without immediately changing source revenue totals.
- Gives operators an immediate applied-adjustment view through an internal ledger entry while preserving source-of-record separation.
- Avoids accidental double-counting across REV, app deals, legacy documents, and external CRM snapshots.
- Gives CRM performance a path away from borrowed REV sheet totals through a tested read model and explicit fallback metadata.
- Gives the ledger app its own import-run, source-file, snapshot, active-source, and validation audit trail instead of relying on live spreadsheet reads.

Negative:

- Users may still ask which number is the final revenue truth until recognized revenue rules are separately defined.
- DSH/KPI actuals and REV actuals can disagree until reconciliation rules are explicit.
- Google Sheet formatting remains operationally meaningful in early phases, especially red/high-confidence color states.
- A draft queue adds one more review step before source data changes are applied.
- The first version is not a full replacement for all spreadsheet tabs.
- The initial `crm_orders` slice excludes other external CRM objects until reconciliation, dedupe, and recognition rules are defined.
- CSV imports cannot recover Google Sheets color formatting, so REV certainty from CSV must be marked `format_unavailable` unless imported from XLSX/Sheets with formatting metadata.

## Related docs/code

- [../active/sales-ledger-productization-prd-2026-06-30.md](../active/sales-ledger-productization-prd-2026-06-30.md)
- [../active/sales-ledger-productization-roadmap-2026-06-30.md](../active/sales-ledger-productization-roadmap-2026-06-30.md)
- [../active/crm-sheet-revenue-sync-plan.md](../active/crm-sheet-revenue-sync-plan.md)
- [../active/erp-blueprint-2026-06-22.md](../active/erp-blueprint-2026-06-22.md)
- [../../lib/branch/parsers/dsh.ts](../../lib/branch/parsers/dsh.ts)
- [../../lib/branch/parsers/rev.ts](../../lib/branch/parsers/rev.ts)
- [../../lib/branch/parsers/kpi.ts](../../lib/branch/parsers/kpi.ts)
- [../../lib/repositories/branch-deals.ts](../../lib/repositories/branch-deals.ts)
- [../../lib/repositories/crm-source-links.ts](../../lib/repositories/crm-source-links.ts)
- [../../lib/admin-crm-revenue.ts](../../lib/admin-crm-revenue.ts)
- [../../lib/crm/revenue-performance.ts](../../lib/crm/revenue-performance.ts)
- [../../lib/external-crm/sync-chain.ts](../../lib/external-crm/sync-chain.ts)

## Status

proposed
