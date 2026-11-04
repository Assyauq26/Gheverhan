import { HttpError } from "@/lib/response";
import { getStoreProfile } from "./config";

/** New P0 stores can publish products before payment/shipping release approval.
 * This local private configuration is never set by the P0 installer or portal. */
export function assertCheckoutReleaseAllowed(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (getStoreProfile(env) === "self-hosted" && env.SELF_HOSTED_CHECKOUT_APPROVED !== "owner-reviewed-v1") {
    throw new HttpError("Checkout belum diaktifkan. Hubungi pengelola toko.", 503);
  }
}
