import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export interface DocumentListItem {
    id: string;
    title: string;
    updatedAt: Date;
    role: Role;
}

export async function getDocumentsForUser(
    userId: string,
    search?: string,
): Promise<DocumentListItem[]> {
    const titleFilter = search
        ? { title: { contains: search, mode: "insensitive" as const } }
        : {};

    const [owned, collaborations] = await Promise.all([
        prisma.document.findMany({
            where: { ownerId: userId, ...titleFilter },
            select: { id: true, title: true, updatedAt: true },
        }),
        prisma.collaborator.findMany({
            where: { userId, document: titleFilter },
            select: {
                role: true,
                document: { select: { id: true, title: true, updatedAt: true } },
            },
        }),
    ]);

    const ownedItems: DocumentListItem[] = owned.map((doc) => ({
        ...doc,
        role: "OWNER" as const,
    }));

    const collaboratorItems: DocumentListItem[] = collaborations.map((c) => ({
        id: c.document.id,
        title: c.document.title,
        updatedAt: c.document.updatedAt,
        role: c.role,
    }));

    return [...ownedItems, ...collaboratorItems].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
}   