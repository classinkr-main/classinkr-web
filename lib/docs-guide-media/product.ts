import type { DocMedia } from "@/lib/docs"
import type { GuideMediaMap } from "./types"

// 키: "<카테고리>/<slug>" → 섹션 제목(heading) → 그 섹션 아래 붙일 화면.
// 이미지는 scripts/docs-guide-shots/product.json 으로 만든다(원본·자른 위치·가린 영역 기록).
// /images/product/... 는 제품 페이지에 쓰는 이미지를 그대로 쓴다.

const G = "/docs/files/guides"
const HW = "/images/product/hw"

function img(src: string, width: number, height: number, alt: string, caption?: string): DocMedia {
  return { type: "image", src, alt, caption, width, height }
}

// 여러 문서에서 같이 쓰는 화면
const CLASS_TOOLS_PALETTE = (caption: string) =>
  img(
    `${G}/classin-ai-blackboard-609/01-open-ai-blackboard.webp`,
    1000,
    863,
    "교실 오른쪽 도구 막대의 수업 도구를 눌러 연 도구 모음 화면",
    caption,
  )
const ADD_ACTIVITY_TYPES = (caption: string) =>
  img(
    `${G}/lesson-activities/01-add-activity-types.webp`,
    624,
    508,
    "코스에서 새로 만들기를 눌렀을 때 열리는 학습 활동 추가하기 창",
    caption,
  )
const HOMEWORK_AI_GRADING = (caption: string) =>
  img(
    `${G}/classin-609-update/03-homework-ai-grading.webp`,
    1200,
    791,
    "숙제 읽기 화면에서 AI가 채운 점수와 총평 초안을 확인하며 채점하는 화면",
    caption,
  )
const REPLAY_AI_ANALYSIS = (caption: string) =>
  img(
    `${G}/classin-ai-lesson-analysis/01-replay-ai-analysis.webp`,
    1200,
    791,
    "수업 다시보기 화면의 AI 강의 분석 결과. 종합 점수와 영역별 점수가 보인다",
    caption,
  )
const VALUE_ADDED_TOGGLE = (caption: string) =>
  img(
    `${G}/classin-ai-lesson-analysis/04-value-added-service-toggle.webp`,
    1200,
    326,
    "관리자 대시보드 일반 설정의 부가가치 서비스 탭에서 기본 에이전트와 AI 강의 분석 토글을 켠 화면",
    caption,
  )
const BLACKBOARD_GRADING = (caption: string) =>
  img(
    `${G}/classin-ai-blackboard-609/08-ai-grading-detail.webp`,
    1200,
    559,
    "AI 칠판 답안 상세 화면. 학생 답안 옆에 AI 채점의 판정, 상세 분석, 종합 제안이 보인다",
    caption,
  )
const MAGIC_PEN = (caption: string) =>
  img(
    `${G}/classroom-tools/02-magic-pen.webp`,
    420,
    808,
    "판서 도구 모음에서 펜 종류 가운데 매직펜을 고르는 화면",
    caption,
  )
const EXPANDABLE_WRITING = (caption: string) =>
  img(
    `${G}/classroom-tools/01-expandable-writing-space.webp`,
    1200,
    657,
    "칠판 아래쪽에 초록 가로선이 생기고 가로선을 위아래로 드래그하라는 안내가 뜬 판서 화면",
    caption,
  )
const SAVE_SHARE_BOARD = (caption: string) =>
  img(
    `${G}/classroom-tools/05-save-share-board.webp`,
    851,
    559,
    "수업 도구의 판서 저장/공유를 눌러 연 판서 저장 및 공유 창과 드라이브에 저장 창",
    caption,
  )
const CLASSROOM_CONTROL_PANEL = (caption: string) =>
  img(
    `${G}/board-basic-operation/01-classroom-control-panel.webp`,
    1100,
    769,
    "전자칠판 수업 화면 하단에서 연 제어 패널. 스피커, 마이크, 카메라 카드와 로컬 수업 녹화, 교실에서 나가기, 슬라이드하여 수업 종료하기가 보인다",
    caption,
  )
const AUDIO_SETTINGS = (caption: string) =>
  img(
    `${G}/mic-dt2-pro/01-classroom-audio-settings.webp`,
    900,
    775,
    "클래스인 교실 설정의 마이크 탭. 마이크와 스피커 선택, 자동 마이크 볼륨 조정, 배경 소음 감소, 음악 모드가 보인다",
    caption,
  )
