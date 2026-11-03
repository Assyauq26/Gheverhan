import { localAdminDatabase } from '@/lib/self-hosted/admin-claim-db';
import { localSetupStatus, redeemLocalAdminClaim, LocalSetupError } from '@/lib/self-hosted/admin-claim';
import { assertLocalSetupRequest, readSetupInput } from '@/lib/self-hosted/admin-claim-http';

import { LOCAL_SETUP_HEADERS as headers, localSetupPage as page } from '@/lib/self-hosted/admin-claim-view';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function failure(error: unknown) {
  const status = error instanceof LocalSetupError ? error.status : 503;
  if (status === 404) return new Response(null,{status:404,headers});
  if (status === 503 || error instanceof LocalSetupError && ['HTTPS_REQUIRED','ORIGIN_DENIED'].includes(error.code)) return new Response('Penyiapan hanya tersedia pada koneksi HTTPS toko yang terkonfigurasi dengan benar.',{status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
  return page(status === 429 ? 'Percobaan dibatasi. Minta operator membuat kode penyiapan baru.' : status === 400 || status === 413 ? 'Periksa isian dan pastikan kedua kata sandi sama.' : 'Penyiapan tidak dapat dilanjutkan. Periksa kode, masa berlaku, dan koneksi HTTPS Anda. Akun yang sudah ada tidak akan diubah.',status);
}
export async function GET(request: Request) {
  try {
    assertLocalSetupRequest(request,false);
    const state=await localSetupStatus(localAdminDatabase(),process.env);
    if(state.status!=='setup_required')return new Response(null,{status:404,headers});
    return page();
  } catch(error) {return failure(error);}
}
export async function POST(request: Request) {
  try {
    const config=assertLocalSetupRequest(request,true);
    await redeemLocalAdminClaim(localAdminDatabase(),process.env,await readSetupInput(request));
    return new Response(null,{status:303,headers:{...headers,Location:config.appOrigin+'/login?redirectTo=/admin'}});
  } catch(error) {return failure(error);}
}
