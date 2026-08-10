import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export async function getUserRole(userId: string, documentId: string): Promise<Role | null> {
    const document = await prisma.document.findUnique({
        where: {id: documentId},
        select: {ownerId: true},
    });

    if (!document) {
        return null;
    }

    if (document.ownerId === userId) {
        return "OWNER";
    }

    const collaborator = await prisma.collaborator.findUnique({
        where: {
            documentId_userId: {documentId, userId},
        },
        select: {role: true},
    });

    return collaborator?.role ?? null;
}