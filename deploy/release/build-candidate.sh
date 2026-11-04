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
 docker image inspect "$repo/$role@$digest" --format '{{.Id}}' > "$out/$role-config-digest"
 printf '%s\n' "$repo/$role@$digest" > "$out/$role-image"
 docker save "$image" | gzip -n > "$out/artifacts/$role.tar.gz"
 "$cosign" sign-blob --yes --bundle "$out/artifacts/$role.bundle.json" "$out/artifacts/$role.tar.gz"
 "$cosign" verify-blob --bundle "$out/artifacts/$role.bundle.json" --certificate-identity "${RELEASE_SIGNER_IDENTITY:?approved identity required}" --certificate-oidc-issuer "${RELEASE_SIGNER_ISSUER:?approved issuer required}" "$out/artifacts/$role.tar.gz" >/dev/null
 done
printf '%s\n' "$sha" > "$out/source-sha"
echo 'Candidate archives signed and verified; TUF publication, independent verification receipt and HTTPS upload remain separately approved steps'
