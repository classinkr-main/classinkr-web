import crypto from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !secretKey) {
  console.error("Missing Supabase credentials in env.")
  process.exit(1)
}

const supabase = createClient(url, secretKey)

function hashContent(content: string) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function parseMarkdownToSections(md: string) {
  const lines = md.split("\n")
  const sections: { heading: string; body: string; steps?: string[] }[] = []
  let currentHeading = "개요"
  let currentBodyLines: string[] = []
  let currentSteps: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("## ")) {
      if (currentBodyLines.length > 0 || currentSteps.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentBodyLines.join("\n").trim(),
          ...(currentSteps.length > 0 ? { steps: currentSteps } : {}),
        })
      }
      currentHeading = trimmed.replace(/^##\s*/, "")
      currentBodyLines = []
      currentSteps = []
    } else if (trimmed.startsWith("* ") || trimmed.startsWith("- ") || /^\d+\.\s/.test(trimmed)) {
      currentSteps.push(trimmed.replace(/^(\*|-|\d+\.)\s*/, ""))
    } else if (trimmed && !trimmed.startsWith("---") && !trimmed.startsWith("# ")) {
      currentBodyLines.push(trimmed)
    }
  }

  if (currentBodyLines.length > 0 || currentSteps.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentBodyLines.join("\n").trim(),
      ...(currentSteps.length > 0 ? { steps: currentSteps } : {}),
    })
  }

  return sections
}

