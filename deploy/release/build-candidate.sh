#!/usr/bin/env bash
# CI/operator release job only. Never called by a seller installer.
set -euo pipefail
umask 077
[[ "${RELEASE_OWNER_APPROVED:-}" = signed-candidate-build ]] || { echo 'Owner approval required'; exit 1; }
sha=${RELEASE_SOURCE_SHA:?exact40character approved source required}
[[ "$sha" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" = "$sha" && -z "$(git status --porcelain --untracked-files=no)" ]] || exit 1
repo=${RELEASE_IMAGE_REPOSITORY:?approved registry/repository prefix required}
[[ "$repo" =~ ^[a-z0-9][a-z0-9.:-]*/[a-z0-9/_-]+$ ]] || exit 1
cosign=${RELEASE_COSIGN_PATH:?independently approved Cosign binary required}
[[ "$cosign" = /* && ! -L "$cosign" && "${RELEASE_COSIGN_SHA256:?}" =~ ^[a-f0-9]{64}$ ]] || exit 1
printf '%s  %s\n' "$RELEASE_COSIGN_SHA256" "$cosign" | sha256sum -c - >/dev/null
out=${1:?fresh absolute output directory required}
[[ "$out" = /* && ! -e "$out" ]] || exit 1
mkdir -m700 "$out"; mkdir -m700 "$out/artifacts"
# Context preparation includes only reviewed source; no credentials or node_modules.
node deploy/self-hosted/prepare.mjs context "$out/context"
for role in app migration; do
 target=runtime; [[ "$role" != migration ]] || target=migration
 image="$repo/$role:$sha"
 docker buildx build --platform linux/amd64 --target "$target" --label "org.opencontainers.image.revision=$sha" --tag "$image" --push --metadata-file "$out/$role-build.json" "$out/context"
 digest=$(node -e 'const v=require(process.argv[1]);const d=v["containerimage.digest"];if(!/^sha256:[a-f0-9]{64}$/.test(d))process.exit(1);process.stdout.write(d)' "$out/$role-build.json")
 docker pull "$repo/$role@$digest" >/dev/null
 docker tag "$repo/$role@$digest" "$image"
 printf '%s\n' "$repo/$role@$digest" > "$out/$role-image"
 "$cosign" sign --yes "$repo/$role@$digest"
 "$cosign" verify --certificate-identity "${RELEASE_SIGNER_IDENTITY:?approved identity required}" --certificate-oidc-issuer "${RELEASE_SIGNER_ISSUER:?approved issuer required}" "$repo/$role@$digest" >/dev/null
 docker save "$image" | gzip -n > "$out/$role.raw.tar.gz"
 python3 deploy/release/normalize-image-archive.py "$out/$role.raw.tar.gz" "$out/artifacts/$role.tar.gz" > "$out/$role-archive-identity.json"
 node -e 'const fs=require("fs"),p=process.argv[1],v=require(p+"-archive-identity.json");fs.writeFileSync(p+"-config-digest","sha256:"+v.config_sha256);fs.writeFileSync(p+"-archive-manifest-digest",v.archive_manifest_sha256)' "$out/$role"
 rm "$out/$role.raw.tar.gz"
 "$cosign" sign-blob --yes --bundle "$out/artifacts/$role.bundle.json" "$out/artifacts/$role.tar.gz"
 "$cosign" verify-blob --bundle "$out/artifacts/$role.bundle.json" --certificate-identity "${RELEASE_SIGNER_IDENTITY:?approved identity required}" --certificate-oidc-issuer "${RELEASE_SIGNER_ISSUER:?approved issuer required}" "$out/artifacts/$role.tar.gz" >/dev/null
 done
# Control-plane image is separate from store archives and signed by immutable digest.
docker buildx build --platform linux/amd64 --file deploy/control-plane/Dockerfile --label "org.opencontainers.image.revision=$sha" --tag "$repo/control:$sha" --push --metadata-file "$out/control-build.json" .
control_digest=$(node -e 'const d=require(process.argv[1])["containerimage.digest"];if(!/^sha256:[a-f0-9]{64}$/.test(d))process.exit(1);process.stdout.write(d)' "$out/control-build.json")
printf '%s\n' "$repo/control@$control_digest" > "$out/control-image"
"$cosign" sign --yes "$repo/control@$control_digest"
"$cosign" verify --certificate-identity "$RELEASE_SIGNER_IDENTITY" --certificate-oidc-issuer "$RELEASE_SIGNER_ISSUER" "$repo/control@$control_digest" >/dev/null
# Seller bootstrap is a native binary, never a downloaded shell script.
(cd agent && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o "$out/jetseller-setup" ./cmd/jetseller-setup)
"$cosign" sign-blob --yes --bundle "$out/jetseller-setup.sigstore.json" "$out/jetseller-setup"
"$cosign" verify-blob --bundle "$out/jetseller-setup.sigstore.json" --certificate-identity "$RELEASE_SIGNER_IDENTITY" --certificate-oidc-issuer "$RELEASE_SIGNER_ISSUER" "$out/jetseller-setup" >/dev/null
sha256sum "$out/jetseller-setup" > "$out/jetseller-setup.sha256"
printf '%s\n' "$sha" > "$out/source-sha"
echo 'Candidate archives signed and verified; TUF publication, independent verification receipt and HTTPS upload remain separately approved steps'
