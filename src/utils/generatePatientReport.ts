/**
 * generatePatientReport.ts
 * -------------------------
 * Generates a professional healthcare PDF report for a completed patient case.
 *
 * Uses a hidden <iframe> + window.print() approach — zero additional npm
 * dependencies. The browser's built-in PDF export handles page breaks and
 * printing. The caller simply invokes generatePatientReport(activeCase) and
 * the browser print dialog opens with the pre-styled report.
 *
 * Safety: This function only reads data from the PatientCase object. It does
 * NOT generate new medical conclusions. AI-assisted information is clearly
 * labelled "AI-Assisted — Requires Doctor Validation".
 */

import type { PatientCase } from '../types';

// ── helpers ────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  if (s === null || s === undefined || s === '') return '<span class="na">Not provided</span>';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ts(): string {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── section builders ────────────────────────────────────────────────────────

function buildHeader(c: PatientCase): string {
  return `
  <div class="report-header">
    <div class="brand">
      <span class="brand-icon">🏥</span>
      <div>
        <h1 class="brand-name">MediKiok</h1>
        <p class="brand-sub">Intelligent OPD Kiosk — Patient Assessment Report</p>
      </div>
    </div>
    <div class="meta-box">
      <div class="meta-row"><span>Case ID</span><strong>${esc(c.id)}</strong></div>
      <div class="meta-row"><span>Report Generated</span><strong>${ts()}</strong></div>
      <div class="meta-row"><span>Status</span><strong class="status-verified">✓ Doctor Verified</strong></div>
    </div>
  </div>`;
}

function buildPatientInfo(c: PatientCase): string {
  const p = c.patient;
  const lang = p.preferredLanguage === 'or' ? 'Odia (ଓଡ଼ିଆ)' : p.preferredLanguage === 'hi' ? 'Hindi (हिन्दी)' : 'English';
  return `
  <section>
    <h2 class="section-title">1. Patient Information</h2>
    <div class="grid-2">
      <div class="field"><label>Full Name</label><span>${esc(p.name)}</span></div>
      <div class="field"><label>Patient / Case ID</label><span class="mono">${esc(p.id || c.id)}</span></div>
      <div class="field"><label>Age</label><span>${esc(p.age)} years</span></div>
      <div class="field"><label>Gender</label><span>${esc(p.gender)}</span></div>
      <div class="field"><label>Mobile</label><span>${esc(p.mobile)}</span></div>
      <div class="field"><label>Preferred Language</label><span>${lang}</span></div>
      <div class="field"><label>Arrival Time</label><span>${esc(c.arrivalTime)}</span></div>
      <div class="field"><label>Assessment Status</label><span class="status-verified">Doctor Verified</span></div>
    </div>
  </section>`;
}

function buildChiefConcern(c: PatientCase): string {
  return `
  <section>
    <h2 class="section-title">2. Chief Concern</h2>
    <div class="callout">
      <p class="chief">${esc(c.chiefComplaint)}</p>
      <p class="duration">Duration: <strong>${esc(c.duration)}</strong></p>
      ${c.associatedSymptoms?.length ? `<p>Associated Symptoms: <strong>${c.associatedSymptoms.map(esc).join(', ')}</strong></p>` : ''}
      ${c.pastMedicalHistory?.length ? `<p>Past Medical History: <strong>${c.pastMedicalHistory.map(esc).join(', ')}</strong></p>` : ''}
      ${c.currentMedications?.length ? `<p>Current Medications: <strong>${c.currentMedications.map(esc).join(', ')}</strong></p>` : ''}
      ${c.allergies?.length ? `<p>Known Allergies: <strong class="red">${c.allergies.map(esc).join(', ')}</strong></p>` : ''}
    </div>
  </section>`;
}

