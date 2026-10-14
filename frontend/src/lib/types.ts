// Shapes of the records the doctor workspace reads from the existing API (no new fields assumed).

export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';

export interface Allergy {
  id: string;
  allergen_ar: string;
  allergen_en: string;
  reaction_ar?: string | null;
  reaction_en?: string | null;
  severity: AllergySeverity;
}

export interface Patient {
  id: string;
  mrn: string;
  full_name_ar: string;
  full_name_en: string;
  national_id?: string;
  gender?: string;
  blood_type?: string | null;
  date_of_birth?: string;
  phone?: string;
  allergies?: Allergy[];
}

export interface Visit {
  id: string;
  visit_date: string;
  chief_complaint: string;
  diagnosis: string;
  treatment_plan?: string | null;
  examination_notes?: string | null;
  vital_signs?: Record<string, unknown>;
  status: 'draft' | 'approved' | 'amended';
  approved_at?: string | null;
  updated_at?: string;
}

export interface PrescriptionItem {
  id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface Prescription {
  id: string;
  visit_id: string;
  status: 'draft' | 'approved' | 'dispensed' | 'cancelled';
  created_at: string;
  updated_at?: string;
  items: PrescriptionItem[];
}

export interface LabResult {
  id: string;
  parameter_name: string;
  value: string;
  unit: string;
  reference_range?: string | null;
  is_abnormal: boolean;
  status: 'draft' | 'approved';
  reviewed_at?: string | null;
}

export interface LabOrder {
  id: string;
  visit_id?: string | null;
  test_name_ar: string;
  test_name_en: string;
  status: string;
  created_at: string;
  updated_at?: string;
  results: LabResult[];
}

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name_ar: string;
  patient_name_en: string;
  start_time: string;
  reason?: string;
  status: string;
}

export interface PatientData {
  patient: Patient;
  visits: Visit[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
}

export type Severity = 'high' | 'medium' | 'low';

export interface Interaction {
  id: string;
  kind: 'drug-drug' | 'drug-allergy';
  severity: Severity;
  a: string;
  b: string;
  message_ar: string;
  message_en: string;
}