async function run() {
  console.log("[1/3] Refining docs_articles content...")

  const doc609Markdown = `## 배포 일정과 적용 범위

6.0.9는 수업 중 AI 도구 고도화(AI 칠판·AgentIn)와 기관 운영 편의성(외부 드라이브 연동, 과제 일괄 채점, 실시간 번역)을 대폭 강화한 대규모 업데이트입니다.

* **그레이 배포일**: 2026년 9월 14일
* **정식 배포일**: 2026년 9월 21일
* **배포 방식**: 별도 알림 없는 비강제 업데이트 (기존 사용자에게 강제 업데이트 팝업이 뜨지 않습니다.)
* **활성화 안내**: 교실 안 AgentIn, AI 칠판, 실시간 자막 번역은 기본 비활성화 상태입니다. 사용을 원하시는 기관은 담당 매니저에게 활성화를 요청해 주세요.

---

## 이번 업데이트 한눈에 보기

| 기능 구분 | 주요 내용 | 적용 대상 | 별도 활성화 |
| :--- | :--- | :--- | :---: |
| **교실 안 AgentIn** | 교실 이탈 없이 우측 툴바에서 AI 질문 및 에이전트 스토어 활용 | 교사 / 학생(선택) | 필요 |
| **AI 칠판 개선** | STEM 수식·손글씨 풀이 인식 대폭 향상, 모범답안 없는 즉시 출제 지원 | 교사 / 학생 | 필요 |
| **AI 요약 에이전트** | 과목·수업 성격에 맞춘 맞춤형 AI 요약 에이전트 선택 지원 | 교사 / 학생 | 옵션 |
| **과제 연속 채점** | 채점 내용 임시저장 후 일괄 발표, 목록 이탈 없는 연속 채점 모드 | 교사 / 관리자 | 기본 제공 |
| **실시간 자막 번역** | 교사 음성 실시간 텍스트 변환 및 다국어 번역 (시간당 과금) | 교사 / 학생 | 필요 |
| **무료 버전 혜택** | 계정당 50회 누적 무료 수업 + 녹화·AI 분석·AI 요약·AI 스크립트 4종 무료 | 무료 사용자 | 기본 제공 |
| **영상 업로드 최적화** | 8GB 대용량 백그라운드 업로드 및 네트워크 끊김 시 이어받기 | 교사 / 관리자 | 기본 제공 |
| **외부 드라이브 연동** | Google Drive, OneDrive, Dropbox 파일을 교실에서 바로 호출 | 교사 / 학생 | 기본 제공 |
| **태국어 지원** | 모든 플랫폼 클라이언트 태국어 UI 지원 | 전체 사용자 | 기본 제공 |
| **요금제 안내 개선** | 무료 버전 한도 초과 시 버전별 기능 비교 및 즉시 업그레이드 안내 | 관리자 / 강사 | 기본 제공 |

---

## 1. 교실 안에서 AgentIn 사용

수업 도중 예시나 설명, 연습 문항이 필요할 때 교실을 나가지 않고 화면 우측 툴바에서 AI에게 즉시 질문할 수 있습니다.

* **교실 내 텍스트 질의응답**: 교실 안 AgentIn 입구에서 바로 질문을 입력합니다. (PC 클라이언트는 현재 텍스트 입력만 지원)
* **에이전트 스토어**: 교실에서 활용할 과목별 전문 에이전트를 추가하거나 삭제할 수 있으며, 추가된 에이전트는 개인 계정에 안전하게 저장됩니다.
* **학생 사용 권한 제어**: '수업 중 학생 사용 허용'을 켜면 학생도 교실 내에서 AgentIn을 사용할 수 있습니다. 기본값은 '숨김'이며, 조교는 교사 설정을 따릅니다.

![교실 안 AgentIn](/images/updates/609/rel_01_3e495856.png)

---

## 2. AI 칠판 개선

수업 중 교사가 문제를 출제하면 AI가 채점 기준을 세우고, 학생의 풀이를 실시간으로 모니터링하여 AI 평가 및 반 전체 성취도 분석까지 이어주는 수업 도구입니다.

* **STEM 문항 인식·채점 정확도 향상**: 복잡한 수식, 연산 기호, 손글씨 풀이 과정 인식이 크게 개선되었습니다. 풀이 과정과 최종 답안을 함께 평가합니다.
* **출제 흐름 간소화**: 마지막으로 사용한 문항 유형을 기억해 열리며, 유형을 변경해도 입력한 문항 내용이 유지됩니다. 모범 답안 없이도 경고 없이 바로 게시할 수 있습니다.
* **긴 문항·이미지 문항 레이아웃 최적화**: 지문이 긴 문항도 화면을 최적 배치하여 학생 답안 필기 영역을 가리지 않습니다.
* **AI 생성 과정 실시간 스트리밍**: 모범 답안, 지도 제안, 채점 기준이 순차적으로 표시되어 생성이 끝날 때까지 대기할 필요가 없습니다.

![AI 칠판 문항 작성](/images/updates/609/rel_03_3e495856.png)

---

## 3. AI 요약 — 과목별 에이전트 선택

수업 생성 시 과목과 수업 성격에 맞는 AI 에이전트를 선택하면, 수업 종료 후 녹화본의 핵심 개념과 요약본이 해당 과목에 최적화된 형식으로 정리됩니다.

* **사용 경로**: 수업 생성 → AI 내용 요약 켜기 → 에이전트 선택
* **코스 그룹 공유**: 동일한 코스 그룹 내 교사들은 동일한 에이전트 목록을 공유합니다.
* **적용 시점**: 에이전트 변경은 설정 이후 녹화분부터 적용되며, 기존 녹화분에는 소급 적용되지 않습니다.

![AI 요약 에이전트 설정](/images/updates/609/rel_05_3e495856.png)

---

## 4. 과제 채점 흐름 개선

채점 도중에 학생을 전환해도 입력 내용이 사라지지 않고 안전하게 보존되며, 전체 채점이 끝난 뒤 한 번에 성적을 발표할 수 있습니다.

* **임시저장 후 일괄 발표**: 채점 내용을 임시저장하면 학생을 전환해도 유지됩니다. 과제 상세 페이지의 [성적 발표] 버튼으로 학생/학부모에게 일괄 발송합니다.
* **연속 채점 모드**: [저장 후 다음 채점] 또는 [발표 후 다음 채점]을 선택하면 과제 목록으로 돌아가지 않고 즉시 다음 학생으로 넘어갑니다.

![과제 채점 흐름](/images/updates/609/rel_06_3e495856.png)

---

## 5. 실시간 자막 음성인식 및 다국어 번역

수업 중 교사의 음성을 실시간 문자로 변환하고 선택한 언어로 즉시 번역합니다.

* **수업 생성 시 활성화**: 새 수업 생성 시 '실시간 자막 번역'을 켜면 교실에서 즉시 적용됩니다.
* **다시 보기**: 자막이 실시간 표시되며, 창을 위로 스크롤하여 놓친 앞선 발화를 확인할 수 있습니다.
* **표시 설정**: 글자 크기, 번역 언어, 이중 언어 병기를 자유롭게 조정할 수 있습니다.
* **과금 정책**: 시간당 400 RMB (분당 3.5 RMB + 180 AI 크레딧 차감). 무료 버전 및 개인 Plus는 지원하지 않습니다.

![실시간 자막 번역](/images/updates/609/rel_07_3e495856.png)

---

## 6. 무료 버전 혜택 확대 & 인프라 최적화

* **계정당 50회 무료 수업**: 매월 초기화되는 방식 대신 계정당 누적 50회의 무료 수업을 안정적으로 제공합니다.
* **무료 제공 기능 4종**: 수업 녹화, AI 강의 분석, AI 내용 요약, AI 스크립트 기능이 무료 버전에 포함됩니다.
* **8GB 대용량 영상 업로드**: 백그라운드 업로드와 네트워크 끊김 시 이어받기를 지원하며, 단일 파일 상한이 8GB로 확장되었습니다.
* **외부 클라우드 드라이브 연동**: Google Drive, OneDrive, Dropbox 계정을 ClassIn 사이드바에 연동하여 수업 중 교실에서 바로 파일을 띄울 수 있습니다.
* **태국어 공식 지원**: PC, 태블릿, 모바일 전 플랫폼에서 태국어 UI를 지원합니다.`

  const docBlackboardMarkdown = `## 사용 전 확인

AI 칠판은 수업 중 문항을 출제하면 **AI가 모범 답안·채점 기준 생성 → 학생 답안 실시간 모니터링 → AI 자동 채점 → 답안 현황/학습 진단**까지 한 번에 처리하는 차세대 수업 도구입니다.

* **지원 버전**: 강사와 학생 모두 ClassIn 6.0.9 이상으로 업데이트되어 있어야 합니다.
* **기능 활성화**: 기본 비활성 기능입니다. 사용을 원하시면 담당 매니저에게 활성화를 요청해 주세요.
* **지원 문항 유형**: 주관식(손글씨 풀이 과정 포함), 객관식(단답/계산형), 말하기(음성 녹음) 3가지를 지원합니다.

---

## 6.0.9 주요 개선 사항

* **STEM 인식·채점 정확도 대폭 향상**: 수식, 연산 기호, 손글씨 풀이 과정 인식이 크게 개선되었습니다. 단순 최종 답뿐만 아니라 풀이 과정의 논리 전개까지 함께 평가합니다.
* **문항 작성 간소화**: 문항 유형을 전환해도 작성 중인 문제가 유지되며, 마지막으로 선택한 유형을 기억합니다. 모범 답안 없이도 경고 없이 바로 게시할 수 있습니다.
* **레이아웃 최적화**: 지문이 긴 문항이나 이미지 문항도 화면을 최적 분할하여 학생의 필기 영역을 가리지 않습니다.
* **실시간 생성 진행 표시**: 모범 답안, 지도 제안, 채점 기준 생성 과정이 스트리밍으로 순차 표시됩니다.

---

## STEP 1. AI 칠판 열기

교실 우측 도구상자(🧰) → [수업 도구] → 하단 펼치기(▼) → [AI 칠판]을 선택합니다.

![AI 칠판 열기](/images/updates/609/bb_01_3e395856.png)

---

## STEP 2. 문항 작성하기

상단에서 문항 유형을 선택합니다: **주관식 / 객관식 / 말하기**

* **다양한 문제 입력 방식**: 직접 타이핑, 🎤 음성 입력, 화면 영역 캡처, 📷 교재 카메라 촬영, 🖼 이미지 불러오기, ☁ 클라우드(.edbx 파일)
* **채점 AI 에이전트 선택**: 좌측 하단에서 문항 성격에 맞는 에이전트(예: 범용 주관식 AI 에이전트)를 지정합니다.
* **문항 게시**: [게시] 버튼을 누르면 학생 화면에 즉시 문항이 배포됩니다.

![문항 작성](/images/updates/609/bb_02_3e395856.png)

---

## STEP 3. AI 모범 답안 및 채점 기준 생성

우측 상단 [모범 답안] → [AI 답안 생성]을 클릭하면 AI가 자동으로 평가 기준표를 작성합니다.

* **주관식**: 【참고 답안】 + 단계별 배점 기준이 담긴 【채점 기준】
* **객관식**: 【정답】 + 부분 점수 조건이 포함된 【채점 기준】
* **교사 맞춤 수정**: 생성된 내용을 최대 3,000자까지 직접 자유롭게 수정할 수 있습니다.

![AI 답안 및 채점 기준 생성](/images/updates/609/bb_03_3e395856.png)

---

## STEP 4. 학생 답안 실시간 모니터링 (답안 상세)

문항을 게시하면 [답안 상세] 탭으로 전환되며, 학생별 카드에 작성 중인 답안이 실시간 스트리밍됩니다.

* **상태 표시**: 시작 전 / 답변 중(작성 중인 손글씨·타이핑 표시) / 제출됨
* **카드 정렬 및 고정**: 학생 이름 검색, 소요 시간순, 성적순 정렬 및 📌 상단 고정 지원
* **고화질 풀이 확인**: 학생 카드를 클릭하면 학생의 손글씨 풀이 과정을 대화면으로 확대해 볼 수 있습니다.

![실시간 학생 답안 그리드](/images/updates/609/bb_04_3e395856.png)
![손글씨 풀이 과정 확대](/images/updates/609/bb_05_3e395856.png)

---

## STEP 5. AI 채점 결과 확인

학생이 제출하면 AI가 설정된 채점 기준에 따라 실시간 자동 채점합니다.

* **점수 / 소요 시간 / 제출 시각** 즉시 산출
* **AI 평가 3단계 피드백**: 한 줄 판정 → 상세 분석(오개념 진단) → 종합 제안
* **해설 공개**: 답안 마감 후 해설 버튼을 통해 학생들에게 일괄 해설을 배포할 수 있습니다.

![AI 채점 결과 확인](/images/updates/609/bb_06_3e395856.png)

---

## STEP 6. 답안 현황 (반 전체 종합 분석)

[답안 현황] 탭에서 학급 전체의 성취도와 취약 요소를 한눈에 파악합니다.

* **참여 인원 및 평균 소요 시간, 평균 점수**
* **점수 분포 차트**: 0~60 / 61~70 / 71~80 / 81~90 / 91~100 점대 구간별 분포
* **본 문항 학습 요소 진단**: AI가 문항을 세부 학습 요소로 분해하여 요소별 정답률 산출 (마우스 오버 시 보충 설명 안내)
* **AI 지도 제안**: 다음 수업에서 집중적으로 보완해야 할 개념을 AI가 교사에게 제안합니다.

![답안 현황 분석](/images/updates/609/bb_07_3e395856.png)

---

## 학생 화면 가이드 (태블릿 / iPad)

강사가 문항을 게시하면 학생 화면에 AI 칠판 창이 자동으로 열립니다.

1. **문항 확인**: 문제 내용과 답안 작성 경과 시간을 확인합니다. (타이핑, 📷 카메라, 🖼 이미지, 🎤 음성, ✍ 그림판 지원)
2. **손글씨 풀기 (그림판)**: 펜·지우개 도구로 풀이 과정을 작성하고 [답안 제출]을 누릅니다.
3. **AI 채점 확인**: 제출 즉시 학생 화면에도 점수와 AI 채점 피드백(판정/상세분석/제안)이 표시됩니다.

![학생 손글씨 풀이 화면](/images/updates/609/bb_13_3e395856.png)
![학생 AI 채점 피드백](/images/updates/609/bb_15_3e395856.png)`

  const docLessonAnalysisMarkdown = `## 기능 개요

**클래스인 AI 강의 분석(ClassIn AI Lesson Analysis)**은 수업 녹화본을 기반으로 교사의 발화 비율, 학생 상호작용, 수업 분위기, 교육학적 스캐폴딩을 다각도로 자동 진단하는 데이터 기반 교육 지원 솔루션입니다.

* **자동 강의 품질 진단**: 관리자가 모든 수업을 직접 참관하지 않아도, AI가 수업 녹화본을 분석하여 객관적인 데이터 리포트를 생성합니다.
* **교사 역량 개발**: 발화 점유율, 질문 분포, 칭찬/피드백 즉시성 등을 정량화하여 교사 스스로 수업 방식을 성찰하고 발전시킬 수 있습니다.
* **지원 조건**: 실시간 라이브 수업 녹화본에 한해 제공됩니다. (외부 수동 업로드 영상은 지원되지 않습니다.)

---

## 활성화 방법 및 리포트 확인 위치

### 1. 기능 활성화 방법
계정 정보 → 일반 설정 → 부가가치 서비스 → **[AI 강의 분석]**을 켠 뒤, 수업을 생성할 때 [AI 강의 분석] 옵션을 체크합니다.

![AI 강의 분석 활성화](/images/updates/609/eval_02_34595856.png)

### 2. 리포트 확인 위치
수업 종료 후 인코딩이 완료되면 아래 경로에서 상세 분석 리포트를 열람할 수 있습니다.

* **관리자 대시보드**: [학습 관리] → [교사 개발 옵션] (원장 및 관리자만 열람 가능, PDF 다운로드 지원)
* **클래스인 교사 앱**: [코스] → [수업 다시보기] (해당 수업 담당 교사 본인만 확인 가능)

![관리자 교사 개발 리포트 위치](/images/updates/609/eval_04_34595856.png)

---

## AI 채점 기준: 4대 평가 영역 · 11개 세부 지표

AI는 공신력 있는 교육학적 루브릭을 바탕으로 다음 4개 영역 11개 항목을 종합 채점합니다.

| 평가 영역 | 세부 평가 항목 | 진단 목적 및 평가 관점 |
| :--- | :--- | :--- |
| **1. 수업 전달** | 효과성, 흥미·몰입도, 스캐폴딩·안내 | 핵심 개념 전달의 명료성, 학생 주의 환기, 학습자가 스스로 문제를 해결할 수 있도록 돕는 단계별 발판(Scaffolding) 제공 여부 |
| **2. 수업 분위기** | 적극적 참여, 협업, 정서적 안전감 | 학생들의 자발적 발화 유도, 동료 간 상호작용 유무, 틀려도 위축되지 않는 정서적 지지 환경 형성 여부 |
| **3. 수업 상호작용** | 공평성, 반응성·평등성, 자율성 | 특정 학생에게 편중되지 않는 공평한 질문 분배, 학생 답변에 대한 교사의 즉각적 피드백, 학생의 주도적 선택권 보장 |
| **4. 언어 표현** | 명료성·유창성, 표현력·전달력 | 정확하고 적절한 어휘 구사, 일정한 발화 속도, 불필요한 군더더기 말 배제 및 명확한 딕션 |

> **¹ 스캐폴딩(Scaffolding)이란?**  
> 적절한 목표 설정 지도와 필요한 기술 육성, 자기 성찰 수행 등 학습자가 스스로의 어려움을 극복하고 다음 단계로 도약할 수 있도록 교사가 단계별로 제공하는 교육학적 비계(지원책).

---

## 리포트 화면 예시 및 활용 방안

AI 강의 분석 리포트는 4대 영역 종합 레이더 차트, 수업 시간대별 발화 분포 타임라인, 세부 항목별 점수표와 강점/개선점 코멘트를 함께 제공합니다.

![종합 평가 리포트](/images/updates/609/eval_01_3a695856.png)
![세부 평가 항목 점수표](/images/updates/609/eval_05_34595856.png)

* **원장 및 교수부장**: 신규 강사 온보딩 및 학원 전체 강사진의 강의 품질 표준화 지표로 활용
* **교사 개인**: 본인의 수업 발화 습관, 학생 질문 편중 여부를 객관적으로 인지하고 지속적으로 수업 개선`

  const updates = [
    {
      slug: "classin-609-update",
      md: doc609Markdown,
      desc: "AI 칠판 고도화(STEM 수식 인식·실시간 채점), 교실 안 AgentIn 대화, AI 요약 에이전트 선택, 과제 연속 채점 등 ClassIn 6.0.9의 핵심 기능과 변경 사항을 안내합니다.",
      readMinutes: 6,
    },
    {
      slug: "classin-ai-blackboard-609",
      md: docBlackboardMarkdown,
      desc: "주관식·객관식·말하기 문항 출제부터 AI 실시간 채점, 손글씨 풀이 진단, 반 전체 학습 요소 분석까지 AI 칠판의 모든 단계별 활용법을 다룹니다.",
      readMinutes: 7,
    },
    {
      slug: "classin-ai-lesson-analysis",
      md: docLessonAnalysisMarkdown,
      desc: "수업 녹화본을 바탕으로 AI가 교사 발화, 학생 상호작용, 수업 분위기 등 4개 영역 11개 지표를 다각도로 정량 분석하여 교사 역량 개발을 지원합니다.",
      readMinutes: 5,
    },
  ]

  const articleMap = new Map<string, { id: string; title: string; category_id: string; slug: string }>()

  for (const item of updates) {
    const sections = parseMarkdownToSections(item.md)
    const { data: updatedArticle, error } = await supabase
      .from("docs_articles")
      .update({
        content_markdown: item.md,
        description: item.desc,
        content_json: {
          source: "admin-editor",
          readMinutes: item.readMinutes,
          sections,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("slug", item.slug)
      .select("id, title, category_id, slug")
      .single()

    if (error) {
      console.error(`Failed to update ${item.slug}:`, error)
    } else {
      console.log(`Updated ${item.slug}`)
      articleMap.set(item.slug, updatedArticle)
    }
  }

  console.log("[2/3] Generating docs_ai_chunks for the 3 articles...")

  for (const item of updates) {
    const article = articleMap.get(item.slug)
    if (!article) continue

    // Delete existing chunks for this article
    await supabase.from("docs_ai_chunks").delete().eq("article_id", article.id)

    const sections = parseMarkdownToSections(item.md)
    const chunks: {
      article_id: string
      chunk_index: number
      heading: string
      content: string
      content_hash: string
      token_count: number
      metadata: Record<string, unknown>
    }[] = []

    // 1. Summary chunk
    const summaryText = `${article.title}\n\n${item.desc}\n\n키워드: 6.0.9, AI 칠판, AgentIn, AI 강의평가, 실시간 자막 번역, 과제 채점`
    chunks.push({
      article_id: article.id,
      chunk_index: 0,
      heading: "요약",
      content: summaryText,
      content_hash: hashContent(summaryText),
      token_count: Math.ceil(summaryText.length / 4),
      metadata: {
        category: article.category_id,
        slug: article.slug,
        title: article.title,
        heading: "요약",
        chunkType: "summary",
        path: `/docs/${article.category_id}/${article.slug}`,
      },
    })

    // 2. Section chunks
    let chunkIdx = 1
    for (const sec of sections) {
      const secContent = `${article.title} > ${sec.heading}\n\n${sec.body}${
        sec.steps?.length ? `\n\n단계 및 세부사항:\n- ${sec.steps.join("\n- ")}` : ""
      }`
      chunks.push({
        article_id: article.id,
        chunk_index: chunkIdx++,
        heading: sec.heading,
        content: secContent,
        content_hash: hashContent(secContent),
        token_count: Math.ceil(secContent.length / 4),
        metadata: {
          category: article.category_id,
          slug: article.slug,
          title: article.title,
          heading: sec.heading,
          chunkType: "section",
          path: `/docs/${article.category_id}/${article.slug}`,
        },
      })
    }

    const { error: insertError } = await supabase.from("docs_ai_chunks").insert(chunks)
    if (insertError) {
      console.error(`Failed to insert chunks for ${item.slug}:`, insertError)
    } else {
      console.log(`Inserted ${chunks.length} chunks for ${item.slug}`)
    }
  }

  console.log("[3/3] Successfully refined markdown and synced docs_ai_chunks!")
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
