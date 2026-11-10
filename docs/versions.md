# Documentation versions

The current documentation describes xObject 1.0.1 and subsequent development. Released snapshots are retained at [1.0.1](https://docs.xobject.org/versions/1.0.1/) and [1.0.0](https://docs.xobject.org/versions/1.0.0/).

The selected canonical documentation origin is **https://docs.xobject.org**. Current documentation uses its root; a released snapshot uses `/versions/<version>/`. Building a snapshot uses `XOBJECT_DOCS_VERSION=<version>` and the corresponding source ref. The source generator and Starlight build rewrite internal links to that base, so a snapshot stays within its own version. Changelog and roadmap come from their canonical repository files rather than manually maintained copies.

A release must retain its documentation archive with its image/source/installation artifacts. Only published, supported snapshots belong in public version navigation. Preparing a local snapshot does not publish it or declare a supported release.
