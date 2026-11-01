# 05 — Rename/private repository readiness

Verdict: NOT READY; no rename or visibility changes performed. Authenticated GitHub reports Assyauq26/Gheverhan PUBLIC and viewer ADMIN. Target Assyauq26/JetSeller availability NOT VERIFIED.

| Dependency | Evidence / gate |
|---|---|
| Local Git/Codex | Current remote Assyauq26/Gheverhan; connector can read/create PR today. Private target GitHub App installation/reviewer access must be tested, not inferred |
| VPS source | Existing /opt/gheverhan path intentionally frozen; remote configuration/private fetch capability not inspected in this task |
| Static landing deploy | landing/jetseller/deploy/release-v3-from-vps.sh and RELEASE-V3.md use anonymous raw.githubusercontent.com/Assyauq26/Gheverhan URLs. BLOCKER for Private; replace via separately reviewed authenticated pinned artifacts/checksums and rehearse from VPS before visibility change |
| Release gate API | .github/scripts/gheverhan-final-release-gate.mjs hardcodes api.github.com/repos/Assyauq26/Gheverhan; production-read-only-preflight.yml also hardcodes old repo environment URL |
| GitHub variables/secrets | Names inventoried only: HELI_POD_AUTODEPLOY (observed disabled), HELI_POD_SSH_KNOWN_HOSTS; secret HELI_POD_DEPLOY_KEY_B64. Values/keys not changed or exported |
| Actions | PR CI supports Node22/disposable DB; private-account Actions entitlement, rulesets/environments/required checks/webhooks/deploy keys must be verified before rename/private |
| Runtime | Domain, JWT issuer/audience, env, DB, Docker/services, /opt/gheverhan and health app names stay unchanged through administrative rename |

Separate phase C proposal: freeze deploy concurrency → authorized git/refs backup → confirm target availability/repo ID → prove private artifact retrieval + rollback → owner approval → rename in Settings → update approved Git remotes/API/webhook integrations → verify GitHub/Codex/VPS/reviewers/CI → separate owner approval to Private → repeat access/health checks. Do not rely on redirects long-term. Existing forks/mirrors are not erased by Private.

All access/visibility gates remain pending; a frontend PR does not grant approval for administrative actions. Operational changes belong in a separate PR.
