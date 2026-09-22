import type { ShippingProvider } from "./contracts/shipping-provider";
import { ManualShippingProvider } from "./manual/manual-shipping-provider";
import { JntProvider } from "./jnt/jnt-provider";
import { KiriminAjaProvider } from "./kiriminaja/kiriminaja-provider";

const registry: Record<string, ShippingProvider> = {
  manual: new ManualShippingProvider(),
  jnt: new JntProvider(),
  kiriminaja: new KiriminAjaProvider(),
};

export function getShippingProvider(
  code = process.env.SHIPPING_PROVIDER || "manual",
): ShippingProvider {
  return registry[code] ?? registry.manual;
}

export type {
  ShippingProvider,
  ShippingRate,
  TrackingEvent,
} from "./contracts/shipping-provider";
