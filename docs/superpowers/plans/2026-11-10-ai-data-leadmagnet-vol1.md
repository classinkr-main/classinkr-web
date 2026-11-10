# 리드마그넷 1권 「AI와 데이터로 학원 운영하기」 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리드마그넷 `academy-ai-data-ops-guide`(JSON 항목 + 12쪽 e-book PDF)를 공개 자료실에 올리고, 블로그 1편과 쇼츠 대본 3개를 붙인다.

**Architecture:** 저장소에 이미 있는 "e-book 인쇄 원본" 경로를 그대로 쓴다 — `scripts/lead-magnet-ebooks/<slug>.html`이 있으면 `scripts/render-lead-magnet-workbook-pdf.mjs`가 그 HTML을 Chromium으로 찍는다(`/* FONT_CSS */` 치환, `src="/…"`→file://, `href="/…"`→utm 절대주소). 슬러그는 `lib/lead-magnet-pdf/workbook-slugs.mjs`(정본)·`scripts/generate-lead-magnet-pdfs.py`(건너뛰기) 두 곳에 등록한다. 앱 코드·스키마 변경 없음.

**Tech Stack:** Next.js 저장소, `data/lead-magnets.json`(로컬 JSON ↔ 운영 Supabase), Node ESM 스크립트, Chromium(설치된 Chrome, `LEAD_MAGNET_PDF_CHANNEL=chrome`), vitest.

**설계 정본:** `docs/superpowers/specs/2026-11-10-ai-data-leadmagnet-series-design.md` · 문안·디자인 목업 `tmp/ref-design/mock4.html` + `style3.css`(gitignore 대상이라 Task 3에서 저장소 안으로 옮긴다).

---

## 파일 구조

| 파일 | 역할 | 작업 |
| --- | --- | --- |
| `lib/lead-magnet-pdf/workbook-slugs.mjs` | 따로 만든 PDF 슬러그 정본(앱·테스트·렌더러가 import) | 슬러그 추가 |
| `scripts/generate-lead-magnet-pdfs.py:26` | 파이썬 생성기 건너뛰기 목록(테스트가 정본과 대조) | 슬러그 추가 |
| `data/lead-magnets.json` | 자료 메타·문안(공개 페이지·게이트·CRM·워크북 폴백이 읽음) | 항목 1개 추가 |
| `scripts/lead-magnet-ebooks/academy-ai-data-ops-guide.html` | 12쪽 인쇄 원본(단일 HTML, 스타일 인라인) | 신규 |
| `public/materials/lead-magnets/academy-ai-data-ops-guide.pdf` | 렌더 결과(정적 배포본) | 생성 |
| `public/materials/lead-magnets/academy-ai-data-ops-guide-board.xlsx` | 월요일 보드 + 신호 4열 워크시트 | 신규 |
| `data/blog-posts.json` | 블로그 글 1편(draft, `leadMagnetSlug` 연결) | 항목 1개 추가 |
| `docs/active/content-hook-lab/shorts-ai-data-ops-guide-2026-11.md` | 쇼츠 대본 3개 | 신규 |
| `docs/active/content-hook-lab/ledger/tofu.md` | 명예의 전당에 NEW 리드마그넷 등록 | 1행 추가 |
| `tests/lead-magnets/ebook-ai-data-ops-guide.test.ts` | 인쇄 원본 계약 테스트(쪽수·금지 표현·링크 규칙) | 신규 |

---

### Task 1: 슬러그 등록 (정본 + 파이썬 건너뛰기)

**Files:**
- Modify: `lib/lead-magnet-pdf/workbook-slugs.mjs:5`
- Modify: `scripts/generate-lead-magnet-pdfs.py:26`
- Test: `tests/scripts/lead-magnet-workbook-pdf.test.ts` (기존 — 두 목록이 같은지 대조)

- [ ] **Step 1: 기존 테스트가 현재 통과하는지 확인**

Run: `npx vitest run tests/scripts/lead-magnet-workbook-pdf.test.ts`
Expected: 4 passed

- [ ] **Step 2: 정본에 슬러그 추가**

`lib/lead-magnet-pdf/workbook-slugs.mjs` 5행을 이렇게 바꾼다.

```js
export const WORKBOOK_SLUGS = [
  "academy-system-checklist",
  "electronic-whiteboard-classroom-checklist",
  "academy-ai-data-ops-guide",
]
```

- [ ] **Step 3: 테스트가 실패하는지 확인 (파이썬 목록 불일치 + JSON에 자료 없음)**

Run: `npx vitest run tests/scripts/lead-magnet-workbook-pdf.test.ts`
Expected: FAIL — "파이썬 생성기는 워크북 자료를 건너뛰어…" 불일치, 그리고 `academy-ai-data-ops-guide` 케이스가 `bySlug.get(slug)!` undefined로 실패

- [ ] **Step 4: 파이썬 목록에 추가**

`scripts/generate-lead-magnet-pdfs.py` 26행:

```python
WORKBOOK_SLUGS = {"academy-system-checklist", "electronic-whiteboard-classroom-checklist", "academy-ai-data-ops-guide"}
```

- [ ] **Step 5: 파이썬 대조 테스트만 통과하는지 확인**

Run: `npx vitest run tests/scripts/lead-magnet-workbook-pdf.test.ts -t "파이썬"`
Expected: 1 passed (나머지 실패는 Task 2에서 JSON 항목이 들어가면 풀린다)

- [ ] **Step 6: 커밋**

```bash
git add lib/lead-magnet-pdf/workbook-slugs.mjs scripts/generate-lead-magnet-pdfs.py
git commit -m "chore(resources): academy-ai-data-ops-guide 를 따로 만드는 PDF 목록에 등록"
```

---

### Task 2: `data/lead-magnets.json` 항목

**Files:**
- Modify: `data/lead-magnets.json` (배열 끝에 객체 1개 추가)
- Test: `tests/scripts/lead-magnet-workbook-pdf.test.ts` (워크북 폴백 빌드가 성공해야 함: 각 section ≤7문항)

JSON 항목은 `lib/lead-magnets.ts`의 `LeadMagnet` 인터페이스를 따른다. 문안은 목업 v4 정본. 아래를 그대로 넣는다.

- [ ] **Step 1: 항목 추가**

`data/lead-magnets.json` 배열의 마지막 객체 뒤에 쉼표를 붙이고 추가:

```json
{
  "slug": "academy-ai-data-ops-guide",
  "title": "AI와 데이터로 학원 운영하기",
  "audience": "강사 3~30명 학원 원장·실장. 출결·수납은 관리 프로그램으로 처리 중이고, ChatGPT로 문제나 문자를 만들어 본 적이 있는 분",
  "status": "review",
  "gate": "email",
  "tier": "advanced",
  "category": "operations",
  "published": true,
  "sourceDetail": "lead_magnet:academy-ai-data-ops-guide",
  "summary": "관리 프로그램에 숫자는 이미 쌓여 있습니다. 매주 무엇을 볼지, AI를 어디에 쓰고 어디에 쓰지 않을지 정하는 가이드입니다. 10문항 진단으로 우리 학원의 AI 단계를 확인하고, 월요일 보드·학생 AI 규칙·출제 템플릿·원장 주간 루틴을 받아 갑니다.",
  "formatLabel": "10문항 진단 + 월요일 보드 + 학생 AI 규칙 + 출제 템플릿 + 프롬프트 2종",
  "estimatedMinutes": 10,
  "blogTone": "학생에게 AI를 금지만 해 둔 원장, 강사마다 따로 쓰는 ChatGPT, 개인 PC에 쌓이는 문제 파일을 먼저 인정합니다. 도구를 늘리자는 이야기가 아니라, 지금 있는 숫자와 AI를 규칙과 루틴으로 묶자는 관점으로 씁니다.",
  "guideTone": "짧은 문장. 한 문장에 한 가지. 라벨은 '지금 / 방법 / 이번 주'. 출처는 숫자에만 붙이고 이름을 나열하지 않습니다.",
  "checklistBullets": [
    "학생 AI 규칙이 글로 있고, 언제 되고 언제 안 되는지 적혀 있는가",
    "문제 만드는 프롬프트가 개인이 아니라 학원 템플릿으로 있는가",
    "AI로 만든 문제가 공유 폴더나 LMS에 쌓이는가",
    "원장이 매주 AI로 하는 일이 하나 이상 정해져 있는가",
    "AI가 낸 결과를 원본과 대조하는 사람이 있는가"
  ],
  "sections": [
    {
      "title": "A. 학생·강사 규칙",
      "description": "해당하면 한 칸. 애매하면 비웁니다.",
      "items": [
        "학생 AI 규칙이 글로 있다. 언제 되고(개념 질문·오답 설명) 언제 안 되는지(제출 과제) 적혀 있다.",
        "강사들이 AI로 하는 일(출제·채점 초안·문자)을 서로 안다.",
        "학생에게 \"쓰지 마\"가 아니라 \"이렇게 써라\"를 말한 적이 있다."
      ]
    },
    {
      "title": "B. 자산·템플릿",
      "description": "강사 개인이 아니라 학원에 남는가를 봅니다.",
      "items": [
        "문제 만드는 프롬프트가 학원 템플릿으로 있다. 과목·난이도·형식·검수 기준이 들어 있다.",
        "AI로 만든 문제가 공유 폴더나 LMS에 쌓인다. 강사 개인 PC에만 있지 않다.",
        "학부모 문자·월말 보고 템플릿이 있고, AI 초안은 강사가 고친 뒤 보낸다.",
        "AI에 넣기 전 지우는 항목(이름·연락처·가정사)이 정해져 있다."
      ]
    },
    {
      "title": "C. 원장 루틴",
      "description": "원장 일정에 AI가 들어 있는가를 봅니다.",
      "items": [
        "원장이 매주 AI로 하는 일이 하나 이상 정해져 있다.",
        "상담 기록이 사실·숫자·날짜로 남는다. 나중에 AI에 넣어 정리할 수 있다.",
        "AI가 낸 결과를 원본과 대조하는 사람이 정해져 있다."
      ]
    }
  ],
  "scoreBands": [
    { "range": "0단계", "label": "금지·방치", "description": "두 묶음 이상이 0칸. 학생에겐 쓰지 말라 하고, 강사는 각자 쓰고, 원장은 안 씁니다. 5-1 학생 규칙 세 줄부터." },
    { "range": "1단계", "label": "개인 도구", "description": "가장 많습니다. B가 비어 있습니다. 문제와 문자는 만들지만 개인 계정·개인 PC에 남습니다. 5-2 출제 템플릿 1호부터." },
    { "range": "2단계", "label": "자산·템플릿", "description": "B는 있고 C가 비어 있습니다. 누가 해도 결과가 같지만 원장 일정에는 없습니다. 5-3 주간 루틴부터." },
    { "range": "3단계", "label": "시스템·루틴", "description": "세 묶음 모두 2칸 이상. 숫자가 매주 AI 분석과 면담에 쓰입니다. 2권 학습관리로." }
  ],
  "redFlags": [
    "감시로 시작합니다. 강사 영상·AI 분석을 평가와 분리한다고 먼저 말하지 않으면 다음 단계가 없습니다.",
    "학생에게 AI를 금지만 합니다. 규칙이 없으면 답 베끼기만 남습니다.",
    "강사 개인 계정에 자산이 쌓입니다. 퇴사하면 프롬프트와 문제가 같이 나갑니다.",
    "상담 노트 원문을 AI에 통째로 넣습니다. 이름·연락처·가정사를 지운 사실만 넣습니다.",
    "\"이 학생 퇴원할까?\" 같은 예측에 기댑니다. AI는 점검 순서만 정합니다."
  ],
  "actionPlan": [
    { "day": "1주", "title": "월요일 보드", "tasks": ["보드 다섯 칸(재원생 증감·상담→등록·퇴원·휴원과 사유·표시된 학생·강사 면담)을 정하고 이번 주 값만 채웁니다.", "관리 프로그램에서 출결·과제를 엑셀로 내보내 신호 4열과 수식 한 줄을 넣습니다."] },
    { "day": "2주", "title": "학생 AI 규칙 세 줄 · 출제 템플릿 1호", "tasks": ["돼요 / 안 돼요 / 표시해요 세 줄을 교실에 붙이고 학부모에게 문자 한 통을 보냅니다.", "가장 잘 쓰는 강사의 프롬프트를 받아 학원 템플릿 1호로 저장합니다."] },
    { "day": "3주", "title": "강사 면담 20분", "tasks": ["강사가 고른 수업 영상 5분을 같이 보고, 다음 수업에서 바꿀 것 하나를 정합니다.", "평가와 분리한다고 먼저 말합니다."] },
    { "day": "4주", "title": "원장 AI 루틴 첫 실행", "tasks": ["비식별한 표로 운영 분석 프롬프트를 한 번 돌립니다.", "나온 행동 두 개를 보드 옆에 적고 4주 뒤 숫자로 확인합니다."] }
  ],
  "deliverables": [
    "10문항 진단과 AI 4단계 판정표",
    "월요일 보드 다섯 칸과 퇴원보다 먼저 오는 신호 네 개(엑셀 파일)",
    "강사 면담 20분 순서와 피드백 문장",
    "학생 AI 규칙 표(돼요·안 돼요·표시해요)와 학부모 안내 문장",
    "출제 템플릿 1호와 검수 네 칸, 문제 은행 폴더 규칙",
    "원장 주간 AI 루틴 세 가지와 프롬프트 2종(운영 분석·월말 보고 초안)",
    "AI에 넣기 전 지우는 세 가지"
  ],
  "consultationPrep": [
    "진단에서 비어 있는 묶음(A·B·C)과 우리 학원 단계",
    "월요일 보드를 채운 4주 분",
    "표시된 학생 수와 그중 연락한 수",
    "강사 면담에서 정한 액션스텝 한 가지",
    "출제 템플릿 1호로 만든 문제 수"
  ],
  "sourceLinks": [
    { "label": "학습 데이터 — 관리자 화면", "href": "/docs/software/admin-monitoring-analytics", "description": "출석·녹화·과제 상태가 수업과 동시에 쌓입니다. 보드의 신호 네 개 중 세 개가 내보내기 없이 보입니다." },
    { "label": "AI 기능 소개서", "href": "/classin-ai-feature-guide.html", "description": "AI 강의 분석(강사가 먼저 자기 수업을 봅니다)·AI 출제·AgentIn 학생 권한." },
    { "label": "목동 쇼룸", "href": "/showroom", "description": "우리 반 자료 하나로 녹화 → 리포트 → 면담까지 30분." },
    { "label": "강사 온보딩·EDB 교안 표준화 SOP", "href": "/resources/teacher-edb-onboarding-sop-kit", "description": "강사가 바뀌어도 남는 교안과 온보딩 순서." }
  ],
  "storyGuide": {
    "eyebrow": "왜 지금",
    "title": "학원은 늘고, 학생은 줄었습니다",
    "body": "학원 사업자는 8.3만에서 13.2만으로 56% 늘었고, 초중고 학생은 2.3% 줄었습니다. 학부모가 학원을 고를 때 1순위는 강사(80.9%)입니다. 그런데 강사가 잘 가르치는지는 대개 숫자가 아니라 인상으로 남습니다. 이 가이드는 그 인상을 매주 볼 수 있는 숫자로 바꾸고, AI를 규칙과 루틴으로 묶는 법입니다. 수납·출결처럼 관리 프로그램이 이미 알려주는 것은 뺐습니다.",
    "beats": [
      "02 진단 — 우리 학원의 AI는 챗봇인가 시스템인가. 10문항, 4단계.",
      "03 월요일 30분 — 숫자 다섯 개, 퇴원보다 먼저 오는 신호 네 개, 짝 지표.",
      "04 강사 면담 20분 — 강사가 찍고, 강사가 고르고, 평가와 분리한다.",
      "05 AI를 시스템으로 — 학생 규칙 세 칸, 출제 템플릿 1호, 원장 주간 루틴."
    ],
    "takeaway": "여기까지는 지금 쓰는 도구로 됩니다. 그다음은 수업 안의 데이터입니다."
  },
  "scriptSamples": [
    {
      "scenario": "강사 면담 — 피드백 한 문장",
      "good": "3교시 15분 중 11분을 설명에 쓰셨어요. 뒤 두 명이 필기를 멈췄습니다. 다음 주엔 7분마다 질문 하나 넣어 볼까요? 제가 뭘 도우면 될까요?",
      "avoid": "수업이 좀 일방적인 것 같아요. 학생들이 지루해해요.",
      "why": "사실 없는 인상은 방어를 부릅니다. 부탁 없는 지적은 바뀌지 않습니다. 사실 · 영향 · 부탁 · 지지 순서."
    },
    {
      "scenario": "학부모 안내 — 학생 AI 규칙",
      "good": "[학원명]은 AI를 금지하지 않고 규칙으로 씁니다. 개념 질문과 오답 비교에는 쓰고, 제출 과제와 시험에는 쓰지 않습니다. AI 도움을 받은 곳은 아이가 스스로 표시합니다. 규칙은 교실에 붙어 있습니다. 가정에서도 같은 기준으로 봐 주시면 됩니다.",
      "avoid": "우리 학원은 AI 사용을 금지합니다.",
      "why": "학생은 이미 쓰고 있습니다. 금지만 있으면 답 베끼기만 남습니다."
    },
    {
      "scenario": "프롬프트 1 — 운영 분석(비식별한 표를 통째로 붙여 넣는다)",
      "good": "역할: 학원 운영 컨설턴트. 아래는 최근 4주 표다. 열: 학생번호 / 주차 / 결석 연속 / 숙제 미제출(월) / 상담 답장 시간(h) / 성적 변화 / 표시. 해 줄 것: ① 한 줄 요약 ② 눈에 띄는 학생 3명과 근거가 된 행 ③ 이번 주 할 행동 2개(담당·기한) ④ 확신 없는 부분. 하지 말 것: 평균·합계 계산(엑셀 값이 정답), 학생 개인 평가, 없는 데이터 추정. 표: [붙여넣기]",
      "why": "숫자는 엑셀이, 해석은 AI가. ②의 행 번호를 원본에서 직접 확인하고, 틀리면 그 답은 버립니다."
    },
    {
      "scenario": "프롬프트 2 — 월말 보고 초안(보내기 전 강사가 고친다)",
      "good": "역할: 담임 강사. 아래 사실만으로 학부모 월말 보고를 5문장으로. 사실: 출석 11/12 · 숙제 9/10 · 단원평가 72 → 81 · 오답 다시 푼 횟수 14 · 다음 달: 서술형 1문항. 규칙: 점수보다 변화를 먼저. 없는 사실 금지. 칭찬 1 · 사실 2 · 다음 달 1 · 질문 1.",
      "why": "사실 줄에 없는 내용은 쓰지 않습니다. 이름·연락처는 넣지 않습니다."
    },
    {
      "scenario": "출제 템플릿 1호([ ] 안만 바꾼다 · 검수 전 배포 금지)",
      "good": "역할: [중2 수학] 출제자. 우리 학원 기준: 풀이 과정을 쓰게 하는 문제, 함정 선지 없음, 계산보다 개념. 단원: [일차함수 — 기울기와 절편]. 난이도: [중 — 교과서 응용]. 형식: [서술형 2 · 객관식 3]. 규칙: 문제마다 정답·풀이·채점 기준(부분 점수). 오답 선지는 흔한 오개념에서. 숫자는 손으로 풀 수 있게. 교과서 밖 용어 금지. 출력: 표로 — 번호 / 문제 / 정답 / 풀이 / 채점 기준 / 확인하는 개념",
      "why": "검수 네 칸 — 정답이 맞는가(직접 푼다) · 오답 선지가 그럴듯한가 · 교과서 용어인가 · 채점 기준이 부분 점수를 가르는가. 통과한 것만 문제 은행에."
    }
  ],
  "salesPlaybook": {
    "intentScore": 25,
    "intentLabel": "AI·운영 관심 리드",
    "ownerNote": "쇼츠·블로그에서 들어온 TOFU 리드입니다. 제품 이야기 전에 진단 결과를 묻습니다. A·B·C 중 어느 묶음이 비었는지, 단계가 몇인지로 다음 자료와 쇼룸 제안을 정합니다. 가격·무료 50회의 AI 포함 여부는 말하지 않습니다(제품팀 확인 전).",
    "firstResponse": "가이드 신청 감사합니다. 진단에서 A(규칙)·B(자산)·C(루틴) 중 어느 묶음이 비어 있었나요? 그것만 알려 주시면 먼저 손댈 한 가지를 정리해 드릴게요.",
    "qualificationQuestions": [
      "진단에서 비어 있던 묶음과 단계는?",
      "학생 AI 규칙이 지금 있나요, 금지만 있나요?",
      "강사들이 문제를 어디에 저장하나요(개인 PC / 공유 폴더 / LMS)?",
      "월요일 보드를 몇 주 채웠나요?",
      "강사 면담 때 수업 기록을 근거로 쓴 적이 있나요?"
    ],
    "followUpSequence": [
      { "day": "D+0", "title": "묶음 묻기", "tasks": ["자료 링크와 함께 비어 있는 묶음을 묻습니다.", "AI·운영 관심 리드 태그를 붙입니다."] },
      { "day": "D+2", "title": "한 가지 정리", "tasks": ["비어 있는 묶음의 장(5-1 / 5-2 / 5-3)과 이번 주 할 일 하나를 보냅니다.", "B가 비었으면 강사 온보딩·EDB SOP 자료를 함께 보냅니다."] },
      { "day": "D+5", "title": "쇼룸 제안", "tasks": ["우리 반 자료 하나로 녹화 → 리포트 → 면담 장면을 30분 안에 보는 쇼룸을 제안합니다.", "보드 4주 분을 가져오면 신호 네 개를 ClassIn 화면에서 같이 봅니다."] }
    ],
    "nextCtas": [
      "목동 쇼룸 30분(우리 반 자료 하나로 녹화 → 리포트 → 면담)",
      "무료로 시작(반 하나, 4주)",
      "2권 학습관리 편 전달",
      "강사 온보딩·EDB SOP 전달"
    ]
  },
  "ctaCopy": {
    "eyebrow": "원장을 위한 실무 가이드 1권",
    "title": "우리 학원의 AI, 챗봇인가 시스템인가",
    "body": "10문항으로 단계를 확인하고, 월요일 보드·학생 AI 규칙·출제 템플릿·원장 주간 루틴을 받아 가세요. 지금 쓰는 도구 그대로 다음 주 월요일부터 시작됩니다.",
    "buttonLabel": "가이드 받기"
  },
  "resourceUrl": "/materials/lead-magnets/academy-ai-data-ops-guide.pdf",
  "suggestedPlacements": [
    "쇼츠 3편(학생 AI 규칙 / 월요일 숫자 다섯 개 / 강사 프롬프트) 고정 댓글·링크",
    "블로그 '학생한테 AI 쓰지 말라고만 하셨나요' 하단 게이트",
    "Meta 리드 광고 후속 문자(AI·운영 관심)",
    "설명회·세미나 참석자 후속 문자와 현장 QR",
    "챗봇의 AI 활용·운영 질문 응답",
    "CRM 리드 태그: AI·운영 관심"
  ],
  "pdfGuide": {
    "subtitle": "관리 프로그램에 쌓인 숫자와 AI를, 월요일 30분 루틴으로 묶는 법",
    "outcome": "10문항으로 우리 학원의 AI 단계를 확인하고, 월요일 보드·학생 AI 규칙·출제 템플릿·원장 주간 루틴을 다음 주부터 씁니다.",
    "bestUsedWhen": [
      "학생에게 AI를 금지만 해 두었을 때",
      "강사마다 따로 ChatGPT를 쓰고 문제가 개인 PC에 쌓일 때",
      "퇴원이 생기고 나서야 알고, 매주 같은 숫자를 보지 않을 때"
    ],
    "howToUse": [
      "02 진단 10문항을 채우고 비어 있는 묶음을 찾습니다.",
      "비어 있는 묶음의 장을 먼저 읽고 '이번 주' 하나만 고릅니다.",
      "4주 뒤 보드와 표시된 학생 수로 확인합니다."
    ],
    "discussionPrompts": [
      "지난주에 숫자를 몇 개 보셨습니까?",
      "강사가 만든 문제는 지금 어디에 있습니까?",
      "학생에게 AI를 어디까지 허용했습니까?"
    ],
    "relatedMagnets": [
      "teacher-edb-onboarding-sop-kit",
      "academy-system-checklist",
      "classroom-recording-replay-setup-guide"
    ],
    "consultationCtas": [
      { "label": "목동 쇼룸 30분 예약", "href": "/showroom", "description": "우리 반 자료 하나로 녹화 → 리포트 → 면담까지 봅니다." },
      { "label": "무료로 시작하기", "href": "/contact#contact-form", "description": "반 하나, 4주. 범위와 가격은 상담에서 학원 숫자로 계산합니다." }
    ],
    "expertNote": "학원 사업자 +56%(8.3만 → 13.2만, 국세청), 초중고 학생 −2.3%(교육부 2025 교육기본통계), 학원 선택 기준 1위 강사진의 역량 80.9%(에듀베이션 학부모 1,550명 설문, 2024.6). 학원 적용 기준(신호 네 개·단계 구분)은 이 가이드가 정한 출발점이며 보장이 아닙니다."
  }
}
```

- [ ] **Step 2: JSON 문법 확인**

Run: `node -e "const d=require('./data/lead-magnets.json'); const m=d.find(x=>x.slug==='academy-ai-data-ops-guide'); console.log(d.length, m.sections.map(s=>s.items.length), m.scoreBands.length)"`
Expected: `17 [ 3, 4, 3 ] 4`

- [ ] **Step 3: 워크북 테스트 통과 확인 (폴백 빌드 + 파이썬 대조)**

Run: `npx vitest run tests/scripts/lead-magnet-workbook-pdf.test.ts`
Expected: 6 passed (슬러그 3개 × each + 3)

- [ ] **Step 4: 공개 페이지에서 보이는지 확인**

Run: `npm run dev` 후 브라우저로 `http://localhost:3888/resources/academy-ai-data-ops-guide`
Expected: 제목·10문항·4단계·CTA가 보이고, 다운로드 폼이 뜬다(PDF는 아직 없어 "이메일로 보내드립니다" 안내 또는 404 — Task 4에서 해결)

- [ ] **Step 5: 커밋**

```bash
git add data/lead-magnets.json
git commit -m "feat(resources): 리드마그넷 「AI와 데이터로 학원 운영하기」 항목 추가"
```

---

### Task 3: 인쇄 원본 HTML (12쪽)

**Files:**
- Create: `scripts/lead-magnet-ebooks/academy-ai-data-ops-guide.html`
- Source: `tmp/ref-design/mock4.html`, `tmp/ref-design/style3.css`, 01장·04장은 `tmp/ref-design/mock3.html`의 3-1·코칭 페이지 구조
- Test: `tests/lead-magnets/ebook-ai-data-ops-guide.test.ts` (신규)

인쇄 원본 규칙(기존 두 원본과 동일): 단일 HTML, `<style>` 첫 줄에 `/* FONT_CSS */`, `@page{size:794px 1123px;margin:0}`, 각 쪽은 `<section class="page …">`(폭 794·높이 1123px, `overflow:hidden`), 이미지는 `src="/…"`(public 기준), 링크는 `href="/…"`(사이트 상대). 외부 스타일시트·`file://` 경로·절대 URL 금지.

- [ ] **Step 1: 계약 테스트 작성**

`tests/lead-magnets/ebook-ai-data-ops-guide.test.ts`:

```ts
// 1권 e-book 인쇄 원본 계약 — 렌더러(scripts/render-lead-magnet-workbook-pdf.mjs)가 전제하는 모양과
// 보이스 차터 §4 금지 표현을 소스 수준에서 잡는다. 실제 PDF 는 Chromium 이 있어야 하므로 여기선 HTML 만 본다.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const SLUG = "academy-ai-data-ops-guide"
const html = readFileSync(path.join(process.cwd(), "scripts", "lead-magnet-ebooks", `${SLUG}.html`), "utf8")
const text = html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")

describe("1권 e-book 인쇄 원본", () => {
  it("12쪽이고 글꼴 자리가 있다", () => {
    expect(html.match(/<section class="page/g) ?? []).toHaveLength(12)
    expect(html).toContain("/* FONT_CSS */")
    expect(html).toContain("@page{size:794px 1123px;margin:0}")
  })

  it("이미지는 public 상대 경로, 링크는 사이트 상대 경로만 쓴다", () => {
    for (const [, src] of html.matchAll(/src="([^"]+)"/g)) expect(src, src).toMatch(/^\//)
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) expect(href, href).toMatch(/^\/|^mailto:/)
    expect(html).not.toContain("file://")
    expect(html).not.toContain('<link rel="stylesheet"')
  })

  it("금지 표현과 미확인 약속이 없다", () => {
    for (const banned of ["감시", "점수표", "무조건", "완벽하게", "가장 싸", "집중도", "50회 무료 수업에 AI"]) {
      expect(text, banned).not.toContain(banned)
    }
    expect(text).not.toMatch(/\d+만\s?원/) // 가격 숫자 없음
  })

  it("핵심 블록이 다 들어 있다", () => {
    for (const must of ["챗봇인가 시스템인가", "돼요", "안 돼요", "표시해요", "출제 템플릿 1호", "운영 분석", "월말 보고 초안", "ClassIn에서는", "이름은 번호로"]) {
      expect(text, must).toContain(must)
    }
    expect(text.match(/ClassIn에서는/g)!.length).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run tests/lead-magnets/ebook-ai-data-ops-guide.test.ts`
Expected: FAIL — ENOENT (파일 없음)

- [ ] **Step 3: 목업을 인쇄 원본으로 변환**

1. `tmp/ref-design/mock4.html`을 `scripts/lead-magnet-ebooks/academy-ai-data-ops-guide.html`로 복사한다.
2. `<head>`에서 `<link rel="stylesheet" href="fonts.css">`와 `<link rel="stylesheet" href="style3.css">`를 지우고, `<style>`을 하나로 합친다. 첫 줄은 `/* FONT_CSS */`, 그다음 `tmp/ref-design/style3.css` 전문, 그다음 mock4의 추가 CSS.
3. `@page{size:A4;margin:0}` → `@page{size:794px 1123px;margin:0}`, `.page{…width:210mm;height:297mm…}` → `width:794px;height:1123px`.
4. 서체 선언에서 `'Noto Serif KR'`은 그대로 둔다(설치돼 있으면 쓰고 없으면 Plex로 폴백). `font-family:'IBM Plex Sans KR',Pretendard,sans-serif`는 그대로.
5. QR 이미지 `src="/Users/clmagi/…/public/qr-code.png"` → `src="/qr-code.png"`.
6. 링크를 단다(목업에는 `<span class="btn">`만 있음): 쇼룸 예약 → `<a class="btn" href="/showroom">`, 무료로 시작 → `<a class="btn o" href="/contact#contact-form">`, 블로그 → `<a class="btn-o" href="/blog">`, ClassIn 콜아웃의 `자세히 →` → `<a class="go" href="/product/sw">`(5-1·5-2는 `/classin-ai-feature-guide.html`, 3-2·5-3은 `/docs/software/admin-monitoring-analytics`), FLOW 알약 `ClassIn 학습 데이터` → `<a class="pill" href="/product/sw">`. `a{color:inherit;text-decoration:none}`을 스타일에 추가.
7. 쪽 추가 2개(목업 11쪽 → 12쪽):
   - **01 데이터는 이미 있다**(진단 앞, 2쪽): `mock3.html`의 "3 통계 페이지" 구조를 쓰되 러닝 헤더 `01 · 데이터`, 절 번호 `1-1`, 제목 "학원은 늘고, 학생은 줄었습니다". 통계 행 3 + 표 + 결론 + 본문 + 캡처 카드는 mock4의 3-1 페이지와 같으므로, **3-1 페이지는 01장으로 옮기고** 03 간지 다음 첫 페이지는 3-2(숫자 다섯 개)가 된다. 쪽 번호·러닝 헤더를 그에 맞게 고친다.
   - **04 강사 면담 20분**(3-3 다음, 8쪽): `mock3.html`의 "5 코칭 페이지 (변주)" 구조 — 인용 블록(Harvard 실험 문장) → 타임라인 3(같이 본다 / 하나만 짚는다 / 그 자리에서 연습) → 규칙 박스 2(매뉴얼 세 줄 / 격주 면담 안건 3) → 피드백 문장(권장/피하기/왜). 문장은 v4 문체로: 영어 라벨 없이, 출처는 "하버드 교육정책연구소 실험(교사 347명)" 한 줄만.
   - **06 망치는 5가지**는 클로징 앞 쪽에 넣지 않고 **마지막 장(다음 걸음) 위쪽**에 리스트 박스(경고형, `.listbox.warn`) 하나로 넣는다. JSON `redFlags` 5개와 같은 문장.
8. 쪽 순서와 번호: 1 표지 / 2 01 데이터 / 3 02 진단 / 4 03 간지 / 5 3-2 숫자 다섯 개 / 6 3-3 질문 네 가지·첫 30일 / 7 04 강사 면담 / 8 5-1 학생 규칙 / 9 5-2 출제 템플릿 / 10 5-3 원장 루틴 / 11 마치며 / 12 다음 걸음. 러닝 헤더 오른쪽 쪽 번호와 측면 탭(01~06)을 맞춘다.
9. 표지 중앙 여백: 비워 둔다(미결 사항 — 결정되면 보드 예시 블록을 다시 넣는다).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lead-magnets/ebook-ai-data-ops-guide.test.ts`
Expected: 4 passed

- [ ] **Step 5: 브라우저에서 넘침 확인(렌더 전 빠른 확인)**

Run: `open scripts/lead-magnet-ebooks/academy-ai-data-ops-guide.html`
Expected: 12쪽이 세로로 이어지고, 각 쪽 안에서 내용이 잘리지 않는다(글꼴은 시스템 폴백이라 줄바꿈이 조금 다를 수 있음 — 최종은 Task 4의 넘침 검사가 판정)

- [ ] **Step 6: 커밋**

```bash
git add scripts/lead-magnet-ebooks/academy-ai-data-ops-guide.html tests/lead-magnets/ebook-ai-data-ops-guide.test.ts
git commit -m "feat(resources): 1권 「AI와 데이터로 학원 운영하기」 12쪽 e-book 인쇄 원본"
```

---

### Task 4: PDF 렌더 + 워크시트 파일

**Files:**
- Create: `public/materials/lead-magnets/academy-ai-data-ops-guide.pdf` (렌더 결과)
- Create: `public/materials/lead-magnets/academy-ai-data-ops-guide-board.xlsx`
- Test: `tests/lead-magnets/pdf-handcrafted.test.ts`, `tests/lead-magnets/material-download-contract.test.ts` (기존)

- [ ] **Step 1: 렌더 의존성 준비 (저장소 의존성 아님)**

Run: `npm i --no-save playwright-core`
Expected: `added 1 package` (package.json·lock 변경 없음 — `git status`로 확인)

- [ ] **Step 2: 렌더**

Run: `LEAD_MAGNET_PDF_CHANNEL=chrome node scripts/render-lead-magnet-workbook-pdf.mjs academy-ai-data-ops-guide --html-out=tmp/ebook-out.html`
Expected:
```
public/materials/lead-magnets/academy-ai-data-ops-guide.pdf
Generated 1 workbook PDF file(s).
```
넘치면 `[academy-ai-data-ops-guide] 내용이 쪽을 넘칩니다: N쪽 +Mpx`로 실패한다 → 해당 쪽의 문장·여백을 줄이고 다시 렌더.

- [ ] **Step 3: 쪽수·링크 확인**

Run: `pdfinfo public/materials/lead-magnets/academy-ai-data-ops-guide.pdf | grep -E "Pages|Producer|Creator"; pdftoppm -png -r 50 -f 1 -l 12 public/materials/lead-magnets/academy-ai-data-ops-guide.pdf tmp/ebook-page`
Expected: `Pages: 12`, Producer에 `ReportLab` 없음(Chromium). `tmp/ebook-page-*.png`를 열어 12쪽 모두 눈으로 확인 — 잘림·겹침·빈 쪽 없음.

Run: `grep -o 'href="[^"]*utm_campaign=academy-ai-data-ops-guide[^"]*"' tmp/ebook-out.html | sort -u | head`
Expected: `/showroom`, `/contact`, `/blog`, `/product/sw` 등이 `https://classin.co.kr/...?utm_source=pdf&utm_medium=lead_magnet&utm_campaign=academy-ai-data-ops-guide`로 바뀌어 있다.

- [ ] **Step 4: 월요일 보드 워크시트 만들기**

`scripts/data/`가 아니라 1회성이므로 노드 한 줄로 만든다(의존성 `xlsx`가 없으면 CSV 2장으로 대체: `-board.csv`, `-signals.csv`).

Run:
```bash
node -e '
const rows=[["항목","이번 주","전주","기준선","메모"],["재원생 증감","","","",""],["상담→등록","","","",""],["퇴원·휴원 (사유)","","","",""],["표시된 학생 수","","","",""],["강사 면담 횟수","","","",""]];
const sig=[["학생번호","주차","결석 연속","숙제 미제출(월)","상담 답장 시간(h)","성적 변화","표시"],["S-001","","","","","","=IF((C2>=2)+(D2>=3)+(E2>48)+(F2<0)>=2,\"●\",\"—\")"]];
const csv=r=>r.map(x=>x.map(c=>`"${String(c).replace(/"/g,"\"\"")}"`).join(",")).join("\n");
require("fs").writeFileSync("public/materials/lead-magnets/academy-ai-data-ops-guide-board.csv","﻿"+csv(rows));
require("fs").writeFileSync("public/materials/lead-magnets/academy-ai-data-ops-guide-signals.csv","﻿"+csv(sig));'
```
Expected: 파일 2개 생성. 엑셀로 열어 한글·수식이 보이는지 확인.

파일 구조표의 `.xlsx` 대신 CSV 2장으로 확정한다(의존성 0). JSON `deliverables` 둘째 항목의 "(엑셀 파일)"은 "(CSV 2장)"으로 고친다.

- [ ] **Step 5: 기존 PDF 계약 테스트 통과 확인**

Run: `npx vitest run tests/lead-magnets/pdf-handcrafted.test.ts tests/lead-magnets/material-download-contract.test.ts tests/lead-magnets/materials-pdf-destination.test.ts`
Expected: 모두 passed — `handMade` 목록(ReportLab이 아닌 PDF)에 새 슬러그가 들어가고 `HANDCRAFTED_LEAD_MAGNET_PDF_SLUGS`(= WORKBOOK_SLUGS 포함)와 일치

- [ ] **Step 6: 로컬 다운로드 흐름 확인**

Run: `npm run dev` → `http://localhost:3888/resources/academy-ai-data-ops-guide` → 이메일 입력 → 다운로드
Expected: `academy-ai-data-ops-guide.pdf`가 내려받아지고(정적 파일, 서버 생성본으로 바뀌지 않음), 관리자 `/admin/lead-magnets`에 다운로드 1건이 기록된다.

