import { PrismaClient } from "@prisma/client";
import { assertPreviewDatabaseIsolation } from "./preview-db-guard";
import { assertPrismaPoolerCompatibility } from "./prisma-pooler-guard";
import { prismaRuntimeDatasourceUrl } from "./prisma-runtime-tls";

// Refuse to initialize a Prisma connection in a Vercel preview until both
// connection strings point at a distinct, explicitly approved preview project.
assertPreviewDatabaseIsolation(process.env);
// A Supabase transaction pooler on 6543 needs the explicit Prisma 5 flag.
assertPrismaPoolerCompatibility(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Keep the strict CA binding from main; no stored environment is rewritten.
  const url = prismaRuntimeDatasourceUrl(process.env);
  return new PrismaClient({
    log: ["error", "warn"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
