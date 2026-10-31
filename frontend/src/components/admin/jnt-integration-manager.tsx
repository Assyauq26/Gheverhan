"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleHelp, KeyRound, Loader2, ShieldCheck, Truck } from "lucide-react";
import {
  credentialKeys, defaultJntEndpoint, jntKinds, type JntKind, type JntEnvironment,
} from "@/modules/jnt/jnt-public";

type Setting = {
  environment: JntEnvironment; kind: JntKind; endpoint: string;
  configured: boolean; updatedAt: string | null;
};
type Draft = { endpoint: string; credentials: Record<string, string> };
type FormDrafts = Record<JntKind, Draft>;
const display: Record<JntKind, { title: string; subtitle: string; badge: string }> = {
  order: { title: "Create Order", subtitle: "Membuat order pengiriman dan menerima AWB", badge: "Pembuatan resi" },
  tariff: { title: "Tariff Check", subtitle: "Meminta tarif ongkir berdasarkan rute dan berat", badge: "Cek ongkir" },
  tracking: { title: "Tracking", subtitle: "Membaca progres pengiriman dari nomor AWB", badge: "Pelacakan" },
  cancellation: { title: "Cancellation", subtitle: "Membatalkan order yang masih memenuhi ketentuan J&T", badge: "Pembatalan" },
};
const fieldLabels: Record<string, string> = {
  username: "Username J&T", apiKey: "API Key", key: "Signature Key",
  customerName: "Customer Name (cusName)", ecompanyId: "E-Company ID / Basic Username",
  password: "Tracking Password",
};
function initialDrafts(environment: JntEnvironment, settings: Setting[]): FormDrafts {
  return Object.fromEntries(jntKinds.map(kind => [
    kind,
    { endpoint: settings.find(item => item.environment === environment && item.kind === kind)?.endpoint
        || defaultJntEndpoint(environment, kind), credentials: {} },
  ])) as FormDrafts;
}
function errorMessage(value: unknown) {
  if (value && typeof value === "object" && "error" in value) {
    const item = (value as { error: { message?: string } }).error;
    return item?.message || "Permintaan tidak berhasil";
  }
  return "Permintaan tidak berhasil";
}
const inputClass = "w-full rounded-xl bg-zinc-100 px-3.5 py-3 text-sm text-zinc-950 outline-none ring-0 focus:bg-white focus:ring-2 focus:ring-zinc-900";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
export function JntIntegrationManager() {
  const [environment, setEnvironment] = useState<JntEnvironment>("sandbox");
  const [settings, setSettings] = useState<Setting[]>([]);
  const [drafts, setDrafts] = useState<FormDrafts>(() => initialDrafts("sandbox", []));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [originCity, setOriginCity] = useState("");
  const [destinationDistrict, setDestinationDistrict] = useState("");
  const [weightKg, setWeightKg] = useState("1");
  const [productType, setProductType] = useState("EZ");
  const [awb, setAwb] = useState("");
  const [testResult, setTestResult] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/admin/jnt-integrations", { credentials: "same-origin", cache: "no-store" });
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(errorMessage(body));
        if (!cancelled) {
          setSettings(body.data as Setting[]);
          setDrafts(initialDrafts(environment, body.data as Setting[]));
          setNotice(null);
        }
      } catch (err) {
        if (!cancelled) setNotice({ text: err instanceof Error ? err.message : "Tidak dapat mengambil konfigurasi", error: true });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []); // configuration is refetched after writes

  const changeEnvironment = (next: JntEnvironment) => {
    setEnvironment(next);
    setDrafts(initialDrafts(next, settings));
    setNotice(null);
    setTestResult(null);
  };
  const setEndpoint = (kind: JntKind, value: string) => setDrafts(previous => ({
    ...previous, [kind]: { ...previous[kind], endpoint: value },
  }));
  const setCredential = (kind: JntKind, field: string, value: string) => setDrafts(previous => ({
    ...previous, [kind]: { ...previous[kind], credentials: { ...previous[kind].credentials, [field]: value } },
  }));
  async function save(kind: JntKind) {
    setBusy("save:" + kind);
    setNotice(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/admin/jnt-integrations", {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment, kind, ...drafts[kind] }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(errorMessage(body));
      setSettings(previous => previous.filter(s => !(s.environment === environment && s.kind === kind)).concat({
        environment, kind, endpoint: body.data.endpoint, configured: true, updatedAt: new Date().toISOString(),
      }));
      setDrafts(previous => ({ ...previous, [kind]: { ...previous[kind], credentials: {} } }));
      setNotice({ text: display[kind].title + " berhasil disimpan. Kredensial tidak akan ditampilkan kembali.", error: false });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Gagal menyimpan konfigurasi", error: true });
    } finally { setBusy(null); }
  }
  async function probe(kind: "tariff" | "tracking") {
    setBusy("test:" + kind);
    setNotice(null);
    setTestResult(null);
    try {
      const input = kind === "tariff" ? {
        originCity: originCity.trim().toUpperCase(), destinationDistrict: destinationDistrict.trim().toUpperCase(),
        weightKg: Number(weightKg), productType,
      } : { awb: awb.trim().toUpperCase() };
      const res = await fetch("/api/v1/admin/jnt-integrations/test", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment, kind, input }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(errorMessage(body));
      setTestResult({ type: kind, result: body.data });
      setNotice({ text: "Permintaan " + display[kind].title + " berhasil diproses.", error: false });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Pengujian gagal", error: true });
    } finally { setBusy(null); }
  }

  return <div className="space-y-6" data-testid="jnt-integration-settings">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500"><Truck size={16} /> PENGIRIMAN / INTEGRASI</div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">J&T Express API</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
          Kelola empat endpoint API resmi J&T. Kredensial tersimpan terenkripsi di server dan tidak pernah ditampilkan kembali.
        </p>
      </div>
      <div className="inline-flex shrink-0 rounded-xl bg-zinc-100 p-1" role="group" aria-label="Environment J&T">
        {(["sandbox", "production"] as const).map(mode =>
          <button key={mode} type="button" onClick={() => changeEnvironment(mode)}
            aria-pressed={environment === mode}
            className={"min-h-10 rounded-lg px-4 text-sm font-semibold transition " + (environment === mode ? "bg-black text-white" : "text-zinc-600 hover:text-black")}>
            {mode === "sandbox" ? "Sandbox" : "Production"}
          </button>)}
      </div>
    </div>
    <div className="flex gap-3 rounded-xl bg-zinc-100 p-4 text-sm text-zinc-700">
      <ShieldCheck className="mt-0.5 shrink-0" size={20}/>
      <p><strong>Checkout tetap aman.</strong> Menyimpan konfigurasi tidak mengaktifkan ongkir atau pembuatan AWB Production secara otomatis. Kesiapan mapping wilayah L3, berat produk, dan verifikasi resmi tetap diperlukan.</p>
    </div>
    {notice && <div role={notice.error ? "alert" : "status"} className={"rounded-xl p-3 text-sm " + (notice.error ? "bg-red-50 text-red-800" : "bg-zinc-100 text-zinc-800")}>{notice.text}</div>}
    {loading ? <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="animate-spin" size={18}/> Memuat konfigurasi...</div> :
    <div className="grid gap-5 xl:grid-cols-2">
      {jntKinds.map(kind => {
        const stored = settings.find(setting => setting.environment === environment && setting.kind === kind);
        const draft = drafts[kind];
        return <section key={kind} className="space-y-4 rounded-2xl bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.04)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">{display[kind].badge}</div>
              <h2 className="text-lg font-bold">{display[kind].title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{display[kind].subtitle}</p>
            </div>
            <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium " + (stored?.configured ? "bg-zinc-100 text-zinc-800" : "bg-amber-50 text-amber-800")}>
              {stored?.configured ? <CheckCircle2 size={13}/> : <CircleHelp size={13}/>}
              {stored?.configured ? "Tersimpan" : "Belum diatur"}
            </span>
          </div>
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(kind); }}>
            <label className="block space-y-1.5 text-xs font-semibold text-zinc-600">Endpoint HTTPS resmi
              <input type="url" autoComplete="off" required className={inputClass} value={draft.endpoint}
                onChange={event => setEndpoint(kind, event.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {credentialKeys[kind].map(field => <label key={field} className="block space-y-1.5 text-xs font-semibold text-zinc-600">
                {fieldLabels[field]}
                <input type="password" autoComplete="new-password" className={inputClass}
                  value={draft.credentials[field] || ""} onChange={event => setCredential(kind, field, event.target.value)}
                  required={!stored?.configured} placeholder={stored?.configured ? "Tersimpan · kosong = tetap" : "Wajib diisi"}/>
              </label>)}
            </div>
            <button type="submit" disabled={busy !== null} className={buttonClass + " w-full bg-black text-white hover:bg-zinc-800"}>
              {busy === "save:" + kind && <Loader2 className="animate-spin" size={16}/>}
              <KeyRound size={16}/> Simpan konfigurasi {display[kind].title}
            </button>
          </form>
          {kind === "tariff" && <div className="space-y-3 border-t border-zinc-100 pt-4">
            <h3 className="text-sm font-bold">Tes Check Fee (baca-saja)</h3>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} aria-label="Kota asal J&T" placeholder="Kota asal (BATANG)" value={originCity} onChange={e => setOriginCity(e.target.value)} />
              <input className={inputClass} aria-label="Kecamatan tujuan J&T" placeholder="Kecamatan tujuan" value={destinationDistrict} onChange={e => setDestinationDistrict(e.target.value)} />
              <input className={inputClass} aria-label="Berat dalam kilogram" type="number" min="0.01" max="100" step="0.01" value={weightKg} onChange={e => setWeightKg(e.target.value)} />
              <select className={inputClass} aria-label="Layanan J&T" value={productType} onChange={e => setProductType(e.target.value)}>
                {["EZ", "HBO", "JND", "ECO"].map(service => <option key={service}>{service}</option>)}
              </select>
            </div>
            <button type="button" disabled={!stored?.configured || !!busy || !originCity || !destinationDistrict}
              onClick={() => void probe("tariff")} className={buttonClass + " w-full bg-zinc-100 text-black hover:bg-zinc-200"}>
              {busy === "test:tariff" && <Loader2 className="animate-spin" size={16}/>} Tes tarif
            </button>
          </div>}
          {kind === "tracking" && <div className="space-y-3 border-t border-zinc-100 pt-4">
            <h3 className="text-sm font-bold">Tes Tracking (baca-saja)</h3>
            <input className={inputClass} aria-label="Nomor resi J&T" placeholder="Nomor AWB pengujian" value={awb} onChange={e => setAwb(e.target.value)} />
            <button type="button" disabled={!stored?.configured || !!busy || !awb}
              onClick={() => void probe("tracking")} className={buttonClass + " w-full bg-zinc-100 text-black hover:bg-zinc-200"}>
              {busy === "test:tracking" && <Loader2 className="animate-spin" size={16}/>} Tes tracking
            </button>
          </div>}
          {(kind === "order" || kind === "cancellation") && <p className="text-xs leading-relaxed text-zinc-500">
            Tes aksi dinonaktifkan di halaman ini. {kind === "order" ? "Pembuatan AWB" : "Pembatalan AWB"} harus melalui alur order terotorisasi dan pengujian Sandbox terkontrol.
          </p>}
        </section>;
      })}
    </div>}
    {testResult != null && <section className="space-y-2 rounded-2xl bg-zinc-950 p-5 text-white">
      <h2 className="text-sm font-bold">Hasil pengujian</h2>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{JSON.stringify(testResult, null, 2)}</pre>
    </section>}
    <p className="text-xs text-zinc-500">Konfigurasi ini bersifat global untuk toko saat ini. Pada SaaS multi-tenant, pengelolaannya dipindah ke otorisasi Super Admin platform, bukan ke dashboard seller.</p>
  </div>;
}
