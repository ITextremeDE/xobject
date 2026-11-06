# Prepare and publish a release

A release is a reviewed source revision with matching immutable images, installer, documentation and recovery evidence. The current repository is unreleased. Version 1 is entirely Community under AGPL-3.0-only, maintained by Jürgen Schadek personally under ITextreme.

## Prepare an unpublished candidate

Complete scoped checks and [quality acceptance](quality-acceptance.md), resolve release blockers and reconcile the PRD, roadmap, changelog, ADRs and user/operator guides. Actual OpenAI client/model acceptance, supported-host validation and public TLS verification must be evidenced rather than inferred from local SDK/container checks.

```sh
npm ci --prefix apps/docs
npm ci --prefix apps/site
npm run typecheck
npm test
npm run build
npm run check --prefix apps/docs
npm test --prefix apps/docs
npm run test:packaging
node scripts/prepare-release.mjs --output .local/release-candidate
```

The packaging command builds current and version-based documentation, copies the operator package, archives public source and the built product website and generates `candidate.json` plus `SHA256SUMS`. Its default version is `0.0.0-unreleased`. The manifest records the actual base commit, dirty state and source hashes, so a working-tree candidate cannot masquerade as a tagged release. Private runtime files, environment files, dependencies, build directories and database archives are excluded. Review archive contents before any upload. Installer archives preserve the repository paths; extract and run `scripts/xobject` from the extracted root.

Build and retain the corresponding local image separately:

```sh
docker build --build-arg RELEASE_VERSION=0.0.0-unreleased -t xobject:local-acceptance .
node scripts/test-selfhost.mjs
```

For private offline recovery, retain an image archive with `docker image save xobject:local-acceptance | gzip > xobject-local-image.tar.gz` and record its SHA-256. Load it with `docker image load` before using the installer. Local image identifiers are not published registry digests. A local candidate is not a user-facing release. The operator's same-target maintenance check and unknown-source refusal are available; the first release has no historical predecessor to migrate. Add and validate dedicated supported-source migrations when an actual released predecessor exists, keeping the runtime on the target schema only.

## Publish after explicit authorization

1. Select the semantic version and reviewed release notes; move the agreed changelog scope under that version/date and update versioned package metadata together.
2. Finish required client/accessibility/platform acceptance. Commit, push intended refs separately to GitHub and Forgejo, open/review the PR, require green CI and merge. Verify both remote refs independently.
3. Build images from the exact release commit for the supported architectures. Run installation, backup/restore and upgrade acceptance on the final image. Publish reviewed immutable images and retain their digests with the corresponding public source revision.
4. Create the version tag and release assets: source, installer, checksums, image digests and migration/recovery instructions. Verify downloaded hashes and source availability, including the source of network-served AGPL modifications.
5. Build documentation from that tag under its version path. Preserve earlier released snapshots. Publish current documentation, changelog/roadmap and website links through the selected Caddy deployment; verify all public origins and search assets live.
6. Record release/runtime evidence and the operational completion in OpenProject. Git platform metadata such as issues and releases requires its own backup; mirroring Git refs alone does not copy it.

Publication credentials, registry ownership, domains, public contact/privacy statements and deployment targets must be verified at that step. The local preparer never tags, commits, pushes, uploads, changes DNS, starts public TLS or publishes a release.

## Recover an installation

Stop writers and retain the failed target's logs without secrets. Restore a verified database/configuration backup using its matching application image and the [operator procedure](self-hosting.md). Verify integrity before serving traffic. Application source never falls back to an old schema. Retain the failed candidate and recovery evidence until review is complete.
