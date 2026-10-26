import { assertSafeDatabaseOperation } from "../assert-safe-db-operation.mjs";
assertSafeDatabaseOperation();
async function main() {
  const { cleanupBranding } = await import(
    "../../src/modules/appearance/media"
  );
  const { prisma } = await import("../../src/lib/prisma");
  try {
    const logos = await cleanupBranding();
    const { cleanupHeroMedia } = await import("../../src/modules/hero/media");
    const hero = await cleanupHeroMedia();
    console.log(JSON.stringify({ logos, hero }));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error("Branding cleanup failed; retained rows can be retried.");
  process.exitCode = 1;
});
