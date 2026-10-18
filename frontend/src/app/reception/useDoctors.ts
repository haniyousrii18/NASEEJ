import { useAuth } from '../../context/AuthContext.js';
import { useApiData } from '../api.js';

export interface Doctor {
  user_id: string;
  full_name_ar: string;
  full_name_en: string;
  specialty_ar?: string;
  specialty_en?: string;
}

/** The active doctors of the active center (the directory view of members: names and specialty only). */
export function useDoctors() {
  const { currentOrgId } = useAuth();
  const { state } = useApiData<Array<Doctor & { role: string; status: string }>>(currentOrgId ? `/api/organizations/${currentOrgId}/members` : null);
  const doctors = state.status === 'ready' ? state.data.filter((m) => m.role === 'doctor' && m.status === 'active') : [];
  return { doctors, state };
}
