import importlib.util,json,pathlib,socket,tempfile,threading,unittest
spec=importlib.util.spec_from_file_location('monitor',pathlib.Path(__file__).with_name('p0-vm-host-monitor.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ReadOnlyQMP(unittest.TestCase):
    def test_query_status_survives_events_and_reports_io_pause_without_mutation(self):
        with tempfile.TemporaryDirectory() as root:
            endpoint=pathlib.Path(root)/'qmp.sock';server=socket.socket(socket.AF_INET);server.bind(('127.0.0.1',0));server.listen(1)
            # Protocol regression over real loopback sockets on Windows too.
            class Connection:
                def __init__(self):self.socket=socket.socket(socket.AF_INET)
                def __enter__(self):return self
                def __exit__(self,*args):self.socket.close()
                def settimeout(self,value):self.socket.settimeout(value)
                def connect(self,path):self.socket.connect(server.getsockname())
                def makefile(self,*args):return self.socket.makefile(*args)
            commands=[];errors=[]
            def peer():
                try:
                    connection,_=server.accept()
                    with connection,connection.makefile('rwb') as stream:
                        stream.write(b'{"QMP":{}}\n');stream.flush()
                        for response in [{},{'status':'io-error','running':False},[{'io-status':'nospace'}]]:
                            command=json.loads(stream.readline());commands.append(command['execute'])
                            stream.write((json.dumps({'event':'STOP'})+'\n'+json.dumps({'return':response,'id':command['id']})+'\n').encode());stream.flush()
                except Exception as error:errors.append(type(error).__name__)
            thread=threading.Thread(target=peer);thread.start()
            try:result=module.qmp_status(endpoint,Connection)
            finally:thread.join(5);server.close()
            self.assertFalse(thread.is_alive());self.assertEqual(errors,[])
            self.assertEqual(commands,['qmp_capabilities','query-status','query-block'])
            self.assertEqual(result,{'qemu_status':'io-error','qemu_running':False,'block_io_status':['nospace']})
if __name__=='__main__':unittest.main()