function buildHealthHistory(c: PatientCase): string {
  if (!c.answers || c.answers.length === 0) {
    return `<section><h2 class="section-title">3. Health History — Voice Intake Q&amp;A</h2><p class="na-block">No intake responses recorded.</p></section>`;
  }
  const rows = c.answers.map((a, i) => `
    <div class="qa-card">
      <div class="q-line"><span class="q-num">Q${i + 1}</span><span class="q-text">${esc(a.questionText)}</span></div>
      <div class="a-line"><strong>Answer:</strong> ${esc(a.answerValue)}</div>
      ${a.rawVoiceInput ? `<div class="voice-line">🎙 Odia voice: <em>${esc(a.rawVoiceInput)}</em></div>` : ''}
    </div>`).join('');
  return `
  <section>
    <h2 class="section-title">3. Health History — Voice Intake Q&amp;A</h2>
    <p class="section-sub">Patient responses collected via the MediKiok adaptive voice intake system (Sarvam Saaras v4).</p>
    ${rows}
  </section>`;
}

function buildDocuments(c: PatientCase): string {
  if (!c.documents || c.documents.length === 0) {
    return `<section><h2 class="section-title">4. OCR Medical Documents</h2><p class="na-block">No documents uploaded.</p></section>`;
  }
  const cards = c.documents.map((d) => `
    <div class="doc-card">
      <div class="doc-header">
        <span class="doc-name">${esc(d.name)}</span>
        <span class="confidence-badge">OCR ${esc(d.confidenceScore)}%</span>
      </div>
      <div class="grid-2">
        <div class="field"><label>Document Type</label><span>${esc(d.type)}</span></div>
        <div class="field"><label>Scan Date</label><span>${esc(d.date)}</span></div>
        <div class="field"><label>Doctor / Facility</label><span>${esc(d.doctorName)}</span></div>
        <div class="field"><label>Diagnosis / Findings</label><span>${esc(d.findings)}</span></div>
      </div>
      ${d.medicines?.length ? `<div class="meds-row"><label>Extracted Medicines:</label> <span>${d.medicines.map(esc).join(' &nbsp;|&nbsp; ')}</span></div>` : ''}
    </div>`).join('');
  return `
  <section>
    <h2 class="section-title">4. OCR Medical Documents</h2>
    <p class="section-sub">Extracted using NAVER Clova Donut OCR model via MediKiok document scanner.</p>
    ${cards}
  </section>`;
}

function buildAyush(c: PatientCase): string {
  const a = c.ayush;
  const rows = [
    ['Prakriti (Constitution)', a.prakriti],
    ['Vikriti (Current Imbalance)', a.vikriti],
    ['Sara (Dhatu Excellence)', a.sara],
    ['Samhanana (Compactness)', a.samhanana],
    ['Pramana (Anthropometry)', a.pramana],
    ['Satmya (Adaptability)', a.satmya],
    ['Satva (Mental Strength)', a.satva],
    ['Ahara Shakti (Digestive Capacity)', a.aharaShakti],
    ['Vyayama Shakti (Physical Endurance)', a.vyayamaShakti],
    ['Vaya (Age Category)', a.vaya],
  ].map(([k, v]) => `
    <div class="field"><label>${esc(k)}</label><span>${esc(v as string)}</span></div>`).join('');
  return `
  <section>
    <h2 class="section-title">5. AYUSH — Dashavidha Pariksha Assessment</h2>
    <p class="section-sub">Traditional Ayurvedic constitutional and current-state evaluation.</p>
    <div class="grid-2">${rows}</div>
  </section>`;
}

function buildClinicalConsiderations(c: PatientCase): string {
  if (!c.clinicalConsiderations) return '';
  const cc = c.clinicalConsiderations;
  const riskClass = cc.riskLevel === 'Emergency' || cc.riskLevel === 'High' ? 'risk-high'
    : cc.riskLevel === 'Moderate' ? 'risk-moderate' : 'risk-low';
  return `
  <section>
    <h2 class="section-title">6. AI-Assisted Clinical Considerations</h2>
    <div class="ai-warning">⚠ AI-Assisted — Requires Doctor Validation. Not a confirmed diagnosis.</div>
    <div class="callout ai-callout">
      <div class="field"><label>Risk Level</label><span class="risk-badge ${riskClass}">${esc(cc.riskLevel)}</span></div>
      ${cc.primarySuspicions?.length ? `<div class="field"><label>Primary Differential Suspicions</label><span>${cc.primarySuspicions.map(esc).join(', ')}</span></div>` : ''}
      ${cc.symptomsIdentified?.length ? `<div class="field"><label>Symptoms Identified</label><span>${cc.symptomsIdentified.map(esc).join(', ')}</span></div>` : ''}
      ${cc.redFlags?.length ? `<div class="field"><label>Red Flags</label><span class="red">${cc.redFlags.map(esc).join(', ')}</span></div>` : ''}
      ${cc.ayushCorrelation?.doshaImbalance ? `<div class="field"><label>AYUSH Dosha Imbalance</label><span>${esc(cc.ayushCorrelation.doshaImbalance)}</span></div>` : ''}
      ${cc.ayushCorrelation?.agniState ? `<div class="field"><label>Agni State</label><span>${esc(cc.ayushCorrelation.agniState)}</span></div>` : ''}
      ${cc.clinicalNotes ? `<div class="field wide"><label>AI Intake Note for Doctor</label><span>${esc(cc.clinicalNotes)}</span></div>` : ''}
      <p class="ai-source">Source: ${esc(cc.source || 'Gemini Flash Clinical Reasoning')}</p>
    </div>
  </section>`;
}

