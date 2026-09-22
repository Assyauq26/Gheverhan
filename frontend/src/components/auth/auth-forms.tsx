"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { MessageCircle, Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  loginAction,
  registerAction,
  forgotPasswordAction,
  resetPasswordAction,
} from "@/modules/auth/auth.actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="auth-submit">
      {pending ? "Memproses..." : label}
    </Button>
  );
}

function SocialButtons() {
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" disabled title="Segera hadir" data-testid="whatsapp-login">
        <MessageCircle size={18} /> Lanjut dengan WhatsApp
      </Button>
      <Button type="button" variant="outline" className="w-full" disabled title="Segera hadir" data-testid="google-login">
        <Chrome size={18} /> Lanjut dengan Google
      </Button>
      <p className="text-center text-[11px] text-ink-muted">WhatsApp & Google aktif saat kredensial dikonfigurasi.</p>
    </div>
  );
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action] = useFormState(loginAction, { ok: false } as any);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black text-ink">Masuk</h1>
        <p className="mt-1 text-sm text-ink-soft">Selamat datang kembali di Gheverhan.</p>
      </div>
      <form action={action} className="space-y-4" data-testid="login-form">
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <div><Label>Email / No. HP</Label><Input name="identifier" required data-testid="login-identifier" /></div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Password</Label>
            <Link href="/forgot-password" className="text-xs font-semibold text-ink-soft hover:text-ink">Lupa password?</Link>
          </div>
          <Input name="password" type="password" required data-testid="login-password" />
        </div>
        {state?.ok === false && state?.error && <p className="text-sm text-destructive" data-testid="login-error">{state.error}</p>}
        <Submit label="Masuk" />
      </form>
      <div className="relative text-center text-xs text-ink-muted"><span className="bg-white px-2">atau</span><span className="absolute inset-x-0 top-1/2 -z-10 h-px bg-line" /></div>
      <SocialButtons />
      <p className="text-center text-sm text-ink-soft">
        Belum punya akun? <Link href="/register" className="font-semibold text-ink underline">Daftar</Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [state, action] = useFormState(registerAction, { ok: false } as any);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black text-ink">Daftar</h1>
        <p className="mt-1 text-sm text-ink-soft">Gabung dan nikmati penawaran eksklusif.</p>
      </div>
      <form action={action} className="space-y-4" data-testid="register-form">
        <div><Label>Nama Lengkap</Label><Input name="name" required data-testid="register-name" /></div>
        <div><Label>Email</Label><Input name="email" type="email" required data-testid="register-email" /></div>
        <div><Label>No. HP</Label><Input name="phone" data-testid="register-phone" /></div>
        <div><Label>Password</Label><Input name="password" type="password" required data-testid="register-password" /></div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="terms" value="1" className="accent-black" data-testid="register-terms" />
          Saya setuju dengan Syarat & Ketentuan
        </label>
        {state?.ok === false && state?.error && <p className="text-sm text-destructive" data-testid="register-error">{state.error}</p>}
        <Submit label="Buat Akun" />
      </form>
      <p className="text-center text-sm text-ink-soft">
        Sudah punya akun? <Link href="/login" className="font-semibold text-ink underline">Masuk</Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const [state, action] = useFormState(forgotPasswordAction, { ok: false } as any);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-black text-ink">Lupa Password</h1>
        <p className="mt-1 text-sm text-ink-soft">Masukkan email untuk menerima tautan reset.</p>
      </div>
      <form action={action} className="space-y-4" data-testid="forgot-form">
        <div><Label>Email</Label><Input name="email" type="email" required data-testid="forgot-email" /></div>
        {state?.message && <p className="text-sm text-success" data-testid="forgot-message">{state.message}</p>}
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Submit label="Kirim Tautan Reset" />
      </form>
      <p className="text-center text-sm text-ink-soft"><Link href="/login" className="font-semibold text-ink underline">Kembali ke Masuk</Link></p>
    </div>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useFormState(resetPasswordAction, { ok: false } as any);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-black text-ink">Atur Ulang Password</h1>
      <form action={action} className="space-y-4" data-testid="reset-form">
        <input type="hidden" name="token" value={token} />
        <div><Label>Password Baru</Label><Input name="password" type="password" required data-testid="reset-password" /></div>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Submit label="Simpan Password" />
      </form>
    </div>
  );
}
