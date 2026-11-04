"""Read-only host/QMP evidence independent of a guest SSH connection."""
import json, os, pathlib, socket, sys, time

def qmp_status(endpoint, connection_factory=None):
    factory=connection_factory or (lambda:socket.socket(socket.AF_UNIX))
    with factory() as connection:
        connection.settimeout(2)
        connection.connect(str(endpoint))
        stream=connection.makefile('rwb')
        json.loads(stream.readline())
        def command(name, identifier):
            stream.write((json.dumps({'execute':name,'id':identifier})+'\n').encode());stream.flush()
            while True:
                response=json.loads(stream.readline())
                if response.get('id')==identifier:
                    if 'return' not in response:raise ValueError('QMP query failed')
                    return response['return']
        command('qmp_capabilities',1)
        status=command('query-status',2)
        blocks=command('query-block',3)
        return {'qemu_status':status['status'],'qemu_running':status['running'],
                'block_io_status':[item.get('io-status','unknown') for item in blocks]}

if __name__=='__main__':
    root,endpoint,pid=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),int(sys.argv[3])
    while not (root/'host-monitor-finished').exists():
        facts={'time_unix':time.time(),'host_disk_free_bytes':os.statvfs(root).f_bavail*os.statvfs(root).f_frsize}
        memory={line.split(':')[0]:int(line.split()[1])*1024 for line in pathlib.Path('/proc/meminfo').read_text().splitlines()}
        facts['host_mem_available_bytes']=memory['MemAvailable']
        try:
            process=pathlib.Path(f'/proc/{pid}/stat').read_text().split(') ',1)[1].split()
            facts['qemu_rss_bytes']=int(process[21])*os.sysconf('SC_PAGE_SIZE')
            facts['qemu_cpu_seconds']=(int(process[11])+int(process[12]))/os.sysconf('SC_CLK_TCK')
            facts.update(qmp_status(endpoint))
        except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError):
            facts['qmp_evidence']='UNAVAILABLE'
        with (root/'host-resource-samples.jsonl').open('a') as output:output.write(json.dumps(facts)+'\n')
        time.sleep(5)
