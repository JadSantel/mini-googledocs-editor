"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Toolbar } from "./Toolbar";

interface EditorProps {
    initialContent?: string;
}

const PLACEHOLDER_CONTENT = `
  <h1>Untitled Document</h1>
  <p>Start typing here. This editor is <strong>local-only</strong> for now —
  nothing you type is saved or synced yet. That arrives with the WebSocket
  server and Yjs in later phases.</p>
  <ul>
    <li>Try <strong>bold</strong>, <em>italic</em>, and <u>underline</u></li>
    <li>Use the toolbar above to insert a table or a link</li>
  </ul>
`;

export function Editor({ initialContent = PLACEHOLDER_CONTENT }: EditorProps) {
    const editor = useEditor({
       immediatelyRender: false,
       extensions: [
        StarterKit.configure({
            link: {
                openOnClick: false,
                autolink: true,
            },
            underline: {},
        }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
       ],
       content: initialContent,
       editorProps: {
        attributes: {
            class: "tiptap-content focus:outline-none min-h-[60vh] px-8 py-6",
        },
       }, 
    });

    return (
        <div className="rounded border border-gray-200">
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
        </div>
    );
}