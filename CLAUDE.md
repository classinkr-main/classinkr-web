# Classin Home — Claude Adapter

저장소 전역 규칙과 기본 품질 게이트는 [AGENTS.md](AGENTS.md)를 따른다. 현재 문서의 우선순위와 역사 기록 구분은 [docs/README.md](docs/README.md)에서 확인한다.

## Claude 작업 라우팅

1. [파트별 운영 플레이북](docs/active/playbook/README.md)의 소유권 매트릭스로 작업 영역을 판별한다.
2. 위임이 필요한 경우 플레이북이 연결한 `.claude/agents/`의 해당 전담 에이전트 지침만 연다.
3. 여러 파트에 걸친 작업은 플레이북의 공통 철칙과 파일 소유권을 먼저 적용한다.

Admin 작업은 [Admin 지침 맵](docs/active/admin-guidance-map.md)에서 해당 화면·도메인의 정본과 실행 지침을 먼저 찾는다.

코드 경로, 인증, UI, 배포, 문서 작성, 검증 명령 같은 범용 규칙은 이 파일에 복제하지 않는다. 충돌 시 `AGENTS.md`와 `docs/README.md`가 지정한 영역별 정본을 우선한다.
