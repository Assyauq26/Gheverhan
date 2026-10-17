"""Synthetic-only encrypted backup/restore drill. Never accepts a remote target."""
import json, os, subprocess, tempfile, time, shutil, re
from pathlib import Path
from urllib.parse import urlparse

def main():
    source_sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    source_dirty=bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip())
    if os.environ.get('R21_FINAL_QUALIFICATION')=='1': assert not source_dirty, 'Freeze a clean source before qualification'
    target = urlparse(os.environ.get('SPRINT1_TEST_DATABASE_URL', ''))
    assert os.environ.get('GHEVERHAN_ISOLATED_TESTS') == '1'
    assert target.hostname in ['127.0.0.1', 'localhost'] and target.port == 55437
    assert target.path == '/gheverhan_sprint1_test' and target.username == 'agent' and not target.password
    assert Path('node_modules/server-only/index.js').is_file(), 'Prepare isolated direct-Node server-only marker as documented in CI'
    binary = Path(os.environ.get('R21_PG_BIN', '/workspace/.tools/postgres/root/usr/lib/postgresql/17/bin'))
    output = Path(os.environ.get('SPRINT1_ARTIFACT_DIR', '/tmp/gheverhan-r21-recovery'))
    output.mkdir(parents=True, exist_ok=True)
    private = Path(tempfile.mkdtemp(prefix='r21-dummy-backup-'))
    base = ['-h', target.hostname, '-p', str(target.port), '-U', 'agent']
    restored = 'gheverhan_sprint1_test'
    restore_base = ['-h', '127.0.0.1', '-p', '55438', '-U', 'agent']
    result_restore_port = 55438
    created = False
    result = {'status': 'FAILED', 'synthetic': True, 'encryption': 'CMS AES-256-GCM / RSA3072 ephemeral dummy recipient', 'sourcePort': target.port, 'commitSha': source_sha, 'sourceDirty':source_dirty}
    def run(args, **kwargs):
        p = subprocess.run(args, capture_output=True, **kwargs)
        if p.returncode: raise RuntimeError('Disposable recovery command failed: '+Path(args[0]).name)
        return p
    def sql(database, statement, restore=False):
        return run([str(binary/'psql'), *(restore_base if restore else base), '-d', database, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], text=True).stdout.strip()
    try:
        assert sql('gheverhan_sprint1_test', 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL') == '6'
        assert sql('gheverhan_sprint1_test', 'SELECT count(*) FROM "User" WHERE email NOT LIKE \'%example.test\'') == '0'
        assert sql('postgres', "SELECT count(*) FROM pg_database WHERE datname='"+restored+"'", restore=True) == '0'
        run(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(private/'dummy.key'),'-out',str(private/'dummy.crt'),'-days','1','-subj','/CN=R21 disposable dummy backup'])
        (private/'dummy.key').chmod(0o600)
        proof_env=os.environ.copy();proof_env.update(JWT_SECRET='r21-backup-replay-fixture-only',DATABASE_URL=os.environ['SPRINT1_TEST_DATABASE_URL'],DIRECT_URL=os.environ['SPRINT1_TEST_DATABASE_URL'])
        create_proof="""(async()=>{const j=require('./src/lib/auth/jwt.ts');const s=require('./src/lib/auth/session-state.ts');const {prisma}=require('./src/lib/prisma.ts');try{const token=await j.signSession({sub:'r21-legacy',email:'migration@example.test',version:2});const claims=await j.verifySessionClaims(token);await prisma.sessionRevocation.deleteMany({where:{userId:'r21-legacy'}});await s.revokeSession(claims);if(await prisma.user.findUnique({where:s.activeSessionWhere(claims)}))throw new Error('Replay accepted before backup');console.log(JSON.stringify({token}));}finally{await prisma.$disconnect();}})().catch(()=>process.exitCode=1)"""
        proof=run(['node','--import','tsx','-e',create_proof],env=proof_env,text=True)
        revoked_token=json.loads(proof.stdout)['token']
        result['revokedJwtRejectedBeforeBackup']=True
        start=time.monotonic()
        # Stream directly into encryption; no plaintext dump is stored before encryption.
        with (private/'dummy.cms').open('wb') as encrypted:
            dump=subprocess.Popen([str(binary/'pg_dump'),*base,'-d','gheverhan_sprint1_test','--format=custom'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            try:
                encrypt=subprocess.run(['openssl','cms','-encrypt','-binary','-aes-256-gcm','-outform','DER',str(private/'dummy.crt')],stdin=dump.stdout,stdout=encrypted,stderr=subprocess.PIPE)
            finally: dump.stdout.close()
            dump_code=dump.wait(timeout=30)
            assert dump_code==0 and encrypt.returncode==0
        result['backupSeconds']=time.monotonic()-start
        ciphertext=(private/'dummy.cms').read_bytes(); result['encryptedBytes']=len(ciphertext)
        start=time.monotonic()
        run(['openssl','cms','-decrypt','-binary','-inform','DER','-in',str(private/'dummy.cms'),'-recip',str(private/'dummy.crt'),'-inkey',str(private/'dummy.key'),'-out',str(private/'dummy.dump')])
        (private/'dummy.dump').chmod(0o600)
        bad=bytearray(ciphertext);bad[-1]^=1;(private/'tampered.cms').write_bytes(bad)
        tampered=subprocess.run(['openssl','cms','-decrypt','-binary','-inform','DER','-in',str(private/'tampered.cms'),'-recip',str(private/'dummy.crt'),'-inkey',str(private/'dummy.key')],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        assert tampered.returncode!=0;result['tamperRejected']=True
        run([str(binary/'createdb'),*restore_base,restored]);created=True
        run([str(binary/'pg_restore'),*restore_base,'-d',restored,'--exit-on-error',str(private/'dummy.dump')])
        assert sql(restored,'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL', restore=True)=='6'
        assert sql(restored,'''SELECT (SELECT "sessionVersion"=2 FROM "User" WHERE id='r21-legacy') AND (SELECT count(*)=1 FROM "SessionRevocation")''', restore=True)=='t'
        result['restoreSeconds']=time.monotonic()-start;result['restoredToDifferentDatabase']=True;result['restorePort']=result_restore_port;result['securityStatePreserved']=True
        env=os.environ.copy();restore_url=f'postgresql://agent@127.0.0.1:55438/{restored}'
        env.update(DATABASE_URL=restore_url,DIRECT_URL=restore_url,SPRINT1_TEST_DATABASE_URL=restore_url,JWT_SECRET='r21-backup-replay-fixture-only',R21_DUMMY_TOKEN=revoked_token)
        verify_replay="""(async()=>{const j=require('./src/lib/auth/jwt.ts');const s=require('./src/lib/auth/session-state.ts');const {prisma}=require('./src/lib/prisma.ts');try{const claims=await j.verifySessionClaims(process.env.R21_DUMMY_TOKEN);if(!claims)throw new Error('Fixture signature invalid');await s.assertSessionRevocationAccess();if(await prisma.user.findUnique({where:s.activeSessionWhere(claims)}))throw new Error('Restored revocation accepted replay');}finally{await prisma.$disconnect();}})().catch(()=>process.exitCode=1)"""
        run(['node','--import','tsx','-e',verify_replay],env=env,text=True)
        result['revokedJwtRejectedAfterRestore']=True
        env.pop('R21_DUMMY_TOKEN');revoked_token=None
        for suite in ['auth-security','transaction-correctness']:
            p=subprocess.run(['node','--import','tsx','--test',f'tests/integration/{suite}.test.ts'],env=env,capture_output=True,text=True)
            (output/f'restore-{suite}.log').write_text(p.stdout+p.stderr)
            assert p.returncode==0,suite
            count=re.search(r'^# tests (\d+)$',p.stdout,re.MULTILINE)
            assert count and int(count[1])>0
            result['postRestoreAuthTests' if suite=='auth-security' else 'postRestoreTransactionTests']=int(count[1])
        result['status']='PASS'
    finally:
        if created:
            cleanup=subprocess.run([str(binary/'dropdb'),*restore_base,restored],capture_output=True)
            result['restoreDatabaseRemoved']=cleanup.returncode==0
            if cleanup.returncode: result['status']='FAILED'
        shutil.rmtree(private)
        result['privateDummyFilesRemoved']=not private.exists()
        (output/'backup-recovery-results.json').write_text(json.dumps(result,indent=2)+'\n')
    assert result['status']=='PASS'
    print(json.dumps(result))

if __name__=='__main__': main()
