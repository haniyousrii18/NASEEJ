// Generates docs/samples/synthetic-lab-report.pdf: a two-page, fully synthetic lab report for trying Naseej's
// AI document reading. Run from the repository root: node docs/samples/make-sample-pdf.mjs
import fs from 'fs';

const esc = (s) => s.replace(/([()\\])/g, '\\$1');
const text = (items) => items.map(([x, y, size, bold, t]) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`).join('\n');
const rule = (y) => `0.6 w 50 ${y} m 562 ${y} l S`;

const page1 =
  text([
    [50, 740, 18, 1, 'Al-Noor Medical Center - Clinical Laboratory'],
    [50, 720, 10, 0, 'SYNTHETIC DEMO DOCUMENT. Not a real patient. For Naseej testing only.'],
    [50, 685, 11, 1, 'Patient: Mohammed Al-Mansoor'], [330, 685, 11, 0, 'MRN: N-1001'],
    [50, 668, 11, 0, 'Date of birth: 1990-04-12'], [330, 668, 11, 0, 'Collected: 2026-09-30'],
    [50, 640, 13, 1, 'Complete Blood Count and Chemistry'],
    [50, 610, 10, 1, 'Test'], [250, 610, 10, 1, 'Result'], [350, 610, 10, 1, 'Unit'], [430, 610, 10, 1, 'Reference range'],
    [50, 590, 11, 0, 'Hemoglobin'], [250, 590, 11, 0, '11.2'], [350, 590, 11, 0, 'g/dL'], [430, 590, 11, 0, '12.0 - 15.5'],
    [50, 570, 11, 0, 'White blood cells'], [250, 570, 11, 0, '6.8'], [350, 570, 11, 0, 'x10^3/uL'], [430, 570, 11, 0, '4.0 - 11.0'],
    [50, 550, 11, 0, 'Platelets'], [250, 550, 11, 0, '245'], [350, 550, 11, 0, 'x10^3/uL'], [430, 550, 11, 0, '150 - 400'],
    [50, 530, 11, 0, 'Fasting glucose'], [250, 530, 11, 0, '112'], [350, 530, 11, 0, 'mg/dL'], [430, 530, 11, 0, '70 - 99'],
    [50, 510, 11, 0, 'HbA1c'], [250, 510, 11, 0, '6.1'], [350, 510, 11, 0, '%'], [430, 510, 11, 0, 'below 5.7'],
    [50, 470, 9, 0, 'Results are reported as measured. Interpretation is left to the treating clinician.'],
    [50, 40, 9, 0, 'Page 1 of 2'],
  ]) +
  '\n' + rule(625) + '\n' + rule(600);

const page2 = text([
  [50, 740, 16, 1, 'Clinical history summary (from the referring form)'],
  [50, 720, 10, 0, 'SYNTHETIC DEMO DOCUMENT. Not a real patient.'],
  [50, 680, 12, 1, 'Known allergies'],
  [50, 660, 11, 0, 'Known allergy: Penicillin (reaction: skin rash)'],
  [50, 620, 12, 1, 'Current medications'],
  [50, 600, 11, 0, 'Current medication: Metformin 500 mg twice daily'],
  [50, 580, 11, 0, 'Current medication: Vitamin D 1000 IU once daily'],
  [50, 540, 12, 1, 'Referral note'],
  [50, 520, 11, 0, 'Follow-up recommended with the endocrinology clinic in 3 months.'],
  [50, 40, 9, 0, 'Page 2 of 2'],
]);

const objs = [];
const add = (s) => (objs.push(s), objs.length);
const res = '/Resources << /Font << /F1 7 0 R /F2 8 0 R >> >>';
add('<< /Type /Catalog /Pages 2 0 R >>');
add('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');
add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ${res} >>`);
add(`<< /Length ${Buffer.byteLength(page1)} >>\nstream\n${page1}\nendstream`);
add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R ${res} >>`);
add(`<< /Length ${Buffer.byteLength(page2)} >>\nstream\n${page2}\nendstream`);
add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

let pdf = '%PDF-1.4\n';
const offsets = [];
objs.forEach((o, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

fs.writeFileSync('docs/samples/synthetic-lab-report.pdf', Buffer.from(pdf, 'latin1'));
console.log('written, bytes:', pdf.length);
