// Server-only lease manager. The factory must resolve a trusted vault reference,
// verify the database's immutable tenant marker and configure Prisma's pool limit.
// Never pass request-supplied tenant scopes or a raw user-supplied database URL.
export class TenantClientPool {
  #slots = new Map();
  #tail = Promise.resolve();
  #clock = 0;
  #closed = false;
  constructor(factory, {maxClients = 4, connectionLimit = 2} = {}) {
    if (typeof factory !== 'function' || !Number.isInteger(maxClients) || maxClients < 1 || maxClients > 16 || !Number.isInteger(connectionLimit) || connectionLimit < 1 || connectionLimit > 4) throw Error('Invalid pool budget');
    this.factory = factory; this.maxClients = maxClients; this.connectionLimit = connectionLimit;
    Object.freeze(this);
  }
  async #exclusive(fn) {
    const previous = this.#tail;
    let done;
    this.#tail = new Promise(resolve => { done = resolve; });
    await previous;
    try { return await fn(); } finally { done(); }
  }
  async lease(scope) {
    if (!scope || scope.status !== 'ACTIVE' || typeof scope.tenantId !== 'string' || !scope.tenantId || typeof scope.databaseSecretRef !== 'string' || !scope.databaseSecretRef) throw Error('Active verified tenant scope required');
    // Copy before any await; a caller cannot mutate an in-flight selection.
    const tenantId = scope.tenantId, secretRef = scope.databaseSecretRef;
    return this.#exclusive(async () => {
      if (this.#closed) throw Error('Pool closed');
      let entry = this.#slots.get(tenantId);
      if (entry && entry.secretRef !== secretRef) {
        if (entry.leases) throw Error('Tenant credential rotation has active leases');
        await entry.client.$disconnect(); this.#slots.delete(tenantId); entry = null;
      }
      if (!entry) {
        if (this.#slots.size >= this.maxClients) {
          const idle = [...this.#slots.entries()].filter(([,v]) => !v.leases).sort((a,b) => a[1].used - b[1].used)[0];
          if (!idle) throw Error('Tenant connection capacity reached');
          await idle[1].client.$disconnect(); this.#slots.delete(idle[0]);
        }
        const client = await this.factory(Object.freeze({tenantId, databaseSecretRef: secretRef, connectionLimit: this.connectionLimit}));
        if (!client || typeof client.$disconnect !== 'function') throw Error('Invalid tenant client');
        entry = {client, secretRef, leases: 0, used: ++this.#clock};
        this.#slots.set(tenantId, entry);
      }
      entry.leases++; entry.used = ++this.#clock;
      let released = false;
      return Object.freeze({client: entry.client, release: () => this.#exclusive(() => {
        if (!released) { entry.leases--; entry.used = ++this.#clock; released = true; }
      })});
    });
  }
  async withTenant(scope, run) {
    const lease = await this.lease(scope);
    try { return await run(lease.client); } finally { await lease.release(); }
  }
  async close() {
    return this.#exclusive(async () => {
      if ([...this.#slots.values()].some(v => v.leases)) throw Error('Cannot close active tenant leases');
      this.#closed = true;
      for (const [key, entry] of this.#slots) { await entry.client.$disconnect(); this.#slots.delete(key); }
    });
  }
}
