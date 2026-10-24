import { requireBackofficeUser } from "@/modules/admin/backoffice-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { readDraft } from "@/modules/appearance/service";
import { AppearanceEditor } from "@/components/appearance/editor";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireBackofficeUser(PERMISSIONS.STORE_CUSTOMIZE_READ);
  return (
    <AppearanceEditor
      initial={await readDraft()}
      canUpdate={user.permissions.includes(PERMISSIONS.STORE_CUSTOMIZE_UPDATE)}
      canPublish={user.permissions.includes(
        PERMISSIONS.STORE_CUSTOMIZE_PUBLISH,
      )}
    />
  );
}
