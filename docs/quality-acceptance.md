# Quality and acceptance evidence

This report describes the current unreleased candidate. Local evidence does not establish a published release, a production SLA or client/model compatibility.

## Permission and query performance

Run `npm run measure:permissions` from the repository root. The command creates and removes its own isolated PostgreSQL 18 container; it never loads the development database. Its local result is written under `.local/permission-performance.json`.

The measured profile contains 10,250 records across ten objects, including five custom sensitive objects, 20 nested groups, a foreign-owner group and 3,000 relationships. Sensitive records mix direct ownership, group ownership, foreign access, public access and denied Personal records; 80% are readable. Field exceptions remain applied. Each read scenario uses 48 requests with concurrency eight after three warmups; writes use 24 sequential optimistic-version updates with journals.

Initial targets were set before measurement. The accepted local run used Node.js 26.9.0 on macOS ARM64 and PostgreSQL 18 in Docker. Fastify HTTP injection includes session/authentication, database and application work; it excludes TLS and network latency.

| Scenario | p95 target | Measured p95 |
| --- | ---: | ---: |
| Object list | 750 ms | 140.4 ms |
| Workspace list | 750 ms | 301.4 ms |
| Global search | 750 ms | 231.7 ms |
| Dashboard | 1,500 ms | 281.0 ms |
| Record | 750 ms | 47.6 ms |
| Incident relationships | 1,000 ms | 247.7 ms |
| Versioned update and journal | 1,000 ms | 40.5 ms |

Equivalent record-level access explanations are reused only within the current object/transaction. Each row retains its own field policy; no cross-request authorization cache exists. Relationship inspection queries incident edges through existing endpoint indexes. All 163 backend tests passed after these changes. Production sizing still requires the actual host, latency, distribution and concurrency profile.

## Accessibility and responsive use

Use the existing shared shadcn primitives, associated form labels, visible keyboard focus, guarded dialogs, keyboard table navigation and command menu. The acceptance target is WCAG 2.2 AA for the supported workflows; an automated result is only one part of that assessment.

Local Playwright Chromium checks cover desktop 1440 × 1000 and mobile 390 × 844. OAuth consent/application revocation and documentation navigation/search were exercised without console errors or horizontal page overflow. Axe reported no serious/critical findings in the tested consent and documentation views. Documentation search corrects a pinned upstream accessible-name mismatch through Starlight's supported composition hook. Whole-product manual and assistive-technology acceptance remains a release gate, rather than being inferred from those focused checks.

## Installation and recovery

The [self-hosting guide](self-hosting.md) defines the current operator path. Isolated Linux/ARM64 container acceptance covers first setup, HTTP content/history, private checksummed backup, content mutation, stopped-writer restore, integrity verification, current-target maintenance and refusal/recovery for an unsupported source fingerprint. Node.js 24 is the image runtime. The same procedure also passes with the Linux/AMD64 application/operator image under emulation on the ARM64 Docker host, using native PostgreSQL 18. This is architecture/emulation evidence, not native AMD64-host acceptance. The separate Caddy loopback-HTTPS test passes with its local CA, canonical Host, secure cookies, spoofed-IP replacement, Origin rejection and HTTPS OAuth metadata. It reserves the fixed proxy address outside Docker’s dynamic pool. Live public TLS, the actual supported host and released-predecessor migrations remain separate delivery gates.

## Provider acceptance

The primary OpenAI path passed live acceptance on **2026-11-06** using **Codex CLI 0.158.0 and `gpt-6-astra`**, the existing ChatGPT account, xObject API `1.0.0` and official MCP SDK `2.4.0`. A preliminary `gpt-6-sol` run exercised discovery. Codex negotiated **2025-06-18** by default; a separate run with its opt-in `mcp_2026_07_28` feature exercised **2026-07-28** discovery and result envelopes. Both used local Streamable HTTP. This is evidence for those combinations, not every OpenAI model or client.

Fresh, ephemeral model runs used fictional data and the normal User, Designer and Administrator accounts. Application data was accessible only through MCP, without repository, SQL or direct-API assistance. The packaged-skill exercise additionally allowed reading only the installed plugin's canonical instruction files. Independent operator checks used application readback, credential metadata, journals and the web UI; model success messages alone were not acceptance evidence.

