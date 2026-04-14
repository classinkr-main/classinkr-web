"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useEditor, EditorContent, Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import { Markdown } from "tiptap-markdown"
import { LayoutTemplate, Sparkles, Wand2 } from "lucide-react"

// ProseMirror 플러그인: {{green:text}} 구문을 에디터에서 초록색으로 시각화
const GreenTextDecoration = Extension.create({
  name: "greenTextDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("greenTextDecoration"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              const regex = /\{\{green:.*?\}\}/g
              let match: RegExpExecArray | null
              while ((match = regex.exec(node.text)) !== null) {
                decorations.push(
                  Decoration.inline(
                    pos + match.index,
                    pos + match.index + match[0].length,
                    { class: "rich-editor-brand-green" }
                  )
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

export interface RichMarkdownEditorHandle {
  toggleBold: () => void
  toggleItalic: () => void
  setHeading: (level: 2 | 3) => void
  toggleBlockquote: () => void
  toggleBulletList: () => void
  toggleOrderedList: () => void
  toggleHighlight: () => void
  wrapBrandColor: () => void
  insertLink: () => void
  insertImage: () => void
  insertDivider: () => void
}

interface RichMarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onTemplateClick?: () => void
  onAiDraftClick?: () => void
  onSelectionOptimize?: (text: string) => void
}

const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor(
    { value, onChange, placeholder = "본문을 작성해주세요", onTemplateClick, onAiDraftClick, onSelectionOptimize },
    ref
  ) {
    const lastEmitted = useRef(value)
    const skipNextUpdate = useRef(false)
    const [isEmpty, setIsEmpty] = useState(!value || value.trim() === "")
    const [hasSelection, setHasSelection] = useState(false)

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit,
        Highlight.configure({ multicolor: false }),
        Link.configure({ openOnClick: false }),
        Image.configure({ allowBase64: false }),
        Placeholder.configure({ placeholder }),
        GreenTextDecoration,
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: "-",
          transformPastedText: true,
        }),
      ],
      content: value,
      editorProps: {
        attributes: { class: "rich-editor-content" },
      },
      onUpdate({ editor }) {
        if (skipNextUpdate.current) {
          skipNextUpdate.current = false
          return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markdown = (editor.storage as any).markdown.getMarkdown() as string
        lastEmitted.current = markdown
        onChange(markdown)
        setIsEmpty(editor.isEmpty)
      },
      onSelectionUpdate({ editor }) {
        const { from, to } = editor.state.selection
        setHasSelection(to - from > 5)
      },
    })

    // 외부에서 value가 변경될 때(언두/리두, 드래프트 불러오기 등) 에디터에 반영
    useEffect(() => {
      if (!editor || value === lastEmitted.current) return
      lastEmitted.current = value
      skipNextUpdate.current = true
      editor.commands.setContent(value)
      setIsEmpty(editor.isEmpty)
    }, [editor, value])

    useImperativeHandle(ref, () => ({
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      setHeading: (level) => editor?.chain().focus().toggleHeading({ level }).run(),
      toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
      toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
      wrapBrandColor: () => {
        if (!editor) return
        const { from, to } = editor.state.selection
        const selectedText = editor.state.doc.textBetween(from, to) || "브랜드 텍스트"
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.insertText(`{{green:${selectedText}}}`, from, to)
            return true
          })
          .run()
      },
      insertLink: () => {
        if (!editor) return
        const { from, to } = editor.state.selection
        if (from !== to) {
          const url = window.prompt("링크 URL을 입력하세요:")
          if (url) editor.chain().focus().setLink({ href: url }).run()
        } else {
          const url = window.prompt("링크 URL을 입력하세요:")
          if (!url) return
          const label = window.prompt("링크 텍스트:") ?? url
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: label,
              marks: [{ type: "link", attrs: { href: url } }],
            })
            .run()
        }
      },
      insertImage: () => {
        if (!editor) return
        const url = window.prompt("이미지 URL을 입력하세요:")
        if (!url) return
        const alt = window.prompt("이미지 설명(alt 텍스트):") ?? ""
        editor.chain().focus().setImage({ src: url, alt }).run()
      },
      insertDivider: () => editor?.chain().focus().setHorizontalRule().run(),
    }), [editor])

    const handleOptimizeClick = () => {
      if (!onSelectionOptimize) return
      if (hasSelection && editor) {
        const { from, to } = editor.state.selection
        const text = editor.state.doc.textBetween(from, to, "\n")
        if (text.trim()) { onSelectionOptimize(text); return }
      }
      onSelectionOptimize("")
    }

    const hasQuickActions = onTemplateClick || onAiDraftClick || onSelectionOptimize

    return (
      <div className="relative">
        {/* A. 빈 상태 플레이스홀더 CTA */}
        {isEmpty && hasQuickActions && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pb-16">
            <p className="text-[12px] text-[#1a1a1a]/30">또는 빠르게 시작하기</p>
            <div className="pointer-events-auto flex gap-2">
              {onTemplateClick && (
                <button
                  type="button"
                  onClick={onTemplateClick}
                  className="flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#615D59] shadow-sm hover:border-[#084734] hover:text-[#084734] transition-colors"
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  템플릿 불러오기
                </button>
              )}
              {onAiDraftClick && (
                <button
                  type="button"
                  onClick={onAiDraftClick}
                  className="flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#615D59] shadow-sm hover:border-[#084734] hover:text-[#084734] transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 초안 생성
                </button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-[600px] rounded-2xl border border-[#e8e8e4] bg-[#fcfcfb] px-5 py-4 transition-colors focus-within:border-[#084734]">
          <EditorContent editor={editor} />
        </div>

        {/* B. 하단 미니 액션바 */}
        {hasQuickActions && (
          <div className="mt-2 flex items-center gap-1.5 px-1">
            <span className="text-[10px] text-[#1a1a1a]/25">빠른 실행</span>
            <span className="h-3 w-px bg-[#e8e8e4]" />
            {onTemplateClick && (
              <button
                type="button"
                onClick={onTemplateClick}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#1a1a1a]/45 hover:bg-[#f0f0ec] hover:text-[#111110] transition-colors"
              >
                <LayoutTemplate className="h-3 w-3" />
                템플릿
              </button>
            )}
            {onSelectionOptimize && (
              <button
                type="button"
                onClick={handleOptimizeClick}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  hasSelection
                    ? "bg-[#ECFDF5] text-[#084734] hover:bg-[#D1FAE5]"
                    : "text-[#1a1a1a]/45 hover:bg-[#f0f0ec] hover:text-[#111110]"
                }`}
              >
                <Wand2 className="h-3 w-3" />
                {hasSelection ? "선택 구간 다듬기" : "전체 다듬기"}
              </button>
            )}
            {onAiDraftClick && (
              <button
                type="button"
                onClick={onAiDraftClick}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#1a1a1a]/45 hover:bg-[#f0f0ec] hover:text-[#111110] transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                AI 초안
              </button>
            )}
          </div>
        )}
      </div>
    )
  }
)

export default RichMarkdownEditor