- [ ] **Step 7: 커밋**

```bash
git add public/materials/lead-magnets/academy-ai-data-ops-guide.pdf public/materials/lead-magnets/academy-ai-data-ops-guide-board.csv public/materials/lead-magnets/academy-ai-data-ops-guide-signals.csv data/lead-magnets.json
git commit -m "feat(resources): 1권 PDF 렌더본과 월요일 보드·신호 워크시트"
```

---

### Task 5: 블로그 글 1편

**Files:**
- Modify: `data/blog-posts.json` (배열 끝에 객체 1개, `id: 12`)
- Test: `tests/blog/slug-normalize.test.ts`·`tests/blog/markdown-renderer.test.ts` (기존 — 회귀 확인만)

`leadMagnetSlug`로 자료를 연결하면 글 하단에 `LeadMagnetGate`가 뜬다(`app/blog/[slug]/page.tsx:130`). `status`는 `draft`로 두고 발행은 어드민에서 한다(운영은 Supabase).

- [ ] **Step 1: 항목 추가**

```json
{
  "id": 12,
  "slug": "student-ai-rules-instead-of-ban",
  "title": "학생한테 AI 쓰지 말라고만 하셨나요 — 학원 AI 4단계",
  "excerpt": "학생은 이미 쓰고 있습니다. 금지만 있으면 답 베끼기만 남습니다. 10문항으로 우리 학원이 어느 단계인지 보고, 규칙 세 칸부터 시작하는 법.",
  "category": "인사이트",
  "tags": ["학원 AI", "학생 AI 규칙", "운영 루틴"],
  "tag": "운영 진단",
  "date": "2026. 11. 17",
  "author": "Classin 팀",
  "authorRole": "운영 인사이트",
  "authorBio": "학원 운영과 수업 데이터를 다루는 ClassIn Korea 팀입니다.",
  "readTime": "6분",
  "imageUrl": "/images/blog/thumb-08.png",
  "thumbnailAlt": "교실에 붙은 학생 AI 규칙 세 줄",
  "heroImageUrl": "/images/blog/thumb-08.png",
  "heroImageAlt": "교실에 붙은 학생 AI 규칙 세 줄",
  "featured": false,
  "benefitItems": [
    "우리 학원의 AI가 0~3단계 중 어디인지 10문항으로 알 수 있습니다.",
    "학생 AI 규칙을 금지 대신 세 칸(돼요·안 돼요·표시해요)으로 만드는 법을 알 수 있습니다.",
    "강사 프롬프트와 문제를 개인 PC가 아니라 학원 자산으로 남기는 첫 걸음을 알 수 있습니다."
  ],
  "targetReader": "강사 3~30명 학원 원장·실장. 출결·수납은 관리 프로그램으로 처리 중이고, ChatGPT로 문제나 문자를 만들어 본 적이 있는 분",
  "contentMarkdown": "## \"쓰지 마\"는 규칙이 아니라 공백입니다\n\n학생은 이미 AI를 씁니다. 학원이 아무 말도 하지 않으면 가장 나쁜 방식 하나만 남습니다. 답을 베끼는 것입니다. 강사도 마찬가지입니다. 각자 ChatGPT로 문제를 만들고, 그 파일은 개인 PC에 쌓이고, 퇴사하면 같이 나갑니다.\n\n도구를 늘리자는 이야기가 아닙니다. 지금 있는 숫자와 지금 쓰는 AI를 규칙과 루틴으로 묶자는 이야기입니다.\n\n## 우리 학원의 AI, 챗봇인가 시스템인가 — 10문항\n\n해당하면 한 칸. 애매하면 비웁니다. 몇 칸인지보다 어느 묶음이 비었는지가 중요합니다.\n\n**A. 학생·강사 규칙**\n\n- 학생 AI 규칙이 글로 있다. 언제 되고(개념 질문·오답 설명) 언제 안 되는지(제출 과제) 적혀 있다.\n- 강사들이 AI로 하는 일(출제·채점 초안·문자)을 서로 안다.\n- 학생에게 \"쓰지 마\"가 아니라 \"이렇게 써라\"를 말한 적이 있다.\n\n**B. 자산·템플릿**\n\n- 문제 만드는 프롬프트가 학원 템플릿으로 있다. 과목·난이도·형식·검수 기준이 들어 있다.\n- AI로 만든 문제가 공유 폴더나 LMS에 쌓인다. 강사 개인 PC에만 있지 않다.\n- 학부모 문자·월말 보고 템플릿이 있고, AI 초안은 강사가 고친 뒤 보낸다.\n- AI에 넣기 전 지우는 항목(이름·연락처·가정사)이 정해져 있다.\n\n**C. 원장 루틴**\n\n- 원장이 매주 AI로 하는 일이 하나 이상 정해져 있다.\n- 상담 기록이 사실·숫자·날짜로 남는다.\n- AI가 낸 결과를 원본과 대조하는 사람이 정해져 있다.\n\n## 4단계\n\n| 단계 | 모습 | 먼저 할 것 |\n| --- | --- | --- |\n| 0 금지·방치 | 두 묶음 이상 0칸. 학생에겐 쓰지 말라 하고, 강사는 각자, 원장은 안 씀 | 학생 규칙 세 줄 |\n| 1 개인 도구 | 가장 많다. B가 비어 있다. 문제·문자는 만들지만 개인 계정에 남는다 | 출제 템플릿 1호 |\n| 2 자산·템플릿 | B는 있고 C가 비어 있다. 누가 해도 같지만 원장 일정엔 없다 | 원장 주간 루틴 |\n| 3 시스템·루틴 | 세 묶음 모두 2칸 이상 | 학생 단위 분석(2권) |\n\n## 학생 AI 규칙 — 금지 대신 세 칸\n\n| 과제 | AI | 어디까지 | 학생이 남기는 것 |\n| --- | --- | --- | --- |\n| 개념 확인 | 돼요 | 모르는 용어와 개념을 설명 듣기 | 무엇을 물었는지 한 줄 |\n| 오답 풀이 | 돼요 | 혼자 다시 푼 뒤 AI 풀이와 비교 | 내 풀이와 다른 점 한 줄 |\n| 서술형 | 표시해요 | 개요와 피드백까지. 문장은 직접 | \"AI: 개요\" 표시 |\n| 제출 과제·시험 | 안 돼요 | 답과 풀이 생성 금지 | — |\n\n교실에 붙이는 세 줄은 이것입니다. **돼요** 모르는 것 물어보기, 틀린 문제 다시 풀고 비교하기. **안 돼요** 제출할 답·풀이·문장 만들기. **표시해요** AI 도움 받은 곳 적기.\n\n규칙보다 빠른 방법도 있습니다. AI가 답을 낼 수 있는 과제는 풀이 과정을 내게 하는 것입니다. 연습은 AI와, 평가는 AI 없이.\n\n## 나머지는 가이드에\n\n월요일에 보는 숫자 다섯 개, 출제 템플릿 1호와 문제 은행 폴더 규칙, 원장 주간 AI 루틴과 프롬프트 2종, AI에 넣기 전 지우는 세 가지는 아래 가이드에 담았습니다. 지금 쓰는 도구 그대로 다음 주 월요일부터 시작됩니다.",
  "seoTitle": "학생 AI 규칙, 금지 대신 세 칸 — 학원 AI 4단계 진단",
  "seoDescription": "학생에게 AI를 금지만 해 두셨나요. 10문항으로 우리 학원의 AI 단계를 확인하고, 돼요·안 돼요·표시해요 세 칸 규칙부터 시작하는 법.",
  "relatedPostIds": [8, 9],
  "pageLayout": "standard",
  "cta": {
    "eyebrow": "원장을 위한 실무 가이드 1권",
    "title": "우리 학원의 AI, 챗봇인가 시스템인가",
    "description": "10문항 진단, 월요일 보드, 학생 AI 규칙, 출제 템플릿, 원장 주간 루틴과 프롬프트 2종.",
    "buttonLabel": "가이드 받기",
    "buttonHref": "/resources/academy-ai-data-ops-guide"
  },
  "leadMagnetSlug": "academy-ai-data-ops-guide",
  "status": "draft"
}
```

