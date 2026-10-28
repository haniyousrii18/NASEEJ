# Documentation — Naseej | نَسيج

Start with the repository [README](../README.md) for setup and an overview. This folder holds everything else.

```text
docs/
├── academic-deliverables.md   capstone deliverables, report outline, demo script
├── guides/                    how to use, build and test the project
├── reference/                 architecture, API and data model
├── features/                  design and rules of each feature
├── diagrams/                  system analysis diagrams (exports and editable sources)
├── requirements/              requirements document (PDF)
├── samples/                   synthetic sample files for trying the app
└── archive/                   superseded design notes kept for reference
```

## Guides
| Document | For |
|---|---|
| [user-guide.md](guides/user-guide.md) | Using the app and running the demo |
| [team-guide.md](guides/team-guide.md) | Installing from GitHub and working with Git (Arabic) |
| [test-plan.md](guides/test-plan.md) | Test strategy, scenarios and automated tests |

## Reference
| Document | For |
|---|---|
| [architecture.md](reference/architecture.md) | Components, data flow and known limits |
| [api-spec.md](reference/api-spec.md) | HTTP endpoints |
| [database-erd.md](reference/database-erd.md) | Schema, relationships and migrations |

## Features
| Document | For |
|---|---|
| [patient-record.md](features/patient-record.md) | The patient layer: rules enforced, configuration, limits |
| [accounts.md](features/accounts.md) | Sign-up, email confirmation, password reset |
| [notifications.md](features/notifications.md) | In-app notifications |
| [translation.md](features/translation.md) | Arabic / English translation of typed text |
| [pwa.md](features/pwa.md) | Installing Naseej as an app |

## Requirements
| Document | For |
|---|---|
| [Naseej-Requirements.pdf](requirements/Naseej-Requirements.pdf) | Functional and non-functional requirements with acceptance criteria and traceability |
| [Naseej-PRD.md](../Naseej-PRD.md) | Product requirements (version 2.1) |

## Diagrams
See [diagrams/README.md](diagrams/README.md): context, DFD levels 0-2, activity, flowchart, use case, sequence, state, class, ERD and ERD mapping.

## Elsewhere in the repository
[Naseej-PRD.md](../Naseej-PRD.md) (requirements), [PRODUCT.md](../PRODUCT.md), [DESIGN.md](../DESIGN.md) (design system), [SECURITY.md](../SECURITY.md).
