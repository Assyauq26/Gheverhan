import type { ShippingInquiry, ShippingProvider, ShippingRate } from "@/infrastructure/shipping/contracts/shipping-provider";
import { getJntAreaMappings } from "./jnt-config";
import { checkJntRate } from "./official-transport";
import { HttpError } from "@/lib/http-error";

/** Injectable for isolated tests; production uses the reviewed J&T transport. */
export interface OfficialJntTransport {
  inquire(input: ShippingInquiry & { originWarehouse: string; destinationArea: string }, signal: AbortSignal): Promise<ShippingRate[]>;
}
const known = ["EZ", "HBO", "JND", "ECO"] as const;
export class JntProvider implements ShippingProvider {
  readonly code = "jnt";
  readonly capabilities = ["rates"];
  constructor(private readonly transport?: OfficialJntTransport) {}
  async getRates(input: ShippingInquiry): Promise<ShippingRate[]> {
    // L3 provider mapping belongs to the *district*, never a village-level guess.
    const mapping = getJntAreaMappings().find(m => m.indonesiaCode === input.destination.districtCode);
    if (!mapping) throw new HttpError("Kecamatan belum terpetakan secara resmi ke J&T.", 422);
    const originWarehouse = process.env.JNT_ORIGIN_WAREHOUSE || "";
    if (!originWarehouse) throw new HttpError("Gudang asal J&T belum dikonfigurasi.", 503);
    let rates: ShippingRate[];
    if (this.transport) {
      rates = await this.transport.inquire({ ...input, originWarehouse, destinationArea: mapping.areaCode }, AbortSignal.timeout(6000));
    } else {
      const requested = (process.env.JNT_RATE_SERVICES || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!requested.length || new Set(requested).size !== requested.length || requested.some(s => !known.includes(s as typeof known[number]))) {
        throw new HttpError("Layanan J&T belum disetujui operator server.", 503);
      }
      const results = await Promise.all(requested.map(service => checkJntRate({
        originSite: originWarehouse, destinationArea: mapping.areaCode, weightGram: input.weightGram,
        productType: service as typeof known[number],
      })));
      rates = results.flat();
    }
    if (rates.some(r => r.courier !== "J&T Express" || !known.includes(r.service as typeof known[number]) ||
        !Number.isSafeInteger(r.cost) || r.cost < 0)) throw new HttpError("Tarif resmi J&T tidak valid", 502);
    if (new Set(rates.map(r => r.service)).size !== rates.length) throw new HttpError("Tarif resmi J&T duplikat", 502);
    return rates.map(r => ({ ...r, mode: "official" }));
  }
}
