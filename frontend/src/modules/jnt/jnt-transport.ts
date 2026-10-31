import "server-only";
import { z } from "zod";
import { HttpError } from "@/lib/http-error";
import { readJntCredentials } from "./jnt-settings";
import { signJntData, tariffInputSchema, parseJntTariffs, type JntEnvironment, type JntKind } from "./jnt-protocol";

async function submitJnt(environment: JntEnvironment, kind: JntKind, data: Record<string, unknown>) {
  const setting = await readJntCredentials(environment, kind);
  const { credentials, endpoint } = setting;
  let headers: Record<string, string>;
  let body: string;
  if (kind === "tracking") {
    const user = credentials.ecompanyId;
    headers = { "Content-Type": "application/json", "Authorization": "Basic " + Buffer.from(user + ":" + credentials.password).toString("base64") };
    body = JSON.stringify(data);
  } else {
    const payload = JSON.stringify(data);
    const sign = signJntData(payload, credentials.key);
    const form = new URLSearchParams(kind === "tariff" ? { data: payload, sign } : { data_param: payload, data_sign: sign });
    headers = { "Content-Type": "application/x-www-form-urlencoded" };
    body = form.toString();
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST", headers, body, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new HttpError("Koneksi ke J&T gagal atau melewati batas waktu", 503);
  }
  if (!response.ok) throw new HttpError("J&T mengembalikan HTTP " + response.status, 502);
  if (Number(response.headers.get("content-length")) > 65536) throw new HttpError("Respons J&T terlalu besar", 502);
  const text = await response.text();
  if (text.length > 65536) throw new HttpError("Respons J&T terlalu besar", 502);
  try { return JSON.parse(text) as unknown; }
  catch { throw new HttpError("Respons J&T bukan JSON", 502); }
}
function getMessage(err: unknown) {
  if (err instanceof HttpError) throw err;
  // Never leak request bodies, credentials, or response internals.
  throw new HttpError("Respons J&T tidak sesuai format yang diharapkan", 502);
}
export async function jntCheckFee(environment: JntEnvironment, input: unknown) {
  try {
    const request = tariffInputSchema.parse(input);
    const setting = await readJntCredentials(environment, "tariff");
    return parseJntTariffs(await submitJnt(environment, "tariff", {
      cusName: setting.credentials.customerName,
      sendSiteCode: request.originCity,
      destAreaCode: request.destinationDistrict,
      weight: String(request.weightKg),
      productType: request.productType,
    }), request.productType);
  } catch (err) { return getMessage(err); }
}

export async function jntTrack(environment: JntEnvironment, awb: string) {
  if (!/^[A-Z0-9-]{8,25}$/.test(awb)) throw new HttpError("Format nomor resi tidak valid", 422);
  const setting = await readJntCredentials(environment, "tracking");
  const response = await submitJnt(environment, "tracking", { awb, eccompanyid: setting.credentials.ecompanyId });
  // Do not send raw tracking events/PII to the settings tester.
  const result = z.object({ error_id: z.unknown().optional(), error_message: z.unknown().optional(), awb: z.unknown().optional(), detail: z.unknown().optional() }).passthrough().safeParse(response);
  if (!result.success) throw new HttpError("Format tracking tidak dikenali", 502);
  const parsed = result.data;
  const errorId = typeof parsed.error_id === "string" ? parsed.error_id : undefined;
  const detailCount = Array.isArray(parsed.detail) ? parsed.detail.length : null;
  return { awb, errorId: errorId || null, eventsReceived: detailCount, responseReceived: true };
}

const orderSchema = z.object({
  username: z.string(), api_key: z.string(), orderid: z.string().min(1).max(20).regex(/^[A-Za-z0-9-]+$/),
  shipper_name: z.string().min(1).max(30), shipper_contact: z.string().min(1).max(30),
  shipper_phone: z.string().regex(/^\+62\d{8,12}$/), shipper_addr: z.string().min(1).max(200),
  origin_code: z.string().regex(/^[A-Z]{3}$/),
  receiver_name: z.string().min(1).max(30), receiver_phone: z.string().regex(/^\+62\d{8,12}$/),
  receiver_addr: z.string().min(1).max(200), receiver_zip: z.string().regex(/^\d{5}$/),
  destination_code: z.string().regex(/^[A-Z]{3}$/), receiver_area: z.string().regex(/^[A-Z0-9]{3,10}$/),
  qty: z.number().int().positive(), weight: z.number().positive().max(100),
  goodsdesc: z.string().min(1).max(40), servicetype: z.union([z.literal(1), z.literal(6)]),
  insurance: z.number().int().nonnegative(), orderdate: z.string(), item_name: z.string().min(1).max(50),
  cod: z.number().int().nonnegative(), sendstarttime: z.string(), sendendtime: z.string(),
  expresstype: z.literal("1"), goodsvalue: z.number().int().nonnegative(),
}).strict();
/** Internal-only: caller must verify paid order and persist idempotency intent BEFORE calling. */
export async function jntCreateOrder(environment: JntEnvironment, input: unknown) {
  const credentials = (await readJntCredentials(environment, "order")).credentials;
  const data = orderSchema.parse({ ...(input as object), username: credentials.username, api_key: credentials.apiKey });
  const raw = await submitJnt(environment, "order", { detail: [data] });
  const parsed = z.object({ success: z.boolean(), detail: z.array(z.object({
    orderid: z.string(), status: z.string(), awb_no: z.string().optional(),
  }).passthrough()) }).passthrough().safeParse(raw);
  const response = parsed.success && parsed.data.success ? parsed.data.detail.find(d => d.orderid === data.orderid && d.status === "Sukses" && d.awb_no) : null;
  if (!response?.awb_no) throw new HttpError("J&T belum mengonfirmasi pembuatan AWB", 502);
  return { orderId: data.orderid, awb: response.awb_no };
}
/** Internal-only: caller must verify shipment ownership, lifecycle and reconciliation. */
export async function jntCancelOrder(environment: JntEnvironment, orderId: string, remark: string) {
  if (!/^[A-Za-z0-9-]{1,20}$/.test(orderId) || remark.length < 1 || remark.length > 30) throw new HttpError("Parameter pembatalan tidak valid", 422);
  const credentials = (await readJntCredentials(environment, "cancellation")).credentials;
  return submitJnt(environment, "cancellation", {
    detail: [{ username: credentials.username, api_key: credentials.apiKey, orderid: orderId, remark }],
  });
}
