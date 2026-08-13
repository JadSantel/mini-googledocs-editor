"use client";

import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";

interface ToolbarProps {
    editor: Editor | null;
}

interface ToolbarButtonProps {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    label?: string;
    children?: ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, label, children }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={isActive}
            className={`rounded px-2 py-1 text-sm font-medium disabled:opacity-30 ${
                isActive ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
        >
            {children}
        </button>
    );
} 

function Divider() {
    return <span className="mx-1 h-5 w-px self-center bg-gray-200" aria-hidden="true" />;
}

export function Toolbar({ editor }: ToolbarProps) {
    if (!editor) {
        return null;
    }

    const setLink = () => {
        const previousUrl = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", previousUrl ?? "");

        if (url === null) return;

        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    };

    return (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 p-2">
        <ToolbarButton
            label="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
        >
            ↺
        </ToolbarButton>
        <ToolbarButton
            label="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
        >
            ↻
        </ToolbarButton>

        <Divider />

        <ToolbarButton
            label="Bold"
            isActive={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
        >
            <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
            label="Italic"
            isActive={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
        >
            <em>I</em>
        </ToolbarButton>
        <ToolbarButton
            label="Underline"
            isActive={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
            <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
            label="Strikethrough"
            isActive={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
        >
            <span className="line-through">S</span>
        </ToolbarButton>

        <Divider />

        {[1, 2, 3].map((level) => (
            <ToolbarButton
            key={level}
            label={`Heading ${level}`}
            isActive={editor.isActive("heading", { level })}
            onClick={() =>
                editor
                .chain()
                .focus()
                .toggleHeading({ level: level as 1 | 2 | 3 })
                .run()
            }
            >
            H{level}
            </ToolbarButton>
        ))}

        <Divider />

        <ToolbarButton
            label="Bullet list"
            isActive={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
            •—
        </ToolbarButton>
        <ToolbarButton
            label="Ordered list"
            isActive={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
            1.
        </ToolbarButton>
        <ToolbarButton
            label="Blockquote"
            isActive={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
            &ldquo;
        </ToolbarButton>
        <ToolbarButton
            label="Code block"
            isActive={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
            {"</>"}
        </ToolbarButton>

        <Divider />

        <ToolbarButton label="Link" isActive={editor.isActive("link")} onClick={setLink}>
            🔗
        </ToolbarButton>
        <ToolbarButton
            label="Insert table"
            onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
        >
            ▦
        </ToolbarButton>

        {editor.isActive("table") && (
            <>
            <Divider />
            <ToolbarButton label="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>
                +Row
            </ToolbarButton>
            <ToolbarButton
                label="Delete row"
                onClick={() => editor.chain().focus().deleteRow().run()}
            >
                −Row
            </ToolbarButton>
            <ToolbarButton
                label="Add column"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
                +Col
            </ToolbarButton>
            <ToolbarButton
                label="Delete column"
                onClick={() => editor.chain().focus().deleteColumn().run()}
            >
                −Col
            </ToolbarButton>
            </>
        )}
        </div>
    );
}