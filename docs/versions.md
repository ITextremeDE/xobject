# Documentation versions

The current documentation describes xObject 1.0.2 and subsequent development. Released snapshots are retained at [1.0.2](https://docs.xobject.org/versions/1.0.2/), [1.0.1](https://docs.xobject.org/versions/1.0.1/) and [1.0.0](https://docs.xobject.org/versions/1.0.0/).

The selected canonical documentation origin is **https://docs.xobject.org**. Current documentation uses its root; a released snapshot uses `/versions/<version>/`. Building a snapshot uses `XOBJECT_DOCS_VERSION=<version>` and the corresponding source ref. The source generator and Starlight build rewrite internal links to that base, so a snapshot stays within its own version. Changelog and roadmap come from their canonical repository files rather than manually maintained copies.

A release must retain its documentation archive with its image/source/installation artifacts. Only published, supported snapshots belong in public version navigation. Preparing a local snapshot does not publish it or declare a supported release.

Explicit absolute links to other published stable snapshots address separately deployed release artifacts. The local build checker validates the current build’s internal pages/assets/anchors and version isolation; it does not claim to validate those remote snapshots. Verify their published targets separately during documentation publication.

The current site shows **Current development** on each page. Its version picker opens the selected documentation start page; exact page paths may differ between versions. Newly built snapshots show their version context. Already published snapshots retain their original interface and sources, including any older navigation.
