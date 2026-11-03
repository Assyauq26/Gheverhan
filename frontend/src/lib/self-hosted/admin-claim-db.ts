import { PrismaClient } from '@prisma/client';
import { LocalSetupError } from './admin-claim';

let client: PrismaClient | undefined;
/** Lazy and silent: legacy requests never initialize this client. */
export function localAdminDatabase() {
  if (!process.env.DATABASE_URL) throw new LocalSetupError('SETUP_UNAVAILABLE',503);
  if (!client) {
    const url=new URL(process.env.DATABASE_URL);
    url.searchParams.set('connection_limit','2');
    url.searchParams.set('connect_timeout','2');
    url.searchParams.set('pool_timeout','2');
    client=new PrismaClient({log:[],datasources:{db:{url:url.toString()}}});
  }
  return client;
}
