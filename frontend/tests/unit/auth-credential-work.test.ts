import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ findFirst: vi.fn(), verify: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findFirst: m.findFirst } } }));
vi.mock('@/lib/auth/password', () => ({ hashPassword: vi.fn(), verifyPassword: m.verify, DUMMY_PASSWORD_HASH: 'public-dummy-hash' }));
vi.mock('@/lib/auth/rate-limit', () => ({ enforceAuthRateLimit: m.limit }));
vi.mock('@/modules/audit/audit.service', () => ({ writeAudit: vi.fn() }));
import { authenticate } from '@/modules/auth/auth.service';
beforeEach(() => { vi.clearAllMocks(); m.verify.mockResolvedValue(false); m.limit.mockResolvedValue(undefined); });
it.each([null, { isActive: false, passwordHash: 'inactive-hash' }, { isActive: true, passwordHash: 'active-hash' }])('performs a password check before the same generic credential denial %#', async user => {
 m.findFirst.mockResolvedValue(user);
 await expect(authenticate('unknown@example.test', 'wrong')).rejects.toMatchObject({ status: 401, message: 'Email/No HP atau password salah' });
 expect(m.verify).toHaveBeenCalledOnce();
 expect(m.verify).toHaveBeenCalledWith('wrong', user?.isActive ? 'active-hash' : 'public-dummy-hash');
});
it('does not consult identity data or hash passwords when the shared limiter fails', async () => {
 m.limit.mockRejectedValue(new Error('database unavailable'));
 await expect(authenticate('unknown@example.test', 'wrong')).rejects.toThrow('database unavailable');
 expect(m.findFirst).not.toHaveBeenCalled(); expect(m.verify).not.toHaveBeenCalled();
});
