# User Guide for Primary Roles — Naseej | نَسيج

## Introduction
Naseej is a multi-tenant healthcare information platform connecting patient health information across medical centers while maintaining strict data isolation and clinical review standards.

---

## 1. Platform Administrator
- **Role Objective**: Oversee medical center onboardings, technical configuration, and audit logs.
- **Access Boundary**: Structurally barred from accessing patient medical records or clinical consultations (`FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL`).
- **Demo Account**: `admin@naseej.health` / `Password123!`
- **Workflows**:
  1. Navigate to **Platform Admin Dashboard**.
  2. Review registered healthcare organizations and their codes.
  3. Click **+ Add Medical Center** to configure a new hospital or clinic with its unique identifier.
  4. Review incoming public demo requests submitted from the landing page.
  5. Inspect the immutable **Security Audit Trail** for cross-tenant violations and administrative events.

---

## 2. Medical Center Manager
- **Role Objective**: Manage center staff memberships, doctor schedules, and operational health metrics.
- **Access Boundary**: Strictly limited to the manager's assigned medical center tenant.
- **Demo Account**: `manager.noor@naseej.health` / `Password123!`
- **Workflows**:
  1. Sign in to the **Center Operations Dashboard**.
  2. Review center metrics: active staff members, patients checked in, and confirmed appointments.
  3. In the **Center Staff Directory**, click **+ Add Staff Member** to invite new doctors or receptionists.
  4. Review operational audit logs scoped strictly to the center.

---

## 3. Doctor / Clinician
- **Role Objective**: Review patient history, allergies, document consultation visits, write prescriptions, and order/approve lab tests.
- **Access Boundary**: Authorized patients within the center. Cannot see patients or visits belonging to other centers.
- **Demo Account**: `doctor.noor@naseej.health` / `Password123!`
- **Workflows**:
  1. Open the **Clinician Workspace**.
  2. In the left panel, see patients waiting in the **Waiting Room Queue** (patients checked in by reception).
  3. Click a patient to inspect their profile:
     - Notice the **Critical Safety Allergy Banner** highlighting documented allergies (e.g., Penicillin, Sulfa).
     - Review past approved consultations.
  4. Click **+ Document New Visit**:
     - Record Chief Complaint, Vital Signs (BP, Pulse, Temp, SpO2), Diagnosis, and Treatment Plan.
     - Saves as an unapproved **draft** (strictly hidden from the patient portal).
  5. When ready, click **✓ Sign & Approve Visit** to publish the consultation to the patient portal.
  6. Click **+ Add Rx** to issue a prescription with medications, dosage, frequency, and duration.
  7. Click **+ Order Lab Test** to request laboratory examinations.

---

## 4. Reception Staff
- **Role Objective**: Register incoming patients, book appointments, and record patient arrival (check-in).
- **Access Boundary**: Administrative workflows only. Strictly barred from documenting visits or modifying clinical records.
- **Demo Account**: `reception.noor@naseej.health` / `Password123!`
- **Workflows**:
  1. Open the **Reception Services Workspace**.
  2. Click **+ Register New Patient** to register an individual with their National ID, name, and phone. The system links the patient to the active center and generates a local MRN.
  3. Click **+ Book Appointment**:
     - Select patient, clinician, date, and time slot.
     - The server validates clinician availability and prevents double-booking conflicts.
  4. When the patient arrives at the clinic, find their confirmed appointment in the table and click **✓ Check-In Patient**.
  5. The appointment transitions to `checked_in` with a precise arrival timestamp, instantly notifying the attending clinician's queue.

---

## 5. Patient
- **Role Objective**: Access approved longitudinal health records, active prescriptions, lab results, submit questions to the care team, and log symptoms.
- **Access Boundary**: Strictly limited to the patient's own approved health records. Cannot view unapproved visit drafts or preliminary lab results.
- **Demo Account**: `patient@naseej.health` / `Password123!`
- **Workflows**:
  1. Sign in to the **Patient Portal**.
  2. In the **Summary Tab**, view affiliated medical centers, local MRNs, and emergency contacts.
  3. Navigate to **My Approved Visits** to review signed consultations. Notice that drafts currently being worked on by doctors do not appear here.
  4. Navigate to **My Active Prescriptions** to view medications and dosage instructions.
  5. Navigate to **My Laboratory Results** to review verified lab tests with reference ranges.
  6. Click **Ask Care Team a Question** to submit inquiries or refill requests.
  7. Click **Log Daily Symptom** to track symptoms and assign severity scores (1 to 10).
