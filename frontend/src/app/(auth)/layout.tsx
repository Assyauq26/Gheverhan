import Link from "next/link";
import "@/components/auth/lumen/styles.css";
import "@/components/auth/auth.css";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-ui" data-theme="light">
      <header className="auth-header">
        <Link
          href="/"
          aria-label="Gheverhan — beranda"
          className="auth-wordmark"
        >
          Gheverhan
        </Link>
      </header>
      <main className="auth-main">{children}</main>
    </div>
  );
}
