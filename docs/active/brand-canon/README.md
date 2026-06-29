# Brand Canon — 브랜드·회사·컨텐츠·참고 단일 기준 인덱스

기준일: 2026-06-29
문서 목적: 정체성·카피·보이스·세그먼트·회사 팩트가 **표면(홈/가이드/문서/블로그/리드마그넷/챗봇)마다 따로 노는 것**을 막는다. 이 캐논은 페이지 카피가 아니라 **브랜드·회사·컨텐츠·기타 참고**의 *결정*을 고정하는 곳이다. 각 항목은 SSOT 1개, 표면은 전부 *참조만* 한다.

> 상위 인덱스: [../../README.md](../../README.md) · [../playbook/README.md](../playbook/README.md)(§3.6)

## 1. 캐논 4영역 × SSOT

### ① 브랜드 — 정체성·카피·보이스·비주얼
| 항목 | SSOT | 상태 |
| --- | --- | --- |
| 카테고리명·메시지 규칙 | [classin-korea-positioning-guidelines.md](../classin-korea-positioning-guidelines.md) (규칙) + [lib/classin-positioning.ts](../../../lib/classin-positioning.ts) (literal 값) | ✅ "수업 시스템 OS" |
| 보이스·표면별 톤 | [voice-charter.md](./voice-charter.md) | ✅ |
| 비주얼 | [DESIGN.md](../../../DESIGN.md) | ✅ |

### ② 회사 — EEO 팩트·연혁·제품군
| 항목 | SSOT | 상태 |
| --- | --- | --- |
| EEO 투자·스케일·연혁·파트너 | [company-facts.md](./company-facts.md) | ✅ 공식 미러 + 출처표기 |
| 제품군 / 한국 판매 SKU | company-facts §1 + `app/product` | 🟡 노출 vs 판매범위 미확정 |

### ③ 컨텐츠 — 블로그·문서·이벤트·이메일·리드마그넷·챗봇
| 항목 | SSOT | 상태 |
| --- | --- | --- |
| 문서센터 톤 | [docs-center-content-guidelines.md](../docs-center-content-guidelines.md) | ✅ |
| 블로그·이벤트·이메일 보이스 | [voice-charter.md](./voice-charter.md) | 🟡 소속만 지정, 실카피 감사 전 |
| 리드마그넷 데이터 | [data/lead-magnets.json](../../../data/lead-magnets.json) | ✅ 13종(PDF 실존) |
| 콘텐츠 로드맵 | [content-roadmap-blog-events-docs-2026-06-10.md](../content-roadmap-blog-events-docs-2026-06-10.md) | (기존) |
| 챗봇 지식 원천 | [lib/docs.ts](../../../lib/docs.ts) `DocArticle[]` (+ kb-audit) | ✅ |

### ④ 기타 참고 — 제품·세그먼트·도입
| 항목 | SSOT | 상태 |
| --- | --- | --- |
| 제품·기능명·하드웨어 | [classin-software-feature-inventory.md](../classin-software-feature-inventory.md) | ✅ 자기선언 SSOT |
| HW 안전·매뉴얼 | [classin-board-s-series-safe-manual-guidelines.md](../classin-board-s-series-safe-manual-guidelines.md) | ✅ |
| 도입 전 22질문 | [classin-pre-adoption-question-matrix-2026-06-18.md](../classin-pre-adoption-question-matrix-2026-06-18.md) | ✅ |
| ICP·세그먼트 | 이 문서 §5 | 🟡 학원유형축 미정 |

## 2. 운영 규칙 (드리프트 방지)
1. **관심사 1개 = SSOT 1개.** 같은 사실/값을 두 곳에 캐논으로 중복 기재하지 않는다.
2. **규칙 vs 값 분리** — 메시지 *규칙*은 `positioning-guidelines.md`, 렌더되는 *literal 값*은 `lib/classin-positioning.ts`. 문서는 값을 재기재하지 말고 코드 상수를 참조한다.
3. **표면은 참조만.** 홈/블로그/문서/이벤트/이메일/챗봇은 위 SSOT를 따르고 자체 캐논을 만들지 않는다.
4. **수치 단정 금지** — 가격·기관 수·밸류·모델 스펙은 [company-facts.md](./company-facts.md) 등급 또는 "상담 확인"으로만.
5. **회사 수치 임의 하향 금지** — 회사 자체 소개는 EEO 공식 자기소개를 따른다(외부 DB로 낮추지 말 것).

