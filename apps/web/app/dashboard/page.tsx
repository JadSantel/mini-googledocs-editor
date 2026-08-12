import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDocumentsForUser } from "@/lib/documents";
import { DocumentDashboard } from "@/components/dashboard/DocumentDashboard";
import type { ClientDocument } from "@/types/document";

export default async function DashboardPage() {
    const session = await auth();

    if(!session?.user) {
        redirect("/login");
    }

    const documents = await getDocumentsForUser(session.user.id);
    const initialDocuments: ClientDocument[] = documents.map((doc) => ({
        ...doc,
        updatedAt: doc.updatedAt.toISOString(),
    }));

    return (
        <div>
            <DocumentDashboard initialDocuments={initialDocuments} />

            <div className="mx-auto max-w-2xl px-4 pb-8">
                <p className="text-sm text-gray-400">
                Logged in as {session.user.name} ({session.user.email})
                </p>
                <form
                action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                }}
                className="mt-3"
                >
                    <button
                        type="submit"
                        className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
                    >
                        Log out
                    </button>
                </form>
            </div>
        </div>
    );
}