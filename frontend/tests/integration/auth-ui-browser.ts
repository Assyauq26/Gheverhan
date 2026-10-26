/** Browser regression: real Server Actions, synthetic data, disposable PostgreSQL only. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, randomInt } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { fallbackHeroSlides } from "../../src/modules/hero/schema";
const target = new URL(
  process.env.SPRINT1_TEST_DATABASE_URL || "http://invalid",
);
assert.equal(process.env.GHEVERHAN_ISOLATED_TESTS, "1");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.pathname, "/gheverhan_sprint1_test");
const db = new PrismaClient({
  datasources: { db: { url: target.toString() } },
});
const root = process.cwd(),
  base = "http://localhost:3170";
const evidence = process.env.SPRINT1_ARTIFACT_DIR || "/tmp/gheverhan-auth-ui";
const checkpoints: string[] = [],
  errors: string[] = [];
const geometry: unknown[] = [];
const expectedTransportErrors: string[] = [];
let injectingResendFailure = false;
const phoneSeed = String(randomInt(1_000_000, 10_000_000));
const dummyPhone = (index: number) => "0812" + phoneSeed + index;
let failMail = false;
const capturedOtp = new Map<string, string>();
const mailCounts = new Map<string, number>();
const viewportSizes = [
  [320, 740],
  [360, 800],
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];
async function main() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(3170, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const mailSink = createHttpServer(async (req, res) => {
    if (req.url !== "/emails" || req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }
    const parts: Buffer[] = [];
    for await (const chunk of req) parts.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(parts).toString("utf8")) as {
      to: string[];
      text: string;
    };
    const code = body.text.match(/pendaftaran Gheverhan: (\d{6})/)?.[1];
    assert.ok(code, "OTP sent only to isolated local sink");
    capturedOtp.set(body.to[0], code);
    mailCounts.set(body.to[0], (mailCounts.get(body.to[0]) || 0) + 1);
    res.writeHead(failMail ? 503 : 200, { "Content-Type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) =>
    mailSink.listen(0, "127.0.0.1", resolve),
  );
  const sinkAddress = mailSink.address();
  assert.ok(sinkAddress && typeof sinkAddress !== "string");
  const server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3170",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: target.toString(),
        DIRECT_URL: target.toString(),
        NEXT_PUBLIC_BASE_URL: base,
        MAINTENANCE_MODE: "0",
        RESEND_API_KEY: "isolated-otp-key",
        PASSWORD_RESET_FROM: "Gheverhan <test@example.test>",
        PASSWORD_RESET_BASE_URL: "https://example.test",
        REGISTRATION_OTP_TEST_SINK:
          "http://127.0.0.1:" + sinkAddress.port + "/emails",
      },
      stdio: "ignore",
    },
  );
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let passed = false;
  try {
    await mkdir(evidence, { recursive: true });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        ready = (await fetch(base + "/api/v1/health")).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready);
    browser = await chromium.launch({
      executablePath: process.env.SPRINT1_CHROMIUM_PATH,
      headless: true,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    // Preserve the existing offline external-network policy. The public
    // homepage now renders two legacy Unsplash hero banners directly in the
    // browser. Give ONLY those known fallback images a deterministic local
    // fixture; any other off-host request still fails closed and is visible
    // in the console regression check below.
    const legacyHeroPaths = new Set(
      fallbackHeroSlides.map((slide) => new URL(slide.image).pathname),
    );
    const offlineHeroImage = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 245, g: 245, b: 245 },
      },
    }).png().toBuffer();
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (["localhost", "127.0.0.1"].includes(u.hostname))
        return route.continue();
      if (
        u.protocol === "https:" &&
        u.hostname === "images.unsplash.com" &&
        legacyHeroPaths.has(u.pathname) &&
        route.request().resourceType() === "image"
      ) {
        return route.fulfill({
          status: 200,
          contentType: "image/png",
          body: offlineHeroImage,
        });
      }
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") {
        if (
          injectingResendFailure &&
          /ERR_FAILED|Failed to fetch|Failed to load resource/.test(m.text())
        )
          expectedTransportErrors.push(m.text());
        else errors.push(m.text());
      }
    });
    async function check(label: string, fn: () => Promise<void>) {
      await fn();
      checkpoints.push(label);
      console.log("PASS", label);
    }
    await check(
      "all nine viewports: geometry, labels, native keyboard and logo order",
      async () => {
        for (const [width, height] of viewportSizes) {
          await page.setViewportSize({ width, height });
          for (const name of ["login", "register"]) {
            await page.goto(base + "/" + name);
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth,
              ),
              false,
            );
            const form = page.getByTestId(name + "-form");
            await expect(form).toBeVisible();
            const home = page.getByRole("link", {
              name: "Kembali ke Beranda",
              exact: true,
            });
            await expect(home).toHaveAttribute("href", "/");
            const homeBox = await home.boundingBox();
            assert.ok(
              homeBox &&
                homeBox.x >= 0 &&
                homeBox.y >= 0 &&
                homeBox.height >= 44,
            );
            assert.equal(
              await page
                .locator(".auth-ui a")
                .evaluateAll((links) =>
                  links.every(
                    (link) =>
                      !getComputedStyle(link).textDecorationLine.includes(
                        "underline",
                      ),
                  ),
                ),
              true,
            );
            const input = page.getByTestId(
              name === "login" ? "login-identifier" : "register-name",
            );
            const inputBox = await input.boundingBox();
            const submitBox = await page
              .getByTestId("auth-submit")
              .boundingBox();
            assert.equal(inputBox?.height, 44);
            assert.equal(submitBox?.height, 44);
            await input.focus();
            // The Lumen input animates border-color for 160ms. Sampling in
            // the same tick as focus() captures the unfocused/interpolated
            // color and falsely fails even though focus eventually passes.
            await expect(input).toBeFocused();
            await expect
              .poll(
                () => input.evaluate((e) => getComputedStyle(e).borderTopColor),
                { message: "Auth focus border must settle to a visible single line" },
              )
              .toBe("rgb(82, 82, 91)");
            const focused = await input.evaluate((e) => ({
              border: getComputedStyle(e).borderTopWidth,
              borderColor: getComputedStyle(e).borderTopColor,
              outline: getComputedStyle(e).outlineStyle,
              shadow: getComputedStyle(e).boxShadow,
            }));
            assert.equal(focused.border, "1px", "Auth field must keep a single focus border");
            assert.equal(focused.borderColor, "rgb(82, 82, 91)", "Auth field focus is distinguishable without extra outline");
            assert.equal(focused.outline, "none", "Auth field must not draw an extra outline");
            assert.equal(focused.shadow, "none", "Auth field must not add a focus halo");
            await input.evaluate((e) => (e as HTMLInputElement).blur());
            geometry.push({
              route: name,
              viewport: { width, height },
              inputBox,
              submitBox,
            });
            await page.screenshot({
              path: path.join(evidence, `${name}-${width}.png`),
              fullPage: true,
            });
            const google = await page.getByTestId("google-login").boundingBox(),
              whatsapp = await page.getByTestId("whatsapp-login").boundingBox();
            assert.ok(google && whatsapp);
            assert.ok(
              width < 640
                ? whatsapp.y > google.y
                : Math.abs(whatsapp.y - google.y) < 1,
            );
            await expect(page.getByTestId("google-login")).toBeDisabled();
            await expect(page.getByTestId("whatsapp-login")).toBeDisabled();
            // Text fields intentionally rely on their single border;
            // Tab from a blurred field may simply focus another text input.
            // Verify a real keyboard-focused LINK retains its visible ring.
            await input.focus();
            await page.keyboard.press("Shift+Tab");
            const keyboardLink = page.locator(".auth-ui a:focus-visible");
            await expect(keyboardLink).toHaveCount(1);
            assert.notEqual(
              await keyboardLink.evaluate(
                (e) => getComputedStyle(e).outlineStyle,
              ),
              "none",
              "Keyboard navigation to a link must retain its visible outline",
            );
          }
        }
      },
    );
    await check(
      "REST registration cannot bypass OTP or field validation and rejects foreign Origin",
      async () => {
        const api = await browser!.newContext();
        const email = `api-${randomUUID()}@example.test`;
        const data = {
          name: "Dummy API",
          email,
          phone: dummyPhone(1),
          password: "dummy-api-password",
          confirmPassword: "dummy-api-password",
          terms: true,
        };
        const challenges = new Map<string, string>();
        const post = async (
          route: string,
          body: Record<string, unknown>,
          origin = base,
        ) => {
          const payload = route
            ? { challengeId: challenges.get(String(body.email)), ...body }
            : body;
          const response = await api.request.post(
            base + "/api/v1/auth/register" + route,
            { data: payload, headers: { Origin: origin } },
          );
          if (!route && response.status() === 202) {
            const json = await response.json();
            assert.equal(typeof json.data.challengeId, "string");
            assert.equal(typeof json.data.serverReceivedAt, "number");
            assert.ok(json.data.serverReceivedAt <= json.data.serverNow);
            assert.equal(json.data.otp, undefined);
            challenges.set(json.data.email, json.data.challengeId);
          }
          return response;
        };
        try {
          assert.equal(
            (await post("", data, "https://foreign.invalid")).status(),
            403,
          );
          for (const patch of [
            { phone: "" },
            { confirmPassword: "" },
            { confirmPassword: "wrong" },
            { terms: false },
          ]) {
            assert.equal((await post("", { ...data, ...patch })).status(), 422);
          }
          assert.equal(
            await db.pendingRegistration.count({ where: { email } }),
            0,
          );
          assert.equal((await post("", data)).status(), 202);
          assert.equal(await db.user.count({ where: { email } }), 0);
          assert.equal(
            (await api.cookies()).some((c) => c.name === "gh_session"),
            false,
          );
          assert.equal((await post("/resend", { email })).status(), 429);
          let code = capturedOtp.get(email)!;
          assert.ok(code);
          assert.equal(
            (
              await post("/verify", {
                email,
                otp: code,
                challengeId: undefined,
              })
            ).status(),
            422,
          );
          assert.equal(
            (
              await post("/verify", {
                email,
                otp: code,
                challengeId: randomUUID(),
              })
            ).status(),
            400,
          );
          assert.equal(
            (
              await post("/resend", { email, challengeId: randomUUID() })
            ).status(),
            400,
          );
          const oldCode = code;
          await db.pendingRegistration.update({
            where: { email },
            data: { sentAt: new Date(Date.now() - 70_000) },
          });
          assert.equal((await post("/resend", { email })).status(), 200);
          code = capturedOtp.get(email)!;
          assert.notEqual(code, oldCode);
          assert.equal(
            (await post("/verify", { email, otp: oldCode })).status(),
            400,
          );
          assert.equal(
            (
              await post("/verify", {
                email,
                otp: code === "000000" ? "111111" : "000000",
              })
            ).status(),
            400,
          );
          assert.equal(await db.user.count({ where: { email } }), 0);
          assert.equal(
            (await post("/verify", { email, otp: code })).status(),
            201,
          );
          assert.ok(
            (await db.user.findUniqueOrThrow({ where: { email } }))
              .emailVerifiedAt,
          );
          assert.equal(
            (await api.cookies()).some((c) => c.name === "gh_session"),
            true,
          );
          assert.equal(
            (await post("/verify", { email, otp: code })).status(),
            400,
          );
          const replaced = {
            ...data,
            email: `generation-${randomUUID()}@example.test`,
            phone: dummyPhone(5),
          };
          assert.equal((await post("", replaced)).status(), 202);
          const firstGeneration = challenges.get(replaced.email)!;
          await db.pendingRegistration.update({
            where: { email: replaced.email },
            data: { sentAt: new Date(Date.now() - 70_000) },
          });
          assert.equal(
            (
              await post("", {
                ...replaced,
                name: "Different applicant",
                password: "changed-password",
                confirmPassword: "changed-password",
              })
            ).status(),
            202,
          );
          assert.notEqual(challenges.get(replaced.email), firstGeneration);
          assert.equal(
            (
              await post("/verify", {
                email: replaced.email,
                otp: capturedOtp.get(replaced.email),
                challengeId: firstGeneration,
              })
            ).status(),
            400,
          );
          assert.equal(
            await db.user.count({ where: { email: replaced.email } }),
            0,
          );
          const expired = {
            ...data,
            email: `expired-${randomUUID()}@example.test`,
            phone: dummyPhone(2),
          };
          assert.equal((await post("", expired)).status(), 202);
          await db.pendingRegistration.update({
            where: { email: expired.email },
            data: { expiresAt: new Date(Date.now() - 1000) },
          });
          assert.equal(
            (
              await post("/verify", {
                email: expired.email,
                otp: capturedOtp.get(expired.email),
              })
            ).status(),
            400,
          );
          assert.equal(
            await db.user.count({ where: { email: expired.email } }),
            0,
          );
          failMail = true;
          const failed = {
            ...data,
            email: `mailfail-${randomUUID()}@example.test`,
            phone: dummyPhone(3),
          };
          assert.equal((await post("", failed)).status(), 503);
          assert.equal(
            await db.pendingRegistration.count({
              where: { email: failed.email },
            }),
            0,
          );
          assert.equal(
            (
              await post("/verify", {
                email: failed.email,
                otp: capturedOtp.get(failed.email),
                challengeId: randomUUID(),
              })
            ).status(),
            400,
          );
          assert.equal(
            await db.user.count({ where: { email: failed.email } }),
            0,
          );
        } finally {
          failMail = false;
          await api.close();
        }
      },
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/register");
    const email = `auth-ui-${randomUUID()}@example.test`,
      password = "Dummy-Only-Password-421";
    await page.getByTestId("register-name").fill("Pengguna Dummy");
    await page.getByTestId("register-email").fill(email);
    await page.getByTestId("register-password").fill(password);
    await page.getByTestId("register-confirm-password").fill(password);
    await page.getByTestId("register-phone").fill(dummyPhone(0));
    await check(
      "legal links preserve registration fields and do not consent",
      async () => {
        for (const [name, route] of [
          ["Syarat & Ketentuan", "syarat-ketentuan"],
          ["Kebijakan Privasi", "kebijakan-privasi"],
        ]) {
          const popupPromise = context.waitForEvent("page");
          await page.getByRole("link", { name, exact: true }).click();
          const popup = await popupPromise;
          await popup.waitForLoadState();
          assert.equal(new URL(popup.url()).pathname, "/" + route);
          await expect(popup.locator("h1")).toHaveText(name);
          assert.equal(
            await popup.locator(".legal-sections section").count(),
            19,
          );
          await popup.close();
          await expect(page.getByTestId("register-email")).toHaveValue(email);
          await expect(page.getByTestId("register-terms")).not.toBeChecked();
        }
      },
    );
    await check(
      "required phone and confirmation reject browser and forged form submissions",
      async () => {
        await page.getByTestId("register-terms").check();
        for (const [id, message] of [
          ["register-phone", "Nomor HP"],
          ["register-confirm-password", "Konfirmasi password"],
        ]) {
          const field = page.getByTestId(id);
          const previous = await field.inputValue();
          await field.fill("");
          await page.getByTestId("auth-submit").click();
          assert.equal(
            await field.evaluate(
              (el: HTMLInputElement) => el.validity.valueMissing,
            ),
            true,
          );
          await field.evaluate((el: HTMLInputElement) => {
            el.required = false;
          });
          await page.getByTestId("auth-submit").click();
          await expect(page.getByTestId("register-error")).toContainText(
            message,
          );
          await expect(page.getByTestId("register-terms")).toBeChecked();
          await field.fill(previous);
          await field.evaluate((el: HTMLInputElement) => {
            el.required = true;
          });
        }
        await page
          .getByTestId("register-confirm-password")
          .fill("different-password");
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("register-error")).toContainText(
          "tidak sama",
        );
        assert.equal(
          await db.pendingRegistration.count({ where: { email } }),
          0,
        );
        await page.getByTestId("register-confirm-password").fill(password);
        await page.getByTestId("register-terms").uncheck();
      },
    );
    await check("client and server both reject missing terms", async () => {
      await page.getByTestId("auth-submit").click();
      assert.equal(
        await page
          .getByTestId("register-terms")
          .evaluate((el: HTMLInputElement) => el.validity.valueMissing),
        true,
      );
      await page
        .getByTestId("register-terms")
        .evaluate((el: HTMLInputElement) => (el.required = false));
      await page.getByTestId("auth-submit").click();
      await expect(page.getByTestId("register-error")).toContainText(
        "menyetujui",
      );
      assert.equal(await db.user.count({ where: { email } }), 0);
    });
    await check(
      "password visibility, OTP required before user creation, and pending prevention",
      async () => {
        await page.getByTestId("register-terms").check();
        await page
          .getByRole("button", { name: "Tampilkan password" })
          .first()
          .click();
        await expect(page.getByTestId("register-password")).toHaveAttribute(
          "type",
          "text",
        );
        await page
          .getByRole("button", { name: "Sembunyikan password" })
          .first()
          .click();
        await expect(page.getByTestId("register-password")).toHaveValue(
          password,
        );
        let submissions = 0;
        await page.route("**/register", async (route) => {
          if (route.request().method() === "POST") {
            submissions++;
            await new Promise((r) => setTimeout(r, 350));
          }
          await route.continue();
        });
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("auth-submit")).toBeDisabled();
        await expect(page.getByTestId("auth-submit")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        await page.evaluate(() => {
          (
            document.querySelector(
              '[data-testid="auth-submit"]',
            ) as HTMLButtonElement
          ).click();
        });
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        await page.unroute("**/register");
        assert.equal(submissions, 1);
        assert.equal(await db.user.count({ where: { email } }), 0);
        assert.equal(
          await db.pendingRegistration.count({ where: { email } }),
          1,
        );
        await expect(page.getByTestId("register-otp")).toBeFocused();
        await expect(page.getByTestId("registration-resend")).toBeDisabled();
        for (const [width, height] of viewportSizes) {
          await page.setViewportSize({ width, height });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await page.screenshot({
            path: path.join(evidence, `registration-otp-${width}.png`),
            fullPage: true,
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        const code = capturedOtp.get(email);
        assert.ok(code, "local email sink captured code");
        const challenge = await db.pendingRegistration.findUniqueOrThrow({
          where: { email },
        });
        const hidden = page
          .getByTestId("verify-registration-form")
          .locator('input[name="challengeId"]');
        await expect(hidden).toHaveValue(challenge.id);
        // A forged generation must recover to the fresh form, never create an account.
        await page
          .getByTestId("verify-registration-form")
          .evaluate((el, replacement: string) => {
            el.addEventListener(
              "submit",
              () => {
                el.querySelector<HTMLInputElement>(
                  'input[name="challengeId"]',
                )!.value = replacement;
              },
              { capture: true, once: true },
            );
          }, randomUUID());
        await page.getByTestId("register-otp").fill(code);
        await expect(page.getByTestId("register-form")).toBeVisible();
        await expect(page.getByTestId("register-error")).toContainText(
          "Sesi pendaftaran",
        );
        assert.equal(await db.user.count({ where: { email } }), 0);
        // Restore the genuine server-issued opaque identifier to test reloading the same generation.
        await page.evaluate(
          ({ email, id }) =>
            sessionStorage.setItem(
              "gheverhan.registration.otp.v1",
              JSON.stringify({ email, challengeId: id }),
            ),
          { email, id: challenge.id },
        );
        await page.reload();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        const resend = page.getByTestId("registration-resend");
        await resend.evaluate((el: HTMLButtonElement) => {
          el.disabled = false;
        });
        await resend.click();
        await expect(
          page.getByTestId("verify-registration-error"),
        ).toContainText("60 detik");
        assert.equal(capturedOtp.get(email), code);
        const otp = page.getByTestId("register-otp");
        await expect(
          page.getByTestId("otp-slots").locator(".auth-otp-slot"),
        ).toHaveCount(6);
        await otp.fill("12345");
        await expect(page.getByTestId("auth-submit")).toBeDisabled();
        await otp.press("ArrowLeft");
        await otp.press("Backspace");
        await expect(otp).toHaveValue("1235");
        await otp.press("Delete");
        await expect(otp).toHaveValue("123");
        await otp.press("ControlOrMeta+A");
        await otp.fill("");
        let verifyPosts = 0;
        await page.route("**/register", async (route) => {
          if (route.request().method() === "POST") {
            verifyPosts++;
            await new Promise((r) => setTimeout(r, 350));
          }
          await route.continue();
        });
        await otp.evaluate(
          (el: HTMLInputElement, wrong: string) => {
            const clipboard = new DataTransfer();
            clipboard.setData("text/plain", wrong);
            el.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: clipboard,
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          code === "000000" ? "111111" : "000000",
        );
        await expect(page.getByTestId("otp-slots")).toHaveAttribute(
          "data-state",
          "verifying",
        );
        await expect(page.getByTestId("auth-submit")).toBeDisabled();
        assert.notEqual(
          await page.getByTestId("otp-slots").getAttribute("data-state"),
          "success",
        );
        await expect(
          page.getByTestId("verify-registration-error"),
        ).toContainText("salah");
        await page.unroute("**/register");
        assert.equal(verifyPosts, 1);
        await expect(page.getByTestId("otp-slots")).toHaveAttribute(
          "data-state",
          "error",
        );
        assert.equal(
          await page
            .locator(".auth-otp-slots")
            .evaluate((el) => getComputedStyle(el).animationName),
          "auth-otp-shake",
        );
        assert.deepEqual(
          await page
            .locator(".auth-otp-slot")
            .evaluateAll((elements) =>
              elements.map((el) => getComputedStyle(el).borderTopColor),
            ),
          Array(6).fill("rgb(180, 35, 24)"),
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator(".auth-otp-slots")).toHaveCSS(
          "animation-name",
          "none",
        );
        await page.emulateMedia({ reducedMotion: "no-preference" });
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({
            path: path.join(evidence, `otp-error-${width}.png`),
            fullPage: true,
            style: ".auth-otp-slot { -webkit-text-security: disc; }",
          });
        }
        assert.equal(await db.user.count({ where: { email } }), 0);
        await page.reload();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        await page.route("**/account*", async (route) => {
          await new Promise((r) => setTimeout(r, 400));
          await route.continue();
        });
        await page
          .getByTestId("register-otp")
          .evaluate((el: HTMLInputElement, value: string) => {
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )!.set!.call(el, value);
            el.dispatchEvent(
              new InputEvent("input", {
                bubbles: true,
                inputType: "insertReplacementText",
                data: value,
              }),
            );
          }, code);
        await expect(page.getByTestId("otp-slots")).toHaveAttribute(
          "data-state",
          "success",
        );
        await expect(
          page.getByText("Email berhasil diverifikasi."),
        ).toBeVisible();
        await page.screenshot({
          path: path.join(evidence, "otp-success-1440.png"),
          fullPage: true,
          style: ".auth-otp-slot { -webkit-text-security: disc; }",
        });
        await page.waitForURL(base + "/account");
        await page.unrouteAll({ behavior: "wait" });
        // The authenticated account page confirms success before discarding the OTP challenge.
        await expect
          .poll(() =>
            page.evaluate(() =>
              sessionStorage.getItem("gheverhan.registration.otp.v1"),
            ),
          )
          .toBeNull();
        assert.equal(await db.user.count({ where: { email } }), 1);
        const created = await db.user.findUniqueOrThrow({ where: { email } });
        assert.ok(created.emailVerifiedAt);
        assert.equal(created.phone, "+62" + dummyPhone(0).slice(1));
        assert.equal(
          await db.pendingRegistration.count({ where: { email } }),
          0,
        );
      },
    );
    await check(
      "OTP survives reload and failed resend returns to fresh registration",
      async () => {
        const retryEmail = `resend-recovery-${randomUUID()}@example.test`;
        await page.goto(base + "/register");
        await page.getByTestId("register-name").fill("Dummy Resend Recovery");
        await page.getByTestId("register-email").fill(retryEmail);
        await page.getByTestId("register-phone").fill(dummyPhone(6));
        await page.getByTestId("register-password").fill(password);
        await page.getByTestId("register-confirm-password").fill(password);
        await page.getByTestId("register-terms").check();
        await page.getByTestId("auth-submit").click();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        const initialChallenge = await db.pendingRegistration.findUniqueOrThrow(
          { where: { email: retryEmail } },
        );
        await page.reload();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        await expect(
          page
            .getByTestId("verify-registration-form")
            .locator('input[name="challengeId"]'),
        ).toHaveValue(initialChallenge.id);
        const savedState = await page.evaluate(() =>
          sessionStorage.getItem("gheverhan.registration.otp.v1"),
        );
        assert.ok(
          savedState &&
            JSON.parse(savedState).challengeId === initialChallenge.id,
        );
        assert.equal(savedState.includes("password"), false);
        await page.evaluate(() => {
          const k = "gheverhan.registration.otp.v1";
          const saved = JSON.parse(sessionStorage.getItem(k) || "{}");
          saved.expiresAt = Date.now() + 1200;
          sessionStorage.setItem(k, JSON.stringify(saved));
        });
        await db.pendingRegistration.update({
          where: { email: retryEmail },
          data: {
            sentAt: new Date(Date.now() - 70_000),
            expiresAt: new Date(Date.now() + 25_000),
          },
        });
        await page.reload();
        await expect(page.getByTestId("otp-expiry")).toContainText(/00:2[0-5]/);
        const successfulResend = page.getByTestId("registration-resend");
        await successfulResend.evaluate((el: HTMLButtonElement) => {
          el.disabled = false;
        });
        await successfulResend.click();
        await expect(
          page.getByText("Kode OTP baru telah dikirim ke email Anda."),
        ).toBeVisible();
        await page.waitForTimeout(1500);
        await page.reload();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        await expect(
          page
            .getByTestId("verify-registration-form")
            .locator('input[name="challengeId"]'),
        ).toHaveValue(initialChallenge.id);
        const restored = await page.evaluate(() =>
          JSON.parse(
            sessionStorage.getItem("gheverhan.registration.otp.v1") || "{}",
          ),
        );
        assert.deepEqual(Object.keys(restored).sort(), [
          "challengeId",
          "email",
        ]);
        await expect(page.getByTestId("otp-expiry")).toContainText(
          /(?:10:00|09:5[0-9])/,
        );
        await db.pendingRegistration.update({
          where: { email: retryEmail },
          data: { sentAt: new Date(Date.now() - 70_000) },
        });
        failMail = true;
        try {
          const resend = page.getByTestId("registration-resend");
          await resend.evaluate((el: HTMLButtonElement) => {
            el.disabled = false;
          });
          await resend.click();
          await expect(page.getByTestId("register-form")).toBeVisible();
          await expect(page.getByTestId("register-error")).toContainText(
            "Pengiriman ulang OTP gagal",
          );
          assert.equal(
            await db.pendingRegistration.count({
              where: { email: retryEmail },
            }),
            0,
          );
          assert.equal(
            await page.evaluate(() =>
              sessionStorage.getItem("gheverhan.registration.otp.v1"),
            ),
            null,
          );
        } finally {
          failMail = false;
        }
        // Three requests already consumed this email's hourly registration quota.
        // A restart may use an independent test identity, never bypass the limiter.
        const freshEmail = `new-recovery-${randomUUID()}@example.test`;
        await page.getByTestId("register-name").fill("Dummy Resend Recovery");
        await page.getByTestId("register-email").fill(freshEmail);
        await page.getByTestId("register-phone").fill(dummyPhone(7));
        await page.getByTestId("register-password").fill(password);
        await page.getByTestId("register-confirm-password").fill(password);
        await page.getByTestId("register-terms").check();
        await page.getByTestId("auth-submit").click();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        assert.equal(
          await db.pendingRegistration.count({ where: { email: freshEmail } }),
          1,
        );
        await page
          .getByRole("button", { name: "Ubah data pendaftaran" })
          .click();
        await expect(page.getByTestId("register-form")).toBeVisible();
        assert.equal(
          await page.evaluate(() =>
            sessionStorage.getItem("gheverhan.registration.otp.v1"),
          ),
          null,
        );
      },
    );
    await check(
      "duplicate contact is rejected before pending mutation or provider delivery",
      async () => {
        await page.goto(base + "/register");
        await page.getByTestId("register-name").fill("Dummy Kedua");
        await page.getByTestId("register-email").fill(email);
        await page.getByTestId("register-password").fill(password);
        await page.getByTestId("register-confirm-password").fill(password);
        await page.getByTestId("register-phone").fill(dummyPhone(4));
        await page.getByTestId("register-terms").check();
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("register-error")).toHaveText(
          "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.",
        );
        await expect(
          page
            .getByRole("navigation", { name: "Pemulihan akun" })
            .getByRole("link", { name: "Masuk", exact: true }),
        ).toHaveAttribute("href", "/login");
        await expect(
          page
            .getByRole("navigation", { name: "Pemulihan akun" })
            .getByRole("link", { name: "Lupa password", exact: true }),
        ).toHaveAttribute("href", "/forgot-password");
        assert.equal(
          await db.pendingRegistration.count({ where: { email } }),
          0,
        );
        assert.equal(mailCounts.get(email), 1);
        assert.equal(await db.user.count({ where: { email } }), 1);
      },
    );
    await check(
      "REST existing email/phone/both cannot call mail or create pending state",
      async () => {
        const api = await browser!.newContext();
        try {
          for (let n = 0; n < 3; n++) {
            const fixtureEmail = `existing-${randomUUID()}@example.test`;
            const fixturePhone = dummyPhone(20 + n);
            await db.user.create({
              data: {
                name: "Existing dummy",
                email: fixtureEmail,
                phone: fixturePhone.slice(0, 4) + " " + fixturePhone.slice(4),
                passwordHash: "isolated-dummy-hash",
              },
            });
            const proposedEmail =
              n === 1
                ? `unused-${randomUUID()}@example.test`
                : fixtureEmail.toUpperCase();
            const proposedPhone =
              n === 0 ? dummyPhone(40 + n) : "+62" + fixturePhone.slice(1);
            const before = await db.pendingRegistration.count();
            const response = await api.request.post(
              base + "/api/v1/auth/register",
              {
                headers: { Origin: base },
                data: {
                  name: "Dummy conflict",
                  email: proposedEmail,
                  phone: proposedPhone,
                  password,
                  confirmPassword: password,
                  terms: true,
                },
              },
            );
            assert.equal(response.status(), 409);
            assert.equal(
              (await response.json()).error.message,
              "Email atau nomor HP sudah terdaftar. Silakan masuk atau reset password.",
            );
            assert.equal(await db.pendingRegistration.count(), before);
            assert.equal(mailCounts.get(proposedEmail.toLowerCase()) || 0, 0);
          }
        } finally {
          await api.close();
        }
      },
    );
    await check(
      "expired UI and interrupted resend reconcile server timing; deleted challenge restarts safely",
      async () => {
        const recoveryEmail = `transport-${randomUUID()}@example.test`;
        await page.goto(base + "/register");
        await page
          .getByTestId("register-name")
          .fill("Dummy Transport Recovery");
        await page.getByTestId("register-email").fill(recoveryEmail);
        await page.getByTestId("register-phone").fill(dummyPhone(8));
        await page.getByTestId("register-password").fill(password);
        await page.getByTestId("register-confirm-password").fill(password);
        await page.getByTestId("register-terms").check();
        await page.getByTestId("auth-submit").click();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        const beforeCode = capturedOtp.get(recoveryEmail)!;
        await db.pendingRegistration.update({
          where: { email: recoveryEmail },
          data: {
            expiresAt: new Date(Date.now() - 1000),
            sentAt: new Date(Date.now() - 70_000),
          },
        });
        await page.reload();
        await expect(page.getByTestId("otp-expiry")).toContainText("00:00");
        await expect(page.getByTestId("auth-submit")).toBeDisabled();
        await expect(
          page.getByTestId("verify-registration-form").getByRole("alert"),
        ).toContainText("kedaluwarsa");
        let dropped = false;
        injectingResendFailure = true;
        await page.route("**/register", async (route) => {
          if (!dropped && route.request().method() === "POST") {
            dropped = true;
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        });
        try {
          await page.getByTestId("registration-resend").click();
          await expect(
            page.getByText(
              "Status kode sudah diperbarui. Gunakan kode terbaru dari email Anda.",
            ),
          ).toBeVisible();
          assert.equal(dropped, true);
          assert.notEqual(capturedOtp.get(recoveryEmail), beforeCode);
          await expect(page.getByTestId("otp-expiry")).toContainText(
            /(?:10:00|09:5[0-9])/,
          );
          await expect(page.getByTestId("register-otp")).toHaveValue("");
          assert.equal(
            await db.user.count({ where: { email: recoveryEmail } }),
            0,
          );
        } finally {
          await page.unrouteAll({ behavior: "wait" });
          injectingResendFailure = false;
        }
        await db.pendingRegistration.delete({
          where: { email: recoveryEmail },
        });
        await page.reload();
        await expect(page.getByTestId("register-form")).toBeVisible();
        await expect(page.getByTestId("register-error")).toContainText(
          "Sesi pendaftaran",
        );
        assert.equal(
          await page.evaluate(() =>
            sessionStorage.getItem("gheverhan.registration.otp.v1"),
          ),
          null,
        );
      },
    );
    await check(
      "five rejected codes lock verification until a server-approved resend",
      async () => {
        const limitedEmail = `attempts-${randomUUID()}@example.test`;
        await page.goto(base + "/register");
        await page.getByTestId("register-name").fill("Dummy Attempts");
        await page.getByTestId("register-email").fill(limitedEmail);
        await page.getByTestId("register-phone").fill(dummyPhone(9));
        await page.getByTestId("register-password").fill(password);
        await page.getByTestId("register-confirm-password").fill(password);
        await page.getByTestId("register-terms").check();
        await page.getByTestId("auth-submit").click();
        await expect(
          page.getByTestId("verify-registration-form"),
        ).toBeVisible();
        const pending = await db.pendingRegistration.findUniqueOrThrow({
          where: { email: limitedEmail },
        });
        const wrong =
          capturedOtp.get(limitedEmail) === "000000" ? "111111" : "000000";
        for (let n = 0; n < 5; n++) {
          const response = await context.request.post(
            base + "/api/v1/auth/register/verify",
            {
              headers: { Origin: base },
              data: {
                email: limitedEmail,
                challengeId: pending.id,
                otp: wrong,
              },
            },
          );
          assert.equal(response.status(), 400);
        }
        await db.pendingRegistration.update({
          where: { id: pending.id },
          data: { sentAt: new Date(Date.now() - 70_000) },
        });
        await page.reload();
        await expect(
          page.getByTestId("verify-registration-form").getByRole("alert"),
        ).toContainText("Batas percobaan");
        await page
          .getByTestId("register-otp")
          .fill(capturedOtp.get(limitedEmail)!);
        await expect(page.getByTestId("auth-submit")).toBeDisabled();
        assert.equal(
          await db.user.count({ where: { email: limitedEmail } }),
          0,
        );
        await page.getByTestId("registration-resend").click();
        await expect(
          page.getByText("Kode OTP baru telah dikirim ke email Anda."),
        ).toBeVisible();
        await page
          .getByTestId("register-otp")
          .fill(capturedOtp.get(limitedEmail)!);
        await page.waitForURL(base + "/account");
        assert.equal(
          await db.user.count({ where: { email: limitedEmail } }),
          1,
        );
      },
    );
    await check("logout, invalid login and safe login redirect", async () => {
      await page.goto(base + "/account");
      await page.getByTestId("logout-btn").click();
      await page.waitForURL(base + "/");
      await page.goto(base + "/login?redirectTo=/cart");
      await page.getByTestId("login-identifier").fill(email);
      await page.getByTestId("login-password").fill("wrong-password");
      await page.getByTestId("auth-submit").click();
      await expect(page.getByTestId("login-error")).toContainText("salah");
      // Pending registration from a different user must not leak after login
      // redirects to /cart instead of /account.
      await page.evaluate(() =>
        sessionStorage.setItem(
          "gheverhan.registration.otp.v1",
          JSON.stringify({
            email: "another-person@example.test",
            challengeId: "00000000-0000-4000-8000-000000000001",
            resendAvailableAt: Date.now() + 60_000,
            expiresAt: Date.now() + 600_000,
          }),
        ),
      );
      await page.getByTestId("login-identifier").fill(dummyPhone(0));
      await page.getByTestId("login-password").fill(password);
      await page.getByTestId("auth-submit").click();
      await page.waitForURL(base + "/cart");
      await expect
        .poll(() =>
          page.evaluate(() =>
            sessionStorage.getItem("gheverhan.registration.otp.v1"),
          ),
        )
        .toBeNull();
    });
    await check(
      "forgot password validates input and keeps a neutral response for an unknown account",
      async () => {
        await page.goto(base + "/forgot-password");
        await page.getByTestId("forgot-email").fill("not-an-email");
        await page.getByTestId("auth-submit").click();
        assert.equal(
          await page
            .getByTestId("forgot-email")
            .evaluate((el: HTMLInputElement) => el.validity.typeMismatch),
          true,
        );
        await page
          .getByTestId("forgot-email")
          .fill("unknown-" + randomUUID() + "@example.test");
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("forgot-message")).toContainText(
          "Jika email terdaftar",
        );
      },
    );
    await check(
      "reset password rejects invalid token, consumes local token once and revokes old session",
      async () => {
        const user = await db.user.findUniqueOrThrow({ where: { email } });
        const oldSession = (await context.cookies()).find(
          (c) => c.name === "gh_session",
        );
        assert.ok(oldSession);
        const token = randomBytes(32).toString("hex");
        await db.passwordResetToken.create({
          data: {
            userId: user.id,
            token: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
        await page.goto(base + "/reset-password?token=invalid-dummy-token");
        await page.getByTestId("reset-password").fill("new-dummy-password");
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("reset-error")).toBeVisible();
        const expired = randomBytes(32).toString("hex");
        await db.passwordResetToken.create({
          data: {
            userId: user.id,
            token: createHash("sha256").update(expired).digest("hex"),
            expiresAt: new Date(Date.now() - 60000),
          },
        });
        await page.goto(base + "/reset-password?token=" + expired);
        await page.getByTestId("reset-password").fill("expiry-must-fail");
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("reset-error")).toBeVisible();
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { email } }))
            .sessionVersion,
          user.sessionVersion,
        );
        await page.goto(base + "/reset-password?token=" + token);
        await page.getByTestId("reset-password").fill("new-dummy-password");
        await page.getByTestId("auth-submit").click();
        await page.waitForURL(base + "/login");
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { email } }))
            .sessionVersion,
          user.sessionVersion + 1,
        );
        const revokedContext = await browser!.newContext();
        await revokedContext.addCookies([oldSession]);
        const revokedPage = await revokedContext.newPage();
        await revokedPage.goto(base + "/account");
        await revokedPage.waitForURL(/\/login\?redirectTo=/);
        await expect(revokedPage.getByTestId("login-form")).toBeVisible();
        await revokedContext.close();
        await page.goto(base + "/reset-password?token=" + token);
        await page.getByTestId("reset-password").fill("replay-must-fail");
        await page.getByTestId("auth-submit").click();
        await expect(page.getByTestId("reset-error")).toBeVisible();
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { email } }))
            .sessionVersion,
          user.sessionVersion + 1,
        );
        await page.goto(base + "/login");
        await page.getByTestId("login-identifier").fill(email);
        await page.getByTestId("login-password").fill("new-dummy-password");
        await page.getByTestId("auth-submit").click();
        await page.waitForURL(base + "/account");
      },
    );
    await check(
      "anonymous legal routes have canonical/SEO/draft metadata and footer entry points",
      async () => {
        const anon = await context.browser()!.newContext();
        const p = await anon.newPage();
        for (const route of ["syarat-ketentuan", "kebijakan-privasi"]) {
          const response = await p.goto(base + "/" + route);
          assert.equal(response?.status(), 200);
          await expect(p.locator('link[rel="canonical"]')).toHaveAttribute(
            "href",
            "https://gheverhan.store/" + route,
          );
          await expect(p.locator('meta[name="robots"]')).toHaveAttribute(
            "content",
            /noindex/,
          );
          await expect(p.locator(".legal-notice")).toBeVisible();
          assert.equal(await p.locator(".legal-sections section").count(), 19);
          assert.equal(
            await p
              .locator(".legal-page a")
              .evaluateAll((links) =>
                links.every(
                  (link) =>
                    !getComputedStyle(link).textDecorationLine.includes(
                      "underline",
                    ),
                ),
              ),
            true,
          );
          for (const width of [390, 1440]) {
            await p.setViewportSize({ width, height: 900 });
            await p.screenshot({
              path: path.join(evidence, `${route}-${width}.png`),
              fullPage: true,
            });
          }
        }
        await p.goto(base + "/");
        assert.equal(
          await p
            .locator(".storefront-root a")
            .evaluateAll((links) =>
              links.every(
                (link) =>
                  !getComputedStyle(link).textDecorationLine.includes(
                    "underline",
                  ),
              ),
            ),
          true,
        );
        const footerLink = p.locator('footer a[href="/syarat-ketentuan"]');
        await footerLink.hover();
        await expect(footerLink).toHaveCSS("color", "rgb(37, 99, 235)");
        await footerLink.evaluate((el) =>
          el.addEventListener("click", (event) => event.preventDefault(), {
            once: true,
          }),
        );
        await p.mouse.down();
        try {
          await expect(footerLink).toHaveCSS("color", "rgb(29, 78, 216)");
        } finally {
          await p.mouse.up();
        }
        await p.keyboard.press("Tab");
        await footerLink.focus();
        assert.notEqual(
          await footerLink.evaluate((el) => getComputedStyle(el).outlineStyle),
          "none",
        );
        await expect(
          p.locator('footer a[href="/syarat-ketentuan"]'),
        ).toBeVisible();
        await expect(
          p.locator('footer a[href="/kebijakan-privasi"]'),
        ).toBeVisible();
        for (const width of [390, 1440]) {
          await p.setViewportSize({ width, height: 900 });
          await p.screenshot({
            path: path.join(evidence, `storefront-links-${width}.png`),
            fullPage: true,
          });
        }
        await p.goto(base + "/cart");
        const darkLink = p.locator("a.bg-black.text-white").first();
        await darkLink.hover();
        await expect(darkLink).toHaveCSS("background-color", "rgb(31, 41, 55)");
        assert.equal(
          await darkLink.evaluate((el) => getComputedStyle(el).color),
          "rgb(255, 255, 255)",
        );
        await p.keyboard.press("Tab");
        await darkLink.focus();
        await expect(darkLink).toHaveCSS("outline-color", "rgb(37, 99, 235)");
        await expect(darkLink).toHaveCSS("outline-style", "solid");
        await anon.close();
      },
    );
    assert.deepEqual(errors, []);
    passed = true;
    await context.close();
  } finally {
    await writeFile(
      path.join(evidence, "auth-ui-results.json"),
      JSON.stringify(
        {
          status: passed ? "PASS" : "FAILED",
          checkpoints,
          geometry,
          errors,
          expectedTransportErrors,
          commitSha: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          nodeVersion: process.version,
          browserVersion: browser?.version(),
          buildId: (
            await readFile(path.join(root, ".next/BUILD_ID"), "utf8")
          ).trim(),
          synthetic: true,
        },
        null,
        2,
      ),
    );
    await browser?.close();
    await new Promise<void>((resolve) => mailSink.close(() => resolve()));
    server.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null) resolve();
      else {
        server.once("exit", () => resolve());
        setTimeout(() => {
          server.kill("SIGKILL");
          resolve();
        }, 5000).unref();
      }
    });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
