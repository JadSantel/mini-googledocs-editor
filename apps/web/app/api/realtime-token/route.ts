import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth";

const SOCKET_TOKEN_TTL_SECONDS = 60;

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ message: "Unauthorized"}, { status: 401 });
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        console.error("[realtime-token] AUTH_SECRET is not set");
        return NextResponse.json({ message: "Server misconfigured"}, { status: 500 });
    }

    const token = jwt.sign({ sub: session.user.id }, secret, {
        expiresIn: SOCKET_TOKEN_TTL_SECONDS,  
    });

    return NextResponse.json({ token });
}