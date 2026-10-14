<div align="center">

<img src="frontend/public/logo.png" alt="Naseej Logo" width="96" height="96" style="border-radius: 16px;" />

# Naseej | نَسيج
### A Multi-Tenant Healthcare SaaS Platform for Connected Patient Information
**منصة الرعاية الصحية السحابية المترابطة والسجلات الطبية المتصلة**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![Tests](https://img.shields.io/badge/Automated%20Tests-17%20Passed-brightgreen.svg)](#testing)

*Academic Graduation Prototype — 100% Synthetic Demo Data*  
*Primary Language: Arabic (RTL) · Secondary: English (LTR)*

</div>

---

## 1. Executive Overview

**Naseej (نَسيج)** is a multi-tenant healthcare information platform designed to connect patient health records across medical centers, clinics, and care teams while preserving strict institutional privacy boundaries and data sovereignty.

### Core Architectural Pillars
1. **Multi-Tenant Isolation**: Complete database-level scoping (`organization_id`). Manually manipulating tenant headers or resource IDs is strictly rejected.
2. **Clinical Wall**: Platform administrators oversee center accounts and infrastructure, but are structurally barred from accessing patient clinical notes or consultation records (`FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL`).
3. **Mandatory Human Clinical Approval**: Visit drafts and preliminary laboratory results remain completely invisible to the patient portal until explicitly reviewed and approved by an attending clinician.
4. **Server-Side Conflict Prevention**: Appointment bookings prevent overlapping clinician slots at the API and database levels.
5. **Tamper-Resistant Audit Trail**: Every authentication event, approval, status change, and cross-tenant attempt is permanently logged with actor details, timestamps, and network IP.
6. **Bilingual RTL/LTR Design**: Arabic is the native primary language with seamless RTL layout, accompanied by English (LTR).

---

## 2. Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Vanilla CSS design tokens adapted from `DESIGN (1).md` with dark obsidian canvas (`#0e100f`), warm cream typography (`#fffce1`), and Naseej brand turquoise (`#00a896`).
- **Backend API**: Node.js, Express, TypeScript, pluggable authentication adapter pattern (`IAuthProvider`).
- **Database**: PostgreSQL 16+ with 3NF relational schema, foreign key constraints, and multi-tenant scoping.
- **Testing**: Vitest, Supertest for integration and security boundary verification.
- **Storage**: Protected local file storage located outside web roots (`storage/protected/`).

---

## 3. Pre-Configured Synthetic Demo Accounts

All accounts use the standardized password: **`Password123!`**

| Persona / Role | Email | Assigned Facility | Responsibilities & Boundaries |
|---|---|---|---|
| **Platform Administrator** | `admin@naseej.health` | System-wide | Centers, service health, audit logs; **no access to clinical records** |
| **Center Manager** | `manager.noor@naseej.health` | Al-Noor Medical Center | Staff directory, doctor schedules, waiting room metrics |
| **Doctor / Clinician** | `doctor.noor@naseej.health` | Al-Noor Medical Center | Consultations, visit drafts, allergy warnings, Rx approval |
| **Reception Staff** | `reception.noor@naseej.health` | Al-Noor Medical Center | Patient registration, appointment booking, arrival check-in |
| **Patient** | `patient@naseej.health` | Multi-Center Affiliated | Approved health record portal, inquiries, symptom logs |
| **Center Manager (Amal)** | `manager.amal@naseej.health` | Al-Amal Hospital | Manager at second tenant (used to test cross-tenant isolation) |
| **Doctor (Amal)** | `doctor.amal@naseej.health` | Al-Amal Hospital | Doctor at second tenant (blocked from Al-Noor records) |

---

## 4. Quickstart & Local Setup

### Prerequisites
- **Node.js**: v20 or v24
- **PostgreSQL**: v16 or higher (running on port 5432)
- **npm**: v10 or higher

### Step 1: Clone & Configure Environment
```bash
# Clone the repository
git clone https://github.com/your-username/naseej.git
cd naseej

# Copy environment variables
cp .env.example .env
```
Ensure `.env` matches your local PostgreSQL configuration:
```ini
PORT=5000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=naseej_dev
DB_USER=postgres
DB_PASSWORD=
JWT_SECRET=naseej_academic_prototype_jwt_secret_key_2026_secure
```

### Step 2: Initialize Database & Run Migrations
Create the database in PostgreSQL if it doesn't already exist:
```bash
# In PostgreSQL CLI (psql):
CREATE DATABASE naseej_dev;
```
Then run migrations and apply the synthetic demo seed:
```bash
# Run migrations (creates tables, indexes, constraints)
npm --prefix backend run migrate

# Populate coherent synthetic demo data
npm --prefix backend run seed
```

### Step 3: Install Dependencies
```bash
# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Step 4: Run the Application
In separate terminal windows:
```bash
# Terminal 1: Start Backend API (runs on http://localhost:5000)
npm run dev:backend

# Terminal 2: Start Frontend Application (runs on http://localhost:3000)
npm run dev:frontend
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 5. Automated Testing <a id="testing"></a>

Naseej includes automated integration test suites executed against the real database schema to verify tenant isolation, role walls, conflict prevention, and draft concealment:

```bash
# Run all automated tests
npm --prefix backend run test
```

### Test Results Summary (100% Passing)
```text
 ✓ tests/appointment-conflict.test.ts  (3 tests)
 ✓ tests/patient-portal.test.ts         (4 tests)
 ✓ tests/tenant-isolation.test.ts       (3 tests)
 ✓ tests/rbac-clinical-wall.test.ts     (3 tests)
 ✓ tests/auth.test.ts                   (4 tests)

 Test Files  5 passed (5)
      Tests  17 passed (17)
   Duration  1.35s
```

### Tested Scenarios
1. **Tenant Isolation**: Users attempting to access another center's records using manipulated headers or known IDs are rejected with `403 Forbidden` / `404 Not Found`.
2. **Clinical Wall**: Platform administrators attempting to access `/api/visits` or `/api/prescriptions` are rejected with `403 Forbidden` (`FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL`).
3. **Appointment Conflict Prevention**: Double-booking the same clinician during overlapping slots is blocked with `409 Conflict`.
4. **Draft Concealment**: Patients requesting unapproved visits or unapproved lab results receive 404 / filtered results.
5. **Role Boundary Enforcement**: Receptionists attempting clinical operations are rejected with `403 Forbidden`.

---

## 6. Backup & Disaster Recovery Procedures (PRD Section 8.1)

### Backup Strategy & Objectives
- **Target RPO (Recovery Point Objective)**: ≤ 1 hour of synthetic data loss.
- **Target RTO (Recovery Time Objective)**: ≤ 15 minutes to fully restore database and file storage.
- **Backup Scope**: PostgreSQL relational database dump + protected storage directory (`storage/protected/`).

### Creating a Backup
```bash
# 1. Export database dump
pg_dump -U postgres -h 127.0.0.1 -p 5432 -d naseej_dev -F c -b -v -f "./backups/naseej_backup_$(date +%Y%m%d).dump"

# 2. Archive protected file storage
tar -czvf "./backups/naseej_storage_$(date +%Y%m%d).tar.gz" storage/protected/
```

### Tested Restoration Procedure
```bash
# 1. Recreate database
psql -U postgres -c "DROP DATABASE IF EXISTS naseej_restored;"
psql -U postgres -c "CREATE DATABASE naseej_restored;"

# 2. Restore schema and data
pg_restore -U postgres -d naseej_restored -v "./backups/naseej_backup_YYYYMMDD.dump"

# 3. Extract files
tar -xzvf "./backups/naseej_storage_YYYYMMDD.tar.gz" -C ./
```

---

## 7. Project Documentation Index

- **[Naseej-PRD.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/Naseej-PRD.md)** — Original product requirements document.
- **[PRODUCT.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/PRODUCT.md)** — Core product truths and principles.
- **[DESIGN.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/DESIGN.md)** — Healthcare design system & visual tokens.
- **[docs/architecture.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/architecture.md)** — System architecture, auth provider analysis, and isolation design.
- **[docs/database-erd.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/database-erd.md)** — Entity Relationship Diagram and PostgreSQL schema specs.
- **[docs/api-spec.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/api-spec.md)** — REST API endpoint contracts.
- **[docs/test-plan.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/test-plan.md)** — Test plan & requirement traceability.
- **[docs/user-guide.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/user-guide.md)** — Step-by-step user guide for all 5 roles.
- **[docs/traceability-matrix.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/traceability-matrix.md)** — Requirement-to-Test verification matrix.
- **[docs/academic-deliverables.md](file:///c:/Users/HA%20NI/OneDrive/Desktop/NASEEJ/docs/academic-deliverables.md)** — University capstone deliverables summary and demonstration scenario.

---

## 8. License & Academic Disclaimer
Developed as a graduation project prototype. All patient names, medical conditions, and facility identifiers are strictly synthetic demo data. Software does not provide autonomous clinical medical diagnosis or treatment prescribing.
