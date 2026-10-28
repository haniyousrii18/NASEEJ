# System analysis diagrams — Naseej | نَسيج

Diagrams for the patient-first prototype (PRD 2.1). The signed-in user is the patient; a clinician has no account and can only read what the patient shares through a temporary link or QR code; AI is optional and cannot write to the health record.

- `exports/` holds the final images and the ERD mapping document used in the report.
- [exports/all-diagrams.pdf](exports/all-diagrams.pdf) combines diagrams 1 to 12, each under its title, with the ERD mapping right after the ERD. It is built from the files in `exports/`; regenerate it when any of them changes.
- `source/` holds the editable files (open `.drawio` in [diagrams.net](https://app.diagrams.net), render `.mmd` in [mermaid.live](https://mermaid.live)).

| # | Diagram | Export | Source | Shows |
|---|---|---|---|---|
| 1 | Context diagram | [01-context-diagram.png](exports/01-context-diagram.png) | [context-diagram.drawio](source/context-diagram.drawio) | The system as one process and its five external parties |
| 2 | Flowchart | [02-flowchart.png](exports/02-flowchart.png) | [flowchart.mmd](source/flowchart.mmd) | Uploading a document and reviewing AI suggestions |
| 3 | Activity diagram | [03-activity-diagram.png](exports/03-activity-diagram.png) | [activity-diagram.drawio](source/activity-diagram.drawio) | Preparing a visit summary and sharing it (swimlanes: patient, system, clinician) |
| 4 | Use case diagram | [04-use-case-diagram.png](exports/04-use-case-diagram.png) | [use-case-diagram.drawio](source/use-case-diagram.drawio) | Patient, clinician and AI provider use cases |
| 5 | Sequence diagram | [05-sequence-diagram.png](exports/05-sequence-diagram.png) | [sequence-diagram.mmd](source/sequence-diagram.mmd) | Approve a summary, share by QR, clinician reads, patient revokes |
| 6 | State diagram | [06-state-diagram.png](exports/06-state-diagram.png) | [state-diagram.drawio](source/state-diagram.drawio) | Visit preparation and share lifecycle |
| 7 | Class diagram | [07-class-diagram.png](exports/07-class-diagram.png) | [class-diagram.drawio](source/class-diagram.drawio) | Domain classes and their relationships |
| 8 | DFD level 0 | [08-dfd-level-0.png](exports/08-dfd-level-0.png) | [dfd-level-0.drawio](source/dfd-level-0.drawio) | Six main processes, data stores and external entities |
| 9 | DFD level 1 — clinician access (5.0) | [09-dfd-level-1-access.png](exports/09-dfd-level-1-access.png) | [dfd-level-1-access.drawio](source/dfd-level-1-access.drawio) | Token validation, access logging, summary and document delivery |
| 10 | DFD level 1 — share record (4.0) | [10-dfd-level-1-share.png](exports/10-dfd-level-1-share.png) | [dfd-level-1-share.drawio](source/dfd-level-1-share.drawio) | Validate, generate, store, revoke and review access history |
| 11 | DFD level 2 — token and snapshot (4.2) | [11-dfd-level-2.png](exports/11-dfd-level-2.png) | [dfd-level-2.drawio](source/dfd-level-2.drawio) | Token generation, hashing, frozen snapshot and share package |
| 12 | ERD | [12-erd.png](exports/12-erd.png) | [erd-diagram.drawio](source/erd-diagram.drawio) | Active patient-owned record and sharing model |
| 13 | ERD mapping | [13-erd-mapping.pdf](exports/13-erd-mapping.pdf) | — | Relational schema derived from the ERD |

## Notes

- Diagram 1 is the context diagram. Diagrams 8 to 11 are the DFD levels and decompose each other: level 0 into level 1 (processes 4.0 and 5.0), and level 1 into level 2 (process 4.2).
- Repeated data stores and the repeated AI provider in diagram 8 keep the same ID; they are repeated only to avoid crossing arrows.
- Diagram 12 and the ERD mapping follow the schema of migrations 001 to 007, including `auth_tokens` and `users.password_changed_at` (migration 007) and the two provenance foreign keys of `health_entries`. The class diagram (7) and DFD level 0 (8) show the same account tokens. The full schema, including the legacy multi-center tables that remain unused, is described in [../reference/database-erd.md](../reference/database-erd.md). Diagram 12 shows only the active patient-owned model.
- When a diagram changes, replace its file in `exports/` under the same name and update the matching file in `source/`.
