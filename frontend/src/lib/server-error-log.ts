const errorNames = new Set([
  'Error', 'TypeError', 'SyntaxError', 'RangeError',
  'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError',
  'PrismaClientInitializationError', 'PrismaClientValidationError', 'PrismaClientRustPanicError',
]);

const nodeCodes = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ERR_INVALID_ARG_TYPE', 'ERR_MODULE_NOT_FOUND', 'ERR_REQUIRE_ESM', 'ERR_PROTO_ACCESS']);

/** Server wrappers must not serialize exception messages, SQL arguments or causes. */
export function logServerFailure(context: 'api-error' | 'action-error', error: unknown) {
  let type = 'Error';
  let code: string | undefined;
  try {
    if (error && typeof error === 'object') {
      const candidate = error as { name?: unknown; code?: unknown };
      if (typeof candidate.name === 'string' && errorNames.has(candidate.name)) type = candidate.name;
      if (typeof candidate.code === 'string' && (/^P\d{4}$/.test(candidate.code) || nodeCodes.has(candidate.code))) code = candidate.code;
    }
  } catch { /* An exception with hostile getters still receives a generic event. */ }
  console.error(`[${context}]`, { type, ...(code ? { code } : {}) });
}
