export interface BlogHeading {
  id: string
  text: string
  level: 2 | 3
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function sanitizeUrl(url: string) {
  if (/^(https?:\/\/|\/)/i.test(url)) return url
  return "#"
}

export function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  return normalized || "untitled-post"
}

export function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/[*_~`>#-]/g, " ")
    .replace(/\{\{green:(.+?)\}\}/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

export function estimateReadTime(markdown: string) {
  const text = stripMarkdown(markdown)
  const words = text ? text.split(/\s+/).length : 0
  const minutes = Math.max(1, Math.ceil(words / 180))
  return `${minutes}분`
}

function renderInline(text: string) {
  let html = escapeHtml(text)

  html = html.replace(/\{\{green:(.+?)\}\}/g, '<span class="font-semibold text-emerald-700">$1</span>')
  html = html.replace(/==(.+?)==/g, '<mark class="rounded bg-[#CEF17B]/60 px-1 text-[#084734]">$1</mark>')
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-[#111110] px-1.5 py-0.5 text-[0.92em] text-white">$1</code>')
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, url: string) =>
      `<a href="${sanitizeUrl(url)}" class="font-medium text-emerald-700 underline underline-offset-4">${label}</a>`
  )
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>")

  return html
}

export function extractMarkdownHeadings(markdown: string): BlogHeading[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(##|###)\s+(.*)$/)
      if (!match) return null

      const level = match[1].length as 2 | 3
      const text = match[2].trim()
      return {
        id: slugify(text),
        text,
        level,
      } satisfies BlogHeading
    })
    .filter((heading): heading is BlogHeading => Boolean(heading))
}

function renderImage(line: string) {
  const match = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/)
  if (!match) return null

  const [, alt, url] = match
  return `
    <figure class="my-8 overflow-hidden rounded-3xl border border-[#e8e8e4] bg-white">
      <img src="${sanitizeUrl(url)}" alt="${escapeHtml(alt)}" class="h-auto w-full object-cover" />
      ${alt ? `<figcaption class="border-t border-[#e8e8e4] px-5 py-3 text-sm text-[#1a1a1a]/45">${escapeHtml(alt)}</figcaption>` : ""}
    </figure>
  `
}

export function renderMarkdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const html: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (/^```/.test(trimmed)) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1
      html.push(
        `<pre class="my-8 overflow-x-auto rounded-3xl bg-[#111110] px-5 py-4 text-sm leading-7 text-white"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`
      )
      continue
    }

    const imageHtml = renderImage(line)
    if (imageHtml) {
      html.push(imageHtml)
      index += 1
      continue
    }

    const headingMatch = trimmed.match(/^(##|###)\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2].trim()
      const id = slugify(text)
      html.push(
        `<h${level} id="${id}" class="${level === 2 ? "scroll-mt-32 mt-14 text-3xl font-bold tracking-[-0.03em] text-[#111110]" : "scroll-mt-32 mt-10 text-2xl font-semibold tracking-[-0.02em] text-[#111110]"}">${renderInline(text)}</h${level}>`
      )
      index += 1
      continue
    }

    if (trimmed === "---") {
      html.push('<hr class="my-10 border-[#e8e8e4]" />')
      index += 1
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      html.push(
        `<blockquote class="my-8 rounded-3xl border border-emerald-100 bg-emerald-50/70 px-6 py-5 text-lg leading-8 text-[#084734]">${quoteLines
          .map((item) => renderInline(item))
          .join("<br />")}</blockquote>`
      )
      continue
    }

    if (/^(-|\*)\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^(-|\*)\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^(-|\*)\s+/, ""))
        index += 1
      }
      html.push(
        `<ul class="my-6 space-y-3 pl-6 text-[17px] leading-8 text-[#2f2f2b]">${items
          .map((item) => `<li class="list-disc pl-1">${renderInline(item)}</li>`)
          .join("")}</ul>`
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""))
        index += 1
      }
      html.push(
        `<ol class="my-6 space-y-3 pl-6 text-[17px] leading-8 text-[#2f2f2b]">${items
          .map((item) => `<li class="list-decimal pl-1">${renderInline(item)}</li>`)
          .join("")}</ol>`
      )
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      if (
        !current ||
        /^```/.test(current) ||
        /^!\[/.test(current) ||
        /^(##|###)\s+/.test(current) ||
        current === "---" ||
        /^>\s?/.test(current) ||
        /^(-|\*)\s+/.test(current) ||
        /^\d+\.\s+/.test(current)
      ) {
        break
      }
      paragraphLines.push(lines[index].trim())
      index += 1
    }

    html.push(
      `<p class="mt-5 text-[17px] leading-8 text-[#2f2f2b]">${renderInline(paragraphLines.join(" "))}</p>`
    )
  }

  return html.join("\n")
}