| Area | Observed outcome |
| --- | --- |
| Discovery and workflows | The model discovered current definitions/input aids, created a Contact person under one Organization, built Contact → Project → Case → Tasks chains in two workspaces, edited records and completed a Task through the configured status meaning, Progress and completion instant. Workspace-specific record numbers and distinct descriptions/Notes were retained. |
| Permissions | User reads omitted a restricted field and denied a Personal record; attempted field/definition writes failed without partial changes. Administrator reads included the retained values. Designer definition rights granted no content automatically; an explicit grant on the new test object enabled valid creation while its required-field failure left no partial row. |
| Credentials | Personal tokens, read-only denial and loss of access after actual expiry/revocation were exercised through live clients. OAuth used the actual Codex CIMD identity, browser sign-in/consent, callback/code exchange and automatic renewal. A model-driven OAuth write was independently matched to its user, Codex client and issued OAuth credential. |
| Concurrency | The model requested clarification for identical names. With an unambiguous record number, a deliberately concurrent write caused a version conflict; rereading and reconciliation preserved the reviewer's text and appended the requested note exactly once. |
| Lifecycle | An unsaved duplicate allocated no persisted copy. A saved duplicate passed recycle/restore/recycle; missing permanent-delete confirmation was rejected. Confirmed deletion retained full Administrator history and only a content-free notice for the formerly authorized User. The original remained unchanged. |
| Skills | All four workflows were read and used through permission-filtered MCP resources. The portable plugin was also installed locally; Foundation and Projects instructions matched their canonical hashes and were read from the installed package and used with MCP. This was separate from resource loading. |
| Independent checks | Record/relationship readback confirmed one direct Primary parent, preserved ancestors, completion fields in one journal change, current user/credential/channel provenance, rejected-write atomicity and valid installation integrity. The resulting Task rendered with its number, ownership, chain, Done status and 100% Progress without page errors; the OAuth consent flow also had no page errors. |

The test exposed two usability gaps, now corrected: `get_access_context` supplies the authenticated user's ID/name, and field-value schemas, tool descriptions, errors and Foundation guidance distinguish `values` technical-name keys from field/option/reference IDs. Four focused backend cases, contract generation/typechecking, application build and packaging checks cover these changes.

Native MCP Skills list/get/activation was **not exposed or negotiated** in the tested Codex paths, including the current-protocol run. Ordinary resources and installed plugin instructions worked; neither establishes native extension activation. ChatGPT app/cloud and Responses API integration, other providers, public TLS and the supported external deployment host were not exercised by this test. Whole-product accessibility and final release acceptance remain separate gates.

### Repeat the model exercise

1. Use a disposable fictional installation, activate the intended modules and prepare reviewed User/Designer/Administrator accounts with deliberate field/record restrictions. Complete normal first-password changes and issue short-lived user-bound MCP credentials or authorize OAuth. Retain client approval controls; explicitly authorize any automated fixture writes and the one disposable permanent-deletion target.
2. Start a fresh client conversation with MCP as its only business-data path. Ask it to discover the workspace and create an Organization-linked Project, Case and three Tasks with different descriptions/Notes, then complete one Task. Supply human-readable names/numbers rather than installation IDs. Exercise Contacts and model design with their actual schemas and configured rights.
3. Repeat the denial, requiredness, conflict and lifecycle cases above. Revoke/expire a credential after a successful call in the same running client. Check resource-based and packaged-skill loading independently; record unsupported client capabilities explicitly.
4. Independently compare records, relationships, versions and journals with the requested outcome. Record client/model/protocol/authentication and actual errors. Revoke test access and remove temporary client/plugin registrations; retain recoverable fixture evidence without changing unrelated data.

The broader SDK suite separately covers schema validation, PKCE/resource binding, scopes, token management and permission-aware Skills digests/direct-read denial. See [API and MCP](api.md) for connection and compatibility boundaries.

## Browser identity and live refresh — 2026-11-06

