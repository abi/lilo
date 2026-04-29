import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { useEffect } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

type ToolbarButtonProps = {
  active?: boolean;
  disabled?: boolean;
  label: string;
  title: string;
  onClick: () => void;
};

const toolbarButtonClass = (active?: boolean): string =>
  `rounded-md px-2 py-1 text-xs font-semibold transition ${
    active
      ? "bg-neutral-950 text-white dark:bg-neutral-100 dark:text-neutral-950"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
  }`;

function ToolbarButton({
  active,
  disabled,
  label,
  title,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={`${toolbarButtonClass(active)} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
        },
      }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class:
          "markdown-wysiwyg min-h-full px-6 py-5 text-[15px] leading-7 text-neutral-900 outline-none dark:text-neutral-100",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChange(updatedEditor.getMarkdown());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getMarkdown() === value) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="min-h-0 flex-1 px-6 py-5 text-sm text-neutral-400">
        Loading editor...
      </div>
    );
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "");
    if (url === null) return;

    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        <ToolbarButton
          label="P"
          title="Paragraph"
          active={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        />
        <ToolbarButton
          label="H1"
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          label="H2"
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
        <ToolbarButton
          label="B"
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="I"
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Code"
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          label="Link"
          title="Add or edit link"
          active={editor.isActive("link")}
          onClick={setLink}
        />
        <span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
        <ToolbarButton
          label="- List"
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="1. List"
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Task"
          title="Task list"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />
        <ToolbarButton
          label="Quote"
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="Block"
          title="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-neutral-800">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
