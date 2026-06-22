export type SlashCommandId =
  | "h2"
  | "h3"
  | "image"
  | "quote"
  | "checklist"
  | "callout"
  | "divider"

export interface SlashCommand {
  id: SlashCommandId
  label: string
  description: string
  aliases: string[]
  markdown: string
}

export interface DocsEditorHelp {
  term: string
  title: string
  description: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "h2",
    label: "큰 소제목",
    description: "문서 목차에 잡히는 주요 섹션을 만듭니다.",
    aliases: ["h2", "heading", "section", "제목", "소제목"],
    markdown: "## 새 섹션",
  },
  {
    id: "h3",
    label: "작은 소제목",
    description: "섹션 안의 하위 내용을 나눕니다.",
    aliases: ["h3", "subheading", "sub", "하위", "작은제목"],
    markdown: "### 세부 항목",
  },
  {
    id: "image",
    label: "이미지",
    description: "파일 업로드, URL 삽입, 붙여넣기 이미지에 사용합니다.",
    aliases: ["image", "img", "photo", "picture", "이미지", "사진"],
    markdown: "",
  },
  {
    id: "quote",
    label: "인용",
    description: "중요한 안내문이나 예외 조건을 분리합니다.",
    aliases: ["quote", "blockquote", "인용", "안내"],
    markdown: "> 중요한 안내를 입력하세요.",
  },
  {
    id: "checklist",
    label: "체크리스트",
    description: "운영자가 순서대로 확인할 항목을 만듭니다.",
    aliases: ["check", "todo", "list", "체크", "체크리스트", "할일"],
    markdown: "- [ ] 확인할 항목\n- [ ] 다음 항목",
  },
  {
    id: "callout",
    label: "주의 박스",
    description: "사용자가 놓치기 쉬운 조건을 강조합니다.",
    aliases: ["callout", "note", "warning", "주의", "메모"],
    markdown: "> **주의:** 확인이 필요한 조건을 입력하세요.",
  },
  {
    id: "divider",
    label: "구분선",
    description: "문서 흐름을 시각적으로 나눕니다.",
    aliases: ["divider", "hr", "line", "구분선"],
    markdown: "---",
  },
]

const HELP_TERMS: DocsEditorHelp[] = [
  {
    term: "slug",
    title: "URL 주소(slug)",
    description:
      "공개 URL 주소의 마지막 부분입니다. 예: /docs/start/pc-install 에서 pc-install. 영어 소문자, 숫자, 하이픈만 씁니다.",
  },
  {
    term: "seo",
    title: "SEO",
    description:
      "검색 엔진과 공유 미리보기에서 쓰는 제목/설명입니다. 비워도 기본값이 들어가지만, 공개 문서는 직접 쓰는 편이 안전합니다.",
  },
  {
    term: "noindex",
    title: "검색 엔진 색인 제외",
    description:
      "켜면 Google 같은 검색 엔진에 노출하지 말라는 신호를 보냅니다. 내부 검수용이거나 임시 문서일 때만 켭니다.",
  },
  {
    term: "visibility",
    title: "가시성",
    description:
      "문서를 누가 볼 수 있는지 정합니다. 공개는 목록/검색 노출, 링크/SEO만은 직접 링크 중심, 내부는 관리자용입니다.",
  },
  {
    term: "status",
    title: "상태",
    description:
      "초안, 리뷰, 게시됨, 보관 중 어디에 있는지 나타냅니다. 실제 공개는 상태와 가시성 값을 함께 봅니다.",
  },
  {
    term: "docType",
    title: "문서 유형",
    description:
      "가이드, 매뉴얼, FAQ처럼 문서의 성격입니다. 템플릿, 챗봇 검색, 관리자 필터에 같이 쓰입니다.",
  },
  {
    term: "productArea",
    title: "제품 영역",
    description:
      "문서가 다루는 제품/업무 범위입니다. 예: 소프트웨어, 하드웨어, 결제, 온보딩.",
  },
  {
    term: "orderIndex",
    title: "왼쪽 사이드 순서",
    description:
      "공개 문서 왼쪽 목록에서 보이는 위치입니다. 위/아래 버튼으로 조정하면 숫자는 자동으로 맞춰집니다.",
  },
  {
    term: "featured",
    title: "대표 문서",
    description:
      "카테고리나 문서 목록에서 우선 보여줄 문서입니다. 신규 사용자에게 먼저 보여야 하는 핵심 문서에만 씁니다.",
  },
  {
    term: "chatbotSummary",
    title: "챗봇 요약",
    description:
      "챗봇이 답변 문맥을 잡을 때 먼저 참고하는 짧은 요약입니다. 2~3문장 정도가 적당합니다.",
  },
  {
    term: "keywords",
    title: "검색 키워드",
    description:
      "사용자가 실제로 검색할 표현입니다. 공식 용어뿐 아니라 줄임말, 자주 쓰는 말도 쉼표로 넣습니다.",
  },
]

export function filterSlashCommands(query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return SLASH_COMMANDS

  return SLASH_COMMANDS.filter((command) =>
    [command.label, command.description, ...command.aliases]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  )
}

export function buildSlashCommandMarkdown(id: SlashCommandId) {
  return SLASH_COMMANDS.find((command) => command.id === id)?.markdown ?? ""
}

export function getDocsEditorHelp(term: string) {
  return HELP_TERMS.find((item) => item.term === term) ?? null
}
