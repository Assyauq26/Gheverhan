import { PrismaClient } from "@prisma/client";
import { assertPreviewDatabaseIsolation } from "./preview-db-guard";
import { prismaRuntimeDatasourceUrl } from "./prisma-runtime-tls";

// Refuse to initialize a Prisma connection in a Vercel preview until both
// connection strings point at a distinct, explicitly approved preview project.
assertPreviewDatabaseIsolation(process.env);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const url = prismaRuntimeDatasourceUrl(process.env);
  return new PrismaClient({
    log: ["error", "warn"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