The local implementation in ADR 0036 was checked with repository type checking, server/web builds and targeted metadata/URL/merge/SSE-framing tests. Real disposable-PostgreSQL scenarios verify commit-only deduplicated signals, rollback after queued NOTIFY, API/MCP journal parity, existing record/classification/localization/security rollback guards, hidden-record filtering, retained-reference access-loss invalidation and stream closure on session revocation. Additional server checks cover generic metadata/manifest, deep routes, cookie-only live access, cross-origin rejection and watch-list bounds. The supplied pinned Caddy configuration validates with SSE excluded from compression.

An isolated Chromium context verified a clean form adopting an external API change without navigation/reload, an unsaved local keyword surviving a concurrent write, explicit draft/latest conflict review and normal saving of the reviewed draft. The saved test record was restored to its original keyword. Desktop (1440×1000) and mobile (390×844) screenshots showed no horizontal overflow or browser errors. Offline/focus, a simulated background HTTP 500 for both record/session refresh and a successful retry retained the unsaved draft. Other checks verified all favicon/install/share assets, generic private HTML, parsed manifest with no Chromium installability errors, current light/dark theme color, offline/reconnect status and an explicit app-update reload. No public reading was enabled.

Actual operating-system app installation, native share destinations, external preview-crawler caches and Safari/Firefox/other-device acceptance were not exercised. The browser checks used local Chromium on loopback; they are not a public deployment or cross-platform acceptance claim. Stream bounds and the one-minute fixed safety resynchronization are documented in ADR 0036.

## Selection trees and shared choice dialogs — 2026-11-06

Four shared tree-helper scenarios verify ancestor closure, independent branches, descendant removal, hierarchy validation, activation, sibling ordering and display order independently of canonical UUID storage. Five targeted disposable-PostgreSQL scenarios cover object and relationship-owned tree fields, API/MCP writes, safe/unsafe conversions, Category defaults/ancestor propagation, record/edge/endpoint versions, history, journal rollback and existing both-endpoint attribute permissions. The existing complete demo fixture scenario passes with all new hierarchy definitions and layouts. Root type checking, generated API-contract checks and server/web builds pass.

Desktop and mobile browser checks exercise searchable tree selection by keyboard, automatic ancestor checkboxes, parent-only selection, descendant deselection, Apply/Save, Cancel preservation, general tree fields independent of Category and the flat multiple-choice list. An additional concurrency check retains a changed dialog selection through an external API edit, applies it with the save shortcut, merges the independent remote edit and saves both. Unchanged selections cannot be submitted. Settled dialog screenshots show no horizontal overflow at 1440×1000 and 390×844; no browser page errors were observed. These are local Chromium checks, not a cross-platform accessibility certification.

The disposable local database was recreated from the current schema after retaining a private pre-change database/account-fixture snapshot. All three scenarios contain single/multiple/tree Category and one independent general tree field; schema fingerprint/readback passes. The restored Administrator identity uses the existing locally selected credentials; generated fictional accounts retain the normal first-password-change policy. No release, push or public deployment occurred.

## URL-field navigation — 2026-11-06

The shared URL input is used by general URL fields and structured Contact websites. Focused validation checks HTTP(S) URLs and rejects empty, malformed, relative and non-web schemes. Web type checking/build pass. A Chrome check on a fictional Workshop tools record verified the native anchor's target/rel attributes and an actual second tab at the configured example URL, preserving the original record page. This was a local UI check; it did not change stored data.

## Stable live-update navigation — 2026-11-06

The shared live-update hook delays connecting notices by 1.5 seconds and scopes the pending notice to the current workspace. Normal visible-record subscription renewals no longer insert/remove a banner during navigation. Offline feedback remains immediate. Web type checking/build and a Chrome check across Tasks, Projects and Dashboard passed without the transient notice. Tab-scoped network emulation verified immediate offline feedback, a visible notice during a deliberately slow reconnect and automatic removal after recovery; normal network conditions were restored afterward.

## V1 audit corrections and rendered regression — 2026-11-06

Synthetic-secret packaging checks now inspect actual commit-bound source archives and exported Docker contexts. Both public environment examples remain included; generated recovery/environment files remain excluded even if accidentally tracked. Operator fixtures verify the private pre-restore configuration, restrictive permissions and atomic upgrade replacement without loading real configuration. Uncommitted public source is refused before release artifacts/builds start. At that local checkpoint the source was uncommitted and was not packaged as a release candidate.

