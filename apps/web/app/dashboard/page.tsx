import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
    const session = await auth();

    if(!session?.user) {
        redirect("/login");
    }

    return (
        <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-gray-600">
            Logged in as {session.user.name} ({session.user.email})
        </p>
        <p className="mt-1 text-sm text-gray-400">
            Document list, create/rename/delete, and search arrive in Phase 4.
        </p>

        <form
            action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
            }}
            className="mt-6"
        >
            <button
            type="submit"
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium"
            >
            Log out
            </button>
        </form>
        </div>
    );
}