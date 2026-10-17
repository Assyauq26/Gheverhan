"""Disposable-only five-to-six migration, lock failure and idempotent retry drill."""
import hashlib, json, os, shutil, subprocess, tempfile, time
from pathlib import Path
from urllib.parse import urlparse, urlunparse, urlencode, parse_qsl

def main():
    root=Path.cwd(); target=urlparse(os.environ.get('SPRINT1_TEST_DATABASE_URL',''))
    assert os.environ.get('GHEVERHAN_ISOLATED_TESTS')=='1'
    assert target.hostname in ['127.0.0.1','localhost'] and target.port==55437
    assert target.path=='/gheverhan_sprint1_test' and target.username=='agent' and not target.password
    source_sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    source_dirty=bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip())
    if os.environ.get('R21_FINAL_QUALIFICATION')=='1': assert not source_dirty
    binary=Path(os.environ.get('R21_PG_BIN','/workspace/.tools/postgres/root/usr/lib/postgresql/17/bin'))
    output=Path(os.environ.get('SPRINT1_ARTIFACT_DIR','/tmp/r21-migration-upgrade'));output.mkdir(parents=True,exist_ok=True)
    base=['-h','127.0.0.1','-p','55437','-U','agent','-d','gheverhan_sprint1_test']
    private=Path(tempfile.mkdtemp(prefix='r21-migration-private-'));holder=None
    result={'status':'FAILED','commitSha':source_sha,'sourceDirty':source_dirty,'synthetic':True}
    def sql(statement,check=True):
        p=subprocess.run([str(binary/'psql'),*base,'-X','-At','-v','ON_ERROR_STOP=1','-c',statement],capture_output=True,text=True)
        if check and p.returncode:raise RuntimeError('Disposable migration SQL failed')
        return p
    env=os.environ.copy();env.update(DATABASE_URL=os.environ['SPRINT1_TEST_DATABASE_URL'],DIRECT_URL=os.environ['SPRINT1_TEST_DATABASE_URL'])
    def deploy(schema,label):
        p=subprocess.run(['node','node_modules/prisma/build/index.js','migrate','deploy','--schema',str(schema)],env=env,capture_output=True,text=True)
        (output/(label+'.log')).write_text(p.stdout+p.stderr);assert p.returncode==0,label
    try:
        assert sql("SELECT to_regclass('public._prisma_migrations') IS NULL").stdout.strip()=='t','Use a fresh disposable migration database'
        migrations=sorted(p for p in (root/'prisma/migrations').iterdir() if p.is_dir());assert len(migrations)==6
        shutil.copy2(root/'prisma/schema.prisma',private/'schema.prisma')
        (private/'migrations').mkdir();shutil.copy2(root/'prisma/migrations/migration_lock.toml',private/'migrations/migration_lock.toml')
        for migration in migrations[:5]:shutil.copytree(migration,private/'migrations'/migration.name)
        deploy(private/'schema.prisma','historical-five')
        assert sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL').stdout.strip()=='5';result['historicalMigrations']=5
        sql('''INSERT INTO "User" (id,name,email,"passwordHash","updatedAt") VALUES ('r21-legacy','Synthetic Migration','migration@example.test','dummy-unused',now())''')
        backup=private/'before-auth.dump'
        subprocess.run([str(binary/'pg_dump'),*base,'--format=custom','--file='+str(backup)],capture_output=True,check=True);backup.chmod(0o600)
        subprocess.run([str(binary/'pg_restore'),*base,'--clean','--if-exists',str(backup)],capture_output=True,check=True)
        assert sql("SELECT count(*) FROM \"User\" WHERE id='r21-legacy'").stdout.strip()=='1';result['legacyBackupRestored']=True
        holder_env=env.copy();holder_env['PGAPPNAME']='r21-local-lock-holder'
        holder=subprocess.Popen([str(binary/'psql'),*base,'-X','-v','ON_ERROR_STOP=1','-c','BEGIN; SELECT id FROM "User"; SELECT pg_sleep(8); COMMIT;'],env=holder_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(40):
            if sql("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='r21-local-lock-holder' AND l.relation='\"User\"'::regclass AND l.granted").stdout.strip()!='0':break
            time.sleep(.05)
        else:raise RuntimeError('Controlled lock holder did not acquire lock')
        auth=(migrations[-1]/'migration.sql').read_text()
        failed=sql("BEGIN; SET LOCAL lock_timeout='750ms'; "+auth+' COMMIT;',check=False)
        assert failed.returncode and 'lock timeout' in failed.stderr.lower();result['lockTimeoutFailsSafely']=True
        assert sql("SELECT to_regclass('public.\"SessionRevocation\"') IS NULL").stdout.strip()=='t';result['noPartialTablesAfterFailure']=True
        assert holder.poll() is None
        constrained=urlunparse(target._replace(query=urlencode({**dict(parse_qsl(target.query)), 'options':'-c lock_timeout=750ms'})))
        failure_env=env.copy();failure_env.update(DATABASE_URL=constrained,DIRECT_URL=constrained)
        actual=subprocess.run(['node','node_modules/prisma/build/index.js','migrate','deploy','--schema',str(root/'prisma/schema.prisma')],env=failure_env,capture_output=True,text=True,timeout=20)
        (output/'prisma-lock-failure.log').write_text(actual.stdout+actual.stderr)
        assert actual.returncode!=0 and 'lock timeout' in (actual.stdout+actual.stderr).lower()
        assert sql("SELECT count(*) FROM \"_prisma_migrations\" WHERE migration_name='20261017000000_auth_session_controls' AND finished_at IS NULL AND rolled_back_at IS NULL").stdout.strip()=='1'
        assert sql("SELECT to_regclass('public.\"SessionRevocation\"') IS NULL").stdout.strip()=='t'
        result['prismaFailureLedgerVerified']=True
        holder.wait(timeout=15);holder=None
        help_result=subprocess.run(['node','node_modules/prisma/build/index.js','migrate','resolve','--help'],capture_output=True,text=True)
        assert help_result.returncode==0 and '--rolled-back' in help_result.stdout
        resolved=subprocess.run(['node','node_modules/prisma/build/index.js','migrate','resolve','--rolled-back','20261017000000_auth_session_controls','--schema',str(root/'prisma/schema.prisma')],env=env,capture_output=True,text=True)
        (output/'resolve-reviewed-empty-failure.log').write_text(resolved.stdout+resolved.stderr);assert resolved.returncode==0
        result['reviewedFailedLedgerResolved']=True
        for label in ['forward','idempotent']:deploy(root/'prisma/schema.prisma',label)
        assert sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL').stdout.strip()=='6';result['finalMigrations']=6
        assert sql("SELECT \"sessionVersion\" FROM \"User\" WHERE id='r21-legacy'").stdout.strip()=='0';result['legacyDefaultZero']=True
        assert sql("SELECT count(*)=2 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('\"SessionRevocation\"'::regclass,'\"AuthRateLimit\"'::regclass)").stdout.strip()=='t';result['rlsEnabled']=True
        assert sql("SELECT count(*)=1 AND bool_and(confdeltype='c' AND confupdtype='c') FROM pg_constraint WHERE conrelid='\"SessionRevocation\"'::regclass AND contype='f'").stdout.strip()=='t';result['foreignKeyCascades']=True
        assert sql("SELECT count(*)=5 AND bool_and(indisvalid) FROM pg_index WHERE indrelid IN ('\"SessionRevocation\"'::regclass,'\"AuthRateLimit\"'::regclass)").stdout.strip()=='t';result['indexesValid']=True
        sql('''UPDATE "User" SET "sessionVersion"=2 WHERE id='r21-legacy'; INSERT INTO "SessionRevocation" ("tokenHash","userId","expiresAt") VALUES (repeat('c',64),'r21-legacy',now()+interval '1 hour')''')
        result['migrationChecksums']={p.name:hashlib.sha256((p/'migration.sql').read_bytes()).hexdigest() for p in migrations}
        result['status']='PASS'
    finally:
        if holder:holder.terminate();holder.wait(timeout=5)
        shutil.rmtree(private);result['privateDummyFilesRemoved']=not private.exists()
        (output/'migration-upgrade-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':main()
