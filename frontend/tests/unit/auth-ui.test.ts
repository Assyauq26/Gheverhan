// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const form = vi.hoisted(() => ({
  pending: false,
  state: { ok: false, error: undefined as string | undefined },
}));
vi.mock("react-dom", async (original) => ({
  ...(await original<typeof import("react-dom")>()),
  useFormState: () => [form.state, undefined],
  useFormStatus: () => ({ pending: form.pending }),
}));
vi.mock("@/modules/auth/auth.actions", () => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
  verifyRegistrationAction: vi.fn(),
  resendRegistrationAction: vi.fn(),
  forgotPasswordAction: vi.fn(),
  resetPasswordAction: vi.fn(),
}));
import { LoginForm, RegisterForm } from "@/components/auth/auth-forms";
afterEach(() => {
  cleanup();
  form.pending = false;
  form.state = { ok: false, error: undefined };
});
it("password toggle preserves entered credentials and remains a non-submit control", () => {
  render(createElement(LoginForm, { redirectTo: "/cart" }));
  const input = screen.getByLabelText("Password") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "local-test-password" } });
  const toggle = screen.getByRole("button", { name: "Tampilkan password" });
  expect(toggle.getAttribute("type")).toBe("button");
  fireEvent.click(toggle);
  expect(input.type).toBe("text");
  expect(input.value).toBe("local-test-password");
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(
    document.querySelector<HTMLInputElement>('[name="redirectTo"]')?.value,
  ).toBe("/cart");
  fireEvent.click(toggle);
  expect(input.type).toBe("password");
});
it("legal links open separately and do not implicitly consent or discard the form", () => {
  render(createElement(RegisterForm));
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  fireEvent.change(email, { target: { value: "dummy@example.test" } });
  const terms = screen.getByTestId("register-terms") as HTMLInputElement;
  for (const name of ["Syarat & Ketentuan", "Kebijakan Privasi"]) {
    const link = screen.getByRole("link", { name });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.closest("label")).toBeNull();
  }
  expect(terms.checked).toBe(false);
  expect(terms.required).toBe(true);
  expect(email.required).toBe(true);
  expect(email.value).toBe("dummy@example.test");
  expect(
    (screen.getByTestId("register-phone") as HTMLInputElement).required,
  ).toBe(true);
  expect(
    (screen.getByTestId("register-confirm-password") as HTMLInputElement)
      .required,
  ).toBe(true);
});
it("pending submit is disabled and server errors are exposed to assistive technology", () => {
  form.pending = true;
  form.state.error = "Email atau password salah";
  render(createElement(LoginForm));
  expect(
    (screen.getByTestId("auth-submit") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByTestId("auth-submit").getAttribute("aria-busy")).toBe(
    "true",
  );
  expect(screen.getByRole("alert").textContent).toBe(form.state.error);
  expect(
    (screen.getByTestId("google-login") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByTestId("whatsapp-login") as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByText(/Segera hadir/)).toBeTruthy();
});

it("registration retains typed values and explicit consent when an action requests native form reset", () => {
  render(createElement(RegisterForm));
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  fireEvent.change(email, { target: { value: "dummy@example.test" } });
  const terms = screen.getByTestId("register-terms") as HTMLInputElement;
  fireEvent.click(terms);
  expect(terms.checked).toBe(true);
  (screen.getByTestId("register-form") as HTMLFormElement).reset();
  expect(terms.checked).toBe(true);
  expect(email.value).toBe("dummy@example.test");
});
