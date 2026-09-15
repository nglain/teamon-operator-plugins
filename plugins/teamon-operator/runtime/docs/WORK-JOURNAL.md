# Operator work journal — 0.2.12-rc.1

Release candidate built from current Operator source. Installation and live
company acceptance are separate checkpoints; this document does not assert them.
The local journal is operator-owned durable work history, not the proposed
company-owned synchronized journal. It neither replaces OperationStore nor
imports user history, company credentials or native agent traces.

## Available contracts

| Tool | Function |
| --- | --- |
| journal_case_open | Create/recover case by company + request_id; conflicting payload rejected |
| journal_case_update | Revision-bound status, next step, conclusion; closing requires a conclusion |
| journal_observation_write | Versioned observation with case event references, subject, behavior, cause status, review and assistance |
| journal_note | Explicitly reported work outside instrumentation; source reference, not proof of execution |
| journal_read | Paginated cases, event timeline or descriptive reviewed-sample groups |

Scoped existing MCP tools accept optional `case_id`. Registration wraps calls
automatically: start, returned result or failure. Without a case events are still
company-scoped and visible through the unfiltered timeline. Exact previously
returned operation/consultation IDs can resume a unique case; ambiguity does not
pick one. A case ID from another company is rejected before execution.

The metadata `_meta.operator_journal` reports local event ID and recorded /
incomplete / unavailable. It is not a native result or delivery status. A native
error still propagates; the journal never retries it. Tool output schema is
validated inside the instrumented boundary before logging a returned result.
Login/setup/company discovery are excluded; account challenges and keys must
never be journal payloads. Arbitrary arguments, responses, prompts and raw errors
are not copied. Only bounded reference fields are selected.

## Ownership and authorization

MCP uses the currently configured Operator principal. Company access is checked
after refreshing the current account binding; the caller supplies no actor field.
SQLite files are per principal, company queries are scoped, and evidence IDs
must belong to the same case. This is not fine-grained company participant ACL:
the store contains the operator's safe local records, not native document bodies.
Each event states the configured principal and local provenance. Only a native
receipt can establish native execution identity. Published identity is unknown
unless independently sourced; a bot name is never inferred as the author.

Entries written via these tools are attributed to the operator's assistant.
`supported` is an attributed review claim; independent review is not established.
An observation can evaluate an agent, operator, operator assistant, integration
or process. Its subject is not its author. A private agent consultation is
operator_delegated work and is not counted as unassisted success.

Raw notes are consciously supplied text. Do not put secrets in notes or refs;
this interface does not promise reliable detection of arbitrary secrets pasted
by a caller. Company logs/private source texts belong in their native store.

## Storage and recovery

`STATE_ROOT/work-journal/SHA256(PRINCIPAL).sqlite`, mode 0600 under a 0700 directory.
Tables: cases (current revision), observations (current revision), events
(append-only changes and tool boundaries). Observation/case writes and events
share one SQLite transaction. The current projection is rebuildable from events;
there is no user-facing event-edit/delete API. Database access is local and
trusted; append-only here is not a cryptographic tamper-proof audit claim.

Stable request IDs protect create/note/observation retries; revisions protect
concurrent updates. After an uncertain case update, read the current revision
and timeline rather than inventing a new operation. A process crash can leave
tool_started without a terminal event. That remains unresolved; no fabricated
finish event, native reconciliation worker or automatic retry is implemented.

If analytic append fails, the result gets incomplete metadata and the native
operation is not repeated. Existing native durable receipt requirements remain.
Journal startup or exact-link lookup failure without explicit case permits the original call with
unavailable metadata; explicit case work fails rather than silently using a
different case. SQLite busy timeout is bounded. No company outbox transport,
sync acknowledgements, retention job or cross-device continuation is shipped.

## Descriptive groups

Current observation revisions only; aggregation runs in SQLite rather than loading
all observation text into process memory. `patterns` groups supported observations by
subject, assistance and category, counting unique cases. Denominator is cases
with observations, including proposed/rejected/insufficient ones. Groups can
overlap. These are operator-selected samples, not all agent turns and not an
autonomous success rate. Automatic causal discovery and lesson promotion are
not implemented. No test, model quality score or human acceptance is inferred
from a closed case.

## Local CLI

`node src/journal-cli.mjs ROOT LOCAL_OWNER COMPANY ACTION [INPUT_JSON]`

Actions: open, update, observe, note, read, list, patterns. JSON goes in a file;
do not interpolate raw text or keys through shell arguments. LOCAL_OWNER is a
local profile, not authenticated server identity. CLI cannot perform remote
actions. The pilot uses it to record actual local work as external reports.

## Verification

`node --test test/work-journal.test.mjs`

Tests cover idempotency/conflicts, stale revisions, history, evidence scope,
owner separation/reopen, pagination, omission of raw sensitive payloads, unknown
effects/no retries, exact operation correlation, analytic write failures, and
an SDK client→MCP server→stub adapter round trip with existing tools preserved.
The round trip also exercises a broken journal lookup and malformed native output:
work is never repeated and invalid output is not recorded as a successful return.
Notes are transactional; event ownership fields cannot be overridden by payloads.
No real account, company write, native trace or external delivery is exercised.

## Next release slices

1. Live acceptance of the implemented receipt reader after authorized login.
   operation_inspect and consultation reads append native_receipt_observed after
   the Core adapter validates the source. No replay or extra network probe.
2. Add company-owned case/event ingestion and an acknowledged local outbox.
   Reuse Staff observations and Core-native ownership, not a second agent runtime.
3. Add exact response/context/attempt/effect readers and company/participant ACLs.
4. Independent review, verification artifacts, version comparisons and lessons
   through existing quality/release workflow. Separate diagnosis from cause proof.
5. Signed-off packaging, installed MCP migration and real scoped acceptance.

Do not deploy this checkout merely because local tests pass.

## Review checkpoint · 11 September 2026

11 journal tests passed. The separate private pilot adds 2 async UI regression
tests, alongside its 7 existing presentation tests. Case reopening fetches current
state; late responses and previous error messages cannot overwrite a new view.
Read coverage explicitly includes instrumented MCP boundaries and attributed
reports. The pilot was also checked in the existing browser at port 51465.
These are local acceptance checks, not deployed Core/Staff acceptance.

## Native evidence in this candidate

Existing Core operation_inspect records exact local/native operation IDs, the
validated actor, delivery or configuration status, revision and persisted/runtime
outcome. It excludes proposal text, paths, secrets and arbitrary response bodies.
Cached operation_commit results are not labelled fresh native observations.
Consultation reads record job status, original context revision, selected scope,
provider/model and effectsMayHaveOccurred (missing = unknown). Completion never
establishes user acceptance. Staff receipts remain local until a native reader
exists; both Staff prepare tools now participate in boundary journaling.

These native observations carry source_event_id and can be cited by an observation
inside the same company/case. Failure to append does not repeat an external action.
No reconciliation daemon, hidden reasoning trace or company sync is introduced.

## Agent workflow

1. Check installation_status and the explicitly selected company.
2. Open or read one case; inspect current revision and next step.
3. Pass case_id on relevant reads and authorized actions. Existing approvals apply.
4. Read operation_inspect / consultation_read for the exact known ID to observe
   its current native state. Follow journal_read pagination for event evidence.
5. Write an attributed observation: behavior, expectation, cause hypothesis,
   assistance, event IDs and review rationale. Do not claim independent acceptance.
6. Update the case revision with the next step or a concrete conclusion.

The CLI is for local reports; it does not impersonate an authenticated company
actor. Pilot records stay with local-pilot and are not imported under a real user.
