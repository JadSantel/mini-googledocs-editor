import { NextResponse } from "next/server";
import { auth } from "./lib/auth";
import { log } from "console";

const PROTECTED_PREFIXES = ["/dashboard", "/documents"];

export default auth((req) => {
    const { pathname } = req.nextUrl;
    const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    if (isProtectedRoute && !req.auth) {
        const loginUrl = new URL("/login", req.nextUrl.origin);

        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }
}) ;