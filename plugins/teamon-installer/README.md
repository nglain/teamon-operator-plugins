# TeamON Installer 0.1.3

Text-only MCP. No embedded UI, progress bar, buttons or company credentials.
The source folder is a packaging template, not an installable runtime.

Recipient flow: guide -> helper installation -> same-thread draft with native
@TeamON Installer -> human submission -> ASCII status -> same-thread draft with
native @TeamON Operator -> human submission -> browser login -> operator_workspace_open.
The guide owns the macOS draft handoff; unavailable hosts use explicit native
selection. The runtime never submits messages. Rediscover tools after submission.

installer_open reads the current run. installer_start is a model-visible write
under normal host approval, only after an explicit installation request.
installer_status reads the exact run and never retries. One job, profile lock,
fixed official package installation. Unknown outcomes are inspected, not replayed.
Keep the helper connected while running. No ASCII animation: snapshots describe
confirmed steps. Completion does not prove account login or workspace visibility.

Build: node scripts/package-installer.mjs. It includes portable manifests,
runner/job/server/text renderer and pinned dependencies, never mcp-view.html.
Publish separately with a clean source and --release; a local candidate does not
update the marketplace. Root teamon-operator-install.md is the recipient guide.
No live installation or login is performed by packaging tests.
