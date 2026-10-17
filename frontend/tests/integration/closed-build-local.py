"""Prove the closed release builds and serves only maintenance on legacy schema."""
import json, os, shutil, subprocess, tempfile, time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def main():
    source_sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    source_dirty=bool(subprocess.check_output(['git','status','--porcelain'],text=True).strip())
    if os.environ.get('R21_FINAL_QUALIFICATION')=='1': assert not source_dirty, 'Freeze a clean source before qualification'
    root=Path.cwd(); parsed=urlparse(os.environ.get('SPRINT1_TEST_DATABASE_URL',''))
    assert os.environ.get('GHEVERHAN_ISOLATED_TESTS')=='1'
    assert parsed.hostname in ['127.0.0.1','localhost'] and parsed.port==55436
    assert parsed.path=='/gheverhan_closed_sprint1_test' and parsed.username=='agent' and not parsed.password
    output=Path(os.environ.get('SPRINT1_ARTIFACT_DIR','/tmp/r21-closed-build'));output.mkdir(parents=True,exist_ok=True)
    binary=Path(os.environ.get('R21_PG_BIN','/workspace/.tools/postgres/root/usr/lib/postgresql/17/bin'))
    def legacy():
        query='''SELECT count(*)=5 AND to_regclass('public."SessionRevocation"') IS NULL AND to_regclass('public."AuthRateLimit"') IS NULL AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='sessionVersion') FROM public._prisma_migrations WHERE finished_at IS NOT NULL'''
        p=subprocess.run([str(binary/'psql'),'-h','127.0.0.1','-p','55436','-U','agent','-d','gheverhan_closed_sprint1_test','-X','-At','-v','ON_ERROR_STOP=1','-c',query],capture_output=True,text=True,check=True)
        return p.stdout.strip()=='t'
    assert legacy()
    result={'status':'FAILED','commitSha':source_sha,'sourceDirty':source_dirty,'profile':'MAINTENANCE_MODE=1','legacySchemaBefore':True}
    temporary=Path(tempfile.mkdtemp(prefix='r21-closed-source-'));server=None
    try:
        for name in ['src','scripts','prisma','tests','public','package.json','package-lock.json','next.config.js','next-env.d.ts','tsconfig.json','tailwind.config.ts','postcss.config.js','.eslintrc.json','vitest.config.ts']:
            source=root/name
            if not source.exists():continue
            if source.is_dir():shutil.copytree(source,temporary/name)
            else:shutil.copy2(source,temporary/name)
        (temporary/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
        env=os.environ.copy();env.update(DATABASE_URL=os.environ['SPRINT1_TEST_DATABASE_URL'],DIRECT_URL=os.environ['SPRINT1_TEST_DATABASE_URL'],MAINTENANCE_MODE='1',NEXT_TELEMETRY_DISABLED='1')
        start=time.monotonic()
        with (output/'closed-build.log').open('w') as log:
            built=subprocess.run(['npm','run','build'],cwd=temporary,env=env,stdout=log,stderr=subprocess.STDOUT)
        assert built.returncode==0,'Closed build failed; inspect isolated log'
        result['buildSeconds']=time.monotonic()-start;result['buildId']=(temporary/'.next/BUILD_ID').read_text().strip()
        # Refuse a pre-existing listener before ever sending it requests.
        import socket
        probe=socket.socket();probe.bind(('127.0.0.1',3134));probe.close()
        server=subprocess.Popen(['node',str(temporary/'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3134'],cwd=temporary,env={**env,'NODE_ENV':'production'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urlopen('http://127.0.0.1:3134/api/v1/health',timeout=1) as response:
                    if response.status==200:break
            except Exception:pass
            time.sleep(.1)
        else:raise RuntimeError('Closed build liveness failed')
        checks=[]
        for route,method in [('/','GET'),('/shop','GET'),('/login','GET'),('/cart','POST'),('/api/v1/auth/login','POST'),('/api/v1/orders','POST'),('/api/internal/cron/expire-orders','GET'),('/_next/static/synthetic.js','POST')]:
            request=Request('http://127.0.0.1:3134'+route,data=b'[]' if method=='POST' else None,method=method,headers={'Next-Action':'synthetic'})
            try:urlopen(request,timeout=5);raise AssertionError('Business request was not closed')
            except HTTPError as error:
                assert error.code==503 and 'no-store' in error.headers.get('Cache-Control','')
                checks.append({'path':route,'method':method,'status':503})
        result['checks']=checks;result['healthStatus']=200;result['legacySchemaAfter']=legacy();assert result['legacySchemaAfter']
        result['status']='PASS'
    finally:
        if server:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
        shutil.rmtree(temporary)
        result['temporarySourceRemoved']=not temporary.exists()
        (output/'closed-build-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':main()