이미지는 기존 글 8번(`academy-system-checklist-blog`)의 썸네일을 임시로 같이 쓴다(전용 썸네일은 디자인 후 교체). `relatedPostIds` 8·9 = `academy-system-checklist-blog`·`academy-system-checklist-guide`.

- [ ] **Step 2: JSON·렌더 확인**

Run: `node -e "const d=require('./data/blog-posts.json'); const p=d.find(x=>x.slug==='student-ai-rules-instead-of-ban'); console.log(p.id, p.leadMagnetSlug, p.contentMarkdown.length)"`
Expected: `12 academy-ai-data-ops-guide <1500 이상>`

Run: `npx vitest run tests/blog`
Expected: 모두 passed

Run: `npm run dev` → 어드민 `/admin`의 블로그 목록에서 초안을 열어 미리보기 → 글 하단에 「AI와 데이터로 학원 운영하기」 게이트가 보이는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add data/blog-posts.json
git commit -m "feat(blog): '학생한테 AI 쓰지 말라고만 하셨나요' 초안 — 1권 가이드 게이트 연결"
```

---

### Task 6: 쇼츠 대본 3개 + 훅 랩 원장 등록

**Files:**
- Create: `docs/active/content-hook-lab/shorts-ai-data-ops-guide-2026-11.md`
- Modify: `docs/active/content-hook-lab/ledger/tofu.md` (명예의 전당 표 아래 행 1개)

- [ ] **Step 1: 대본 파일 작성**

```markdown
# 쇼츠 대본 3편 — 1권 「AI와 데이터로 학원 운영하기」 (2026-11)

