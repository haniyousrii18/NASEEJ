export type SystemRole = 'platform_admin' | 'user';

export type CenterRole = 'center_manager' | 'doctor' | 'reception' | 'caregiver' | 'care_coordinator';

export interface User {
  id: string;
  auth_provider_id: string;
  email: string;
  full_name_ar: string;
  full_name_en: string;
  phone?: string;
  national_id?: string;
  system_role: SystemRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Organization {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
  type: string;
  status: string;
  contact_phone?: string;
  contact_email?: string;
  address_ar?: string;
  address_en?: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: CenterRole;
  specialty_ar?: string;
  specialty_en?: string;
  license_number?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  organization?: Organization;
}

export interface PatientProfile {
  id: string;
  user_id?: string;
  national_id: string;
  full_name_ar: string;
  full_name_en: string;
  date_of_birth: string;
  gender: 'male' | 'female';
  blood_type?: string;
  phone: string;
  email?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PatientAllergy {
  id: string;
  patient_id: string;
  allergen_ar: string;
  allergen_en: string;
  reaction_ar?: string;
  reaction_en?: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  diagnosed_at?: string;
}

export interface Appointment {
  id: string;
  organization_id: string;
  patient_id: string;
  clinician_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'in_consultation' | 'completed' | 'cancelled' | 'no_show';
  reason?: string;
  check_in_time?: Date;
  created_by?: string;
  patient?: PatientProfile;
  clinician?: User;
}

export interface Visit {
  id: string;
  organization_id: string;
  patient_id: string;
  clinician_id: string;
  appointment_id?: string;
  visit_date: Date;
  chief_complaint: string;
  vital_signs: Record<string, any>;
  examination_notes?: string;
  diagnosis: string;
  treatment_plan?: string;
  status: 'draft' | 'approved' | 'amended';
  approved_by?: string;
  approved_at?: Date;
  prescriptions?: Prescription[];
  lab_orders?: LabOrder[];
}

export interface Prescription {
  id: string;
  organization_id: string;
  visit_id: string;
  patient_id: string;
  clinician_id: string;
  notes?: string;
  status: 'draft' | 'approved' | 'dispensed' | 'cancelled';
  approved_by?: string;
  approved_at?: Date;
  items?: PrescriptionItem[];
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface LabOrder {
  id: string;
  organization_id: string;
  visit_id?: string;
  patient_id: string;
  clinician_id: string;
  test_name_ar: string;
  test_name_en: string;
  test_category: string;
  clinical_notes?: string;
  status: 'pending' | 'sample_collected' | 'completed' | 'cancelled';
  results?: LabResult[];
}

export interface LabResult {
  id: string;
  organization_id: string;
  lab_order_id: string;
  parameter_name: string;
  value: string;
  unit: string;
  reference_range?: string;
  is_abnormal: boolean;
  status: 'draft' | 'approved';
  reviewed_by?: string;
  reviewed_at?: Date;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  systemRole: SystemRole;
  currentOrganizationId?: string;
  currentRole?: CenterRole;
}
