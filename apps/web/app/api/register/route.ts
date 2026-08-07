import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";


const MIN_PASSWORD_LENGTH = 6;
const MIN_USERNAME_LENGTH = 3;
const BCRYPT_SALT_ROUNDS = 10;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, email, password } = body as {
            username?: string;
            email?: string;
            password?: string;
        };

        if (!username || !email || !password) {
            return NextResponse.json(
                { message: "Please provide username, email, and password" },
                { status: 400 },
            );
        }

        if (username.trim().length < MIN_USERNAME_LENGTH) {
            return NextResponse.json(
                { message: `Username must be at least ${MIN_USERNAME_LENGTH} characters` },
                { status: 400 },
            );
        }

        if (password.length < MIN_PASSWORD_LENGTH) {
            return NextResponse.json(
                { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
                { status: 400 },
            );
        }

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ email: email.toLowerCase() }, { username }],
            },
        });


        if (existingUser) {
            return NextResponse.json(
                { message: "Username or email is already in use" },
                { status: 409 },
            );            
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        const user = await prisma.user.create({
            data: {
                username: username.trim(),
                email: email.toLowerCase().trim(),
                password: hashedPassword,
            },
            select: {
                id: true,
                username: true, 
                email: true,
                createdAt: true,
            },
        });

        return NextResponse.json(user, {status: 201});
    }   catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
    }  
}

    