# ADR 0039: Bounded permission queries and safe creation retries

- Status: Accepted; Community 1.4.0 release scope
- Date: 2026-11-12

## Context

The ownership model in ADR 0027 remains the business contract. Loading every
sensitive record's policy for each request makes even individual reads grow with
the entire object table. API/MCP clients can also lose a successful creation
response and accidentally create a second record when repeating their request.

## Decision

Retain PostgreSQL, typed dynamic tables, the modular application and one shared
transactional writer for web, API and MCP. `Application.execute` retains locking,
authentication and authorization. Definition lifecycle/configuration, module
installation and record creation have separate services using that same
transaction and Journal writer. The frontend relationship draft owns its
baseline, staged edges and staged attributes together.

List predicates and field masking resolve current access in SQL before filtering,
counting, sorting and paging. The SQL resolver uses the current transaction's
membership/foreign graph. Recursive states consist only of principal, finite
access rank and confidentiality/traversal flags; `UNION` bounds cycles without
enumerating unbounded paths. Direct ownership precedes group ownership, public
access and foreign access. Personal/confidential behavior, inherited grades,
record maxima and object/field ceilings retain ADR 0027 semantics.

Single-record capabilities and explanations load policies by requested identity
and use the existing finite contract resolver. Security graphs and metadata are
reused only inside the application transaction. Security writes clear those
values; no authorization cache survives a request. Contract-resolver comparisons
and the existing negative projection/revocation tests validate both paths.

`create_record` accepts an optional user-scoped UUID `requestId`. Technical
receipts contain the canonical input hash, object/record identities and a
seven-day expiry. A transaction-scoped lock serializes concurrent uses of one
user/key. Receipt, record, number, links and Journal commit or roll back together.
An identical retry returns the current permitted record. Different input returns
`creation_request_conflict`; revoked access cannot replay a cached response.
The current expired key is removed under its request lock before bounded
cleanup batches use `FOR UPDATE SKIP LOCKED` for unrelated receipts. A held
receipt cannot block unrelated creation; skipped expired receipts are eligible
for later cleanup. The web creation draft retains one key. Other writes
keep their existing optimistic-version semantics.

The current installation includes the receipt table. Exact supported released
predecessors install it in the stopped-writer upgrade, with runtime grants and
the target fingerprint. Upgrade handling stays outside normal runtime logic.

Use explicit stable domain error codes for client behavior and translation.
Human-readable diagnostic text may change independently of those codes.

## Consequences

- Individual reads no longer transfer policies for unrelated records.
- List authorization remains server-side and precedes aggregation/pagination.
- Large scans still have a cost. SQL plans and realistic membership graphs need
  continued measurement; this decision does not establish a production SLA.
- Creation receipts add bounded technical state, not business Journal entries.
- Retry safety expires after seven days and requires identical input. Clients
  must inspect uncertain outcomes when no valid retry key is available.
- The existing broad model/workspace locks remain. Narrower locks require a
  separate measured need and integrity/concurrency acceptance.

## Alternatives

Cross-request access caches introduce revocation complexity. Full-table UUID
arrays move filtering work into application memory and grow request cost. A new
database, microservices or a complete rewrite would add migration and parity risk
without solving a demonstrated requirement better than these targeted changes.
