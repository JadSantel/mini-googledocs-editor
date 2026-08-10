import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDocumentsForUser } from "@/lib/documents";
import { nextTest } from "next/dist/cli/next-test";

const DEFAULT_TITLE = "Untitled Document";

export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return NextResponse.json({ message: "Unauthorized "}, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() || undefined;

    const documents = await getDocumentsForUser(session.user.id, search);
    return NextResponse.json(documents);
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({message: "Unauthorized"}, {status: 401});
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : DEFAULT_TITLE;

    const document = await prisma.document.create({
        data: {
            title,
            ownerId: session.user.id,
        },
        select: {id:true, title:true, updatedAt:true},
    });

    return NextResponse.json({ ...document, role: "OWNER" as const }, {status: 201});
}