착지: `/resources/academy-ai-data-ops-guide` (고정 댓글·프로필 링크, utm_source=shorts&utm_campaign=academy-ai-data-ops-guide)
형식: 30초, 세로, 자막 필수. 출연: 사용자 본인(원장 1인칭 질문형) 또는 협의된 고객 원장님. 화면 자료는 가이드 PDF 쪽을 그대로 캡처.
문체: 가이드와 같다. 카피 문장·과장·보장 없음. 제품 이름은 마지막 3초에만.

## 1. 학생한테 AI 쓰지 말라고만 하세요?

| 초 | 화면 | 말 |
| --- | --- | --- |
| 0–3 | 교실 벽 클로즈업, 빈 종이 | "학생한테 AI 쓰지 말라고만 하셨나요?" |
| 3–10 | 가이드 5-1 표(돼요·안 돼요·표시해요) | "학생은 이미 쓰고 있어요. 금지만 있으면 답 베끼기만 남습니다. 규칙은 세 칸이면 됩니다." |
| 10–20 | 세 줄이 하나씩 뜸 | "돼요 — 모르는 것 물어보기, 틀린 문제 다시 풀고 비교하기. 안 돼요 — 제출할 답·풀이 만들기. 표시해요 — AI 도움 받은 곳 적기." |
| 20–26 | 과제 유형 표 | "연습은 AI와, 평가는 AI 없이. 과제를 바꾸면 규칙이 필요 없어집니다." |
| 26–30 | 가이드 표지 + 링크 자막 | "세 줄 포스터랑 학부모 문자까지 가이드에 있어요. 링크는 댓글에." |

