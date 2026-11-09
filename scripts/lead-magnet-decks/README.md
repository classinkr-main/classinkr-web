# 리드마그넷 16:9 HTML 덱 (ClassIn 원장 노트)

`data/lead-magnets.json`의 리드마그넷 16종을 16:9 인터랙티브 HTML 덱으로 만든다. 결과물은 글꼴까지 넣은 단일 HTML 파일이라 메일 첨부, 링크 공유, 상담 화면 공유에 그대로 쓴다.

- 결과물: `public/materials/lead-magnets/decks/<slug>.html`, 서가 `index.html`, 표지 썸네일 `thumbs/<slug>.webp`
- 광고 소재(4:5): `docs/reports/lead-magnet-decks/ads/`
- 실행 기록과 심사 결과: `docs/reports/lead-magnet-decks/2026-11-10-loop.md`

## 정본

| 무엇 | 어디 |
| --- | --- |
| 문항·점수 구간·실행 플랜·스크립트·사례·준비물 | `data/lead-magnets.json` (사이트 자료실과 같은 정본) |
| 표지·후킹 카피, 시리즈 번호, 퍼널 단계 | `content.py` `OV` |
| 플래그십 전용 장(Before·After, 비교 단위, 정직한 범위, 쇼룸 30분) | `content.py` `EXTRAS` |
| 캠페인 대표 3권 | `content.py` `PICKS` |
| 디자인(종이·먹·초록 하나, 모바일 재배치, 인쇄) | `assets/deck.css` |
| 화면 맞춤·넘기기·자가진단 점수·계산표·복사 | `assets/deck.js` |

카피 규칙은 `content.py` 머리말과 `docs/active/brand-canon/`을 따른다. 미검증 수치·가격·국내 도입 수·보장 표현을 쓰지 않고, 사례 학원명은 JSON 의 가린 이름만 쓴다.

## 만들기

```bash
python3 scripts/lead-magnet-decks/build.py
```

```bash
node scripts/lead-magnet-decks/qa.mjs public/materials/lead-magnets/decks/*.html --shots /tmp/lm-shots --click
```

```bash
python3 scripts/lead-magnet-decks/build.py --thumbs-from /tmp/lm-shots --index
```

```bash
python3 scripts/lead-magnet-decks/creatives.py --out docs/reports/lead-magnet-decks/ads
```

- 필요한 것: Python 3 + `fonttools`·`brotli`·`Pillow`(글꼴 부분 집합·썸네일), `node_modules/pretendard`(글꼴 원본), Playwright(QA·스크린샷).
- `qa.mjs`는 슬라이드마다 1920×1080 스크린샷을 찍고 본문 영역을 넘치는 요소를 찾는다. `QA: no overflow issues`가 나와야 한다. `--pdf`를 붙이면 16:9 PDF도 만든다.
- 광고 소재 PNG 는 `creatives.py`가 만든 HTML 을 1080×1350 으로 찍어 만든다(실행 기록의 명령 참고).

## 덱 구성

표지 → 후킹(장면) → 이 자료 사용법 → (이야기) → (플래그십 전용 장) → 자가진단 영역별 → 레드 플래그(체크) → 결과 → 상담용 한 장 → (워크시트·사례·스크립트) → 실행 플랜 → (쇼룸 30분) → 다음 한 걸음.

- 체크·입력은 보는 사람의 브라우저(`localStorage`)에만 저장하고 어디에도 보내지 않는다.
- 폭 760px 이하에서는 슬라이드를 세로 카드로 다시 흘린다(메타·인스타 유입 대비).
- 인쇄는 1920×1080 한 장씩, 어두운 장은 종이색으로 바뀐다.
- 상담·쇼룸 링크에는 `utm_source=lead_magnet&utm_medium=deck&utm_campaign=<slug>`가 붙는다.
