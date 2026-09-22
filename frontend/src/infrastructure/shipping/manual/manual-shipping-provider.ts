import type {
  ShippingProvider,
  ShippingRate,
} from "@/infrastructure/shipping/contracts/shipping-provider";

/** MVP shipping: admin enters courier, service, cost and resi manually. */
export class ManualShippingProvider implements ShippingProvider {
  readonly code = "manual";
  readonly capabilities = ["manualEntry"];

  async getRates(): Promise<ShippingRate[]> {
    // Manual MVP offers a small fixed rate table; admin can override.
    return [
      { courier: "JNE", service: "REG", cost: 20000, etd: "2-3 hari" },
      { courier: "J&T", service: "EZ", cost: 22000, etd: "2-3 hari" },
      { courier: "SiCepat", service: "BEST", cost: 25000, etd: "1-2 hari" },
    ];
  }
}
