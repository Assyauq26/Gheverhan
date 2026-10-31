"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, LockKeyhole, ShieldAlert, Truck } from "lucide-react";

type Env = "sandbox" | "production";
type Endpoint = "order" | "tariff" | "tracking" | "cancellation";
type Secret = "orderUsername" | "orderApiKey" | "orderKey" | "tariffCustomer" | "tariffKey" |
  "trackingUsername" | "trackingPassword";
type Endpoints = Record<Endpoint, string>;
type Secrets = Record<Secret, string>;
type Status = {
  configured: boolean;
  enabled: boolean;
  updatedAt: string | null;
  endpoints: Endpoints | null;
  credentialSet: Record<Secret, boolean>;
};
const emptySecrets: Secrets = {
  orderUsername: "", orderApiKey: "", orderKey: "", tariffCustomer: "",
  tariffKey: "", trackingUsername: "", trackingPassword: "",
};
const paths = {
  order: "/jts-idn-ecommerce-api/api/order/create",
  cancellation: "/jts-idn-ecommerce-api/api/order/cancel",
  tariff: "/jandt_track/inquiry.action",
  tracking: "/jandt_track/track/trackAction!tracking.action",
};
function defaults(env: Env): Endpoints {
  const orderHost = env === "sandbox" ? "demo-ecommerce.inuat-jntexpress.id" : "api.jet.co.id";
  const trackHost = env === "sandbox" ? "demo-general.inuat-jntexpress.id" : "partner-track.jet.co.id";
  return {
    order: "https://" + orderHost + paths.order,
    cancellation: "https://" + orderHost + paths.cancellation,
    tariff: "https://" + trackHost + paths.tariff,
    tracking: "https://" + trackHost + paths.tracking,
  };
}
const groups: Array<{ name: string; endpoint: Endpoint; description: string; fields: Array<{ key: Secret; label: string; sensitive?: boolean }> }> = [
  { name: "1. Order (Create AWB)", endpoint: "order",
    description: "Buat resi dari order yang sudah terverifikasi. Tidak tersedia tombol uji pembuatan resi agar tidak terjadi order ganda.",
    fields: [{ key: "orderUsername", label: "Username Order" }, { key: "orderApiKey", label: "API Key Order", sensitive: true }, { key: "orderKey", label: "Signing Key Order", sensitive: true }] },
  { name: "2. Tariff Check (Ongkir)", endpoint: "tariff",
    description: "POST data dan sign. Tarif diambil berdasarkan kota asal, kecamatan tujuan dari mapping L3, berat aktual, dan layanan.",
    fields: [{ key: "tariffCustomer", label: "Customer Name / cusName" }, { key: "tariffKey", label: "Signing Key Tariff", sensitive: true }] },
  { name: "3. Tracking", endpoint: "tracking",
    description: "Basic Authentication dan body JSON berisi awb serta eccompanyid.",
    fields: [{ key: "trackingUsername", label: "Basic Auth Username / e-company ID" }, { key: "trackingPassword", label: "Basic Auth Password", sensitive: true }] },
  { name: "4. Cancellation", endpoint: "cancellation",
    description: "POST data_param dan data_sign. Menggunakan kredensial Order yang sama; pembatalan hanya boleh dijalankan dari pesanan milik toko yang masih memenuhi syarat.",
    fields: [] },
];
export function JntIntegrationSettings() {
  const [environment, setEnvironment] = useState<Env>("sandbox");
  const [endpoints, setEndpoints] = useState<Endpoints>(defaults("sandbox"));
  const [secrets, setSecrets] = useState<Secrets>({ ...emptySecrets });
  const [status, setStatus] = useState<Status | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setNotice("");
    setStatus(null);
    setSecrets({ ...emptySecrets });
    setEndpoints(defaults(environment));
    fetch("/api/v1/admin/integrations/jnt?environment=" + environment, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error?.message || "Gagal membaca konfigurasi");
        return json.data as Status;
      })
      .then(data => {
        setStatus(data);
        setEnabled(data.enabled);
        setEndpoints(data.endpoints || defaults(environment));
      })
      .catch(error => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Gagal membaca konfigurasi"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [environment]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/integrations/jnt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ environment, endpoints, credentials: secrets, enabled }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error?.message || "Gagal menyimpan");
      setSecrets({ ...emptySecrets });
      setStatus(previous => ({
        configured: true,
        enabled: json.data.enabled,
        updatedAt: json.data.updatedAt,
        endpoints,
        credentialSet: Object.fromEntries(Object.keys(emptySecrets).map(key => [key, true])) as Record<Secret, boolean>,
      }));
      setNotice("Konfigurasi berhasil disimpan terenkripsi. Aktivasi checkout tetap memerlukan mapping, berat produk, dan gate rilis.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan konfigurasi");
    } finally { setSaving(false); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-500"><Truck size={16}/> INTEGRASI PENGIRIMAN</div>
        <h1 className="font-display text-2xl font-bold tracking-tight">J&T Express API</h1>
        <p className="mt-1 text-sm text-zinc-500">Konfigurasi global pemilik SaaS, terpisah dari pengaturan toko seller.</p>
      </div>
      <div className="rounded-full bg-zinc-100 p-1" role="group" aria-label="Lingkungan J&T">
        {(["sandbox", "production"] as const).map(env => <button key={env} type="button"
          aria-pressed={environment === env} onClick={() => setEnvironment(env)}
          className={"rounded-full px-4 py-2 text-sm font-medium " + (environment === env ? "bg-black text-white" : "text-zinc-600")}>
          {env === "sandbox" ? "Testing" : "Production"}
        </button>)}
      </div>
    </div>
    <div className="flex gap-3 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-700">
      <ShieldAlert className="shrink-0" size={20}/>
      <span>Kredensial tidak akan ditampilkan kembali setelah disimpan. Kosongkan input secret untuk mempertahankan nilai lama. Jangan masukkan kredensial Demo ke environment Production. Pengubahan ini tidak otomatis membuat resi atau membuka checkout.</span>
    </div>
    <form onSubmit={save} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {status?.configured ? <CheckCircle2 className="text-emerald-600" size={21}/> : <KeyRound size={21}/>}
          <div>
            <div className="text-sm font-semibold">{loading ? "Memeriksa konfigurasi..." : status?.configured ? "Kredensial tersimpan" : "Belum dikonfigurasi"}</div>
            <div className="text-xs text-zinc-500">{status?.updatedAt ? "Diperbarui " + new Date(status.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "Belum ada perubahan tersimpan"}</div>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={loading} className="size-4 accent-black"/>
          Aktifkan kredensial {environment === "sandbox" ? "Testing" : "Production"}
        </label>
      </div>
      {groups.map(group => <section key={group.endpoint} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">{group.name}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">{group.description}</p></div>
          <LockKeyhole size={19} className="shrink-0 text-zinc-400"/>
        </div>
        <label className="block text-xs font-semibold text-zinc-600">
          Endpoint URL
          <input type="url" required maxLength={350} disabled={loading}
            value={endpoints[group.endpoint]} onChange={event => setEndpoints(old => ({ ...old, [group.endpoint]: event.target.value }))}
            className="mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3 text-sm font-normal text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400"/>
        </label>
        {group.fields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
          {group.fields.map(field => <label key={field.key} className="block text-xs font-semibold text-zinc-600">
            {field.label} {status?.credentialSet[field.key] && <span className="ml-1 font-normal text-emerald-700">Tersimpan</span>}
            <input type={field.sensitive ? "password" : "text"} autoComplete="off" maxLength={300}
              disabled={loading} value={secrets[field.key]}
              onChange={event => setSecrets(old => ({ ...old, [field.key]: event.target.value }))}
              placeholder={status?.credentialSet[field.key] ? "Kosongkan untuk tetap memakai nilai tersimpan" : "Wajib untuk konfigurasi pertama"}
              className="mt-2 h-11 w-full rounded-xl bg-zinc-100 px-3 text-sm font-normal text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400"/>
          </label>)}
        </div>}
      </section>)}
      {notice && <p role="status" className="rounded-xl bg-zinc-100 px-4 py-3 text-sm">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="max-w-lg text-xs text-zinc-500">Akses terbatas ke Super Admin yang ID akunnya tercantum di allowlist platform pada server. Semua perubahan dicatat pada Audit Log.</span>
        <button type="submit" disabled={loading || saving} className="min-h-11 rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Menyimpan..." : "Simpan konfigurasi"}
        </button>
      </div>
    </form>
  </div>;
}
