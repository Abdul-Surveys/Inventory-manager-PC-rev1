# Self-Hosting Deployment Package — PetroChina GPP Inventory

Prepares the existing inventory application to run on a company-owned server and be used over the
company intranet, with no change to its current features. The result is an installable, offline-capable
package plus an IT guide, delivered on a separate branch and published to GitHub.

## Who it's for
The company IT team that will install and operate the system on an internal server, and the GPP
planning team who will continue to use the same application at an internal web address instead of the
Emergent preview link.

## Decisions already made (from the conversation)
- **Access:** stays open — anyone on the intranet can use it; there is no login. Network access control
  is the security boundary. (No admin accounts, no permissions, no first-admin step are added.)
- **Internet:** the target server is fully air-gapped. The package must install and run with nothing
  downloaded on the server.
- **HTTPS:** a self-signed certificate is generated for the internal hostname during installation.
  Browsers show a one-time trust warning unless IT imports the certificate into the company trust store
  (documented).
- **Starting data:** the system starts with an empty database. A tested, documented procedure (and a
  helper script) lets IT import the current items and transactions later. The live Emergent database is
  never copied into GitHub or modified.

## Core deliverables and experience
What the package contains and what each party experiences.

- **Unchanged application.** All current features remain: dashboard, inventory, transactions, consumption
  and recommended min/max, reorder proposals, monthly report with the criticality trend, critical-materials
  dashboard, bulk edits, auto-classify, Excel import/export, and the downloadable offline desktop edition.
- **Runs as a self-contained set of services** on one server: the application, its web server, and the
  database, started together with automatic restart and health checks so it comes back up after a reboot
  or crash.
- **Truly offline.** External runtime dependencies currently embedded in the app are removed or bundled so
  nothing reaches the internet: web fonts are served locally; the Emergent helper script and the usage
  analytics/telemetry are removed. The downloadable offline desktop edition already works without internet
  and is retained.
- **Portable configuration.** The internal hostname, web address, cross-origin setting, database name and
  ports are all set through a single configuration file. No Emergent addresses or preview links remain.
- **An example configuration file** with every setting explained and safe placeholder values. No real
  credentials or secrets are committed.
- **Database and files handled explicitly.** Required database indexes are created automatically on first
  start. Instructions cover both a clean install and migrating existing data. The application stores no
  uploaded files on disk (spreadsheets are processed in memory and the logo ships with the app), so only
  the database needs persistent storage and backup.
- **Offline internet-requirements report.** A written audit listing every feature, whether it needs an
  external service, and the conclusion for offline use. Expected finding from the audit so far: after the
  cleanup above, no application feature requires internet at runtime.
- **IT installation guide.** Supported operating system, prerequisites, estimated hardware with the
  assumptions behind the estimate, required network ports, step-by-step install and configuration, how to
  back up and restore the database, and how to upgrade and roll back.
- **Honest test evidence.** A report of what was verified from a clean install, what could not be verified
  in this environment, and any remaining platform dependencies — not a claim of readiness based on the
  Emergent preview.
- **Published to GitHub** on a dedicated self-hosting branch, with the exact tested commit identified and a
  concise handover checklist for IT.

## Installation flow (IT)
1. Receive the package: the repository branch plus a bundle of the prebuilt service images exported for
   offline transfer.
2. Copy the package to the server, copy the example configuration file, and fill in the internal hostname
   and any site-specific values.
3. Run the documented install command. It loads the bundled images, generates the self-signed certificate
   for the hostname, creates persistent database storage, and starts all services with restart-on-failure.
4. Open the internal HTTPS address in a browser, accept or pre-install the certificate, and confirm the
   dashboard loads.
5. Optional: run the migration procedure to import current items and transactions.
6. Schedule the documented database backup.

## End-user experience
Identical to today. Users visit the internal HTTPS address instead of the preview link. On first visit a
browser may show a one-time certificate trust prompt (removed if IT installs the certificate centrally).
Currency stays USD; all screens, exports and the offline download behave as they do now.

## Implementation phases

### Phase 1 — Offline deployment package (built now)
Everything above: external-dependency cleanup for offline use, portable configuration, production service
packaging with persistent database storage, health checks and auto-restart, self-signed HTTPS for a
configurable internal hostname, example configuration file, fresh-install and migration procedures with
automatic indexes, the offline internet-requirements report, the IT installation/backup/restore/upgrade/
rollback guide, clean-install testing with an honest evidence report, and publication to GitHub with the
tested commit and handover checklist. The current application and branch are preserved.

### Phase 2 — Operations hardening (later)
Scheduled automatic database backups with retention, basic health/monitoring and log collection, and
optional database access credentials. Considered after Phase 1 is accepted.

### Phase 3 — Scale and integration (later)
Optional local login with roles or sign-in against the company directory, resilience across more than one
server, and an internal build/release pipeline. Only if the company later requests them.

## Assumptions
- **Platform:** one Linux x86_64 server with a container runtime and Compose available offline; all
  services run on that single host (no high availability in Phase 1). An ARM note is included if needed.
- **Security boundary:** the open-access model is kept by choice; the database is reachable only on the
  internal service network and is not exposed on the host; no application login is added.
- **HTTPS:** self-signed certificate generated at install for the configured hostname; HTTP redirects to
  HTTPS; trust-store import is an IT step, not automated.
- **Data:** starts empty; the current ~15,000-item master and any transactions are migrated by IT using the
  provided export-then-import steps; the live database is left untouched and no business data is placed in
  GitHub.
- **Hardware estimate (assumption, stated in the guide):** minimum ~2 CPU cores, 4 GB RAM, 20 GB disk;
  recommended ~4 cores, 8 GB RAM, 50 GB disk — sized for a small planning team (tens of concurrent users)
  and a catalog up to roughly 200,000 items; actual needs scale with data volume and usage.
- **Ports:** 443 for the application (and 80 redirecting to 443); the database port is not published
  outside the server.
- **Dependencies pinned:** application, web server and database versions are fixed so rebuilds are
  reproducible; images are shipped prebuilt for the air-gapped server.
- **Telemetry removed:** the usage-analytics and Emergent helper scripts are removed entirely for privacy
  and offline operation.
- **Fonts:** the interface font is bundled and served locally; the visual design is unchanged.
- **Testing limits:** verification is done from a clean local checkout where this environment allows;
  certificate trust behaviour and performance on the company's actual server and network cannot be
  verified here and are called out in the evidence report.
