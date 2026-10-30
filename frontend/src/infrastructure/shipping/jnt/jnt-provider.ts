import type { ShippingInquiry, ShippingProvider, ShippingRate } from "@/infrastructure/shipping/contracts/shipping-provider";
import { getJntAreaMappings } from "./jnt-config";
import { HttpError } from "@/lib/http-error";

/** The transport is injected only after official account specification/UAT approval.
 * No endpoint, signing scheme, area code or response is guessed here. */
export interface OfficialJntTransport {
  inquire(input: ShippingInquiry & { originWarehouse: string; destinationArea: string }, signal: AbortSignal): Promise<ShippingRate[]>;
}
export class JntProvider implements ShippingProvider {
  readonly code = "jnt";
  readonly capabilities = [];
  constructor(private readonly transport?: OfficialJntTransport) {}
  async getRates(input: ShippingInquiry): Promise<ShippingRate[]> {
    const mapping = getJntAreaMappings().find(m => m.indonesiaCode === input.destination.villageCode);
    if (!mapping) throw new HttpError("Wilayah belum memiliki mapping resmi J&T. Hubungi toko.", 422);
    if (!this.transport || !process.env.JNT_ORIGIN_WAREHOUSE) throw new HttpError("Integrasi resmi J&T belum diaktifkan. Hubungi toko.", 503);
    const rates = await this.transport.inquire({ ...input, originWarehouse: process.env.JNT_ORIGIN_WAREHOUSE, destinationArea: mapping.areaCode }, AbortSignal.timeout(5000));
    if (rates.some(r => r.courier !== "J&T Express" || !["EZ", "HBO", "JND", "ECO"].includes(r.service) || !Number.isSafeInteger(r.cost) || r.cost < 0)) throw new HttpError("Tarif resmi J&T tidak valid", 502);
    return rates.map(r => ({ ...r, mode: "official" }));
  }
}
