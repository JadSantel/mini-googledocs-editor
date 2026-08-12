"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientDocument } from "@/types/document";

interface DocumentRowProps {
    document: ClientDocument;
    onRename: (id: string, title: string) => void;
    onDelete: (id: string) => void;
    isDeleting: boolean;
}

export function DocumentRow({ document, onRename, onDelete, isDeleting }: DocumentRowProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState(document.title);

    const canRename = document.role === "OWNER" || document.role === "EDITOR";
    const canDelete = document.role === "OWNER";

    function commitRename() {
        const trimmed = draftTitle.trim();
        setIsEditing(false);
        if (trimmed && trimmed !== document.title) {
            onRename(document.id, trimmed);
        } else {
            setDraftTitle(document.title);
        }
    }

    return (
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3">
        <div className="min-w-0 flex-1">
            {isEditing ? (
            <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                    setDraftTitle(document.title);
                    setIsEditing(false);
                }
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
            ) : (
            <Link
                href={`/documents/${document.id}`}
                className="block truncate text-sm font-medium hover:underline"
            >
                {document.title}
            </Link>
            )}
            <p className="mt-0.5 text-xs text-gray-400">
            {document.role.charAt(0) + document.role.slice(1).toLowerCase()} · Updated{" "}
            {new Date(document.updatedAt).toLocaleDateString()}
            </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
            {canRename && !isEditing && (
            <button
                onClick={() => setIsEditing(true)}
                className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
            >
                Rename
            </button>
            )}
            {canDelete && (
            <button
                onClick={() => onDelete(document.id)}
                disabled={isDeleting}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
                {isDeleting ? "Deleting…" : "Delete"}
            </button>
            )}
        </div>
        </div>
    );
}