## 3. 확정 결정
- **카테고리명 = "수업 시스템 OS"** (학원 시스템 OS 폐기). 라이브 코드·문서 동기화 완료, 역사 스펙 2건만 보존.
- **보이스 = 표면별 톤 레인지** ([voice-charter.md](./voice-charter.md)). 홈=긴장 허용 / 지원·문서=안심.
- **회사 팩트 = EEO 공식 미러** ([company-facts.md](./company-facts.md)) — 시리즈 D 유니콘·$500M+·5,000만+·160+개국. 외부 DB의 시리즈 C $265M은 맥락으로만. $30B 거짓.
- **표시광고법 안전장치** — 회사 수치에 "전 세계 누적·EEO 공식 기준" 출처 표기 적용(2026-06-29).
- **카테고리 정합(O1)** — 한국 1차 카테고리 = "수업 시스템 OS". 글로벌 "올인원 하이브리드 학습 플랫폼"은 보조 설명어로만.
- **제품 노출(O3)** — EEO 5제품군(ClassIn·X·NOBOOK·TeacherIn·FlowIn)은 글로벌 위상으로 현행 노출 유지. 한국 실판매 = 전자칠판 + SW(구독/충전).
- **"유니콘"(O4)** — classin.com 출처표기로 유지. 조건: EEO 실증자료(IR/확인서) 별도 확보·보관(미완).

## 4. 열린 결정 (OPEN)
> O1~O4는 2026-06-29 확정 → §3·§5. 남은 건 *작업*이다.

| # | 영역 | 할 것 | 현 상태 |
| --- | --- | --- | --- |
| O5 | 컨텐츠 | 블로그·이벤트·이메일 실카피 **보이스 감사** + 프랜차이즈·온라인 **사례 확보** | 헌장 소속만 지정, 실제 정합·사례 미착수 |
| O6 | 브랜드 | 홈 공포·손실 소구가 **검증된 전략인지** 확인 | canon에 의도된 분기로 박음 — A/B·의도 확인 필요 |

## 5. 세그먼트 (3레이어 + ICP)
| 레이어 | 정의 | 원천 |
| --- | --- | --- |
| 구매자(1순위) | 학원 원장·관리자·실장·운영책임자 | positioning §2 |
| 사용 역할 | 관리자·강사·학생·학부모 | `components/sections/Outcomes.tsx` |
| 인텐트(퍼널) | 가격방어·운영관리·API·일정·쇼룸·설치·사례·리스크제거 | `lead-magnets.json` salesPlaybook |

> **1차 ICP = 좁히지 않음 (2026-06-29 결정).** 주요 타입: ① 중·고등 입시/교과 보습(현 사례 다수) ② 대형 프랜차이즈·다지점 ③ 온라인 학원. 규모·형태축으로 메시지·CTA·HW 추천은 분기하되 단일 세그먼트로 좁히지 않는다. ⚠️ 콘텐츠 갭: 프랜차이즈·온라인 사례 0개 → 확보 후속(O5).

## 6. 변경 시 체크리스트
- [ ] 포지셔닝 *규칙* 변경 → `positioning-guidelines.md`
- [ ] 카테고리명/히어로 *값* 변경 → `lib/classin-positioning.ts` (문서는 참조만)
- [ ] 보이스/톤 변경 → `voice-charter.md` + 해당 표면
- [ ] 회사 수치 변경 → `company-facts.md` (출처 갱신) → `app/about`·`GlobalScale`
- [ ] 기능명 변경 → `feature-inventory.md` → `lib/docs.ts` (+ 챗봇 재임베딩)
- [ ] 리드마그넷 변경 → `lead-magnets.json` + positioning §9 라우팅 확인