## 2. 월요일 아침, 원장이 보는 숫자 다섯 개

| 초 | 화면 | 말 |
| --- | --- | --- |
| 0–3 | 관리 프로그램 화면 스크롤 | "지난주에 숫자 몇 개 보셨어요?" |
| 3–10 | 가이드 3-2 보드 | "숫자는 프로그램에 다 있어요. 문제는 매주 같은 걸 같은 시간에 안 본다는 거예요." |
| 10–22 | 다섯 칸이 하나씩 | "재원생 증감, 상담에서 등록, 퇴원·휴원이랑 사유, 표시된 학생 수, 강사 면담 횟수. 월요일 30분, 빨간 칸만 말합니다." |
| 22–27 | 신호 4열 엑셀 캡처 | "퇴원보다 먼저 오는 신호 네 개는 엑셀 수식 한 줄이에요." |
| 27–30 | 가이드 표지 + 링크 | "보드 양식이랑 수식, 가이드에 넣어뒀습니다." |

## 3. 강사 프롬프트, 퇴사하면 같이 나갑니다

| 초 | 화면 | 말 |
| --- | --- | --- |
| 0–3 | 폴더 창 "김OO 문제" | "그 선생님 프롬프트, 지금 어디 있어요?" |
| 3–10 | 가이드 5-2 템플릿 블록 | "강사 다섯이 각자 만들면 품질이 다섯 가지고, 퇴사하면 사라져요." |
| 10–20 | [ ] 칸만 바뀌는 애니메이션 | "바꿀 건 둘이에요. 프롬프트는 학원 템플릿으로 — 단원·난이도·형식 칸만 비우고 규칙은 고정. 결과는 문제 은행으로." |
| 20–26 | 폴더 트리, 파일명 | "파일명에 난이도·형식·버전·작성자·검수자. 검수자 없는 파일은 안 씁니다." |
| 26–30 | 가이드 표지 + 링크 | "템플릿 1호 전문은 가이드에. 댓글 링크." |

