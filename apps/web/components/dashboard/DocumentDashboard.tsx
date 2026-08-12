"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DocumentRow } from "./DocumentRow";
import type { ClientDocument } from "@/types/document";


interface DocumentDashboardProps {
    initialDocuments: ClientDocument[];
}

async function fetchDocuments(search: string): Promise<ClientDocument[]> {
    const url = search ? `/api/documents?q=${encodeURIComponent(search)}` : "/api/documents";
    const response = await fetch(url); 
    if (!response.ok) {
        throw new Error("Failed to load documents");
    }
    return response.json();
}

const DEBOUNCE_MS = 300;

export function DocumentDashboard({ initialDocuments }: DocumentDashboardProps) {
    const queryClient = useQueryClient();
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setdebouncedSearch] = useState("");

    useEffect(() => {
        const timeout = setTimeout(() => setdebouncedSearch(searchInput.trim()), DEBOUNCE_MS);
        return () => clearTimeout(timeout);
    }, [searchInput]);

    const queryKey = ["documents", debouncedSearch] as const;

    const { data: documents = [] } = useQuery({
        queryKey,
        queryFn: () => fetchDocuments(debouncedSearch),
        initialData: debouncedSearch === "" ? initialDocuments : undefined,
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch("/api/documents", { method: "POST" });
            if (!response.ok) throw new Error("Failed to create a document");
            return response.json() as Promise<ClientDocument>;
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData<ClientDocument[]>(queryKey);
            const tempId = `temp-${Date.now()}`;

            queryClient.setQueryData<ClientDocument[]>(queryKey, (old = []) => [
                {
                    id: tempId,
                    title: "Untitled Document",
                    updatedAt: new Date().toISOString(),
                    role: "OWNER",
                },
                ...old,
            ]);
            return { previous, tempId };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
        },
        onSuccess: (created, _vars, context) => {
            queryClient.setQueryData<ClientDocument[]>(queryKey, (old = []) =>
                old.map((doc) => (doc.id === context?.tempId ? created : doc)),
            );
        },
    });

    const renameMutation = useMutation({
        mutationFn: async ({ id, title }: { id: string; title: string}) => {
            const response = await fetch(`/api/documents/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({title}),
            });
            if (!response.ok) throw new Error("Failed to rename document");
            return response.json() as Promise<ClientDocument>;
        },
        onMutate: async ({ id, title }) => {
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData<ClientDocument>(queryKey);
            queryClient.setQueryData<ClientDocument[]>(queryKey, (old = []) =>
                old.map((doc) => (doc.id === id ? { ...doc, title } : doc)),
            );
            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete document");
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData<ClientDocument[]>(queryKey);
            queryClient.setQueryData<ClientDocument[]>(queryKey, (old = []) =>
                old.filter((doc) => doc.id !== id),
            );
            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
        },
    });

    return (
        <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">Documents</h1>
            <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
            New Document
            </button>
        </div>

        <input
            type="search"
            placeholder="Search documents…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="mb-6 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />

        {documents.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
            {debouncedSearch ? "No documents match your search." : "No documents yet — create one to get started."}
            </p>
        ) : (
            <div>
            {documents.map((doc) => (
                <DocumentRow
                key={doc.id}
                document={doc}
                onRename={(id, title) => renameMutation.mutate({ id, title })}
                onDelete={(id) => deleteMutation.mutate(id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === doc.id}
                />
            ))}
            </div>
        )}
        </div>
    );

}
