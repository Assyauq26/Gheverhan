import { PrismaClient } from "@prisma/client";
import { assertPreviewDatabaseIsolation } from "./preview-db-guard";
import { assertPrismaPoolerCompatibility } from "./prisma-pooler-guard";
import { prismaRuntimeDatasourceUrl } from "./prisma-runtime-tls";

// Reject any Vercel Preview using Gheverhan's Production Supabase project.
// Separately approved Preview DB must be configured; old deployments are not
// revoked by this code change.
assertPreviewDatabaseIsolation(process.env);
assertPrismaPoolerCompatibility(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Keep the strict CA binding from main; stored environment is unchanged.
  const url = prismaRuntimeDatasourceUrl(process.env);
  return new PrismaClient({
    log: ["error", "warn"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