## 측정

- 각 편 고정 댓글 링크에 `utm_content=shorts-1|2|3`.
- 2주 뒤 `/admin/lead-magnets` 다운로드 수와 CRM 태그 'AI·운영 관심' 리드 수를 훅 랩 원장 '실측 피드백'에 적는다.
```

- [ ] **Step 2: 훅 랩 TOFU 원장에 등록**

`docs/active/content-hook-lab/ledger/tofu.md`의 "명예의 전당" 표 마지막 행 아래에 추가:

```markdown
| — | 수동 · 2026-11-10 | 학생한테 AI 쓰지 말라고만 하세요? | 학생한테 AI 쓰지 말라고만 하셨나요 — 학원 AI 4단계 | NEW: academy-ai-data-ops-guide — AI·데이터 운영 가이드(12쪽 e-book, 난이도 상, 제작 완료) | — | 배포 대기 |
```

- [ ] **Step 3: 커밋**

```bash
git add docs/active/content-hook-lab/shorts-ai-data-ops-guide-2026-11.md docs/active/content-hook-lab/ledger/tofu.md
git commit -m "docs(content): 1권 가이드 쇼츠 대본 3편 + 훅 랩 원장 등록"
```

---

### Task 7: 품질 게이트와 마무리

**Files:**
- 없음(검증만). 실패 시 해당 Task로 돌아간다.

- [ ] **Step 1: 타입·린트·테스트**

Run: `npm run typecheck && npx eslint app components lib --max-warnings=0 && npm test`
Expected: 모두 통과. 실패하면 메시지를 그대로 적고 원인 Task로.

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 성공. `/resources/academy-ai-data-ops-guide`가 정적 생성 목록에 보인다(generateStaticParams).

- [ ] **Step 3: 금지 표현 전수 확인(JSON·블로그·대본)**

Run: `grep -n "감시\|점수표\|무조건\|완벽하게\|가장 싸\|집중도" data/lead-magnets.json data/blog-posts.json docs/active/content-hook-lab/shorts-ai-data-ops-guide-2026-11.md | grep -i "ai-data-ops\|student-ai-rules\|shorts-ai" || echo CLEAN`
Expected: `CLEAN` (redFlags의 "감시로 시작합니다"는 경고문이라 예외 — 걸리면 그 줄만 눈으로 확인)

- [ ] **Step 4: 운영 반영 메모(실행은 사람이)**

Vercel 운영은 Supabase 모드라 JSON 추가만으로는 공개되지 않는다. 배포 후:
- `node --env-file=.env.local scripts/import-lead-magnets.mjs --dry-run` → 새 슬러그 1건 upsert 예정 확인 → `--dry-run` 없이 실행.
- 블로그 초안은 어드민에서 `published`로 바꾼다(미결 사항 확인 뒤: 교육부 가이드라인 원문 인용, 50회 AI 포함 여부).

- [ ] **Step 5: 메모리·스펙 갱신**

`docs/superpowers/specs/2026-11-10-ai-data-leadmagnet-series-design.md` §10 미결에 결과를 적고(표지 여백 결정 등), 상태를 "1권 구현 완료"로 바꾼다. 커밋:

```bash
git add docs/superpowers/specs/2026-11-10-ai-data-leadmagnet-series-design.md
git commit -m "docs(spec): 1권 구현 결과·미결 반영"
```

---

## 자기 점검

- 스펙 §4 12쪽 ↔ Task 3 쪽 순서 12개 일치. §6 "렌더러에 템플릿 추가"는 저장소에 이미 있는 인쇄 원본 경로로 대체했다(코드 변경 0) — 스펙 §6의 그 문장은 Task 7-5에서 고친다.
- §7 블로그·쇼츠 ↔ Task 5·6. §8 검증 ↔ Task 4-3·5, Task 7.
- 슬러그 `academy-ai-data-ops-guide`가 Task 1·2·3·4·5·6에서 동일. 블로그 슬러그 `student-ai-rules-instead-of-ban` Task 5·6 동일. CSV 파일명 Task 4 둘 다 `-board.csv`·`-signals.csv`.
- 링크 경로는 실제 라우트로 확인했다: `/docs/software/admin-monitoring-analytics`(lib/docs.ts 870행, category software), `/classin-ai-feature-guide.html`(public), `/showroom`, `/contact#contact-form`, `/blog`.
