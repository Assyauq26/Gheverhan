import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isJntPlatformOwner } from "@/infrastructure/shipping/jnt/official-config";
import { JntIntegrationSettings } from "@/components/admin/jnt-integration-settings";
import { getStoreProfile } from "@/lib/self-hosted/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrasi J&T Express", robots: { index: false } };

export default async function JntIntegrationPage() {
  const user = await getCurrentUser(false);
  if (!user) redirect("/login?redirectTo=/admin/integrations/jnt");
  if (!isJntPlatformOwner(user)) notFound();
  return <JntIntegrationSettings ownershipMode={getStoreProfile(process.env) === "self-hosted" ? "store" : "platform"} />;
}
