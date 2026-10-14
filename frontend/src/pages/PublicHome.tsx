import React from 'react';
import { LeafIcon, LockIcon } from '../components/LineIcon.js';
import { useLang } from '../context/LangContext.js';

interface PublicHomeProps {
  setCurrentView: (view: string) => void;
}

export const PublicHome: React.FC<PublicHomeProps> = ({ setCurrentView }) => {
  const { t, isRtl } = useLang();

  return (
    <div className="home-page" style={{ background: 'var(--color-paper-white)', width: '100%', overflowX: 'clip' }}>
      {/* =========================================================================
          1. Cloudlight Device Hero (Hero Sky Gradient + Dimensional Composition)
          ========================================================================= */}
      <section style={{
        maxWidth: 1360,
        margin: '0 auto',
        padding: '24px 20px 80px',
      }}>
        <div className="home-hero" style={{
          background: 'var(--gradient-hero-sky)',
          borderRadius: 36,
          padding: '72px 24px 80px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Recognition Laurel Pair per DESIGN (2).md */}
          <div className="recognition-laurel-pair">
            <div className="recognition-laurel-item">
              <LeafIcon />
              <span>{isRtl ? 'جائزة الابتكار الصحي الرقمي 2026' : 'Digital Health Innovation Award 2026'}</span>
              <LeafIcon />
            </div>
            <span style={{ color: 'var(--color-body-gray)', opacity: 0.5 }}>•</span>
            <div className="recognition-laurel-item">
              <LeafIcon />
              <span>{isRtl ? 'معايير العزل السحابي الطبي المعتمد' : 'HIPAA & HL7/FHIR Architectural Standard'}</span>
              <LeafIcon />
            </div>
          </div>

          {/* Hero Display Headline */}
          <h1
            className="text-hero-display"
            style={{
              maxWidth: 960,
              margin: '16px auto 24px',
            }}
          >
            {t.hero.title}
          </h1>

          {/* Supporting Copy in Body Gray */}
          <p
            className="text-subhead"
            style={{
              maxWidth: 780,
              margin: '0 auto 36px',
            }}
          >
            {t.hero.description}
          </p>

          {/* Conversion Actions: Charcoal Download Pill + Secondary Cloud Pill */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentView('demo')}
              className="btn-pill btn-pill-charcoal"
              style={{
                fontSize: 16,
                padding: '12px 28px',
                borderRadius: 128,
              }}
            >
              <span>{t.hero.ctaDemo}</span>
              <span style={{ fontSize: 18 }}>→</span>
            </button>
            <button
              onClick={() => setCurrentView('login')}
              className="btn-pill btn-pill-cloud"
              style={{
                fontSize: 16,
                padding: '12px 28px',
                borderRadius: 128,
                background: 'var(--color-glass)',
              }}
            >
              <span>{t.hero.ctaLogin}</span>
            </button>
          </div>

          {/* Hero Rating Strip per DESIGN (2).md */}
          <div className="hero-rating-strip" style={{ justifyContent: 'center' }}>
            <span className="star-rating">★★★★★</span>
            <span>4.9 / 5.0</span>
            <span>•</span>
            <span>{isRtl ? 'موثوق لدى كبرى المراكز والعيادات التخصصية' : 'Trusted by leading hospitals and multi-tenant clinics'}</span>
          </div>

          {/* Overlapping Device & Health Data Composition */}
          <div style={{
            maxWidth: 1040,
            margin: '56px auto 0',
            position: 'relative',
          }}>
            {/* Main Clinical Dashboard Preview Surface */}
            <div style={{
              background: 'var(--color-glass)',
              borderRadius: 28,
              padding: '36px',
              boxShadow: 'var(--shadow-float)',
              border: '1px solid var(--color-glass-border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: 24,
              textAlign: isRtl ? 'right' : 'left',
            }}>
              {/* Device Card 1: Multi-Color Health Rings (Recovery Green, Metric Blue, Sleep Lilac, Coral Signal) */}
              <div style={{
                background: 'var(--color-cloud-card)',
                borderRadius: 20,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 520, color: 'var(--color-body-gray)', textTransform: 'uppercase' }}>
                    {isRtl ? 'حلقات الرعاية الحيوية' : 'Health Metric Rings'}
                  </span>
                  <span className="status-badge badge-approved" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span className="telemetry-beacon" />
                    <span>{isRtl ? 'متصل ومُوثّق' : 'Live Synced'}</span>
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, margin: '16px 0' }}>
                  {/* Circular Score Visual with CSS SVG */}
                  <div style={{ position: 'relative', width: 120, height: 120 }}>
                    <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="60" cy="60" r="50" stroke="var(--color-cloud-card-hover)" strokeWidth="8" fill="none" />
                      <circle cx="60" cy="60" r="50" className="ring-green-draw" stroke="var(--color-recovery-green)" strokeWidth="8" strokeDasharray="314" strokeDashoffset="40" strokeLinecap="round" fill="none" />
                      <circle cx="60" cy="60" r="38" className="ring-blue-draw" stroke="var(--color-metric-blue)" strokeWidth="8" strokeDasharray="238" strokeDashoffset="35" strokeLinecap="round" fill="none" />
                      <circle cx="60" cy="60" r="26" className="ring-lilac-draw" stroke="var(--color-sleep-lilac)" strokeWidth="8" strokeDasharray="163" strokeDashoffset="25" strokeLinecap="round" fill="none" />
                    </svg>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 560, color: 'var(--color-ink)', lineHeight: 1 }}>98%</span>
                      <span style={{ fontSize: 10, color: 'var(--color-body-gray)', marginTop: 2 }}>
                        {isRtl ? 'توافق سريري' : 'Vitals Score'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="metric-chip">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-recovery-green)' }} />
                      <span>{isRtl ? 'تعافي وعلامات طبيعية' : 'Recovery 94%'}</span>
                    </div>
                    <div className="metric-chip">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-metric-blue)' }} />
                      <span>{isRtl ? 'عزل المنشآت 100%' : 'Isolation 100%'}</span>
                    </div>
                    <div className="metric-chip">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-sleep-lilac)' }} />
                      <span>{isRtl ? 'متابعة دورية' : 'Continuity 92%'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-body-gray)', textAlign: 'center' }}>
                  {isRtl ? 'تحديث لحظي من الملف الطبي الموحد' : 'Real-time telemetry from validated patient encounters'}
                </div>
              </div>

              {/* Device Card 2: Clinical Vitals & Patient Snapshot */}
              <div style={{
                background: 'var(--color-cloud-card)',
                borderRadius: 20,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: 'var(--color-charcoal)',
                      color: 'var(--color-cloud-card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 520,
                    }}>
                      م.ع
                    </div>
                    <div>
                      <div style={{ fontWeight: 520, fontSize: 15, color: 'var(--color-ink)' }}>
                        {isRtl ? 'محمد المنصور (المريض)' : 'Mohammed Al-Mansoor'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>
                        MRN: SA-2026-90412 · O+
                      </div>
                    </div>
                  </div>
                  <span className="status-badge badge-info">{isRtl ? 'معتمد' : 'Verified'}</span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                  margin: '20px 0',
                }}>
                  <div style={{ background: 'var(--color-bg-elevated)', padding: '12px', borderRadius: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-body-gray)', display: 'block' }}>
                      {isRtl ? 'ضغط الدم (BP)' : 'Blood Pressure'}
                    </span>
                    <strong style={{ fontSize: 18, color: 'var(--color-ink)' }}>120/80</strong>
                    <span style={{ fontSize: 11, color: 'var(--color-recovery-green)', marginInlineStart: 4 }}>mmHg</span>
                  </div>
                  <div style={{ background: 'var(--color-bg-elevated)', padding: '12px', borderRadius: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-body-gray)', display: 'block' }}>
                      {isRtl ? 'أكسجين الدم (SpO2)' : 'Oxygen (SpO2)'}
                    </span>
                    <strong style={{ fontSize: 18, color: 'var(--color-metric-blue)' }}>99%</strong>
                    <span style={{ fontSize: 11, color: 'var(--color-body-gray)', marginInlineStart: 4 }}>Normal</span>
                  </div>
                  <div style={{ background: 'var(--color-bg-elevated)', padding: '12px', borderRadius: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-body-gray)', display: 'block' }}>
                      {isRtl ? 'نبض القلب (Pulse)' : 'Heart Rate'}
                    </span>
                    <strong style={{ fontSize: 18, color: 'var(--color-ink)' }}>72</strong>
                    <span style={{ fontSize: 11, color: 'var(--color-coral-signal)', marginInlineStart: 4 }}>bpm</span>
                  </div>
                  <div style={{ background: 'var(--color-bg-elevated)', padding: '12px', borderRadius: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-body-gray)', display: 'block' }}>
                      {isRtl ? 'حرارة الجسم (Temp)' : 'Temperature'}
                    </span>
                    <strong style={{ fontSize: 18, color: 'var(--color-ink)' }}>37.0°C</strong>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 12,
                  borderTop: '1px solid var(--color-border-subtle)',
                  fontSize: 12,
                  color: 'var(--color-body-gray)',
                }}>
                  <span>{isRtl ? 'المركز المعالج: مركز النور التخصصي' : 'Attending: Noor Specialty Clinic'}</span>
                  <span style={{ color: 'var(--color-recovery-green)', fontWeight: 520 }}>
                    {isRtl ? 'توقيع الطبيب معتمد ✓' : 'Signed by Dr. Faisal ✓'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. Wearable & Health Ecosystem Compatibility Row per DESIGN (2).md
          ========================================================================= */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px 80px',
        textAlign: 'center',
      }}>
        <h2
          className="text-section-label"
          style={{
            marginBottom: 24,
            fontSize: 24,
            fontWeight: 520,
            letterSpacing: '-0.24px',
            color: 'var(--color-ink)',
          }}
        >
          {isRtl
            ? 'متوافق مع أجهزة القياس والمنظومات الصحية المعتمدة'
            : 'Compatible with Medical Standards and Wearable Health Ecosystems'}
        </h2>

        <div className="wearable-partner-row">
          <div className="partner-wordmark">
            <span>🍎</span> Apple HealthKit
          </div>
          <div className="partner-wordmark">
            <span>⚡</span> WHOOP 4.0
          </div>
          <div className="partner-wordmark">
            <span>💍</span> Oura Ring Gen 3
          </div>
          <div className="partner-wordmark">
            <span>⌚</span> Garmin Health
          </div>
          <div className="partner-wordmark">
            <span>🔥</span> HL7 / FHIR R4
          </div>
          <div className="partner-wordmark">
            <span>🇸🇦</span> Saudi Seha & Mawid
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. Cloud Feature Cards (borderless, #ebf0f8 surfaces, 24px radius, 32px padding)
          ========================================================================= */}
      <section style={{
        maxWidth: 1240,
        margin: '0 auto',
        padding: '0 24px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2
            className="text-display"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3.2rem)',
              maxWidth: 820,
              margin: '0 auto 16px',
            }}
          >
            {t.features.title}
          </h2>
          <p className="text-subhead" style={{ maxWidth: 650, margin: '0 auto' }}>
            {isRtl
              ? 'معمارية سحابية رائدة تُحقق التوازن الكامل بين توحيد السجل وسرية بيانات كل منشأة'
              : 'A cloud architecture achieving flawless synergy between unified health history and zero-leak tenant isolation'}
          </p>
        </div>

        {/* 3-Column Cloud Feature Cards Row per DESIGN (2).md */}
        <div className="home-feature-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: 24,
        }}>
          {/* Feature Card 1 */}
          <div className="cloud-feature-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'var(--color-paper-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 24,
                boxShadow: 'var(--shadow-sm)',
              }}>
                🏢
              </div>
              <h3 className="text-card-heading" style={{ fontSize: 28, marginBottom: 16 }}>
                {t.features.f1_title}
              </h3>
              <p className="text-body" style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 28 }}>
                {t.features.f1_desc}
              </p>
            </div>

            {/* Inset Metric Visualization */}
            <div style={{
              background: 'var(--color-paper-white)',
              borderRadius: 16,
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-body-gray)', display: 'block' }}>
                  {isRtl ? 'حاجز العزل' : 'Tenant Isolation Shield'}
                </span>
                <span style={{ fontSize: 16, fontWeight: 520, color: 'var(--color-metric-blue)' }}>
                  X-Organization-Id
                </span>
              </div>
              <span className="status-badge badge-info">{isRtl ? '100% معزول' : '100% Enforced'}</span>
            </div>
          </div>

          {/* Feature Card 2 */}
          <div className="cloud-feature-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'var(--color-paper-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 24,
                boxShadow: 'var(--shadow-sm)',
              }}>
                🩺
              </div>
              <h3 className="text-card-heading" style={{ fontSize: 28, marginBottom: 16 }}>
                {t.features.f2_title}
              </h3>
              <p className="text-body" style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 28 }}>
                {t.features.f2_desc}
              </p>
            </div>

            {/* Inset Metric Visualization */}
            <div style={{
              background: 'var(--color-paper-white)',
              borderRadius: 16,
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-body-gray)', display: 'block' }}>
                  {isRtl ? 'حالة المسودة' : 'Draft Protocol'}
                </span>
                <span style={{ fontSize: 16, fontWeight: 520, color: 'var(--color-recovery-green)' }}>
                  Human In-The-Loop
                </span>
              </div>
              <span className="status-badge badge-approved">{isRtl ? 'موافقة الطبيب إلزامية' : 'Doctor Sign-off'}</span>
            </div>
          </div>

          {/* Feature Card 3 */}
          <div className="cloud-feature-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'var(--color-paper-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 24,
                boxShadow: 'var(--shadow-sm)',
              }}>
                📅
              </div>
              <h3 className="text-card-heading" style={{ fontSize: 28, marginBottom: 16 }}>
                {t.features.f3_title}
              </h3>
              <p className="text-body" style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 28 }}>
                {t.features.f3_desc}
              </p>
            </div>

            {/* Inset Metric Visualization */}
            <div style={{
              background: 'var(--color-paper-white)',
              borderRadius: 16,
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <span style={{ fontSize: 12, color: 'var(--color-body-gray)', display: 'block' }}>
                  {isRtl ? 'فحص التعارض' : 'Conflict Prevention'}
                </span>
                <span style={{ fontSize: 16, fontWeight: 520, color: 'var(--color-sleep-lilac)' }}>
                  Server Conflict Logic
                </span>
              </div>
              <span className="status-badge badge-lilac">{isRtl ? '0 تضارب مواعيد' : 'Zero Overlap'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. Community & Clinical Story Carousel per DESIGN (2).md
          ========================================================================= */}
      <section style={{
        maxWidth: 1240,
        margin: '0 auto',
        padding: '0 24px 80px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="text-display" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)' }}>
            {isRtl ? 'قصص النجاح الميدانية والتجربة السريرية' : 'Clinical Stories & Patient Experiences'}
          </h2>
          <p className="text-subhead" style={{ maxWidth: 600, margin: '8px auto 0' }}>
            {isRtl
              ? 'كيف تسهم نسيج في حماية المرضى وتسهيل عمل الكوادر الطبية كل صباح'
              : 'Empowering physicians and keeping patients safe every single day'}
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: 24,
        }}>
          {/* Story Tile 1 */}
          <div className="community-story-tile" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--color-cloud-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>
                🩺
              </div>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 520, color: 'var(--color-ink)' }}>
                  {isRtl ? 'د. فيصل الشمري' : 'Dr. Faisal Al-Shammari'}
                </h4>
                <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>
                  {isRtl ? 'استشاري أمراض القلب · مركز النور' : 'Consultant Cardiologist · Noor Clinic'}
                </span>
              </div>
            </div>
            <p style={{ fontSize: 15, color: 'var(--color-body-gray)', lineHeight: 1.6, marginBottom: 16 }}>
              {isRtl
                ? '"بفضل نسيج، أتمكن من توثيق الزيارات ومراجعة التحاليل كمسودات، ولا يُتاح أي تشخيص للمريض قبل اعتماده النهائي، مما يضمن أقصى معايير السلامة السريرية."'
                : '"Naseej ensures all my notes and lab orders remain unexposed drafts until I formally review and sign them off, guaranteeing complete clinical safety."'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="status-badge badge-approved">{isRtl ? 'اعتماد بشري' : 'Human Review'}</span>
              <span className="status-badge badge-info">{isRtl ? 'ملف متكامل' : 'Unified'}</span>
            </div>
          </div>

          {/* Story Tile 2 */}
          <div className="community-story-tile" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--color-cloud-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>
                🛎️
              </div>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 520, color: 'var(--color-ink)' }}>
                  {isRtl ? 'نورة القحطاني' : 'Noura Al-Qahtani'}
                </h4>
                <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>
                  {isRtl ? 'مشرفة الاستقبال وتنسيق المواعيد' : 'Lead Receptionist · Noor Health'}
                </span>
              </div>
            </div>
            <p style={{ fontSize: 15, color: 'var(--color-body-gray)', lineHeight: 1.6, marginBottom: 16 }}>
              {isRtl
                ? '"انتهت تماماً مشاكل الحجز المزدوج وتضارب مواعيد الأطباء. نسجل حضور المراجعين في ثوانٍ، ويصل الإشعار فوراً لغرفة الطبيب."'
                : '"Double booking conflicts are completely eliminated. Patient check-in takes seconds and updates the clinician queue in real time."'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="status-badge badge-lilac">{isRtl ? 'تسجيل حضور فوري' : 'Instant Arrival'}</span>
              <span className="status-badge badge-draft">{isRtl ? 'منع التضارب' : 'Zero Conflicts'}</span>
            </div>
          </div>

          {/* Story Tile 3 */}
          <div className="community-story-tile" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--color-cloud-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}>
                🌟
              </div>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 520, color: 'var(--color-ink)' }}>
                  {isRtl ? 'محمد المنصور' : 'Mohammed Al-Mansoor'}
                </h4>
                <span style={{ fontSize: 12, color: 'var(--color-body-gray)' }}>
                  {isRtl ? 'مريض ومستفيد من المنصة' : 'Verified Patient'}
                </span>
              </div>
            </div>
            <p style={{ fontSize: 15, color: 'var(--color-body-gray)', lineHeight: 1.6, marginBottom: 16 }}>
              {isRtl
                ? '"أجد جميع وصفاتي المعتمدة وفحوصاتي السابقة في شاشة واحدة، وسجل الحساسية الدوائية متاح دائماً للأطباء لحمايتي دون الحاجة لتكرار الشرح."'
                : '"I have instant access to my approved prescriptions and allergy tags, while knowing my records at other hospitals remain strictly protected."'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="status-badge badge-approved">{isRtl ? 'بوابة المريض' : 'Patient Portal'}</span>
              <span className="status-badge badge-info">{isRtl ? 'سجل موحد' : 'Secure Vault'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. Elevated QR Download & Callout Card per DESIGN (2).md
          ========================================================================= */}
      <section style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px 100px',
      }}>
        <div className="elevated-qr-card home-security-panel" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 36,
          padding: '44px 48px',
        }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              borderRadius: 128,
              background: 'color-mix(in srgb, var(--color-text-inverse) 15%, transparent)',
              color: 'var(--color-text-inverse)',
              fontSize: 12,
              fontWeight: 520,
              marginBottom: 16,
            }}>
              <LockIcon />
              <span>{isRtl ? 'المبدأ الجوهري لمنصة نسيج' : 'Core Architecture Commitment'}</span>
            </div>
            <h3 style={{ fontSize: 32, fontWeight: 520, letterSpacing: '-0.8px', color: 'var(--color-text-inverse)', marginBottom: 14 }}>
              {isRtl
                ? 'الربط السحابي لا يعني فتح السجلات للجميع'
                : 'Connecting Healthcare Never Means Exposing Patient Records'}
            </h3>
            <p style={{ fontSize: 16, color: 'color-mix(in srgb, var(--color-text-inverse) 78%, transparent)', lineHeight: 1.6 }}>
              {isRtl
                ? 'كل سجل طبي يحتفظ بمصدره، وطابعه الزمني، وحدود الوصول الخاصة به. لا يملك أي ذكاء اصطناعي سلطة التشخيص المستقل، والقرار الطبي النهائي يبقى دائماً مسؤولية الطبيب المعالج.'
                : 'Every medical item retains its source, timestamp, and isolation boundaries. No software or AI autonomously makes clinical decisions; final medical responsibility always remains with the human clinician.'}
            </p>
          </div>

          {/* Elevated QR Card */}
          <div style={{
            background: 'color-mix(in srgb, var(--color-text-inverse) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-text-inverse) 15%, transparent)',
            borderRadius: 20,
            padding: '24px 28px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}>
            {/* High-Contrast QR Code representation */}
            <div style={{
              width: 110,
              height: 110,
              background: 'var(--color-cream-paper)',
              borderRadius: 12,
              padding: 8,
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 4,
            }}>
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />

              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />

              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />

              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />

              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-cream-paper)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
              <div style={{ background: 'var(--color-forest-ink)', borderRadius: 2 }} />
            </div>

            <div style={{ fontSize: 13, color: 'var(--color-text-inverse)', fontWeight: 480 }}>
              {isRtl ? 'امسح للوصول السريع للجوال' : 'Scan for Mobile Portal'}
            </div>

            <button
              onClick={() => setCurrentView('demo')}
              className="btn-pill"
              style={{
                background: 'var(--color-cloud-card)',
                color: 'var(--color-charcoal)',
                fontSize: 14,
                padding: '8px 18px',
                fontWeight: 520,
              }}
            >
              {t.hero.ctaDemo}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
