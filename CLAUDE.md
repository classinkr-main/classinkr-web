# Classin Home — Repository Notes

## 프로젝트 개요

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, Supabase, Recharts, Lucide
- 공개 사이트(`/`), 관리자(`/admin`), 공유 링크(`/share/{quote,contract}/[token]`), 포털 API(`/app/api/portal`)

## 먼저 볼 문서

- [docs/active/playbook/README.md](docs/active/playbook/README.md) — 파트별 운영 플레이북: 작업이 어느 파트인지 판별 → 담당 에이전트(`.claude/agents/`)·가이드·철칙 적용
- [docs/README.md](docs/README.md)
- [docs/active/repository-audit-2026-04-15.md](docs/active/repository-audit-2026-04-15.md)
- [DESIGN.md](DESIGN.md)

## 파트 분담 (작업 위임)

저장소는 6개 파트로 나뉜다. 작업이 들어오면 [플레이북 §2 소유권 매트릭스](docs/active/playbook/README.md)로 파트를 판별하고 해당 전담 에이전트를 띄운다.

| 파트 | 에이전트 | 가이드 |
|------|----------|--------|
| 홈 및 랜딩 | `home-front` | [01](docs/active/playbook/01-home-front.md) |
| 어드민 코어 | `admin-core` | [02](docs/active/playbook/02-admin-core.md) |
| 컨텐츠 발행 | `content-pub` | [03](docs/active/playbook/03-content-pub.md) |
| 마케팅/그로스/CRM | `growth-crm` | [04](docs/active/playbook/04-growth-crm.md) |
| 챗봇 | `chatbot` | [05](docs/active/playbook/05-chatbot.md) |
| 플랫폼 & 데이터 | `platform-data` | [06](docs/active/playbook/06-platform-data.md) |

## 코드 규칙

- 공용 컴포넌트는 `components/`에 둔다.
- 관리자 API는 `app/api/admin/`에서 `verifyAdmin()` 또는 동등한 관리자 인증 가드를 사용한다.
- 포털 V2 API는 `app/api/portal/`과 `lib/portal/portal-authorize.ts` 기준으로 맞춘다.
- 데이터 접근은 `lib/repositories/` 또는 `lib/portal/repositories/`로 모은다.
- 일부 기능은 여전히 `data/*.json` 또는 듀얼 모드 저장소를 통해 폴백한다.

## 검증 기준

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

현재 저장소에서는 위 두 명령을 기본 품질 게이트로 본다.

## UI 작업 시 필수 체크

- 색상: [DESIGN.md](DESIGN.md) 팔레트만 사용
- 보더: `1px solid rgba(0,0,0,0.08)`
- 섹션 배경: `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`
- 모바일 우선 반응형 유지

## 문서 운영 규칙

- 기준 문서는 repo-relative 링크만 사용한다.
- 브랜치명, 로컬 절대경로, 실제 비밀번호 예시는 남기지 않는다.
- 오래된 사고 메모는 현재 상태 단정에 쓰지 않고, 현재 audit 문서와 실제 코드로 재검증한다.
