import React from 'react';
import { LeafIcon } from '../components/LineIcon.js';
import { useLang } from '../context/LangContext.js';

export const FeaturesPage: React.FC = () => {
  const { t, isRtl } = useLang();

  const featureDeepDives = [
    {
      id: 'multi-tenancy',
      tag: 'FR-020 — FR-026',
      badgeClass: 'badge-info',
      accentColor: 'var(--color-metric-blue)',
      icon: '🏢',
      title: t.features.f1_title,
      summary: t.features.f1_desc,
      points: isRtl ? [
        'عزل صارم للبيانات على مستوى جداول قاعدة البيانات عبر وسيط برمجي إلزامي (X-Organization-Id).',
        'محاولات التلاعب بمعرفات السجلات أو المنشآت تُقابل بالرفض الفوري (403 Forbidden) وتُسجل كحدث أمني.',
        'ربط المريض بمنشأة جديدة يولد رقم سجل طبي (MRN) محلي ولا يمنح المنشأة حق استعراض سجلات المراكز الأخرى تلقائياً.',
      ] : [
        'Strict database-level scoping enforced by mandatory server middleware (X-Organization-Id).',
        'Header or identifier tampering attempts are immediately rejected (403 Forbidden) and logged in security audits.',
        'Associating a patient with a new center assigns a local MRN without automatically exposing external center records.',
      ],
    },
    {
      id: 'draft-concealment',
      tag: 'FR-066 & FR-084',
      badgeClass: 'badge-approved',
      accentColor: 'var(--color-recovery-green)',
      icon: '🩺',
      title: t.features.f2_title,
      summary: t.features.f2_desc,
      points: isRtl ? [
        'تُنشأ الزيارات السريرية والوصفات وفحوصات المختبر بحالة "مسودة" (draft) غير معتمدة.',
        'تستبعد استعلامات بوابة المريض أي سجل لم يحصل على توقيع واعتماد الطبيب المعالج.',
        'التحاليل المخبرية التي تحتوي على نتائج غير طبيعية تخضع لمراجعة سريرية إلزامية قبل كشفها للمريض.',
      ] : [
        'Clinical visits, prescriptions, and lab tests start in an unapproved "draft" state.',
        'Patient portal queries strictly filter out unapproved drafts (status = "approved" required).',
        'Abnormal laboratory results require clinical sign-off before becoming visible to the patient.',
      ],
    },
    {
      id: 'conflict-prevention',
      tag: 'FR-040 — FR-046',
      badgeClass: 'badge-lilac',
      accentColor: 'var(--color-sleep-lilac)',
      icon: '📅',
      title: t.features.f3_title,
      summary: t.features.f3_desc,
      points: isRtl ? [
        'فحص الخادم لمنع الحجز المزدوج للطبيب في نفس اليوم والفترة الزمنية (Server-Side Conflict Rejection).',
        'إدارة جداول عمل الأطباء بحصص زمنية قابلة للتخصيص (Slots).',
        'مسار تدفق فوري لموظف الاستقبال لتسجيل وصول المريض (Checked-in) مع توثيق الطابع الزمني.',
      ] : [
        'Server-side rejection prevents double-booking clinicians for overlapping time slots.',
        'Clinician schedule availability managed in customizable discrete time slots.',
        'Instant receptionist arrival workflow marking patient as "Checked-in" with timestamps.',
      ],
    },
    {
      id: 'admin-wall',
      tag: 'FR-133 & AC-04',
      badgeClass: 'badge-draft',
      accentColor: 'var(--color-coral-signal)',
      icon: '🔒',
      title: t.features.f4_title,
      summary: t.features.f4_desc,
      points: isRtl ? [
        'فصل تام بين إدارة المنشآت التقنية والوصول إلى المحتوى الطبي السريري للمرضى.',
        'يُحظر على مديري المنصة (Platform Admin) استعراض الزيارات، أو الوصفات، أو نتائج التحاليل السريرية.',
        'محاولة استدعاء المسارات السريرية من حساب مدير المنصة تُرفض برمز FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL.',
      ] : [
        'Complete separation between platform infrastructure operations and patient clinical data.',
        'Platform administrators cannot view consultation notes, prescriptions, or laboratory values.',
        'Attempting clinical endpoints as platform admin is rejected with FORBIDDEN_PLATFORM_ADMIN_CLINICAL_WALL.',
      ],
    },
  ];

  return (
    <div className="page-shell" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div className="recognition-laurel-pair">
          <div className="recognition-laurel-item">
            <LeafIcon />
            <span>{isRtl ? 'المعايير الهندسية والمعمارية' : 'Architectural Standards'}</span>
            <LeafIcon />
          </div>
        </div>
        <h1 className="text-display" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', margin: '14px 0' }}>
          {t.features.title}
        </h1>
        <p className="text-subhead" style={{ maxWidth: 700, margin: '0 auto' }}>
          {isRtl
            ? 'نظرة متعمقة على آليات الأمان، والعزل متعدد المنشآت، وحوكمة المعلومات الصحية في منصة نسيج.'
            : 'An in-depth look at security mechanisms, multi-tenant isolation, and clinical governance in Naseej.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {featureDeepDives.map((feat) => (
          <div key={feat.id} className="cloud-feature-card" style={{ padding: '36px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="emoji-quiet" aria-hidden="true" style={{ fontSize: 28 }}>{feat.icon}</span>
                <span className={`status-badge ${feat.badgeClass}`}>{feat.tag}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--color-body-gray)', fontFamily: 'monospace' }}>
                {`#${feat.id}`}
              </span>
            </div>

            <h2 className="text-card-heading" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)', marginBottom: 12 }}>
              {feat.title}
            </h2>
            <p style={{ fontSize: 16, color: 'var(--color-body-gray)', lineHeight: 1.6, marginBottom: 24 }}>
              {feat.summary}
            </p>

            <div style={{
              background: 'var(--color-paper-white)',
              borderRadius: 18,
              padding: '20px 24px',
              border: '1px solid var(--color-border-subtle)',
            }}>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {feat.points.map((pt, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 15, color: 'var(--color-ink)' }}>
                    <span style={{ color: feat.accentColor, fontWeight: 560, fontSize: 18 }}>•</span>
                    <span style={{ lineHeight: 1.6 }}>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
