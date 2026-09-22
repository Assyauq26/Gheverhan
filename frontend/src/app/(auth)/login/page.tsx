import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Masuk", robots: { index: false } };

export default function LoginPage({ searchParams }: { searchParams: { redirectTo?: string } }) {
  return <LoginForm redirectTo={searchParams.redirectTo} />;
}
