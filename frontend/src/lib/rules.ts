// DEMO RULES ONLY. Synthetic, bilingual, hand-written for the Naseej prototype.
// This is NOT clinical guidance, has not been validated, and must never be shown to patients.

import type { AllergySeverity, Severity } from './types.js';

export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export const ALLERGY_SEVERITY: Record<AllergySeverity, Severity> = {
  life_threatening: 'high',
  severe: 'high',
  moderate: 'medium',
  mild: 'low',
};

interface DrugPair {
  a: string;
  b: string;
  severity: Severity;
  message_ar: string;
  message_en: string;
}

// Matched on lower-case substrings of the medication name.
export const DRUG_PAIRS: DrugPair[] = [
  {
    a: 'warfarin',
    b: 'aspirin',
    severity: 'high',
    message_ar: 'قد يزيد الجمع بين هذين الدواءين خطر النزيف.',
    message_en: 'Combining these two may raise bleeding risk.',
  },
  {
    a: 'warfarin',
    b: 'ibuprofen',
    severity: 'high',
    message_ar: 'قد يزيد الجمع بين هذين الدواءين خطر النزيف.',
    message_en: 'Combining these two may raise bleeding risk.',
  },
  {
    a: 'simvastatin',
    b: 'amlodipine',
    severity: 'medium',
    message_ar: 'قد يلزم مراجعة جرعة السيمفاستاتين عند الجمع بينهما.',
    message_en: 'Simvastatin dose may need review when combined.',
  },
  {
    a: 'lisinopril',
    b: 'spironolactone',
    severity: 'medium',
    message_ar: 'قد يرتفع البوتاسيوم عند الجمع بينهما، يُنصح بمتابعة التحاليل.',
    message_en: 'Potassium may rise when combined; consider monitoring labs.',
  },
];

interface AllergyRule {
  allergen: string; // lower-case substring of the recorded allergen
  drugs: string[]; // lower-case substrings of medication names
  message_ar: string;
  message_en: string;
}

export const ALLERGY_RULES: AllergyRule[] = [
  {
    allergen: 'penicillin',
    drugs: ['penicillin', 'amoxicillin', 'ampicillin'],
    message_ar: 'الدواء من عائلة البنسلين والمريض لديه حساسية مسجلة منها.',
    message_en: 'Medicine is in the penicillin family and the patient has a recorded allergy.',
  },
  {
    allergen: 'sulfa',
    drugs: ['sulfamethoxazole', 'sulfasalazine'],
    message_ar: 'الدواء من عائلة السلفا والمريض لديه حساسية مسجلة منها.',
    message_en: 'Medicine is in the sulfa family and the patient has a recorded allergy.',
  },
  {
    allergen: 'aspirin',
    drugs: ['aspirin', 'ibuprofen', 'diclofenac'],
    message_ar: 'الدواء من مضادات الالتهاب غير الستيرويدية والمريض لديه حساسية مسجلة من الأسبرين.',
    message_en: 'Medicine is an NSAID and the patient has a recorded aspirin allergy.',
  },
];

// Arabic allergen words mapped to the English keys above, so Arabic-only records still match.
export const ALLERGEN_ALIASES: Record<string, string> = {
  بنسلين: 'penicillin',
  بنيسيلين: 'penicillin',
  سلفا: 'sulfa',
  أسبرين: 'aspirin',
  اسبرين: 'aspirin',
};

// ---- Dictation parsing vocabulary (used by parseVisit) ----
export const KNOWN_MEDICINES = [
  'amlodipine', 'atorvastatin', 'simvastatin', 'metformin', 'lisinopril', 'losartan', 'aspirin', 'ibuprofen',
  'paracetamol', 'amoxicillin', 'omeprazole', 'warfarin', 'spironolactone', 'insulin', 'salbutamol',
];

export const KNOWN_TESTS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'CBC', pattern: /\b(cbc|complete blood count)\b|صورة دم/i },
  { key: 'HbA1c', pattern: /\bhba1c\b|سكر تراكمي/i },
  { key: 'Lipid profile', pattern: /\blipid( profile| panel)?\b|دهون/i },
  { key: 'Liver function', pattern: /\b(lft|liver function)\b|وظائف الكبد/i },
  { key: 'Kidney function', pattern: /\b(kft|renal function|kidney function|creatinine)\b|وظائف الكلى/i },
  { key: 'ECG', pattern: /\b(ecg|ekg)\b|رسم قلب/i },
];

export const COMPLAINT_HINTS = /شكوى|يشكو|تشكو|ألم|صداع|سعال|حمى|دوخة|خفقان|complain|pain|cough|fever|headache|dizz|palpitation|fatigue|shortness/i;
export const DIAGNOSIS_PREFIX = /(?:diagnosis|dx|التشخيص|تشخيص)\s*[:\-–]\s*([^\n.]+)/i;
export const FOLLOWUP_SOURCE = '(?:follow[- ]?up|review|recheck|متابعة|مراجعة|إعادة الفحص)[^\\n.]*';
