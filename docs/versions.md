# Documentation versions

The current documentation describes unreleased xObject development. No stable application release or archived release documentation is published yet.

The selected canonical documentation origin is **https://docs.xobject.org**. Current documentation uses its root; a released snapshot uses `/versions/<version>/`. Building a snapshot uses `XOBJECT_DOCS_VERSION=<version>` and the corresponding source ref. The source generator and Starlight build rewrite internal links to that base, so a snapshot stays within its own version. Changelog and roadmap come from their canonical repository files rather than manually maintained copies.

A release must retain its documentation archive with its image/source/installation artifacts. Only published, supported snapshots belong in public version navigation. Preparing a local snapshot does not publish it or declare a supported release.