const START_ONSITE_RECORDING = (caption: string) =>
  img(
    `${G}/board-ai-camera-mic/04-start-recording.webp`,
    895,
    544,
    "전자칠판에서 현장 녹화 창의 바로 녹화하기 버튼과 설정의 카메라 목록을 연 모습",
    caption,
  )

export const PRODUCT_GUIDE_MEDIA: GuideMediaMap = {
  // ── 소프트웨어 ─────────────────────────────────────────────
  "software/software-overview": {
    "화면에서 찾을 때는 다섯 묶음으로": [
      CLASS_TOOLS_PALETTE("수업 도구는 교실 오른쪽 도구 막대의 [수업 도구]를 눌러 엽니다. 보이는 도구는 기관 설정에 따라 다릅니다."),
      ADD_ACTIVITY_TYPES("학습 활동은 코스에서 [새로 만들기]를 누르면 나오는 창에서 종류를 골라 만듭니다."),
    ],
  },
  "software/classroom-tools": {
    "수업 단계마다 꺼내는 도구가 다릅니다": [
      CLASS_TOOLS_PALETTE("교실 오른쪽 도구 막대의 [수업 도구]를 누르면 도구 모음이 열립니다. 아래로 내리면 더 많은 도구가 나옵니다."),
    ],
    "판서하고 자료를 보여 줄 때": [
      EXPANDABLE_WRITING("칠판이 가득 차면 마우스 오른쪽 버튼으로 가로선을 띄우고, 선을 아래로 끌어 판서 공간을 늘립니다."),
      MAGIC_PEN("펜 종류에서 매직펜을 고르면 쓴 획이 1초 뒤 저절로 사라집니다."),
    ],
    "EDB 교안 만들고 다시 쓰기": [
      img(
        `${G}/classroom-tools/03-blackboard-menu.webp`,
        1100,
        744,
        "클래스인 홈 화면 왼쪽 메뉴에서 칠판을 가리킨 화면",
        "수업 전에 판서를 미리 만들려면 클래스인 왼쪽 메뉴의 [칠판]을 누릅니다.",
      ),
      img(
        `${G}/classroom-tools/04-open-edb-file.webp`,
        1060,
        471,
        "칠판 화면에서 수업 도구의 파일 열기와 드라이브 창을 함께 연 화면",
        "[수업 도구] → [파일 열기]로 내 컴퓨터의 .edb 파일을, 오른쪽 클라우드 드라이브 버튼으로 드라이브의 .edb 파일을 불러옵니다.",
      ),
      SAVE_SHARE_BOARD("다 만든 판서는 [수업 도구] → [판서 저장/공유]에서 드라이브에 저장합니다. 파일 유형은 .edb, .png, .pdf 중에서 고릅니다."),
    ],
  },
  "software/lesson-activities": {
    "활동을 만들기 전에 정할 것": [
      ADD_ACTIVITY_TYPES("코스 과정 탭에서 [새로 만들기]를 누르면 학습 활동 종류를 고르는 창이 열립니다. AI 표시가 붙은 활동은 AI 기능을 함께 씁니다."),
    ],
    "숙제와 일일 과제": [
      HOMEWORK_AI_GRADING("AI 채점을 켠 숙제는 채점 화면에 점수와 총평 초안이 먼저 채워집니다. 교사가 확인한 뒤 게시합니다."),
    ],
    "시험과 OMR 카드": [
      img(
        `${G}/lesson-activities/02-new-exam.webp`,
        1059,
        684,
        "새 시험 추가 화면. 문제 은행에서 불러오기, 시험 문제 추가, 시험 문제 대량 추가, AI 출제 버튼과 오른쪽 시간·점수·게시 설정이 보인다",
        "문항은 위쪽 버튼으로 넣고, 응시 시간과 점수 설정은 오른쪽에서 정합니다.",
      ),
    ],
    "따라읽기·받아쓰기·외워말하기로 어학 연습하기": [
      img(
        `${G}/lesson-activities/03-repeat-after-me-student.webp`,
        1100,
        725,
        "학생이 따라읽기 활동을 하는 화면. 가운데 단어와 마이크 버튼, 오른쪽에 문제 목록이 보인다",
        "학생은 오른쪽 목록에서 연습할 문장을 골라 마이크 버튼을 누르고 읽은 뒤 [제출하기]를 누릅니다.",
      ),
    ],
  },
  "software/ai-learning-tools": {
    "강사가 쓰는 AI 기능": [
      HOMEWORK_AI_GRADING("숙제 AI 채점 결과는 초안으로 먼저 들어옵니다. 점수를 확인한 뒤 [게시 후 다음 학생]으로 공개합니다."),
    ],
    "수업 중에 문제를 내는 AI 칠판": [
      img(
        `${G}/classin-ai-blackboard-609/02-write-question.webp`,
        1100,
        747,
        "AI 칠판 문항 작성 화면. 주관식, 객관식, 말하기 탭과 입력 도구, 채점 AI 에이전트 선택, 게시 버튼이 보인다",
        "유형을 고르고 문제를 입력한 뒤, 채점할 AI 에이전트를 확인하고 [게시]를 누릅니다.",
      ),
      img(
        `${G}/classin-ai-blackboard-609/10-answer-stats.webp`,
        1200,
        559,
        "AI 칠판 답안 현황 화면. 참여 인원, 평균 소요 시간, 점수 분포, 학습 요소별 정답률, 지도 제안이 보인다",
        "[답안 현황]에서 반 전체 점수 분포와 지도 제안을 보고 다시 설명할 곳을 정합니다.",
      ),
    ],
  },
  "software/admin-monitoring-analytics": {
    "끝난 수업의 기록 보기": [
      img(
        `${G}/admin-monitoring-analytics/02-lesson-manage-menu.webp`,
        786,
        183,
        "관리자 대시보드 수업 목록에서 관리 메뉴를 펼친 화면. 수업 모니터링 데이터, 웹 라이브 및 다시 보기 관리, 수업 녹화 데이터, 학습 보고서가 보인다",
        "수업 오른쪽 [관리]를 누르면 수업 모니터링 데이터, 수업 녹화 데이터, 학습 보고서로 들어갑니다.",
      ),
      img(
        `${G}/admin-monitoring-analytics/01-lesson-monitoring-detail.webp`,
        1200,
        569,
        "수업 모니터링 데이터 화면. 위에 교실 스크린샷, 가운데 학생 수 도표, 아래 교사·학생 출석과 입장 시간줄이 있다",
        "1분 간격 교실 스크린샷, 시간대별 학생 수, 사람마다의 출석과 입장·퇴장 시간을 한 화면에서 봅니다.",
      ),
    ],
    "웹 라이브와 플레이백": [
      img(
        `${G}/admin-monitoring-analytics/03-web-live-options.webp`,
        418,
        423,
        "수업 생성 창의 웹 라이브&플레이백 설정. 로그인 필요, 비밀번호 입력 후 시청, 채팅 허용, 시청 권한, 커버 이미지와 소개 입력란이 보인다",
        "수업을 만들 때 [웹 라이브&플레이백]을 켜고 로그인, 비밀번호, 채팅, 시청 권한을 정합니다.",
      ),
    ],
    "기간별 통계 내려받기": [
      img(
        `${G}/admin-monitoring-analytics/05-statistics-download.webp`,
        520,
        492,
        "관리자 대시보드 결제 메뉴의 통계 다운로드 화면. 기간 선택과 수업 소비, 저장 소비, 출결 통계, 수업 강의 분석 다운로드 버튼이 보인다",
        "위쪽에서 기간을 고른 뒤 필요한 항목의 [다운로드]를 누릅니다.",
      ),
    ],
  },
  "software/app-capabilities-map": {
    "코스에 올리는 학습 활동 9종": [
      ADD_ACTIVITY_TYPES("코스에서 [새로 만들기]를 누르면 학습 활동 종류를 고르는 창이 열립니다."),
    ],
    "수업 중에 꺼내 쓰는 교실 도구": [
      CLASS_TOOLS_PALETTE("교실 오른쪽 도구 막대의 [수업 도구]를 누르면 도구 모음이 열립니다."),
    ],
    "AI 기능은 보조로 씁니다": [
      BLACKBOARD_GRADING("AI 칠판은 학생 답안을 채점해 판정, 상세 분석, 종합 제안을 보여 줍니다. 점수는 교사가 확인합니다."),
    ],
  },
  "software/classin-ai-feature-guide": {
    "AI 기능을 화면과 함께 살펴보세요": [
      REPLAY_AI_ANALYSIS("AI 강의 분석: 수업 다시보기의 [AI 강의 분석]에서 종합 점수와 영역별 점수를 봅니다."),
      BLACKBOARD_GRADING("AI 칠판: 학생이 답을 내면 AI 채점 결과가 판정, 상세 분석, 종합 제안으로 나옵니다."),
    ],
    "사용 전에 확인하세요": [
      VALUE_ADDED_TOGGLE("AI 강의 분석은 대시보드 [계정 정보] > [일반 설정] > [부가가치 서비스]에서 켭니다."),
    ],
  },

  // ── 업데이트 ───────────────────────────────────────────────
  "updates/classin-609-update": {
    "교실 안 AgentIn 대화 지원": [
      img(
        `${G}/classin-609-update/01-agentin-menu.webp`,
        900,
        664,
        "교실 오른쪽 도구 막대 맨 아래 AI 버튼을 눌러 연 메뉴. 자막 번역과 AgentIn 에이전트 항목이 보인다",
        "도구 막대 맨 아래 AI 버튼을 누르고 [AgentIn 에이전트]를 고릅니다.",
      ),
      img(
        `${G}/classin-609-update/02-agentin-student-allow.webp`,
        900,
        524,
        "AI 메뉴의 기능 오른쪽 더보기를 눌러 수업 중 학생 사용 허용을 켠 화면",
        "기능 오른쪽 [⋯]에서 [수업 중 학생 사용 허용]을 켜면 학생도 그 기능을 씁니다.",
      ),
    ],
    "AI 칠판 고도화 및 STEM 수식 인식": [
      img(
        `${G}/classin-ai-blackboard-609/09-student-ai-result.webp`,
        960,
        663,
        "학생 화면의 AI 칠판 결과. 손글씨로 쓴 화학식 답안 옆에 AI 채점 판정과 상세 분석, 종합 제안이 보인다",
        "학생이 손글씨로 쓴 수식을 AI가 읽고 채점 결과를 바로 보여 줍니다.",
      ),
    ],
    "AI 요약 에이전트 선택": [
      img(
        `${G}/classin-609-update/05-ai-summary-option.webp`,
        786,
        1120,
        "수업 새로 만들기 창 오른쪽 설정. 교실 녹화, 카메라 녹화, AI 강의 분석, AI 요약과 요약 에이전트, AI 스크립트 토글이 보인다",
        "[AI 요약]을 켜고 아래 목록에서 요약 에이전트를 고릅니다.",
      ),
    ],
    "과제 임시저장 및 연속 채점 기능": [
      HOMEWORK_AI_GRADING("[저장 후 다음 학생]은 초안으로 저장하고, [게시 후 다음 학생]은 결과를 공개하고 다음 학생으로 넘어갑니다."),
      img(
        `${G}/classin-609-update/04-homework-publish-all.webp`,
        1100,
        803,
        "숙제 데이터 화면. 미제출, 채점 대기, 채점 완료 탭과 모두 공개 버튼, 학생별 AI 채점 완료 표시가 보인다",
        "초안으로 둔 채점 결과는 [모두 공개]로 한 번에 공개합니다.",
      ),
    ],
    "다국어 실시간 자막 및 음성 번역": [
      img(
        `${G}/classin-609-update/06-live-caption-option.webp`,
        786,
        840,
        "수업 새로 만들기 창에서 실시간 자막 번역 토글을 켠 화면",
        "수업을 만들 때 [실시간 자막 번역]을 켭니다. AI 인식 결과는 참고용입니다.",
      ),
      img(
        `${G}/classin-609-update/07-live-caption-settings.webp`,
        1200,
        529,
        "수업 중 자막 창과 설정. 글자 크기, 원문 언어, 번역 언어, 이중 언어 표시와 언어 목록이 보인다",
        "자막 창의 설정에서 글자 크기, 원문 언어, 번역 언어, 원문·번역 함께 보기를 정합니다.",
      ),
    ],
    "수업 녹화본 기반 AI 강의 품질 진단 리포트": [
      REPLAY_AI_ANALYSIS("교사는 수업 다시보기의 [AI 강의 분석]에서 자기 수업 보고서를 봅니다."),
    ],
  },
  "updates/classin-ai-blackboard-609": {
    "1. AI 칠판 열기": [
      CLASS_TOOLS_PALETTE("교실 오른쪽 도구 막대의 [수업 도구]를 누르고 도구 모음 아래쪽의 [AI 칠판]을 누릅니다."),
    ],
    "2. 문항 쓰고 채점 기준 만들기": [
      img(
        `${G}/classin-ai-blackboard-609/02-write-question.webp`,
        1100,
        747,
        "AI 칠판 문항 작성 화면. 주관식, 객관식, 말하기 탭과 음성·화면·카메라·이미지·클라우드 입력 버튼, 채점 AI 에이전트 선택, 게시 버튼이 보인다",
        "위쪽에서 유형을 고르고 문제를 입력합니다. 왼쪽 아래에서 채점할 AI 에이전트를 고릅니다.",
      ),
      img(
        `${G}/classin-ai-blackboard-609/03-ai-answer-rubric.webp`,
        1100,
        747,
        "모범 답안 창에서 AI 답안 생성으로 참고 답안과 채점 기준을 만든 화면",
        "[모범 답안] → [AI 답안 생성]을 누르면 참고 답안과 채점 기준이 만들어집니다. 고친 뒤 [확인]을 누릅니다.",
      ),
    ],
    "3. 학생 화면에서 답 쓰기": [
      img(
        `${G}/classin-ai-blackboard-609/04-student-answer-tools.webp`,
        960,
        663,
        "학생 화면의 AI 칠판. 문제 아래에 카메라, 이미지, 음성, 그림판 버튼과 답안 입력란이 있다",
        "학생은 글자 입력, 카메라, 이미지, 음성, [그림판] 가운데 편한 방법으로 답합니다.",
      ),
      img(
        `${G}/classin-ai-blackboard-609/05-student-handwriting.webp`,
        960,
        663,
        "학생이 그림판에 손글씨로 화학식을 쓰고 답안 제출 버튼이 활성화된 화면",
        "수식과 풀이는 [그림판]에 펜으로 쓰고 [답안 제출]을 누릅니다.",
      ),
      img(
        `${G}/classin-ai-blackboard-609/06-student-speaking.webp`,
        960,
        663,
        "학생 화면의 말하기 문항. 음성 파형과 녹음 시간, 녹음 정지 버튼이 보인다",
        "말하기 문항은 녹음해서 음성으로 답합니다.",
      ),
    ],
    "4. 답안 상세에서 학생별 진행 보기": [
      img(
        `${G}/classin-ai-blackboard-609/07-answer-cards.webp`,
        1100,
        747,
        "AI 칠판 답안 상세 탭. 학생 카드와 시작 전 상태, 왼쪽 학생 목록, 오른쪽 아래 답안 종료 버튼이 보인다",
        "[답안 상세]에 학생마다 카드가 생기고 진행 상태가 보입니다. 마감할 때는 [답안 종료]를 누릅니다.",
      ),
    ],
    "5. AI 채점 결과 확인하기": [
      BLACKBOARD_GRADING("학생 카드를 열면 답안 옆에 AI 채점 결과와 점수, 소요 시간이 보입니다."),
      img(
        `${G}/classin-ai-blackboard-609/09-student-ai-result.webp`,
        960,
        663,
        "학생 화면의 AI 칠판 결과. 손글씨 답안 옆에 AI 채점 판정과 상세 분석, 종합 제안, 점수가 보인다",
        "학생도 자기 화면에서 같은 채점 결과와 점수를 봅니다.",
      ),
    ],
    "6. 답안 현황으로 반 전체 진단하기": [
      img(
        `${G}/classin-ai-blackboard-609/10-answer-stats.webp`,
        1200,
        559,
        "AI 칠판 답안 현황 탭. 참여 인원, 평균 소요 시간, 점수 분포, 본 문항 학습 요소별 정답률, 지도 제안, 새 문항 게시하기 버튼이 보인다",
        "[답안 현황]에서 반 전체 결과와 지도 제안을 보고 [새 문항 게시하기]로 다음 문제를 냅니다.",
      ),
    ],
  },
  "updates/classin-ai-lesson-analysis": {
    "1. AI 강의 분석(수업 품질 진단)이란?": [
      REPLAY_AI_ANALYSIS("보고서는 수업 다시보기 화면의 [AI 강의 분석]에 나옵니다. 옆의 [AI 요약], [AI 스크립트]는 다른 기능입니다."),
      img(
        `${G}/classin-ai-lesson-analysis/02-report-time-chart.webp`,
        900,
        1183,
        "AI 강의 분석 보고서의 수업 시간 배분 차트. 교사 강의, 상호 작용, 학생 참여, 기타 비중과 시간 흐름이 보인다",
        "보고서에는 수업 시간 중 교사 강의, 상호 작용, 학생 참여가 차지한 비중과 흐름도 나옵니다.",
      ),
    ],
    "3. 보는 순서 — 강사 자기 점검, 코칭 근거, 관리자 비교": [
      img(
        `${G}/classin-ai-lesson-analysis/03-admin-teacher-development.webp`,
        1200,
        593,
        "관리자 대시보드 학습 관리의 교사 개발을 눌러 연 AI 강의 분석 목록. 수업 이름, 교사, 시작일 검색과 AI 수업 분석 점수 열이 보인다",
        "관리자는 대시보드 [학습 관리] → [교사 개발]에서 수업별 AI 수업 분석 점수를 모아 봅니다.",
      ),
    ],
    "4. 활성화 설정과 분석 범위": [
      VALUE_ADDED_TOGGLE("[계정 정보] > [일반 설정] > [부가가치 서비스]에서 [AI 강의 분석]을 켭니다."),
      img(
        `${G}/classin-ai-lesson-analysis/05-lesson-ai-analysis-option.webp`,
        786,
        868,
        "수업 새로 만들기 창에서 AI 강의 분석 토글과 분석 에이전트 선택 목록이 보이는 화면",
        "수업을 만들 때 [AI 강의 분석]을 켜고, 아래 목록에서 분석 에이전트를 고릅니다.",
      ),
    ],
  },

  // ── 하드웨어 ───────────────────────────────────────────────
  "hardware/board-overview": {
    "일반 전자칠판과 다른 점": [
      img(
        `${HW}/features/feature-interactive.webp`,
        1360,
        840,
        "강사가 보드 앞에서 설명하고 화면 위쪽에 원격 학생 영상이 함께 뜬 수업 장면",
        "카메라와 마이크를 붙이면 교실 수업과 원격 학생이 같은 화면으로 이어집니다.",
      ),
    ],
    "외장 PC와 HDMI 선 없이 켜서 씁니다": [
      img(
        `${HW}/ops/ops-glass-energy-module-black.webp`,
        1717,
        916,
        "탈착식 OPS 컴퓨터 모듈을 표현한 제품 이미지",
        "탈착식 OPS 컴퓨터가 보드 안에 들어가 있어 외장 PC 없이 수업 화면이 켜집니다.",
      ),
    ],
  },
  "hardware/board-basic-operation": {
    "수업이 끝나면 교실에서 이렇게 나갑니다": [
      CLASSROOM_CONTROL_PANEL("[교실에서 나가기]는 강사만 나가고, 오른쪽 위 [슬라이드하여 수업 종료하기]는 수업을 끝냅니다."),
    ],
  },
  "hardware/board-writing-touch": {
    "지우고 끝나는 칠판과 다른 점": [
      MAGIC_PEN("펜 종류에서 매직펜을 고르면 쓴 획이 1초 뒤 사라져 기존 판서를 가리지 않습니다."),
    ],
    "페이지를 넘기며 이어 쓰기": [
      EXPANDABLE_WRITING("판서 영역이 차면 마우스 오른쪽 버튼으로 초록 가로선을 띄우고 아래로 끌어 새 공간을 만듭니다."),
    ],
    "수업이 끝난 뒤 판서 넘기기": [
      SAVE_SHARE_BOARD("[수업 도구] → [판서 저장/공유]에서 저장 방법을 고릅니다. 드라이브에 저장할 때는 파일 유형을 .edb, .png, .pdf 중에서 고릅니다."),
    ],
    "터치가 튀거나 안 먹힐 때": [
      img(
        `${HW}/details/bezel-closeup.webp`,
        1536,
        1024,
        "Classin Board 화면 모서리와 테두리(베젤)를 가까이서 본 이미지",
        "적외선 터치는 화면 테두리(베젤)에서 손과 펜을 읽습니다. 테두리에 먼지가 끼면 터치가 튑니다.",
      ),
    ],
  },
  "hardware/board-ai-camera-mic": {
    "강사 목소리가 원격 학생에게 들리는지": [
      AUDIO_SETTINGS("교실 설정의 [마이크]에서 실제로 쓸 마이크를 고르고, 말할 때 아래 막대가 초록색으로 움직이는지 봅니다."),
    ],
    "원격 학생이 있는 수업, 시작 5분 전에": [
      img(
        `${G}/board-ai-camera-mic/01-device-test.webp`,
        630,
        340,
        "수업 입장 전 장비 테스트 화면. 카메라, 마이크, 스피커 선택과 수업 입장 버튼이 보인다",
        "입장 전 장비 테스트에서 카메라, 마이크, 스피커를 확인하고 [수업 입장]을 누릅니다. 마이크가 '사용 안 함'이면 바꿉니다.",
      ),
      CLASSROOM_CONTROL_PANEL("수업 중에는 하단 도구 막대 오른쪽 톱니바퀴를 눌러 나오는 패널에서 마이크와 카메라를 다시 고릅니다."),
    ],
    "카메라 화면까지 녹화하려면 현장 녹화를 켭니다": [
      img(
        `${G}/board-ai-camera-mic/02-onsite-recording-option.webp`,
        497,
        617,
        "수업 새로 만들기 창에서 시작 시각, 온스테이지 인원수 1V0, 현장 녹화 토글을 표시한 화면",
        "수업을 만들 때 온스테이지 인원수를 1V0으로 두고 [현장 녹화]를 켠 뒤 [등록]을 누릅니다.",
      ),
      img(
        `${G}/board-ai-camera-mic/03-recording-notice.webp`,
        967,
        596,
        "전자칠판 화면에 현장 녹화가 켜진 수업이라는 알림과 확인 버튼이 뜬 모습",
        "교실에 들어가면 현장 녹화 알림이 뜹니다. 권장 사양을 확인하고 [확인]을 누릅니다.",
      ),
      START_ONSITE_RECORDING("현장 녹화 창의 톱니바퀴를 눌러 녹화할 카메라를 고르고 [바로 녹화하기]를 누릅니다."),
      img(
        `${G}/board-ai-camera-mic/05-recording-indicator.webp`,
        392,
        195,
        "전자칠판 하단 도구 막대 위에 현장 녹화 진행 중 표시가 뜬 모습",
        "녹화 중이면 하단 캠코더 아이콘이 초록색이고, 누르면 '현장 녹화 진행 중'이 보입니다.",
      ),
    ],
  },
  "hardware/board-install-readiness": {
    "설치 방식부터 정합니다": [
      img(
        `${HW}/hero/hero-board-stand.webp`,
        1536,
        1024,
        "이동형 스탠드에 올린 Classin Board",
        "이동형 스탠드는 설치가 간단하고 교실을 옮겨 가며 씁니다.",
      ),
      img(
        `${HW}/spaces/space-s86-classroom.webp`,
        1672,
        941,
        "교실 앞쪽 벽에 건 Classin Board",
        "벽걸이는 벽이나 기존 칠판 위에 브래킷으로 고정합니다. 벽 재질에 따라 보강이 필요합니다.",
      ),
    ],
  },
  "hardware/board-s-series-safe-use": {
    "화면 관리와 청소": [
      img(
        `${HW}/board/board-bezel-detail.webp`,
        1647,
        955,
        "ClassIn Board 화면 모서리와 테두리(베젤)를 가까이서 본 이미지",
        "청소할 때 화면뿐 아니라 테두리(베젤)도 함께 닦습니다. 테두리에 먼지가 끼면 터치가 튈 수 있습니다.",
      ),
    ],
  },
  "hardware/mic-dt2-pro": {
    "설치 후 세팅 순서": [
      AUDIO_SETTINGS("교실 설정의 [마이크]에서 마이크와 스피커를 DT2 Pro로 고르고 [음악 모드]를 켭니다. 화면은 다른 마이크가 선택된 예시입니다."),
    ],
  },
  "hardware/cam-t1-s1": {
    "T1은 강사를, S1은 발표하는 학생을 찍습니다": [
      img(
        `${HW}/camera/camera-dual-premium-blended.webp`,
        1402,
        1122,
        "ClassIn Cam 추적 카메라 두 대를 위아래로 놓은 제품 이미지",
        "T1과 S1은 크기와 사양이 같고 렌즈만 다릅니다.",
      ),
    ],
    "카메라가 이상할 때 먼저 볼 것": [
      START_ONSITE_RECORDING("클래스인 카메라 목록에는 설치 때 등록한 이름으로 추적 화면(T1-Tracking)과 고정 화면(T1-Panorama), S1이 따로 보입니다."),
    ],
  },
}
