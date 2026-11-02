import { localSetupConfig, LocalSetupError } from './admin-claim';

export function assertLocalSetupRequest(request: Request, mutation: boolean) {
  const config = localSetupConfig(process.env);
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || url.origin !== config.appOrigin || url.search) throw new LocalSetupError('HTTPS_REQUIRED', 403);
  if (mutation && (request.headers.get('origin') !== config.appOrigin ||
      !['same-origin', null].includes(request.headers.get('sec-fetch-site')))) throw new LocalSetupError('ORIGIN_DENIED', 403);
  return config;
}

export async function readSetupInput(request: Request, timeoutMs = 3000) {
  const type = request.headers.get('content-type')?.split(';')[0];
  if (type !== 'application/x-www-form-urlencoded') throw new LocalSetupError('INVALID_REQUEST', 400);
  if (Number(request.headers.get('content-length') || 0) > 4096) throw new LocalSetupError('INVALID_REQUEST', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LocalSetupError('INVALID_REQUEST', 400);
  let size = 0; const chunks: Uint8Array[] = [];
  const deadline = Date.now() + Math.min(timeoutMs, 3000);
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { void reader.cancel().catch(() => undefined); throw new LocalSetupError('BODY_TIMEOUT', 408); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const {done, value} = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
        reject(new LocalSetupError('BODY_TIMEOUT', 408));
        void reader.cancel().catch(() => undefined);
      }, remaining); }),
    ]).finally(() => clearTimeout(timer));
    if (done) break;
    size += value.length;
    if (size > 4096) { void reader.cancel().catch(() => undefined); throw new LocalSetupError('INVALID_REQUEST', 413); }
    chunks.push(value);
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  const keys = [...params.keys()];
  if (keys.length !== new Set(keys).size || keys.some(key => !['claim','name','email','password','confirmation'].includes(key)) || params.get('password') !== params.get('confirmation')) throw new LocalSetupError('INVALID_REQUEST', 400);
  return Object.fromEntries([...params.entries()].filter(([key]) => key !== 'confirmation'));
}
