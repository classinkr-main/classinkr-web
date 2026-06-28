# Brand Canon — 브랜드·콘텐츠 단일 기준 인덱스

기준일: 2026-06-29
문서 목적: 정체성·카피·보이스·세그먼트·회사 팩트가 **표면(홈/가이드/문서/블로그/리드마그넷/챗봇)마다 따로 노는 것**을 막는다. 각 관심사의 SSOT를 한 장에 고정하고, 나머지 표면은 전부 *참조만* 한다.

> 상위 인덱스: [../../README.md](../../README.md)(Docs Index §6 "한 영역=기준문서 하나") · [../playbook/README.md](../playbook/README.md)(§3.6 포지셔닝 SSOT)

## 1. SSOT 계층 (관심사 → 단일 기준 → 소비처)
| 관심사 | SSOT (단일 기준) | 런타임/소비처 | 비고 |
| --- | --- | --- | --- |
| 메시지 규칙·CTA·비교 프레임 | [classin-korea-positioning-guidelines.md](../classin-korea-positioning-guidelines.md) | — | "규칙"의 SSOT |
| 카테고리명·히어로 등 **literal 카피** | [lib/classin-positioning.ts](../../../lib/classin-positioning.ts) | 홈/제품/챗봇 | "값"의 SSOT |
| 보이스·표면별 톤 | [voice-charter.md](./voice-charter.md) | 전 표면 | 신규 |
| 회사 팩트(EEO 투자/스케일) | [company-facts.md](./company-facts.md) | `app/about`, `GlobalScale` | 신규·웹검증 |
| 제품·기능명·하드웨어 | [classin-software-feature-inventory.md](../classin-software-feature-inventory.md) | `lib/docs.ts`, 챗봇 | 자기선언 SSOT |
| 비주얼 | [DESIGN.md](../../../DESIGN.md) | `globals.css`, 전 컴포넌트 | |
| 퍼널·리드마그넷 데이터 | [data/lead-magnets.json](../../../data/lead-magnets.json) | `/resources`, 챗봇 CTA | 라우팅표 = positioning §9 |
| 챗봇 지식 원천 | [lib/docs.ts](../../../lib/docs.ts) `DocArticle[]` | RAG 파이프라인 | kb-audit가 선언 |

## 2. 운영 규칙 (드리프트 방지)
1. **관심사 1개 = SSOT 1개.** 같은 사실/값을 두 곳에 캐논으로 중복 기재하지 않는다.
2. **규칙 vs 값 분리** — 메시지 *규칙*은 `positioning-guidelines.md`, 렌더되는 *literal 값*(카테고리명·oneLine·hero)은 `lib/classin-positioning.ts`. 문서는 값을 재기재하지 말고 코드 상수를 참조한다. 충돌 시 값=코드 / 규칙=문서가 각자 정점.
3. **표면은 참조만.** 홈/블로그/문서/이벤트/이메일/챗봇은 위 SSOT를 따르고 자체 캐논을 만들지 않는다.
4. **수치 단정 금지** — 가격·기관 수·밸류·모델 스펙은 [company-facts.md](./company-facts.md) 등급 또는 "상담 확인"으로만.
5. **리드마그넷** — 데이터(gate/tier/intentScore)는 `lead-magnets.json`이 SSOT. positioning §8/§10은 *역할·라우팅*만 기술하고 숫자 스코어를 재정의하지 않는다.

## 3. 확정 결정 (2026-06-29)
- **카테고리명 = "수업 시스템 OS"** (학원 시스템 OS 폐기). 라이브 코드·문서 동기화 완료. 잔존은 날짜박힌 역사 스펙 2건뿐(보존).
  - oneLine: "Classin은 전자칠판, 수업 녹화, EDB 교안, LMS, 학생 관리, 관리자 데이터를 한 흐름으로 묶는 **수업 시스템 OS**입니다."
  - 근거: 라이브/코드/최신 플레이북이 이미 사용 중 + "정직한 한계"(결제·출석·리포트 미대체)상 '학원 전체 OS'보다 방어 가능.
- **보이스 = 표면별 톤 레인지** ([voice-charter.md](./voice-charter.md)). 홈=긴장 허용 / 지원·문서=안심.
- **회사 팩트 = SSOT** ([company-facts.md](./company-facts.md)). 회사 자체 소개는 **EEO 공식 자기소개(classin.com) 미러** — 시리즈 D 유니콘·누적 $500M+·5,000만+ 교육자·학습자·160+개국. 외부 DB의 시리즈 C $265M은 내부 맥락으로만(임의 하향 금지). $30B/30조원은 거짓.

## 4. 세그먼트 (3레이어 — 통합 보기)
| 레이어 | 정의 | 원천 |
| --- | --- | --- |
| 구매자(1순위) | 학원 원장·관리자·실장·운영책임자 | positioning §2 |
| 사용 역할 | 관리자·강사·학생·학부모 | `components/sections/Outcomes.tsx` |
| 인텐트(퍼널) | 가격방어·운영관리·API·일정·쇼룸·설치·사례·리스크제거 | `lead-magnets.json` salesPlaybook |

> 공백: 학원 유형(과목/규모/지역)축 세그먼트는 `academy-case-match-brief` 외 미정 → 후속 과제.

## 5. 변경 시 체크리스트
- [ ] 포지셔닝 *규칙* 변경 → `positioning-guidelines.md`
- [ ] 카테고리명/히어로 *값* 변경 → `lib/classin-positioning.ts` (문서는 참조만)
- [ ] 보이스/톤 변경 → `voice-charter.md` + 해당 표면
- [ ] 회사 수치 변경 → `company-facts.md` (출처 갱신) → `app/about`·`GlobalScale`
- [ ] 기능명 변경 → `feature-inventory.md` → `lib/docs.ts` (+ 챗봇 재임베딩)
- [ ] 리드마그넷 변경 → `lead-magnets.json` + positioning §9 라우팅 확인
