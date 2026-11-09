# Prepare and publish a release

A release is a reviewed source revision with matching immutable images, installer, documentation and recovery evidence. Version 1.0.0 is the first stable baseline. Version 1 is entirely Community under AGPL-3.0-only, maintained by Jürgen Schadek personally under ITextreme.

## Prepare an unpublished candidate

Complete scoped checks and [quality acceptance](quality-acceptance.md), resolve release blockers and reconcile the PRD, roadmap, changelog, ADRs and user/operator guides. Prepare artifacts from a clean checkout of the reviewed commit; commit all intended public source before running the preparer. Actual OpenAI client/model acceptance, supported-host validation and public TLS verification must be evidenced rather than inferred from local SDK/container checks.

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

The packaging command builds current and version-based documentation, copies the operator package, archives public source and the built product website and generates `candidate.json` plus `SHA256SUMS`. Its default version is `0.0.0-unreleased`. The manifest records the exact commit and SHA-256 hashes of the committed source. Source selection uses an explicit set of public directories/root files and additional private-file exclusions; untracked files never enter the archive. Tracked changes and untracked public source are rejected before artifacts or builds are created. Installer, documentation and website builds use that same clean checkout. Private runtime files, environment files (including restore copies and upgrade temporaries), dependencies, build directories and database archives are excluded; the two supplied environment examples remain included. Review archive contents before any upload. Installer archives preserve the repository paths; extract and run `scripts/xobject` from the extracted root.

Build and retain the corresponding local image separately:

```sh
docker build --build-arg RELEASE_VERSION=0.0.0-unreleased -t xobject:local-acceptance .
node scripts/test-selfhost.mjs
```

For private offline recovery, retain an image archive with `docker image save xobject:local-acceptance | gzip > xobject-local-image.tar.gz` and record its SHA-256. Load it with `docker image load` before using the installer. Local image identifiers are not published registry digests. A local candidate is not a user-facing release. Versions 1.0.0 and 1.0.1 share the complete schema/catalog/auth fingerprint: upgrading requires backup, stopped writers and target/integrity verification, with no SQL conversion. The native image workflow checks both fresh installation and upgrade from the immutable 1.0.0 image, retaining record values, versions and journal. Unknown schemas fail closed. Future schema-changing releases require dedicated supported-source migrations; the runtime serves only the target model.

## Publish after explicit authorization

1. Select the semantic version and reviewed release notes; move the agreed changelog scope under that version/date and update versioned package metadata together.
2. Finish required client/accessibility/platform acceptance. Commit, push intended refs separately to GitHub and Forgejo, open/review the PR, require green CI and merge. Verify both remote refs independently.
3. Run the manually dispatched `Release images` workflow on the accepted `main` commit. It builds and tests Linux/AMD64 and Linux/ARM64 natively before publishing the multi-platform reference to `ghcr.io/itextremede/xobject`. Verify anonymous pulling and package visibility before publishing downloads. Build images from the exact release commit for the supported architectures. Run installation, backup/restore and upgrade acceptance on the final image. Publish reviewed immutable images and retain their digests with the corresponding public source revision.
4. Create the version tag and release assets: source, installer, checksums, image digests and migration/recovery instructions. Verify downloaded hashes and source availability, including the source of network-served AGPL modifications.
5. Build documentation from that tag under its version path. Preserve earlier released snapshots. Publish current documentation, changelog/roadmap and website links through the selected Caddy deployment; verify all public origins and search assets live.
6. Record release/runtime evidence and the operational completion in OpenProject. Git platform metadata such as issues and releases requires its own backup; mirroring Git refs alone does not copy it.

Publication credentials, registry ownership, domains, public contact/privacy statements and deployment targets must be verified at that step. The local preparer never tags, commits, pushes, uploads, changes DNS, starts public TLS or publishes a release.

## Recover an installation

Stop writers and retain the failed target's logs without secrets. Restore a verified database/configuration backup using its matching application image and the [operator procedure](self-hosting.md). Verify integrity before serving traffic. Application source never falls back to an old schema. Retain the failed candidate and recovery evidence until review is complete.
