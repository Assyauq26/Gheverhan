import { PrismaClient } from "@prisma/client";
import { assertPreviewDatabaseIsolation } from "./preview-db-guard";

// Refuse to initialize a Prisma connection in a Vercel preview until both
// connection strings point at a distinct, explicitly approved preview project.
assertPreviewDatabaseIsolation(process.env);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
