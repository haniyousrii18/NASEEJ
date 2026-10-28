# Security Policy

Naseej is an academic graduation prototype using synthetic data only. It is not production software and must not be used with real patient data without the deployment work listed in `docs/features/patient-record.md` (encryption at rest, retention and purge jobs, a shared rate-limit store, clinical review of the AI safety wording, a data-processing agreement with any AI provider).

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the project team (contact: [To be completed by the team]) rather than opening a public issue. Include the affected route or screen, the steps to reproduce, and the impact. Do not include real personal data in a report.

## Security design in brief

- Every patient-owned query is scoped by the session's patient profile; a row that is not the caller's is reported as not found.
- Share links use a 256-bit random token stored only as a SHA-256 hash; they expire, can be revoked at once, and are read-only.
- The AI assistant has no write tools; its safety rules run on the server; nothing is sent to a provider without the patient's switch and per-file confirmation.
- Secrets and API keys belong in `.env` (never committed); the audit log holds ids and kinds, never health content.

Details and known limits: `docs/features/patient-record.md`.
