import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="container flex items-center justify-center py-6">
        <Link href="/" className="font-display text-2xl font-extrabold tracking-tight">
          Gheverhan
        </Link>
      </header>
      <main className="container flex flex-1 items-center justify-center py-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
