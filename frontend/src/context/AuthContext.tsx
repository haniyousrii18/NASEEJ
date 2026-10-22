import React, { createContext, useContext, useState, useEffect } from 'react';

export interface UserMembership {
  id: string;
  organization_id: string;
  role: 'center_manager' | 'doctor' | 'reception' | 'caregiver' | 'care_coordinator';
  specialty_ar?: string;
  specialty_en?: string;
  organization_name_ar: string;
  organization_name_en: string;
  organization_code: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullNameAr: string;
  fullNameEn: string;
  systemRole: 'platform_admin' | 'user';
  patientProfileId?: string | null;
  memberships: UserMembership[];
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  currentOrgId: string | null;
  currentRole: string | null;
  setCurrentOrgId: (orgId: string) => void;
  /** `remember` keeps the session after the browser is closed; without it the session ends with the tab. */
  login: (token: string, user: UserProfile, remember?: boolean) => void;
  logout: () => void;
  /** Updates the signed-in profile held in memory after the server confirmed a change (for example a new display name). */
  updateUser: (patch: Partial<UserProfile>) => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  isPlatformAdmin: boolean;
  isCenterManager: boolean;
  isDoctor: boolean;
  isReception: boolean;
  isPatient: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * "Keep me signed in on this device" decides where the session lives: localStorage survives closing the browser,
 * sessionStorage ends with the tab. The session is read from whichever holds it.
 */
const readSaved = (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key);
const savedStore = (): Storage => (localStorage.getItem('naseej_token') ? localStorage : sessionStorage);
const SESSION_KEYS = ['naseej_token', 'naseej_user', 'naseej_org_id'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => readSaved('naseej_token'));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = readSaved('naseej_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(() => {
    return readSaved('naseej_org_id');
  });

  const setCurrentOrgId = (orgId: string) => {
    setCurrentOrgIdState(orgId);
    savedStore().setItem('naseej_org_id', orgId);
  };

  const login = (newToken: string, newUser: UserProfile, remember = false) => {
    setToken(newToken);
    setUser(newUser);
    // one place at a time: clear the other store so an old session cannot outlive this choice
    const keep = remember ? localStorage : sessionStorage;
    SESSION_KEYS.forEach((k) => (remember ? sessionStorage : localStorage).removeItem(k));
    keep.setItem('naseej_token', newToken);
    keep.setItem('naseej_user', JSON.stringify(newUser));

    // Default active center if user has memberships
    if (newUser.memberships && newUser.memberships.length > 0) {
      setCurrentOrgId(newUser.memberships[0].organization_id);
    } else {
      // If patient, default to Al-Noor
      setCurrentOrgId('11111111-1111-1111-1111-111111111111');
    }
  };

  const updateUser = (patch: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      savedStore().setItem('naseej_user', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setCurrentOrgIdState(null);
    SESSION_KEYS.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  };

  // Find active role in current organization
  const activeMembership = user?.memberships?.find((m) => m.organization_id === currentOrgId);
  const currentRole = user?.systemRole === 'platform_admin'
    ? 'platform_admin'
    : user?.patientProfileId
    ? 'patient'
    : activeMembership?.role || null;

  const isPlatformAdmin = user?.systemRole === 'platform_admin';
  const isCenterManager = activeMembership?.role === 'center_manager';
  const isDoctor = activeMembership?.role === 'doctor';
  const isReception = activeMembership?.role === 'reception';
  const isPatient = !!user?.patientProfileId;

  // Custom fetch wrapper injecting Auth & Tenant headers
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (currentOrgId) {
      headers['X-Organization-Id'] = currentOrgId;
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || 'API request failed');
    }

    return data;
  };

  const value = {
    user,
    token,
    currentOrgId,
    currentRole,
    setCurrentOrgId,
    login,
    logout,
    updateUser,
    apiFetch,
    isPlatformAdmin,
    isCenterManager,
    isDoctor,
    isReception,
    isPatient,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
