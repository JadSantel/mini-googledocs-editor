import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserRole } from "@/lib/permission";

interface RouteParams {
    params: Promise<{ id: string }>;
}

const CAN_RENAME: readonly string[] = ["OWNER", "EDITOR"];
const CAN_DELETE: readonly string[] = ["OWNER"];

export async function PATCH(request: Request, {params}: RouteParams) {
    const {id} = await params;
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({message: "Unauthorized"}, {status:401});
    } 

    const role = await getUserRole(session.user.id, id);
    if (!role) {
        return NextResponse.json({ message: "Document not found" }, { status: 404 });
    }
    if (!CAN_RENAME.includes(role)) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
        return NextResponse.json({ message: "Title cannot be empty" }, { status: 400});
    }

    const document = await prisma.document.update({
        where: { id },
        data: { title },
        select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json(document);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 404 });
    }

    const role = await getUserRole(session.user.id, id);
    if (!role) {
        return NextResponse.json({ message: "Document not found "}, { status: 404 });
    }
    if (!CAN_DELETE.includes(role)) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    await prisma.document.delete({ where: { id } });

    return NextResponse.json({ message: "Deleted" });
}