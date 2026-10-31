import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { JntIntegrationManager } from "@/components/admin/jnt-integration-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrasi J&T Express · Admin", robots: { index: false } };

export default async function JntIntegrationSettingsPage() {
  await requireBackofficeUser(PERMISSIONS.JNT_INTEGRATION_MANAGE);
  return <JntIntegrationManager />;
}
