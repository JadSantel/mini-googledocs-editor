import jwt from "jsonwebtoken";

export interface SocketTokenPayload {
    userId: string;
}

export function verifySocketToken(token: string): SocketTokenPayload | null {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        console.error("[auth] AUTH_SECRET is not set — refusing all connections");
        return null;
    }

    try {
        const decoded = jwt.verify(token, secret);
        if (typeof decoded === "object" && decoded !== null && typeof decoded.sub === "string") {
            return { userId: decoded.sub };
        }
        return  null;
    } catch {
        return null;
    }
}