const errorNames = new Set([
  'Error', 'TypeError', 'SyntaxError', 'RangeError',
  'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError',
  'PrismaClientInitializationError', 'PrismaClientValidationError', 'PrismaClientRustPanicError',
]);

/** Server wrappers must not serialize exception messages, SQL arguments or causes. */
export function logServerFailure(context: 'api-error' | 'action-error', error: unknown) {
  let type = 'Error';
  let code: string | undefined;
  try {
    if (error && typeof error === 'object') {
      const candidate = error as { name?: unknown; code?: unknown };
      if (typeof candidate.name === 'string' && errorNames.has(candidate.name)) type = candidate.name;
      if (typeof candidate.code === 'string' && /^(P\d{4}|ERR_[A-Z_]{1,40}|ECONNREFUSED|ETIMEDOUT)$/.test(candidate.code)) code = candidate.code;
    }
  } catch { /* An exception with hostile getters still receives a generic event. */ }
  console.error(`[${context}]`, { type, ...(code ? { code } : {}) });
}
