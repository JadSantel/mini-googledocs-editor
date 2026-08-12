import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getUserRole } from "@/lib/permission";
import { prisma } from "@/lib/prisma";

interface DocumentPageProps {
    params: Promise<{ id: string }>;
}

export default async function DocumentPage({ params }: DocumentPageProps) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
        redirect("/login");
    } 

    const role = await getUserRole(session.user.id, id);
    if (!role) {
        notFound();
    }

    const document = await prisma.document.findUniqueOrThrow({
        where: { id },
        select: { title: true },
    });

    return (
        <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold">{document.title}</h1>
        <p className="mt-1 text-sm text-gray-400">Your role: {role}</p>
        <p className="mt-8 text-sm text-gray-500">
            The rich text editor arrives in Phase 5.
        </p>
        </div>
    );
}