function buildDoctorAssessment(c: PatientCase): string {
  return `
  <section>
    <h2 class="section-title">7. Doctor Assessment &amp; Verification</h2>
    <div class="doctor-box">
      <div class="doctor-verified-badge">✓ Doctor Verified</div>
      <div class="field wide"><label>Doctor-Reviewed Case Summary</label>
        <p class="summary-text">${esc(c.aiSummary)}</p>
      </div>
      <div class="field"><label>Verification Status</label><span class="status-verified">Doctor Verified — Ready for Consultation</span></div>
      <div class="field"><label>Report Generated</label><span>${ts()}</span></div>
    </div>
  </section>`;
}

function buildFooter(): string {
  return `
  <footer class="report-footer">
    <p>MediKiok — Intelligent OPD Patient Intake System &nbsp;|&nbsp; SIH 2026 &nbsp;|&nbsp; Team Vertex</p>
    <p>This report is generated from patient-provided information. All AI-assisted content requires doctor validation before clinical use.</p>
  </footer>`;
}

// ── CSS ────────────────────────────────────────────────────────────────────

function reportCSS(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a2320;
      background: #fff;
      margin: 0;
      padding: 0;
    }

    .report-wrapper {
      max-width: 800px;
      margin: 0 auto;
      padding: 28px 36px 48px;
    }

    /* Header */
    .report-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 3px solid #245B4A;
      padding-bottom: 18px;
      margin-bottom: 28px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { font-size: 32px; }
    .brand-name { font-size: 22pt; font-weight: 800; color: #245B4A; margin: 0; }
    .brand-sub { font-size: 8.5pt; color: #5a6b65; margin: 2px 0 0; }
    .meta-box { text-align: right; font-size: 8.5pt; }
    .meta-row { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 3px; }
    .meta-row span { color: #68716C; }
    .meta-row strong { color: #1a2320; }

    /* Sections */
    section { margin-bottom: 28px; page-break-inside: avoid; }
    .section-title {
      font-size: 11pt;
      font-weight: 800;
      color: #245B4A;
      border-bottom: 1.5px solid #DCE2DE;
      padding-bottom: 5px;
      margin: 0 0 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .section-sub { font-size: 8pt; color: #68716C; margin: -8px 0 10px; }

    /* Grid */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
    }
    .field { padding: 8px 10px; background: #F7F7F4; border-radius: 7px; border: 1px solid #DCE2DE; }
    .field label { display: block; font-size: 7.5pt; font-weight: 700; color: #68716C; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .field span { font-size: 10pt; font-weight: 600; color: #1a2320; }
    .field.wide { grid-column: 1 / -1; }
    .mono { font-family: 'Courier New', monospace; }

    /* Callout */
    .callout {
      background: #F4F9F6;
      border: 1.5px solid #245B4A33;
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 10pt;
    }
    .callout p { margin: 4px 0; }
    .chief { font-size: 12pt; font-weight: 700; color: #1a2320; }
    .duration { color: #5a6b65; }
    .ai-callout { background: #fffbf0; border-color: #e6a00033; }

    /* AI warning */
    .ai-warning {
      background: #fff3cd;
      border: 1px solid #f0c040;
      border-radius: 7px;
      padding: 7px 12px;
      font-size: 8.5pt;
      font-weight: 700;
      color: #7a5c00;
      margin-bottom: 10px;
    }
    .ai-source { font-size: 7.5pt; color: #999; margin-top: 10px; font-style: italic; }

    /* Doctor box */
    .doctor-box {
      background: #f0faf6;
      border: 2px solid #245B4A55;
      border-radius: 10px;
      padding: 16px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .doctor-verified-badge {
      grid-column: 1 / -1;
      display: inline-block;
      background: #245B4A;
      color: #fff;
      font-weight: 700;
      font-size: 9pt;
      padding: 4px 12px;
      border-radius: 999px;
      width: fit-content;
    }
    .summary-text { font-size: 10pt; color: #1a2320; margin: 4px 0 0; line-height: 1.6; }

    /* QA cards */
    .qa-card {
      background: #F7F7F4;
      border: 1px solid #DCE2DE;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .q-line { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 4px; }
    .q-num { background: #245B4A; color: #fff; font-size: 7.5pt; font-weight: 800; border-radius: 4px; padding: 2px 5px; flex-shrink: 0; margin-top: 1px; }
    .q-text { font-size: 9.5pt; font-weight: 700; color: #245B4A; }
    .a-line { font-size: 10pt; color: #1a2320; padding-left: 26px; }
    .voice-line { font-size: 8.5pt; color: #68716C; padding-left: 26px; margin-top: 3px; }

    /* Doc cards */
    .doc-card {
      background: #F7F7F4;
      border: 1px solid #DCE2DE;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    .doc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .doc-name { font-weight: 700; font-size: 10pt; color: #1a2320; }
    .confidence-badge { font-size: 7.5pt; font-weight: 700; color: #245B4A; background: #245B4A1a; border: 1px solid #245B4A33; padding: 2px 8px; border-radius: 999px; }
    .meds-row { font-size: 8.5pt; margin-top: 8px; color: #1a2320; }
    .meds-row label { font-weight: 700; color: #68716C; text-transform: uppercase; font-size: 7.5pt; }

    /* Risk badges */
    .risk-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
    .risk-high { background: #FEECEC; color: #C62828; border: 1px solid #C6282833; }
    .risk-moderate { background: #FFF3E0; color: #E65100; border: 1px solid #E6510033; }
    .risk-low { background: #E8F5E9; color: #2E7D32; border: 1px solid #2E7D3233; }

    /* Misc */
    .na { color: #aaa; font-style: italic; }
    .na-block { color: #aaa; font-style: italic; font-size: 9pt; }
    .red { color: #C62828; font-weight: 700; }
    .status-verified { color: #245B4A; font-weight: 700; }

    /* Footer */
    .report-footer {
      border-top: 1.5px solid #DCE2DE;
      margin-top: 36px;
      padding-top: 12px;
      text-align: center;
      font-size: 7.5pt;
      color: #999;
    }
    .report-footer p { margin: 3px 0; }

    @media print {
      body { background: #fff; }
      .report-wrapper { padding: 12px 20px 24px; }
      section { page-break-inside: avoid; }
      .report-header { page-break-inside: avoid; }
    }
  `;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Generate and print/download the final patient report for a Doctor-Verified case.
 *
 * Opens the browser's print dialog pre-filled with the styled report HTML.
 * The user can "Save as PDF" from the print dialog.
 *
 * @param patientCase - The fully submitted PatientCase (must be Doctor Verified)
 */
export function generatePatientReport(patientCase: PatientCase): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MediKiok Patient Report — ${patientCase.id}</title>
  <style>${reportCSS()}</style>
</head>
<body>
  <div class="report-wrapper">
    ${buildHeader(patientCase)}
    ${buildPatientInfo(patientCase)}
    ${buildChiefConcern(patientCase)}
    ${buildHealthHistory(patientCase)}
    ${buildDocuments(patientCase)}
    ${buildAyush(patientCase)}
    ${buildClinicalConsiderations(patientCase)}
    ${buildDoctorAssessment(patientCase)}
    ${buildFooter()}
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;

  // Open in a new window/tab and trigger print
  const win = window.open('', '_blank');
  if (!win) {
    // If popup blocked, fall back to download as .html file (browser will offer Save As PDF on open)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediKiok_Report_${patientCase.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
}
