# ClassIn Insight 시리즈 (체크리스트가 아닌 16:9 리드마그넷)

원장 노트 16권(체크리스트·워크시트, `../README.md`)과 따로 만든 2차 시리즈다. 형식마다 디자인 언어를 따로 잡고, 사이트 디자인 규칙 대신 발표 자료(PT)형 레이아웃을 쓴다.

- 결과물: `public/materials/lead-magnets/insight/<slug>.html`, 서가 `index.html`, 표지 썸네일 `thumbs/<slug>.webp`
- 심사 기록: `docs/reports/lead-magnet-decks/2026-11-10-insight-r2.md`

## 여섯 가지 형식

| slug | 형식 | 테마 | 참고한 레퍼런스 |
| --- | --- | --- | --- |
| `academy-operations-report-2027` | 리포트·백서 | `report` 먹·베이지·민트, 압축 디스플레이 | HubSpot State of Sales |
| `2028-admissions-reform-brief` | 데이터 브리핑 | `brief` 원색 파랑 전면, 육각 패턴 | 검색 데이터 활용 가이드북 |
| `academy-briefing-summary` | 행사 요약집 | `summit` 숲색 그라데이션, 과제·해결·효과 | Dreamforce 핵심요약집 |
| `parent-consult-closing-guide` | 대화형 가이드 | `guide` 크림·코랄·네이비, 세리프 | Sales Closing Guide |
| `academy-operation-type-test` | 퀴즈·진단 | `play` 원색 블록 | 리드 마그넷 유형: 퀴즈 |
| `academy-2027-operation-planner` | 템플릿·도구 | `planner` 점 격자·라임, 탭 | 리드 마그넷 유형: 템플릿 |

## 정본

| 무엇 | 어디 |
| --- | --- |
| 덱 원고(장 순서·문구·출처) | `decks/<slug>.py` 의 `DECK` |
| 레이아웃(표지·목차·오프너·핵심 발견·큰 숫자·차트·누적 막대·도넛·과제/해결/효과·토크 트랙·매트릭스·퀴즈·입력 양식 등) | `engine.py` 의 렌더러 표 `R` |
| 디자인 토큰·테마 6종·모바일 재배치·인쇄 | `insight.css` |
| 넘기기·퀴즈 채점·입력 저장·한 장 요약·복사 | `insight.js` |
| 서가 대표 3종 | `engine.py` `PICKS` |

## 원고 규칙

- 숫자는 공식 원문에서 확인한 값만 쓰고 장마다 꼬리말에 출처를 단다. 해석 문장은 **ClassIn 해석**으로 표시한다.
- 확인하지 못한 수치(국세청 사업자 수 인용치, KESS 강사 수 등)는 쓰지 않는다.
- 대화·장면은 예시임을 밝히고, 학생·학원 이름은 `[학생]`처럼 자리 표시로 둔다.
- 가격·할인·도입 수·성적/재등록 보장 표현을 쓰지 않는다. 도입 기간은 "보통 3~4개월, 넓은 기관은 6개월~1년".
- 실제 화면은 `public/images/home/` 의 공개 이미지만 쓴다(이름·영상 흐림 처리된 것).

## 만들기

```bash
python3 scripts/lead-magnet-decks/insight/engine.py
```

```bash
node scripts/lead-magnet-decks/qa.mjs public/materials/lead-magnets/insight/*.html --shots /tmp/ins-shots
```

```bash
python3 scripts/lead-magnet-decks/insight/engine.py --thumbs-from /tmp/ins-shots --index
```

- 테마 글꼴(Anton·Black Han Sans·Hahmlet·Archivo, 모두 OFL)은 처음 빌드할 때 Google Fonts 저장소에서 `fonts/` 로 내려받아(커밋하지 않음) 덱에 쓰인 글자만 부분 집합으로 넣는다. 본문은 `node_modules/pretendard`.
- `qa.mjs` 가 `QA: no overflow issues` 를 내야 한다. `--pdf` 를 붙이면 16:9 PDF 도 만든다.
- 퀴즈 결과·템플릿 요약은 보는 사람의 브라우저(`localStorage`)에만 저장된다.
