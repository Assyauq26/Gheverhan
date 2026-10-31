/** Browser-safe J&T metadata. No secret values or transport implementation here. */
export const jntKinds = ["order", "tariff", "tracking", "cancellation"] as const;
export const jntEnvironments = ["sandbox", "production"] as const;
export type JntKind = typeof jntKinds[number];
export type JntEnvironment = typeof jntEnvironments[number];
export const credentialKeys: Record<JntKind, readonly string[]> = {
  order: ["username", "apiKey", "key"],
  tariff: ["customerName", "key"],
  tracking: ["ecompanyId", "password"],
  cancellation: ["username", "apiKey", "key"],
};
export const pathFor: Record<JntKind, string> = {
  order: "/jts-idn-ecommerce-api/api/order/create",
  tariff: "/jandt_track/inquiry.action",
  tracking: "/jandt_track/track/trackAction!tracking.action",
  cancellation: "/jts-idn-ecommerce-api/api/order/cancel",
};
export const hostFor: Record<JntEnvironment, Record<JntKind, string>> = {
  sandbox: {
    order: "demo-ecommerce.inuat-jntexpress.id",
    tariff: "demo-general.inuat-jntexpress.id",
    tracking: "demo-general.inuat-jntexpress.id",
    cancellation: "demo-ecommerce.inuat-jntexpress.id",
  },
  production: {
    order: "api.jet.co.id",
    tariff: "partner-track.jet.co.id",
    tracking: "partner-track.jet.co.id",
    cancellation: "api.jet.co.id",
  },
};
export function defaultJntEndpoint(environment: JntEnvironment, kind: JntKind) {
  return "https://" + hostFor[environment][kind] + pathFor[kind];
}
