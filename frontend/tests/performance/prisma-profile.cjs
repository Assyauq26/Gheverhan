// Test-only preload. Never imported by the application or enabled in deployment.
const Module = require('node:module');
const load = Module._load;
Module._load = function (name, ...args) {
  const exports = load.call(this, name, ...args);
  if (name !== '@prisma/client') return exports;
  return {
    ...exports,
    PrismaClient: class extends exports.PrismaClient {
      constructor(options = {}) {
        const target = new URL(process.env.DATABASE_URL);
        if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/gheverhan_sprint1_test') {
          throw new Error('Query profiler only supports the disposable loopback test database');
        }
        super({ ...options, log: ['error', 'warn', { emit: 'event', level: 'query' }] });
        if (process.env.GH_PROFILE_OPERATIONS === '1') {
          this.$use(async (params, next) => {
            const start = performance.now();
            try { return await next(params); }
            finally { process.stdout.write(`GH_PROFILE_OPERATION ${JSON.stringify({ model: params.model, action: params.action, durationMs: performance.now() - start })}\n`); }
          });
        }
        // Durations only: no query text, parameters, user data or credentials.
        this.$on('query', event => process.stdout.write(`GH_PROFILE_QUERY ${event.duration}\n`));
      }
    },
  };
};