Twelve focused session/personal-token/OAuth/password cases pass after the shared transactional request-context check. Two deterministic PostgreSQL scenarios observe a real lock wait, commit session revocation or pass wall-clock expiry, then release the queued request. It returns 401 without changing record contents, optimistic version or journal; ownership/malformed context/internal calls are also covered.

Two API/MCP classification-filter scenarios cover OR within a field, AND between fields, empty values, single/multiple/tree Category, parent versus leaf filters, inactive choices, search, counts/pagination and both global/per-record field restrictions. The current Web logic/rendering suite passes 141 tests. Root type checking, API generation/check and production builds pass.

The separate `npm run test:browser` command passes seven real Chromium scenarios (eight Node test entries including the parent). A fresh current PostgreSQL installation uses ordinary Administrator/User/Designer accounts and initial-password onboarding. It exercises Save/discard/readback, nested-dialog focus/command search, filter combinations and list return URLs, workspace/system-theme/portal previews, restricted-user and Designer workflows, and mobile 390×844 settings/record/field editing. The fixture and all sessions are disposed; development data and personal browser profiles remain untouched. The integrated baseline subsequently passed [PR CI](https://github.com/ITextremeDE/xobject/actions/runs/42263595464) and [merge CI](https://github.com/ITextremeDE/xobject/actions/runs/42264895106) at `32e1c7e`, including 177 backend tests, 141 Web tests, the seven Chromium scenarios, packaging, documentation and fresh container/restore/HTTPS checks. Those runs establish that baseline, not later working-tree changes. These focused scenarios supplement, rather than complete, assistive-technology and cross-browser acceptance.

## V1 path performance and targeted query corrections

Run `npm run measure:v1-paths` for this separate current-installation profile. The measured local environment is Node.js 26.9.0 on macOS/ARM64 with disposable PostgreSQL 18. There are 10,000 records, 1,000 Primary edges across ten Projects, 10,000 field-journal events on one visible record and 32 eligible active accounts; 5% of custom records are denied Personal records. Complete scenarios use 24 measured calls and eight concurrent readers after preflight/warmup. HTTP injection exercises real authentication/application paths without network or TLS latency.

Targets were fixed before the baseline: tree branch and record journal p95 at most 1,000 ms, Access-principals selection at most 750 ms. The same fixture and targets were used after the corrections.

| Read path | Baseline | After correction | Fixed target |
| --- | --- | --- | --- |
| Primary tree branch | One preflight: 9,844.1 ms; concurrent repetition skipped, no p95 estimate | Preflight 57.3 ms; p95 201.0 ms | p95 ≤ 1,000 ms |
| Record journal | p95 368.1 ms | p95 379.5 ms | p95 ≤ 1,000 ms |
| Access-principals selection | p95 3,563.2 ms | p95 160.1 ms | p95 ≤ 750 ms |

The tree reads only the requested ancestor path, direct children and visible page-local descendant existence, using existing endpoint indexes and grouped record projections. Locale-aware numeric sorting still precedes paging. Selection reuses the exact administrative object-ceiling resolver without rebuilding every existing record policy for every candidate account. No schema, permission rule, cross-request cache or advisory-lock strategy changed. Journal queries already met their target and were retained.

Eight focused tree/relation cases and four principal-selection/permission cases pass. Coverage includes unrelated graph growth, hidden/recycled children, no hidden `hasChildren` signal, inactive definitions, numeric sorting/paging, ancestor bounds/cycles and direct/group/Create/denial/availability/Administrator eligibility. A 120-edge unrelated graph increases neither the branch's returned edge-row volume nor its query count; this is a bounded regression fixture, not an unlimited scaling claim.

Single-record transport p95 observations are cookie HTTP 160.4 ms, cookie MCP 170.1 ms, one shared personal-token MCP 580.8 ms and one shared OAuth-token MCP 328.4 ms. MCP uses the official client and actual local authentication; OAuth follows authorization, consent, PKCE and token exchange. These observations have no transport SLA. Controlled workspace/model advisory barriers hold four readers for about 204 ms; the batches finish after 317.6/321.6 ms respectively. The barrier measurement is synthetic and does not establish the duration of real business mutations or justify a lock-strategy change.

The command removes its own container and writes `.local/v1-path-performance.json`; the baseline was retained separately before rerunning. This profile has no deleted-identity history, large relationship-journal history, external model, TLS/network latency, native AMD64 or supported-host evidence. Functional history/lifecycle tests cover the corresponding semantics separately; production sizing and whole-product release acceptance remain distinct.

## Expanded V1 product acceptance — 2026-11-06

This local acceptance block extends the integrated `32e1c7e` baseline; it does not certify a release. The browser harness creates a current empty PostgreSQL installation, performs normal account/password onboarding and activates both V1 modules. Administrator, Designer and User contexts retain their own normally authenticated sessions. Development contents and personal browser profiles are not used or reset.

The suite now contains ten functional scenarios (eleven Node test entries including the parent). Besides the existing seven, it exercises all five supplied objects and all three Contact kinds as an ordinary User, edits Project/Case/Task Keywords with independent API readback, inspects Journal/Dossier/Tree and checks the complete derived Primary chain. It duplicates a record into an editable unsaved draft, saves the copy, recycles/restores it through the UI and verifies the original remains unchanged. A controlled plain-text HTTP 429 response verifies localized retry guidance. The workspace/theme scenario visits all 15 settings sections in both Light and Dark.

Automated accessibility uses the pinned Axe integration's WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags. All collected violations fail the parent test; vendor nodes and rules are not excluded. Screenshots, raw violations, failure traces and scenario/filter identity remain local under `.local/browser-acceptance/`. Passing this subset of automated rules is not WCAG conformance or assistive-technology acceptance.

Confirmed corrections from rendered evidence:

- Search/security inputs no longer carry `aria-expanded` without a supporting role. Record icons use named image semantics; User/workspace/tree names reflect their visible contents. Contact submenu controls provide 24-pixel target width.
- Keyboard hints and avatar initials use readable foreground tokens on muted surfaces. Error descriptions retain the full destructive color instead of reduced opacity. Destructive buttons use readable foreground text with the destructive icon and background tint. These are intentional accessibility changes to the copied component recipes, rather than unexplained theme overrides.
- Non-JSON error responses preserve their HTTP status. Both inline login errors and shared feedback explain rate limiting in English/German, rather than reporting it as a network failure.
- Fresh supplied templates reserve Primary before Classification. Eight focused module/template regressions verify gating, module combinations, common identities, additive updates and preservation of authored forms. An older ADR sentence now places Task Priority before Progress in Schedule, matching the existing implementation.

### Current local results

- Chromium: all ten functional scenarios and the parent pass (eleven test entries); no Axe violations across checked views. The fresh-installation run is identified locally by `2026-11-06T18-56-03-824Z`.
- WebKit: all ten functional scenarios pass without uncaught browser errors in the final stable-asset run (`2026-11-06T18-54-20-729Z`). The parent fails because Axe reports `aria-command-name` on upstream dialog focus guards in 33 checked views; it is not an accessibility pass.
- Root type checking/generated-contract drift check, 142 Web tests, eight focused backend module/template cases and server/Web builds pass.
- Documentation: zero check errors/warnings; 58 generated pages and 5,307 local links/assets/anchors validated; the documentation source test passes.
- The local development server runs the rebuilt assets/backend and passes its health check; its business data was preserved.

### Acceptance map and remaining boundaries

| PRD section 11 area | Evidence used | Remaining boundary |
| --- | --- | --- |
| Object core | Integrated API/MCP/backend baseline; browser Save/discard, Designer field creation and API readback | Browser coverage is representative, not every possible custom field combination. |
| Permissions | Three browser roles, restricted-field omission/read-only views; integrated resolver/session regressions and prior live MCP denial cases | Real screenreader use of the rights editors remains unchecked. |
| Contacts | Three Contact-kind forms, Organization linkage, Distribution-list form; existing domain-profile/backend and live MCP evidence | This block does not repeat every contact codec, Identities or exchange case. Exchange is later scope. |
| Project context | Actual Contact → Project → Case → Task, derived-chain readback and all record tabs; existing relationship/history/performance regressions | Not every parent-change permutation is repeated in the browser. |
| Modules/forms | Fresh combined browser installation; eight focused backend module/template scenarios | No released-predecessor upgrade is claimed. |
| Lifecycle | Browser duplicate/save/recycle/restore and unchanged-original check; integrated permanent-deletion/history tests and prior live MCP case | Permanent deletion is not newly exercised through the browser in this block. |
| MCP | Existing dated live Codex/model acceptance above, reused without another paid model run | Other providers/client surfaces/native Skills activation remain untested. |
| Self-hosting | Existing isolated Linux container, backup/restore and Caddy acceptance above | Separate supported external Linux-host/public-TLS acceptance and publication remain pending. |

Local Firefox launch fails before application navigation with macOS sandbox-extension denial and a compositor framebuffer error. The sandbox remains enabled. The Linux Chromium/Firefox CI matrix preserves the existing Chromium check identity and gives each engine separate failure artifacts. Both browser jobs passed on `77bb755` in the [first PR CI run](https://github.com/ITextremeDE/xobject/actions/runs/42333382594), each with ten functional scenarios/eleven Node test entries and no Axe findings in the checked views. That Linux evidence complements the local macOS results; it does not establish native Safari/VoiceOver or real-device acceptance.

Playwright WebKit identifies unnamed Base UI FocusGuard buttons in dialog focus management. The installed upstream implementation intentionally exposes those guards to WebKit/VoiceOver. A clean automated accessibility verdict cannot be issued for those views; retain the findings and perform actual VoiceOver/Safari testing before choosing an upstream report or application change. Do not hide the guards or disable the rule solely to make the report green. Earlier WebKit session-refresh errors did not recur in the final full stable-asset run. A separate run overlapped a Web asset rebuild and is excluded as invalid functional evidence. This does not establish native Safari behavior.

Desktop Chromium and a 390 × 844 viewport are tested; actual mobile devices, operating-system installation, native Safari, VoiceOver and broader manual keyboard/screenreader exploration remain release gates. This block records partial whole-product acceptance, not a completed V1 release decision.

## Native Safari validation and focused corrections — 2026-11-09

Actual Safari 27.2 (22625.2.8.11.9) on macOS 27.2 was exercised through Apple's safaridriver MCP and the native macOS application interface, using the existing fictional Demo workspace and ordinary Administrator sign-in. All 15 desktop settings sections loaded. Seven supplied record profiles (three Contact kinds, Projects, Cases, Tasks and Distribution lists) plus one custom record were inspected through Details, Tree, Dossier and Journal: 32 tab views. This was sampled read/UI acceptance, not another complete write/lifecycle or User/Designer permission assessment. Selected desktop screenshots, dark rendering and a narrow custom-record view were inspected. Actual CSS viewports were 1440 × 835 and 390 × 679; this does not establish iPhone hardware behavior.

Twenty-four forward Tab steps stayed within Settings and did not settle on a focus guard; Escape returned focus to the header user trigger. A selection-tree draft was changed and cancelled, preserving its original values and leaving Save disabled. A keyboard-opened picker returned focus to its invoking control on Escape. That specific check initially placed focus on the observed trigger programmatically; it does not establish every control's Tab reachability. System appearance was restored after testing Dark. No record/definition Save or lifecycle operation was submitted in the development database.

The native run identified two shared application defects, now corrected:

- New-record browser titles used the missing `createRecord` translation. BrowserPresence now uses the same existing `newRecord` label as the form, including its German translation. A targeted Safari replay verified `Create record · Demo · xObject` on an unsaved Project draft.
- The shared multiple-value trigger's accessible name omitted its visible selected values. MultiValueSelect now uses the same displayed selection/empty text in its accessible name, prefixed by the field label. This applies to every caller rather than one demo field. Safari verified the populated user/group reference's visible names were included. Pinned Axe 4.14.0 reported no A/AA violations in that targeted populated custom-record view; incomplete contrast/multiple-label checks remain manual-review items.

The isolated Chromium lifecycle regression now contains a populated multiple user/group-reference field and checks both the new-draft browser title and the trigger's accessible name, with an additional draft-view Axe audit. The focused scenario and parent passed; all 142 Web tests, root type/API checks and the Web build passed. The local server was rebuilt/restarted with preserved data. No schema or permission change was needed.

A `target-size` flag in four populated Dossiers was investigated rather than treated as a required style change. Axe measured the 16 × 16 Checkbox border box. The unchanged shadcn recipe enlarges the hit area with `::after`; settled Safari hit testing found a roughly 35 × 30 effective span, with every point in a centered 24 × 24 square reaching the checkbox. A real click outside the visual border selected three rows, and a second cleared them. The manufacturer recipe remains unchanged; the raw findings and hit-area proof were retained.

VoiceOver was enabled through System Settings, its first-run welcome handled and native Safari AX inspected. Spoken feedback and virtual-cursor position were not reliably observable through the initial control interface. The original VoiceOver-off state was restored and verified. The initial unnamed Base UI focus-guard findings were retained for the direct assistive-technology follow-up below; no rule/node suppressions or upstream patches were introduced.

Narrow Settings Profile rendered, but the Safari MCP native-select interaction later blocked the automation channel. Narrow section selection/nested-field-dialog acceptance was unvalidated by that initial run, rather than a confirmed application defect; the native follow-up below covers those interactions. The automation sessions were ended; the ordinary native test session was signed out and its own tab closed while preserving the user's original tab. Remote automation was initially retained for the follow-up; its final rollback is recorded below. Real-device, OS-installation and external-host/TLS gates remain separate.

## Direct VoiceOver and narrow Safari follow-up — 2026-11-09

Native Safari Responsive Design at 390 × 877 CSS pixels verified Settings section selection from Profile to Workspace / Object types, opening Access checks / Expected result field attributes and the nested dialog's contained, scrollable layout with reachable footer controls. Escape returned focus to the invoking field. No definition was edited or saved. This is a narrow desktop-browser viewport, not mobile-device acceptance.

The actual macOS VoiceOver process was then exercised through Apple's native scripting interface, with explicit temporary authorization. Each traversal kept Safari in the foreground while recording the real VoiceOver cursor text and last spoken phrase. This avoided focus changes to the controlling application between individual commands. The user separately confirmed audible Safari sign-in and understandable Settings dialog/navigation announcements; these observations are distinct from the scripted transcripts.

- Settings / Profile: 55 forward cursor steps traversed navigation, form contents and footer controls, then remained at the final named Close button. No unnamed focus-guard button or underlying Dashboard content was encountered.
- Settings / Language & region: 90 backward cursor steps from Date format traversed the dialog and stopped at its named heading. No unnamed button or underlying Dashboard content was encountered.
- Date format: ordinary Down/Up navigation announced all five options and the inherited option's selected state. Additional VoiceOver interaction inside the list, with 14 forward and 14 backward cursor steps, reached both list boundaries and remained on the final/first option. No unnamed focus-guard button or content behind the list was encountered. Escape announced the original Date format combobox and unchanged inherited value.
- Escape from Settings announced the invoking John Doe user-menu trigger. Reset and Save remained disabled before closing; no preference was persisted.

These checks pass the targeted open questions about option announcements, selected-state feedback, virtual-cursor containment and focus-guard traversal for these dialog/list instances. The raw automated WebKit focus-guard findings remain available; the direct checks do not justify changing upstream guards or suppressing automated rules. They are not a whole-product VoiceOver/WCAG certification: other control families, rights editors, all custom form combinations and actual mobile assistive technology are outside this follow-up.

Raw cursor/phrase transcripts and reproducible scripts are retained as ignored local acceptance artifacts. The temporary VoiceOver AppleScript permission was restored to disabled and VoiceOver to off, with native readback. Subsequent requested Mac cleanup also restored Safari remote automation to disabled, verified the temporary Accessibility Keyboard and other keyboard aids were off, and closed the test utility windows. The ordinary demo session was signed out and only the test window closed. Application data, preferences, schema and component recipes were unchanged.
