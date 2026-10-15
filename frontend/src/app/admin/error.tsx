"use client";
import { Button } from "@/components/ui/button";
export default function AdminError({ reset }: { reset: () => void }) { return <div role="alert" className="max-w-lg space-y-4 py-8"><h1 className="text-xl font-semibold">Data belum dapat dimuat</h1><p className="text-sm text-ink-soft">Periksa koneksi, lalu coba lagi. Perubahan yang belum dikonfirmasi tidak dikirim.</p><Button onClick={reset}>Coba lagi</Button></div>; }
