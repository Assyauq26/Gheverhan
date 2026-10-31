import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  defaultJntEndpoint, validateJntEndpoint, signJntData, parseJntTariffs,
} from "@/modules/jnt/jnt-protocol";

describe("J&T official protocol", () => {
  it("allows precisely the documented sandbox/production endpoint pairings", () => {
    for (const env of ["sandbox", "production"] as const) {
      for (const kind of ["order", "tariff", "tracking", "cancellation"] as const) {
        const endpoint = defaultJntEndpoint(env, kind);
        expect(validateJntEndpoint(env, kind, endpoint)).toBe(endpoint);
      }
    }
  });
  it("rejects SSRF, credential exfiltration, query strings and cross-environment hostnames", () => {
    const endpoint = defaultJntEndpoint("production", "tariff");
    for (const bad of [
      "http://partner-track.jet.co.id/jandt_track/inquiry.action",
      "https://partner-track.jet.co.id.evil.example/jandt_track/inquiry.action",
      "https://127.0.0.1/jandt_track/inquiry.action",
      "https://metadata.google.internal/jandt_track/inquiry.action",
      endpoint + "?callback=https://evil.test",
      endpoint + "#fragment",
      endpoint.replace("partner-track", "demo-general"),
      endpoint.replace("inquiry.action", "anything.action"),
      "https://user:password@partner-track.jet.co.id/jandt_track/inquiry.action",
    ]) expect(() => validateJntEndpoint("production", "tariff", bad)).toThrow();
  });
  it("uses base64 of MD5 hexadecimal characters, not base64 of the raw digest", () => {
    const payload = '{"weight":"3"}', key = "fixture-not-a-secret";
    const expected = Buffer.from(createHash("md5").update(payload + key).digest("hex")).toString("base64");
    expect(signJntData(payload, key)).toBe(expected);
    expect(Buffer.from(signJntData(payload, key), "base64").length).toBe(32);
  });
  it("reads the real observed HBO response shape and rejects incorrect service or amount", () => {
    const response = { content: '[{"cost":"14500","name":"HBO","productType":"HBO"}]', is_success: "true", message: "" };
    expect(parseJntTariffs(response, "HBO")).toEqual([{ courier: "J&T Express", service: "HBO", cost: 14500, mode: "official" }]);
    expect(parseJntTariffs(response, "EZ")).toEqual([]);
    expect(() => parseJntTariffs({ ...response, is_success: "false" }, "HBO")).toThrow();
    expect(() => parseJntTariffs({ ...response, content: '[{"cost":"-1","name":"HBO","productType":"HBO"}]' }, "HBO")).toThrow();
  });
});
