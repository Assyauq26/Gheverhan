import hashlib, importlib.util, io, json, pathlib, tarfile, tempfile, unittest
spec=importlib.util.spec_from_file_location('normalizer',pathlib.Path(__file__).with_name('normalize-image-archive.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ArchiveIdentity(unittest.TestCase):
    def test_dual_layout_binds_identical_config_layers_and_is_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);source=root/'input.gz'
            layer=b'synthetic layer bytes'
            config=json.dumps({'os':'linux','architecture':'amd64','rootfs':{'type':'layers','diff_ids':['sha256:'+hashlib.sha256(layer).hexdigest()]}}).encode()
            files={'config.json':config,'layer.tar':layer,'manifest.json':json.dumps([{'Config':'config.json','RepoTags':['fixture:release'],'Layers':['layer.tar']}]).encode()}
            with tarfile.open(source,'w:gz') as archive:
                for name,data in files.items():
                    entry=tarfile.TarInfo(name);entry.size=len(data);archive.addfile(entry,io.BytesIO(data))
            result=module.normalize(source,root/'one.gz');self.assertEqual(result,module.normalize(source,root/'two.gz'))
            self.assertEqual((root/'one.gz').read_bytes(),(root/'two.gz').read_bytes())
            with tarfile.open(root/'one.gz','r:gz') as archive:
                index=json.load(archive.extractfile('index.json'));descriptor=index['manifests'][0]
                raw=archive.extractfile('blobs/sha256/'+result['archive_manifest_sha256']).read()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),descriptor['digest'][7:])
                manifest=json.loads(raw);classic=json.load(archive.extractfile('manifest.json'))[0]
                self.assertEqual(classic['Config'],'blobs/sha256/'+result['config_sha256'])
                for item in [manifest['config'],*manifest['layers']]:
                    data=archive.extractfile('blobs/sha256/'+item['digest'][7:]).read()
                    self.assertEqual(len(data),item['size']);self.assertEqual(hashlib.sha256(data).hexdigest(),item['digest'][7:])
                self.assertEqual(classic['Layers'],['blobs/sha256/'+hashlib.sha256(layer).hexdigest()])
            with self.assertRaises(FileExistsError):module.normalize(source,root/'one.gz')
    def test_incomplete_or_wrong_platform_archive_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            with tarfile.open(root/'bad.gz','w:gz') as archive:
                data=b'[]';entry=tarfile.TarInfo('manifest.json');entry.size=len(data);archive.addfile(entry,io.BytesIO(data))
            with self.assertRaises(ValueError):module.normalize(root/'bad.gz',root/'out.gz')
            self.assertFalse((root/'out.gz').exists())
            for index,(platform,layer_hash) in enumerate([('arm64',hashlib.sha256(b'layer').hexdigest()),('amd64','a'*64)]):
                config=json.dumps({'os':'linux','architecture':platform,'rootfs':{'diff_ids':['sha256:'+layer_hash]}}).encode()
                files={'config.json':config,'layer.tar':b'layer','manifest.json':b'[{"Config":"config.json","RepoTags":["fixture:test"],"Layers":["layer.tar"]}]'}
                with tarfile.open(root/f'bad{index}.gz','w:gz') as archive:
                    for name,data in files.items():
                        entry=tarfile.TarInfo(name);entry.size=len(data);archive.addfile(entry,io.BytesIO(data))
                with self.assertRaises(ValueError):module.normalize(root/f'bad{index}.gz',root/f'out{index}.gz')
                self.assertFalse((root/f'out{index}.gz').exists())
if __name__=='__main__':unittest.main()
