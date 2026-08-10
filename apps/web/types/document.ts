import type { Role } from "@prisma/client";

export interface ClientDocument {
    id: string;
    title: string;
    updatedAt: string;
    role: Role;
}