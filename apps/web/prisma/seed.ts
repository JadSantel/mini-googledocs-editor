import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BCRYPT_SALT_ROUNDS = 10;

async function main() {
    const [ownerPassword, editorPassword] = await Promise.all([
        bcrypt.hash("password123", BCRYPT_SALT_ROUNDS),
        bcrypt.hash("password123", BCRYPT_SALT_ROUNDS),
    ]);

    const owner = await prisma.user.upsert({
        where: { email: "alice@test.com" },
        update: {},
        create: {
            username: "alice",
            email: "alice@test.com",
            password: ownerPassword,
        },
    });

    const editor = await prisma.user.upsert({
        where: { email: "bob@test.com" },
        update: {},
        create: {
            username: "bob",
            email: "bob@test.com",
            password: editorPassword,
        },
    });

    const document = await prisma.document.upsert({
        where: { id: "seed-doc-1" },
        update: {},
        create: {
            id: "seed-doc-1",
            title: "Welcome to the Collaborative Editor",
            ownerId: owner.id,
        },
    });

    await prisma.collaborator.upsert({
        where: {
            documentId_userId: {
                documentId: document.id,
                userId: editor.id,
            },
        },
        update: {},
        create: {
            documentId: document.id,
            userId: editor.id,
            role: "EDITOR",
        },
    });

    console.log("Seed Complete:");
    console.log(`Owner:  ${owner.email} (password: password123)`);
    console.log(`Editor:  ${editor.email} (password: password123)`);
    console.log(`Document:  "${document.title}" (${document.id})`);
}

main().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
