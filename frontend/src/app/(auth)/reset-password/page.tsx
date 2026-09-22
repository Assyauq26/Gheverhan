import { ResetForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset Password", robots: { index: false } };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  return <ResetForm token={searchParams.token ?? ""} />;
}
