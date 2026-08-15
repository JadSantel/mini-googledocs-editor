import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getUserRole } from "@/lib/permission";
import { prisma } from "@/lib/prisma";
import { Editor } from "@/components/components/Editor";

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

// The permission check pattern here (getUserRole → 404 if none, not
// 403 — so an unauthorized caller can't even confirm the document
// exists) was established in Phase 4 and is reused as-is.
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
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{document.title}</h1>
        <p className="text-sm text-gray-400">Your role: {role}</p>
      </div>

      <Editor documentId={id} readOnly={role === "VIEWER"} />
    </div>
  );
}
