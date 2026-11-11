#!/usr/bin/env bash
# Hosted Ubuntu runners: retain signed suites/keys, use one official HTTPS mirror.
set -Eeuo pipefail
python3 - "${1:-/etc/apt}" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1])
files=[root/'sources.list',*root.glob('sources.list.d/*.list'),*root.glob('sources.list.d/*.sources'),*root.glob('apt-mirrors*.txt')]
for source in files:
    if not source.is_file():continue
    before=source.read_text()
    after=re.sub(r'https?://(?:(?:azure\.)?archive|security)\.ubuntu\.com/ubuntu(?=[/\s]|$)','https://nl.archive.ubuntu.com/ubuntu',before)
    if before!=after:source.write_text(after)
(root/'apt.conf.d/99-xobject-ci-network').write_text('Acquire::Retries "1";\nAcquire::http::Timeout "15";\nAcquire::https::Timeout "15";\nAPT::Update::Error-Mode "any";\n')
PY
