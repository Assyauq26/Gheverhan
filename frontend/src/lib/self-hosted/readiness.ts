import type { SelfHostedStoreConfig } from "./config";
import { getStoreProfile, parseSelfHostedConfig } from "./config";

type Env = Readonly<Record<string, string | undefined>>;
export interface ReadinessDependencies {
  database(config: SelfHostedStoreConfig, signal: AbortSignal): Promise<void>;
  storage(config: SelfHostedStoreConfig, signal: AbortSignal): Promise<void>;
}
export interface ReadinessResult { status: "ready" | "not_ready" | "not_enabled" }

/** One probe at a time per worker. A timed-out underlying operation keeps the slot
 * until it settles, preventing health traffic from creating unlimited work. */
export function createReadinessCheck(dependencies: ReadinessDependencies, options: { timeoutMs?: number; cacheMs?: number; now?: () => number } = {}) {
  const timeoutMs = options.timeoutMs ?? 2500;
  const cacheMs = options.cacheMs ?? 2000;
  const now = options.now ?? Date.now;
  let active: { result: Promise<ReadinessResult>; identity: string } | undefined;
  let cached: { result: ReadinessResult; until: number; identity: string } | undefined;
  return async (env: Env): Promise<ReadinessResult> => {
    let config: SelfHostedStoreConfig;
    try {
      if (getStoreProfile(env) === "legacy") return { status: "not_enabled" };
      config = parseSelfHostedConfig(env);
    } catch { return { status: "not_ready" }; }
    // Private in-memory identity only; never returned/logged. Secret rotation must
    // invalidate success, not serve a prior credential's healthy result.
    const identity = JSON.stringify([config, env.DATABASE_URL, env.JWT_SECRET]);
    if (cached?.identity === identity && cached.until > now()) return cached.result;
    if (active) return active.identity === identity ? active.result : { status: "not_ready" };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<ReadinessResult>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve({ status: "not_ready" }); }, timeoutMs);
    });
    const work = [
      Promise.resolve().then(() => dependencies.database(config, controller.signal)),
      Promise.resolve().then(() => dependencies.storage(config, controller.signal)),
    ];
    const operation = Promise.allSettled(work).then<ReadinessResult>(outcomes => ({
      status: !controller.signal.aborted && outcomes.every(outcome => outcome.status === "fulfilled") ? "ready" : "not_ready",
    }));
    const result = Promise.race([operation, deadline]).then(value => {
      clearTimeout(timer);
      cached = { identity, result: value, until: now() + cacheMs };
      return value;
    });
    active = { identity, result };
    // Retain slot until every underlying dependency settles, including after timeout.
    void operation.finally(() => { if (active?.result === result) active = undefined; });
    return result;
  };
}
