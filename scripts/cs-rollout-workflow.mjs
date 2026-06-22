export const meta = {
  name: 'cs-figma-rollout-judgment',
  description: 'CS 문서별 합성 이미지 레이아웃/소비자 카피/PII 영역을 vision으로 판정(픽셀 작업은 호출부가 결정론적으로 적용)',
  phases: [
    { title: 'Judge', detail: '문서별 vision 판정(격자/단일, 카피, PII 박스)' },
  ],
}

// args = [{ slug, category }, ...] 또는 { docs: [...] }. 문자열로 올 수 있어 파싱한다.
let parsedArgs = args
if (typeof parsedArgs === "string") {
  try { parsedArgs = JSON.parse(parsedArgs) } catch { parsedArgs = [] }
}
const docs = Array.isArray(parsedArgs) ? parsedArgs : (parsedArgs && Array.isArray(parsedArgs.docs) ? parsedArgs.docs : [])
log(`docs=${docs.length}`)

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slug: { type: 'string' },
    category: { type: 'string' },
    hasImage: { type: 'boolean', description: '문서 페이지에 cs-figma 합성 이미지가 있으면 true' },
    compositeSrc: { type: 'string', description: '이미지 src 경로 (예: /docs/files/cs-figma/x.png). 없으면 빈 문자열' },
    layout: { type: 'string', enum: ['single', 'grid', 'irregular'], description: '균등한 행×열 격자면 grid, 한 장이면 single, 불규칙(캡션 섞임/크기 제각각)이면 irregular' },
    rows: { type: 'integer', description: 'grid일 때 행 수, 아니면 1' },
    cols: { type: 'integer', description: 'grid일 때 열 수, 아니면 1' },
    splitConfidence: { type: 'string', enum: ['high', 'low'], description: '균등 격자로 깔끔히 분할 가능하면 high' },
    consumerTitle: { type: 'string', description: '행동 중심 소비자용 제목(피그마/CS/캡처 단어 금지)' },
    consumerIntro: { type: 'string', description: '1~2문장 소비자용 도입문' },
    stages: {
      type: 'array',
      description: '단계별 소비자 안내. panelIndex는 reading order(좌→우,위→아래) 1-based; 분할 불가/단일이면 0',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          panelIndex: { type: 'integer' },
        },
        required: ['title', 'body', 'panelIndex'],
      },
    },
    tips: { type: 'array', items: { type: 'string' } },
    piiRegions: {
      type: 'array',
      description: '가릴 외부 클라이언트 PII 영역(분수 좌표 0~1, 패널 기준).',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          panelIndex: { type: 'integer', description: 'reading order 1-based; 단일 이미지면 1' },
          xFrac: { type: 'number' },
          yFrac: { type: 'number' },
          wFrac: { type: 'number' },
          hFrac: { type: 'number' },
          kind: { type: 'string', enum: ['academy-name', 'logo-watermark', 'phone', 'email', 'account-id'] },
        },
        required: ['panelIndex', 'xFrac', 'yFrac', 'wFrac', 'hFrac', 'kind'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['slug', 'category', 'hasImage', 'layout', 'rows', 'cols', 'splitConfidence', 'consumerTitle', 'consumerIntro', 'stages', 'tips', 'piiRegions'],
}

function buildPrompt(doc) {
  return `너는 ClassIn 학원솔루션의 CS 사용 가이드 문서를 소비자용으로 정리하는 분석가다.

대상 문서: /docs/${doc.category}/${doc.slug}

해야 할 일 (직접 파일을 수정하지 말고, 판정 결과만 StructuredOutput으로 반환):

1) 페이지 HTML을 가져와 본문 단계 텍스트와 합성 이미지 경로를 파악한다:
   bash: curl -s "http://localhost:3888/docs/${doc.category}/${doc.slug}"
   - 본문의 단계(순서) 텍스트, 제목, 그리고 cs-figma 이미지 src(예: /docs/files/cs-figma/xxx.png)를 찾는다.
   - 이미지가 없으면 hasImage=false, compositeSrc="" 로 반환하고 layout="single", stages=[] 로 둔다.

2) 합성 이미지를 직접 본다(Read 도구로 파일을 연다):
   파일 디스크 경로 = "public" + 이미지 src.  예: public/docs/files/cs-figma/xxx.png
   - 이미지가 "균등한 행×열 격자"(각 셀 크기가 비슷, 여러 스크린샷이 규칙적으로 배열)면 layout="grid", rows/cols를 채우고 splitConfidence를 정한다.
     · 셀 크기가 제각각이거나 캡션이 스크린샷 사이에 끼어 행 높이가 불규칙하면 layout="irregular", splitConfidence="low".
     · 스크린샷이 한 장이면 layout="single".
   - 균등 격자만 high. 조금이라도 불규칙하면 low (그러면 호출부가 분할하지 않고 단일 이미지로 둔다).

3) 소비자용 카피 작성 (한국어, 따뜻하고 간결, 이모지 금지):
   - consumerTitle: 행동 중심 제목. "Figma/CS/원본 캡처/캡쳐" 단어 절대 금지.
   - consumerIntro: 1~2문장.
   - stages: 단계별 안내. 각 stage.body에서 "(빨간 박스/화살표 표시)" 같은 화면 주석과 "예: 1026165787" 같은 식별자는 빼고 행동만 적는다. panelIndex는 그 단계가 보이는 패널(reading order 좌→우,위→아래, 1-based). grid가 아니거나 단일이면 모든 stage.panelIndex=0.
   - tips: 있으면 1~3개(주의/팁).

4) 가릴 PII 영역 (piiRegions, 패널 기준 분수 좌표 0~1):
   - 가릴 것: 외부 학원/기관 이름·로고·워터마크(ClassIn 제외), 전화번호, 이메일, 전화번호처럼 보이는 로그인/계정 ID.
   - 가리지 말 것: 사람 이름(예: "Minjae Kim"), 명백한 데모/테스트 계정(예: "EEO-TEST-..."), 일반 UI 숫자.
   - 좌표는 해당 패널(grid면 그 셀, single이면 전체)을 기준으로 한 분수. 넉넉하게 잡되 핵심 안내(빨간 박스/화살표)는 가리지 말 것.
   - 없으면 빈 배열.

slug="${doc.slug}", category="${doc.category}" 를 그대로 반환에 포함한다.`
}

const results = await parallel(
  docs.map((doc) => () =>
    agent(buildPrompt(doc), { label: `judge:${doc.slug}`, phase: 'Judge', schema: SCHEMA })
      .then((r) => r ?? { slug: doc.slug, category: doc.category, hasImage: false, layout: 'single', rows: 1, cols: 1, splitConfidence: 'low', consumerTitle: '', consumerIntro: '', stages: [], tips: [], piiRegions: [], notes: 'agent-null' })
  )
)

return results.filter(Boolean)
