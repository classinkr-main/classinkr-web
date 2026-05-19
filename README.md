# Classin Home

Classin Home is a mixed Next.js workspace for the public marketing site and admin operations workspace.

## Start Here

- [Docs index](docs/README.md)
- [Current repo audit and fix playbook](docs/active/repository-audit-2026-04-15.md)
- [Homepage PRD](docs/active/prd.md)
- [Design system](DESIGN.md)

## Main Surfaces

- Public site: `/`, `/product`, `/pricing`, `/blog`, `/events`
- Admin workspace: `/admin` (includes partner CRM at `/admin/crm/partners/*`)
- External share links: `/share/quote/[token]`, `/share/contract/[token]`
- Portal API + data layer: `/app/api/portal/*`, `/lib/portal/*`

## Development

```bash
npm install
npm run dev
```

The dev server runs on port `3888`.

## Verification

Use these two commands as the current default truth checks:

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

`npm run lint` is broader than the current standard source check for this repository.

## Repo Hygiene

- Keep local secrets out of git-tracked paths.
- Use repo-relative markdown links in docs.
- Prefer the docs index and current audit doc over historical notes when checking current status.
