import type { ShippingProvider } from "@/infrastructure/shipping/contracts/shipping-provider";

/** Future J&T Express adapter boundary. Requires JNT_API_KEY. Not enabled in MVP. */
export class JntProvider implements ShippingProvider {
  readonly code = "jnt";
  readonly capabilities = [];
}
