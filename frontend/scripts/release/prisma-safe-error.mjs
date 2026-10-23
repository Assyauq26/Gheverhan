/** Consume errors privately; emit only hardcoded categories/codes, never raw messages. */
const prismaCodes = new Set(['P1000','P1001','P1002','P1003','P1008','P1010','P1011','P1012','P1013','P1015','P1017','P2010','P2021','P2022','P2024','P2028','P2034']);
const sqlStates = new Set(['28P01','28000','42501','42P01','42703','42883','08006','08P01','53300','57014','0A000','26000','42P05']);
const phases = new Set(['PRISMA_INIT','CONNECT','START_TRANSACTION','SET_READ_ONLY','SET_TIMEOUT','IDENTITY_METADATA','TABLE_GRANTS_METADATA','CONNECTION_CHECK','DISCONNECT','RELEASE_PREFLIGHT']);
const configReasons = new Set(['CA_MISSING','CA_INVALID','TARGET_UNVERIFIED','DSN_PARAMETERS_INVALID','STRICT_TLS_REQUIRED','TLS_PARAMETERS_UNSUPPORTED','UNMANAGED_CA_PATH','MISSING_PROTECTED_OPERATOR_BINDINGS','DIRECT_URL_TRANSACTION_POOLER_NOT_ALLOWED','TRANSACTION_POOLER_PREPARED_STATEMENTS_UNVERIFIED']);
export function safeProbeFailure(error, phase, connection) {
  let code, state, name, network, message = '', config;
  try {
    code = prismaCodes.has(error?.errorCode) ? error.errorCode : error?.code;
    state = error?.meta?.code; network = error?.cause?.code || error?.code; name = error?.name; config = error?.reason;
    if (typeof error?.message === 'string') message = error.message.slice(0,32768);
  } catch { /* hostile getters are not diagnostic output */ }
  const prismaCode = prismaCodes.has(code) ? code : 'UNCLASSIFIED';
  const sqlState = sqlStates.has(state) ? state : 'UNCLASSIFIED';
  let category = 'UNKNOWN_RUNTIME_EXCEPTION';
  if (configReasons.has(config)) category = config;
  else if (prismaCode === 'P1000' || ['28P01','28000'].includes(sqlState)) category = 'POSTGRES_AUTHENTICATION_REJECTED';
  else if (prismaCode === 'P1011') category = /hostname mismatch|IP address mismatch|not valid for.*name/i.test(message) ? 'TLS_HOSTNAME_MISMATCH' : /certificate verify failed|self.signed|unknown issuer|unable to get.*issuer/i.test(message) ? 'TLS_CERTIFICATE_UNTRUSTED' : 'TLS_HANDSHAKE_FAILED';
  else if (['ENOTFOUND','EAI_AGAIN'].includes(network)) category = 'DNS_LOOKUP_FAILED';
  else if (network === 'ETIMEDOUT') category = 'CONNECTION_TIMEOUT';
  else if (network === 'ECONNREFUSED') category = 'NETWORK_UNREACHABLE';
  else if (['P1001','P1002','P1008','P1017','P2024'].includes(prismaCode)) category = 'NETWORK_OR_CONNECTION_TIMEOUT';
  else if (['P1012','P1013','P1015'].includes(prismaCode)) category = 'PRISMA_CONFIGURATION_INVALID';
  else if (prismaCode === 'P1010' || sqlState === '42501') category = 'POSTGRES_PRIVILEGE_DENIED';
  else if (['26000','42P05','08P01','0A000'].includes(sqlState)) category = 'CONNECTION_MODE_OR_STATEMENT_FAILURE';
  else if (['42P01','42703','42883'].includes(sqlState) || ['P2021','P2022'].includes(prismaCode)) category = 'SQL_METADATA_QUERY_FAILED';
  else if (name === 'PrismaClientRustPanicError') category = 'PRISMA_ENGINE_STARTUP_FAILED';
  else if (/query.engine|libquery_engine|dlopen|shared library|cannot find module|could not load.*engine|Unable to require/i.test(message)) category = 'PRISMA_ENGINE_LOAD_FAILED';
  else if (name === 'PrismaClientInitializationError') category = 'PRISMA_CLIENT_INITIALIZATION_FAILED';
  return {status:'BLOCKED',reason:'RUNTIME_PROBE_FAILED',category,connection:connection==='direct'?'direct':'runtime',phase:phases.has(phase)?phase:'UNEXPECTED',prismaCode,sqlState,readOnly:true};
}
