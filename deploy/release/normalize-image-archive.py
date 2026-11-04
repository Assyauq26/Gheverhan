"""Publisher-only dual Docker/OCI archive. No extraction or Docker execution.

OCI descriptors preserve a runnable manifest digest across containerd loads;
manifest.json preserves classic Docker compatibility. Both reference identical
config/layer bytes once. Run BEFORE archive signing and TUF publication.
"""
import gzip
import hashlib
import io
import json
import pathlib
import sys
import tarfile

def encode(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=True).encode()

def normalize(source, destination):
    blobs, metadata = {}, None
    expanded, captured_bytes = 0, 0
    with tarfile.open(source, 'r|gz') as archive:
        for entry in archive:
            if entry.isdir():
                continue
            if not entry.isfile() or entry.name in blobs or len(blobs) >= 4096:
                raise ValueError('regular unique bounded entries required')
            if entry.name.startswith('/') or '..' in pathlib.PurePosixPath(entry.name).parts or '\\' in entry.name:
                raise ValueError('confined archive entry required')
            expanded += entry.size
            if expanded > 16 * 1024**3:
                raise ValueError('expanded archive budget exceeded')
            stream, digest = archive.extractfile(entry), hashlib.sha256()
            capture = entry.size <= 2*1024**2 and captured_bytes + entry.size <= 16*1024**2
            captured = bytearray() if capture else None
            if capture:
                captured_bytes += entry.size
            while chunk := stream.read(1024*1024):
                digest.update(chunk)
                if captured is not None:
                    captured.extend(chunk)
            blobs[entry.name] = (digest.hexdigest(), entry.size, bytes(captured) if captured is not None else None)
            if entry.name == 'manifest.json':
                if captured is None:
                    raise ValueError('bounded manifest required')
                metadata = json.loads(captured)
    if not isinstance(metadata, list) or len(metadata) != 1:
        raise ValueError('exactly one saved image required')
    image = metadata[0]
    paths = [image['Config'], *image['Layers']]
    if len(paths) > 256 or not image['Layers'] or any(p not in blobs for p in paths):
        raise ValueError('complete bounded saved image required')
    config_sha, _, config_raw = blobs[image['Config']]
    if config_raw is None:
        raise ValueError('bounded config required')
    config = json.loads(config_raw)
    if config.get('os') != 'linux' or config.get('architecture') != 'amd64':
        raise ValueError('linux amd64 required')
    tags = image.get('RepoTags') or []
    if len(tags) != 1 or not isinstance(tags[0], str) or len(tags[0]) > 256:
        raise ValueError('one publisher-selected tag required')
    def descriptor(name, media):
        sha, size, _ = blobs[name]
        return {'mediaType':media, 'digest':'sha256:'+sha, 'size':size}
    # docker save layers are uncompressed tar streams. Reject other encodings.
    diff_ids = config.get('rootfs', {}).get('diff_ids')
    if diff_ids != ['sha256:'+blobs[p][0] for p in image['Layers']]:
        raise ValueError('config must bind every uncompressed layer in order')
    manifest = encode({'schemaVersion':2,'mediaType':'application/vnd.oci.image.manifest.v1+json',
        'config':descriptor(image['Config'],'application/vnd.oci.image.config.v1+json'),
        'layers':[descriptor(p,'application/vnd.oci.image.layer.v1.tar') for p in image['Layers']]})
    manifest_sha = hashlib.sha256(manifest).hexdigest()
    index = encode({'schemaVersion':2,'manifests':[{'mediaType':'application/vnd.oci.image.manifest.v1+json',
        'digest':'sha256:'+manifest_sha,'size':len(manifest),
        'platform':{'architecture':'amd64','os':'linux'},
        'annotations':{'io.containerd.image.name':tags[0], 'org.opencontainers.image.ref.name':tags[0]}}]})
    selected = {p:'blobs/sha256/'+blobs[p][0] for p in paths}
    classic = encode([{'Config':selected[image['Config']], 'RepoTags':tags, 'Layers':[selected[p] for p in image['Layers']]}])
    destination = pathlib.Path(destination)
    with destination.open('xb') as output, gzip.GzipFile(fileobj=output, mode='wb', mtime=0, filename='') as compressed, tarfile.open(fileobj=compressed, mode='w|') as target:
        def add(name, size, reader):
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode = size, 0o644
            target.addfile(entry, reader)
        written = set()
        class CheckedReader:
            def __init__(self, stream):
                self.stream, self.digest = stream, hashlib.sha256()
            def read(self, size=-1):
                chunk = self.stream.read(size)
                self.digest.update(chunk)
                return chunk
        with tarfile.open(source, 'r|gz') as archive:
            for entry in archive:
                if entry.name in selected and selected[entry.name] not in written:
                    reader = CheckedReader(archive.extractfile(entry))
                    add(selected[entry.name],entry.size,reader)
                    if reader.digest.hexdigest() != blobs[entry.name][0] or entry.size != blobs[entry.name][1]:
                        raise ValueError('source changed during publication')
                    written.add(selected[entry.name])
        if written != set(selected.values()):
            raise ValueError('source became incomplete during publication')
        for name, data in [('oci-layout',b'{"imageLayoutVersion":"1.0.0"}'),('index.json',index),('blobs/sha256/'+manifest_sha,manifest),('manifest.json',classic)]:
            add(name,len(data),io.BytesIO(data))
    return {'config_sha256':config_sha,'archive_manifest_sha256':manifest_sha}

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('source archive and fresh output required')
    print(json.dumps(normalize(*sys.argv[1:])))
