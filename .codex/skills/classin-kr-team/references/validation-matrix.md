# KR Team 검증 매트릭스

개발 중에는 해당 행만 실행하고, 완료 전 기본 품질 게이트로 마무리한다.

| 변경 종류 | 빠른 검증 | 브라우저 확인 |
| --- | --- | --- |
| 탭·필터·지연 로딩 | `npx vitest run tests/branch/tab-data-needs.test.ts tests/branch/touch-target-mobile.test.ts` | 변경 탭 딥링크, 탭 왕복, 뒤로가기, 모바일 폭 |
| 개요 숫자·차트 | 관련 `tests/branch/computations/*` + summary API 테스트 | 팀·M/Q/Y·월 변경, 로딩·빈 상태·오류 |
| 파이프라인 | pipeline API/계산 테스트 | 테이블↔칸반, 검색·담당자, 딜 상세 |
| 히트맵 | heatmap 계산·요약모드 테스트 | 지역 선택, 툴팁, 전체 파이프라인 이동 |
| AI | `tests/branch/insights/` | 기존 결과·실패 상태. 강제 생성은 승인된 환경에서만 |
| 장부 입력 | ledger cell/draft/weekly-close 관련 테스트 | 잠금·초안·충돌. 실제 마감·임포트 금지 |
| 동기화·정합성 | freshness·sync partial failure·CRM sync 테스트 | 상태칩·오래됨·실패 배너. 실제 동기화 버튼 금지 |

## 완료 게이트

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

DB/RPC·migration을 건드렸다면 해당 migration 계약 테스트를 추가하고 실행한다. `vercel.json`을 건드렸다면 `npm run check:vercel-crons`를 별도로 실행한다.
