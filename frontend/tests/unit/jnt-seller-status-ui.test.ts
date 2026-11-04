// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JntIntegrationSettings } from "@/components/admin/jnt-integration-settings";
const revision = "2026-11-05T00:00:00.000Z";
function setup(proof: object = {}) {
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => new Response(JSON.stringify({ success: true, data: options?.method === "POST" ? {
    endpoint: "tariff", status: "CONNECTED", environment: "sandbox", scope: "local_store", configurationUpdatedAt: revision,
    testedAt: "2026-11-05T01:00:00.000Z", message: "Synthetic read-only proof", ...proof,
  } : { configured: true, enabled: true, updatedAt: revision, endpoints: null, credentialSet: {} } })));
  vi.stubGlobal("fetch", fetcher); render(React.createElement(JntIntegrationSettings, { localStore: true }));
  return fetcher;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("distinguishes saved credentials from scoped Check Fee proof, then clears success after network failure", async () => {
  const fetcher = setup();
  await screen.findByText("Konfigurasi tersimpan");
  expect(screen.queryByText("Sandbox Check Fee terverifikasi")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Uji Check Fee" }));
  await screen.findByText("Sandbox Check Fee terverifikasi");
  expect(screen.getByText(/cakupan toko ini/).textContent).toContain("bukan UAT Production");
  fetcher.mockRejectedValueOnce(new Error("synthetic transport failure"));
  await waitFor(() => expect((screen.getByRole("button", { name: "Uji Check Fee" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Uji Check Fee" }));
  await screen.findByText("Memerlukan verifikasi");
  expect(screen.queryByText("Sandbox Check Fee terverifikasi")).toBeNull();
});
it.each([{ environment: "production" }, { scope: "other_store" }, { configurationUpdatedAt: "old" }, { testedAt: "invalid" }])("rejects proof for a different environment/scope/revision or missing time: %j", async proof => {
  setup(proof); await screen.findByText("Konfigurasi tersimpan");
  fireEvent.click(screen.getByRole("button", { name: "Uji Check Fee" }));
  await screen.findByText(/Konfigurasi tersimpan berubah/);
  expect(screen.queryByText(/Check Fee terverifikasi/)).toBeNull();
});
