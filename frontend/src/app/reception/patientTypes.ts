/** The administrative view of a patient the front desk gets from /api/patients (identity and contact, nothing clinical). */
export interface PatientRow {
  id: string;
  national_id: string;
  full_name_ar: string;
  full_name_en: string;
  date_of_birth: string;
  gender: 'male' | 'female';
  phone: string;
  email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  mrn: string;
}
