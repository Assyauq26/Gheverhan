"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { Button, Checkbox, Icon, Input, Label } from "./lumen";
import {
  loginAction,
  registerAction,
  forgotPasswordAction,
  resetPasswordAction,
  verifyRegistrationAction,
  resendRegistrationAction,
} from "@/modules/auth/auth.actions";

type FormState = {
  ok: boolean;
  error?: string;
  message?: string;
  email?: string;
  challengeId?: string;
  step?: string;
  resendAvailableAt?: number;
  restartRequired?: boolean;
};
type PersistedRegistrationOtp = {
  email: string;
  challengeId: string;
  resendAvailableAt: number;
  expiresAt: number;
};
const REGISTRATION_OTP_STORAGE_KEY = "gheverhan.registration.otp.v1";
const REGISTRATION_OTP_TTL_MS = 10 * 60_000;
function validPersistedOtp(value: unknown): value is PersistedRegistrationOtp {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PersistedRegistrationOtp>;
  const now = Date.now();
  return (
    typeof item.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email) &&
    typeof item.challengeId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.challengeId) &&
    typeof item.resendAvailableAt === "number" &&
    Number.isFinite(item.resendAvailableAt) &&
    typeof item.expiresAt === "number" &&
    item.expiresAt > now &&
    item.expiresAt <= now + REGISTRATION_OTP_TTL_MS + 60_000
  );
}
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
function ResendSubmit({ availableAt }: { availableAt: number }) {
  const { pending } = useFormStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((availableAt - now) / 1000));
  return (
    <button
      type="submit"
      className="auth-resend-button"
      disabled={pending || remaining > 0}
      aria-busy={pending}
      data-testid="registration-resend"
    >
      {pending
        ? "Mengirim..."
        : remaining > 0
          ? `Kirim ulang dalam ${remaining} detik`
          : "Kirim ulang kode OTP"}
    </button>
  );
}
function RegistrationOtpStep({
  email,
  challengeId,
  availableAt,
  onRestart,
}: {
  email: string;
  challengeId: string;
  availableAt: number;
  onRestart: (reason?: string) => void;
}) {
  const [state, action] = useFormState<FormState, FormData>(
    verifyRegistrationAction,
    initialState,
  );
  const [resendState, resendAction] = useFormState<FormState, FormData>(
    resendRegistrationAction,
    initialState,
  );
  useEffect(() => {
    if (resendState.restartRequired) {
      onRestart("Pengiriman ulang OTP gagal. Silakan minta kode baru.");
      return;
    }
    if (!resendState.ok || !resendState.resendAvailableAt) return;
    try {
      const serialized = window.sessionStorage.getItem(REGISTRATION_OTP_STORAGE_KEY);
      if (!serialized) return;
      const stored: unknown = JSON.parse(serialized);
      if (!validPersistedOtp(stored)) return;
      if (stored.email !== email || stored.challengeId !== challengeId) return;
      window.sessionStorage.setItem(
        REGISTRATION_OTP_STORAGE_KEY,
        JSON.stringify({
          ...stored,
          resendAvailableAt: resendState.resendAvailableAt,
          expiresAt: Date.now() + REGISTRATION_OTP_TTL_MS,
        }),
      );
    } catch {
      // Storage may be disabled; the live verification form remains usable.
    }
  }, [resendState.ok, resendState.restartRequired, resendState.resendAvailableAt, email, challengeId, onRestart]);
  const preserveInterruptedResend = () => {
    // If the email is sent but the response is lost, preserve the same challenge.
    // Only the server can validate the new code, expiration and cooldown.
    try {
      const raw = window.sessionStorage.getItem(REGISTRATION_OTP_STORAGE_KEY);
      if (!raw) return;
      const stored: unknown = JSON.parse(raw);
      if (!validPersistedOtp(stored)) return;
      if (stored.email !== email || stored.challengeId !== challengeId) return;
      const now = Date.now();
      window.sessionStorage.setItem(
        REGISTRATION_OTP_STORAGE_KEY,
        JSON.stringify({
          ...stored,
          expiresAt: now + REGISTRATION_OTP_TTL_MS,
          resendAvailableAt: now + 60_000,
        }),
      );
    } catch {
      // Unavailable browser storage does not block resending.
    }
  };
  return (
    <div className="auth-content">
      <Heading title="Verifikasi email">
        Masukkan kode OTP 6 angka yang dikirim ke {email}.
      </Heading>
      <form
        action={action}
        className="auth-form"
        data-testid="verify-registration-form"
        aria-describedby="register-otp-note verify-registration-error"
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="challengeId" value={challengeId} />
        <Field
          id="register-otp"
          label="Kode OTP 6 angka"
          name="otp"
          icon="mail"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          aria-describedby="register-otp-note verify-registration-error"
          data-testid="register-otp"
        />
        <p className="auth-otp-note" id="register-otp-note">
          Kode berlaku 10 menit dengan maksimal 5 percobaan.
        </p>
        <Feedback error={state.error} id="verify-registration-error" />
        <Submit label="Verifikasi & Buat Akun" />
      </form>
      <form action={resendAction} onSubmit={preserveInterruptedResend} className="auth-resend-form">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="challengeId" value={challengeId} />
        <ResendSubmit
          availableAt={resendState.resendAvailableAt ?? availableAt}
        />
      </form>
      <Feedback error={resendState.error} id="registration-resend-error" />
      {resendState.message && (
        <p role="status" className="auth-success">
          {resendState.message}
        </p>
      )}
      <p className="auth-switch">
        <button
          type="button"
          className="auth-resend-button"
          onClick={() => onRestart()}
        >
          Ubah data pendaftaran
        </button>
      </p>
    </div>
  );
}
export function RegisterForm() {
  const [attempt, setAttempt] = useState(0);
  const [restartReason, setRestartReason] = useState<string | undefined>();
  const onRestart = useCallback((reason?: string) => {
    try {
      window.sessionStorage.removeItem(REGISTRATION_OTP_STORAGE_KEY);
    } catch {
      // Private browsing may disable storage.
    }
    setRestartReason(reason);
    setAttempt((value) => value + 1);
  }, []);
  return (
    <RegistrationForm key={attempt} onRestart={onRestart} restartReason={restartReason} />
  );
}
function RegistrationForm({
  onRestart,
  restartReason,
}: {
  onRestart: (reason?: string) => void;
  restartReason?: string;
}) {
  const [state, action] = useFormState<FormState, FormData>(
    registerAction,
    initialState,
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [activeOtp, setActiveOtp] = useState<PersistedRegistrationOtp | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(REGISTRATION_OTP_STORAGE_KEY);
      if (!saved) return;
      const item: unknown = JSON.parse(saved);
      if (validPersistedOtp(item)) {
        setActiveOtp(item);
      } else {
        window.sessionStorage.removeItem(REGISTRATION_OTP_STORAGE_KEY);
      }
    } catch {
      // Invalid or unavailable storage must never prevent registration.
    }
  }, []);
  useEffect(() => {
    if (state.step !== "verify" || !state.email || !state.challengeId) return;
    const item: PersistedRegistrationOtp = {
      email: state.email,
      challengeId: state.challengeId,
      resendAvailableAt: state.resendAvailableAt ?? 0,
      expiresAt: Date.now() + REGISTRATION_OTP_TTL_MS,
    };
    setActiveOtp(item);
    try {
      // Only the email and opaque challenge metadata: never persist password/OTP.
      window.sessionStorage.setItem(REGISTRATION_OTP_STORAGE_KEY, JSON.stringify(item));
    } catch {
      // Verification still works without browser storage.
    }
  }, [state.step, state.email, state.challengeId, state.resendAvailableAt]);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    // React's delegated reset event can be suppressed while a Server Action is pending.
    // Cancel the native reset on this form so failed validation cannot discard consent/input.
    const preserveInput = (event: Event) => event.preventDefault();
    form.addEventListener("reset", preserveInput);
    return () => form.removeEventListener("reset", preserveInput);
  }, [state.step]);
  const challenge = state.step === "verify" && state.email && state.challengeId
    ? { email: state.email, challengeId: state.challengeId, resendAvailableAt: state.resendAvailableAt ?? 0 }
    : activeOtp;
  if (challenge)
    return (
      <RegistrationOtpStep
        email={challenge.email}
        challengeId={challenge.challengeId}
        availableAt={challenge.resendAvailableAt}
        onRestart={onRestart}
      />
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
        ref={formRef}
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
          id="register-phone"
          label="Nomor HP (wajib)"
          name="phone"
          type="tel"
          icon="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          data-testid="register-phone"
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
          onChange={(event) => setPassword(event.target.value)}
          data-testid="register-password"
        />
        <Field
          id="register-confirm-password"
          label="Konfirmasi password"
          name="confirmPassword"
          icon="lock-keyhole"
          password
          required
          minLength={6}
          autoComplete="new-password"
          onChange={(event) => setConfirm(event.target.value)}
          data-testid="register-confirm-password"
        />
        {confirm && password !== confirm && (
          <p className="auth-inline-error" role="status">
            Konfirmasi password tidak sama.
          </p>
        )}
        <div className="auth-terms">
          <Label htmlFor="register-terms" className="auth-terms-check">
            <Checkbox
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
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
        <Feedback error={restartReason ?? state.error} id="register-error" />
        <Submit label="Kirim Kode OTP" />
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
