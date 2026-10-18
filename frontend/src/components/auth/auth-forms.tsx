"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { Button, Checkbox, Icon, Input, Label } from "./lumen";
import {
  loginAction,
  registerAction,
  forgotPasswordAction,
  resetPasswordAction,
} from "@/modules/auth/auth.actions";

type FormState = { ok: boolean; error?: string; message?: string };
const initialState: FormState = { ok: false };
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className="auth-submit"
      loading={pending}
      disabled={pending}
      data-testid="auth-submit"
    >
      <span>{pending ? "Memproses..." : label}</span>
      {!pending && <Icon name="arrow-right" />}
    </Button>
  );
}
function Field({
  id,
  label,
  icon,
  password,
  ...props
}: ComponentPropsWithoutRef<"input"> & {
  id: string;
  label: string;
  icon: "user-round" | "mail" | "phone" | "lock-keyhole";
  password?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(String(props.defaultValue ?? ""));
  return (
    <div className="auth-field">
      <Label htmlFor={id} className="auth-sr-only">
        {label}
      </Label>
      <div className="auth-input-wrap">
        <Icon name={icon} />
        <Input
          {...props}
          id={id}
          type={password ? (visible ? "text" : "password") : props.type}
          placeholder={props.placeholder || label}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            props.onChange?.(event);
          }}
          className={password ? "auth-input auth-input-password" : "auth-input"}
        />
        {password && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="auth-password-toggle"
            aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={visible}
            aria-controls={id}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? "eye-off" : "eye"} />
          </Button>
        )}
      </div>
    </div>
  );
}
function Feedback({ error, id }: { error?: string; id: string }) {
  return (
    <div
      id={id}
      className="auth-feedback"
      aria-live="polite"
      aria-atomic="true"
    >
      {error && (
        <p role="alert" data-testid={id}>
          {error}
        </p>
      )}
    </div>
  );
}
function SocialButtons() {
  return (
    <div className="auth-social-block">
      <div className="auth-divider">
        <span>atau</span>
      </div>
      <div className="auth-social">
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby="social-coming-soon"
          title="Segera hadir"
          data-testid="google-login"
        >
          <Image
            src="/brands/google.svg"
            width={22}
            height={22}
            alt=""
            aria-hidden="true"
            unoptimized
          />
          Lanjut dengan Google
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby="social-coming-soon"
          title="Segera hadir"
          data-testid="whatsapp-login"
        >
          <Image
            src="/brands/whatsapp.svg"
            width={22}
            height={22}
            alt=""
            aria-hidden="true"
            unoptimized
          />
          Lanjut dengan WhatsApp
        </Button>
      </div>
      <p className="auth-social-note" id="social-coming-soon">
        Google dan WhatsApp · Segera hadir
      </p>
    </div>
  );
}
function Heading({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-heading">
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, action] = useFormState<FormState, FormData>(
    loginAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Masuk">Selamat datang kembali di Gheverhan.</Heading>
      <form
        action={action}
        className="auth-form"
        data-testid="login-form"
        aria-describedby="login-error"
      >
        <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
        <Field
          id="login-identifier"
          label="Email atau No. HP"
          name="identifier"
          icon="user-round"
          required
          autoComplete="username"
          autoCapitalize="none"
          data-testid="login-identifier"
        />
        <Field
          id="login-password"
          label="Password"
          name="password"
          icon="lock-keyhole"
          password
          required
          autoComplete="current-password"
          data-testid="login-password"
        />
        <Link href="/forgot-password" className="auth-forgot">
          Lupa password?
        </Link>
        <Feedback error={state?.error} id="login-error" />
        <Submit label="Masuk" />
      </form>
      <SocialButtons />
      <p className="auth-switch">
        Belum punya akun? <Link href="/register">Daftar</Link>
      </p>
    </div>
  );
}
export function RegisterForm() {
  const [state, action] = useFormState<FormState, FormData>(
    registerAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Daftar akun">
        Buat akun baru untuk mulai belanja di Gheverhan.
      </Heading>
      <form
        action={action}
        className="auth-form"
        data-testid="register-form"
        aria-describedby="register-error"
      >
        <Field
          id="register-name"
          label="Nama lengkap"
          name="name"
          icon="user-round"
          required
          minLength={2}
          autoComplete="name"
          data-testid="register-name"
        />
        <Field
          id="register-email"
          label="Email"
          name="email"
          type="email"
          icon="mail"
          required
          autoComplete="email"
          autoCapitalize="none"
          data-testid="register-email"
        />
        <Field
          id="register-password"
          label="Password"
          name="password"
          icon="lock-keyhole"
          password
          required
          minLength={6}
          autoComplete="new-password"
          data-testid="register-password"
        />
        <details className="auth-optional-phone">
          <summary>Tambahkan nomor HP (opsional)</summary>
          <Field
            id="register-phone"
            label="No. HP (opsional)"
            name="phone"
            type="tel"
            icon="phone"
            autoComplete="tel"
            data-testid="register-phone"
          />
        </details>
        <div className="auth-terms">
          <Label htmlFor="register-terms" className="auth-terms-check">
            <Checkbox
              id="register-terms"
              name="terms"
              value="1"
              required
              data-testid="register-terms"
            />
            <span className="auth-sr-only">
              Saya setuju dengan Syarat &amp; Ketentuan dan Kebijakan Privasi
            </span>
          </Label>
          <p>
            Saya setuju dengan{" "}
            <Link
              href="/syarat-ketentuan"
              target="_blank"
              rel="noopener noreferrer"
            >
              Syarat &amp; Ketentuan
            </Link>{" "}
            dan{" "}
            <Link
              href="/kebijakan-privasi"
              target="_blank"
              rel="noopener noreferrer"
            >
              Kebijakan Privasi
            </Link>
            .
          </p>
        </div>
        <Feedback error={state?.error} id="register-error" />
        <Submit label="Daftar" />
      </form>
      <SocialButtons />
      <p className="auth-switch">
        Sudah punya akun? <Link href="/login">Masuk</Link>
      </p>
    </div>
  );
}
export function ForgotForm() {
  const [state, action] = useFormState<FormState, FormData>(
    forgotPasswordAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Lupa Password">
        Masukkan email untuk menerima tautan reset.
      </Heading>
      <form action={action} className="auth-form" data-testid="forgot-form">
        <Field
          id="forgot-email"
          label="Email"
          name="email"
          type="email"
          icon="mail"
          required
          autoComplete="email"
          data-testid="forgot-email"
        />
        {state?.message && (
          <p
            role="status"
            className="auth-success"
            data-testid="forgot-message"
          >
            {state.message}
          </p>
        )}
        <Feedback id="forgot-error" error={state?.error} />
        <Submit label="Kirim Tautan Reset" />
      </form>
      <p className="auth-switch">
        <Link href="/login">Kembali ke Masuk</Link>
      </p>
    </div>
  );
}
export function ResetForm({ token }: { token: string }) {
  const [state, action] = useFormState<FormState, FormData>(
    resetPasswordAction,
    initialState,
  );
  return (
    <div className="auth-content">
      <Heading title="Atur Ulang Password">
        Buat password baru untuk akun Anda.
      </Heading>
      <form action={action} className="auth-form" data-testid="reset-form">
        <input type="hidden" name="token" value={token} />
        <Field
          id="reset-password"
          label="Password Baru"
          name="password"
          password
          icon="lock-keyhole"
          required
          minLength={6}
          autoComplete="new-password"
          data-testid="reset-password"
        />
        <Feedback id="reset-error" error={state?.error} />
        <Submit label="Simpan Password" />
      </form>
    </div>
  );
}
