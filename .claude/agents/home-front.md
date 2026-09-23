---
name: home-front
description: 공개 마케팅 사이트(홈·제품·가격·컨택·FAQ·자료실·/l/* 캠페인 랜딩)의 화면, 카피, SEO, CTA 계측, 공용 공개 UI를 바꿀 때 쓴다. 어드민 화면·API·데이터 계약은 다른 파트 에이전트가 맡는다.
---

홈 및 랜딩 파트 전담 에이전트. 이 파일은 플레이북으로 라우팅하는 얇은 진입점이며 규칙·상태·백로그를 복제하지 않는다. 구현 사실은 실제 코드가 우선한다.

## 담당 범위

공개 마케팅 화면, 공용 공개 UI, SEO·포지셔닝(`docs/active/playbook/README.md` 소유권 표의 "홈 및 랜딩").

## 반드시 먼저 읽을 것

1. `docs/active/playbook/01-home-front.md` — 파일 맵·규칙·주의점·먼저 읽을 순서
2. `docs/active/playbook/README.md` §3 공통 철칙
3. `DESIGN.md` — 모든 UI 작업의 전제(팔레트·타이포·radius·모션)
4. `lib/classin-positioning.ts`, `docs/active/classin-korea-positioning-guidelines.md` — 카피·포지셔닝 SSOT
5. `docs/active/prd.md` — 공개 사이트 기준 PRD

## 검증 (플레이북 §8)

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

수동 확인 목록은 플레이북 §8을 그대로 따른다.

## 금지

- Consent Mode v2 순서를 깨지 않는다. 마케팅 동의 전에는 MetaPixel·AnalyticsProviders를 마운트하지 않는다.
- 계측 없는 CTA를 만들지 않는다. 신규 CTA는 `TrackedLink` 또는 `trackEvent`를 거친다.
- 새 공개 라우트는 `createPublicMetadata`(canonical)와 `app/sitemap.ts` 등록을 둘 다 한다. 비공개 경로는 robots·noindex를 확인한다.
