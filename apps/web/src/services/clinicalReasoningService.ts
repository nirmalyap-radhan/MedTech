/**
 * clinicalReasoningService.ts
 * ----------------------------
 * Real-time Clinical Reasoning & Adaptive Next Best Question generation
 * powered by Gemini Flash + Medical Knowledge Graph.
 *
 * Flow:
 * 1. Takes accumulated dialogue turns (Odia speech & English translations)
 * 2. Calls backend /api/clinical-reasoning (Gemini 1.5 Flash)
 * 3. Returns:
 *    - Real-time Clinical Considerations (Differentials, Symptoms, Red Flags, AYUSH Dosha)
 *    - Next Best Question (in Odia, Hindi, and English)
 */

import type { ClinicalConsiderations, DynamicClinicalQuestion, ClinicalDialogueTurn, Patient } from '../types';

export interface ClinicalReasoningResponse {
  status: 'success' | 'error';
  source?: string;
  clinicalConsiderations: ClinicalConsiderations;
  nextQuestion: DynamicClinicalQuestion;
  errorMessage?: string;
}

class ClinicalReasoningService {
  private backendUrl =
    (import.meta.env.VITE_VOICE_API_URL || 'http://localhost:5000/api/transcribe').replace('/api/transcribe', '/api/clinical-reasoning');

  public async evaluateClinicalDialogue(
    dialogueHistory: ClinicalDialogueTurn[],
    patientInfo: Partial<Patient>,
    latestRegional: string,
    latestEnglish: string
  ): Promise<ClinicalReasoningResponse> {
    try {
      const payload = {
        patient_info: {
          name: patientInfo.name || 'Patient',
          age: patientInfo.age || 45,
          gender: patientInfo.gender || 'Male',
        },
        dialogue_history: dialogueHistory.map((t) => ({
          question: t.question,
          answer_regional: t.answerRegional,
          answer_english: t.answerEnglish,
          category: t.category,
        })),
        latest_regional: latestRegional,
        latest_english: latestEnglish,
      };

      const response = await fetch(this.backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });

      if (!response.ok) {
        throw new Error(`Clinical backend returned status ${response.status}`);
      }

      const data = await response.json();

      const rawCc = data.clinical_considerations || {};
      const rawNq = data.next_question || {};

      const clinicalConsiderations: ClinicalConsiderations = {
        primarySuspicions: rawCc.primary_suspicions || ['Clinical Evaluation Pending'],
        symptomsIdentified: rawCc.symptoms_identified || [latestEnglish || 'General health concern'],
        redFlags: rawCc.red_flags || [],
        riskLevel: rawCc.risk_level || 'Mild',
        ayushCorrelation: {
          doshaImbalance: rawCc.ayush_correlation?.dosha_imbalance || 'Vata-Pitta Dushti',
          agniState: rawCc.ayush_correlation?.agni_state || 'Mandagni',
        },
        clinicalNotes: rawCc.clinical_notes || 'AI clinical case intake in progress.',
        source: data.source || 'gemini-flash',
      };

      const nextQuestion: DynamicClinicalQuestion = {
        id: rawNq.id || `dyn_q_${dialogueHistory.length + 2}`,
        category: rawNq.category || 'Symptoms',
        type: rawNq.type || 'yes-no',
        textEn: rawNq.text_en || 'Are you experiencing any associated symptoms?',
        textOr: rawNq.text_or || 'ଆପଣଙ୍କର ଏଥିସହ ଅନ୍ୟ କୌଣସି ଲକ୍ଷଣ ଅଛି କି?',
        textHi: rawNq.text_hi || 'क्या आपको इसके साथ कोई अन्य लक्षण भी हैं?',
        options: rawNq.options,
        placeholderEn: rawNq.placeholder_en,
        placeholderOr: rawNq.placeholder_or,
        placeholderHi: rawNq.placeholder_hi,
        isTerminal: rawNq.is_terminal ?? false,
      };

      return {
        status: 'success',
        source: data.source,
        clinicalConsiderations,
        nextQuestion,
      };
    } catch (err: any) {
      console.warn('[ClinicalReasoningService] Error invoking clinical reasoning API:', err);
      return this.fallbackReasoning(dialogueHistory, latestRegional, latestEnglish);
    }
  }

  private fallbackReasoning(
    dialogueHistory: ClinicalDialogueTurn[],
    latestRegional: string,
    latestEnglish: string
  ): ClinicalReasoningResponse {
    const text = (latestEnglish + ' ' + latestRegional).toLowerCase();
    
    // Symptom detection
    const isFever = text.includes('fever') || text.includes('ଜ୍ୱର') || text.includes('बुखार');
    const isCough = text.includes('cough') || text.includes('cold') || text.includes('କାଶ') || text.includes('खांसी');
    const isHeadache = text.includes('head') || text.includes('migraine') || text.includes('ମୁଣ୍ଡ') || text.includes('सिरदर्द');
    const isStomach = text.includes('stomach') || text.includes('abdomen') || text.includes('belly') || text.includes('ପେଟ') || text.includes('पेट');
    const isBodyPain = text.includes('body') || text.includes('joint') || text.includes('muscle') || text.includes('ଶରୀର') || text.includes('ବଦନ') || text.includes('दर्द');
    const isBreathless = text.includes('breath') || text.includes('chest') || text.includes('ଶ୍ୱାସ') || text.includes('सांस');
    const isNausea = text.includes('nausea') || text.includes('vomit') || text.includes('ବାନ୍ତି') || text.includes('उल्टी');

    let nextQ: DynamicClinicalQuestion;
    let suspicions: string[];
    let dosha: string;

    if (isCough) {
      suspicions = ['Viral Upper Respiratory Infection', 'Bronchitis', 'Allergic Cough'];
      dosha = 'Kapha-Vata Dushti in Pranavaha Srotas';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Is there phlegm with the cough or any difficulty breathing?',
        textOr: 'କାଶ ସହିତ କଫ ବାହାରୁଛି କିମ୍ବା ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ ହେଉଛି କି?',
        textHi: 'क्या खांसी के साथ बलगम आ रहा है या सांस लेने में तकलीफ है?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    } else if (isHeadache) {
      suspicions = ['Tension Headache', 'Migraine with Aura', 'Cervicogenic Strain'];
      dosha = 'Vata Dushti in Shiras (Shirashoola)';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Do you have dizziness, nausea, or eye strain with the headache?',
        textOr: 'ମୁଣ୍ଡବିନ୍ଧା ସହିତ ମୁଣ୍ଡ ବୁଲାଉଛି କିମ୍ବା ବାନ୍ତି ଭାବ ଲାଗୁଛି କି?',
        textHi: 'क्या सिरदर्द के साथ चक्कर आना या जी मिचलाना है?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    } else if (isStomach) {
      suspicions = ['Gastritis / Amlapitta', 'Functional Dyspepsia', 'Acute Enteritis'];
      dosha = 'Pitta-Vata Dushti (Amlapitta & Agnimandya)';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Do you have acidity, burning sensation, or vomiting with stomach pain?',
        textOr: 'ପେଟ ଯନ୍ତ୍ରଣା ସହିତ ଛାତି ପୋଡ଼ାଜଳା କିମ୍ବା ବାନ୍ତି ହେଉଛି କି?',
        textHi: 'क्या पेट दर्द के साथ जलन, खट्टी डकार या उल्टी है?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    } else if (isBodyPain) {
      suspicions = ['Inflammatory Arthropathy', 'Viral Myalgia', 'Vata Vyadhi'];
      dosha = 'Vata Dushti in Asthi-Sandhi';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Do you have joint swelling or stiffness when waking up in the morning?',
        textOr: 'ଗଣ୍ଠିରେ ଫୁଲା ଅଛି କିମ୍ବା ସକାଳେ ଶରୀର ଜଡ଼ ହୋଇଯାଉଛି କି?',
        textHi: 'क्या जोड़ों में सूजन है या सुबह उठने पर जकड़न होती है?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    } else if (isBreathless) {
      suspicions = ['Exertional Dyspnea', 'Bronchospasm', 'Cardiorespiratory Evaluation'];
      dosha = 'Vata-Kapha Dushti (Shwasa Roga)';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Does the breathlessness worsen while walking or lying flat?',
        textOr: 'ଚାଲିବା ବେଳେ କିମ୍ବା ଶୋଇବା ବେଳେ ଶ୍ୱାସକଷ୍ଟ ଅଧିକ ହେଉଛି କି?',
        textHi: 'क्या चलने पर या सीधे लेटने पर सांस ज्यादा फूलती है?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    } else if (isNausea) {
      suspicions = ['Acute Gastroenteritis', 'Biliary Reflux', 'Food Indigestion'];
      dosha = 'Pitta-Kapha Dushti (Chhardi)';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Have you had vomiting or loose motions today?',
        textOr: 'ଆଜି ଆପଣଙ୍କର ବାନ୍ତି କିମ୍ବା ତରଳ ଝାଡ଼ା ହୋଇଛି କି?',
        textHi: 'क्या आज आपको उल्टी या दस्त हुए हैं?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    } else {
      // Default fever / general concern
      suspicions = isFever ? ['Acute Febrile Illness (AFI)', 'Viral Fever'] : ['General Health Symptom Presentation'];
      dosha = 'Vata-Pitta Dushti (Jwara state)';
      nextQ = {
        id: `dyn_q_${dialogueHistory.length + 2}`,
        category: 'Symptoms',
        type: 'yes-no',
        textEn: 'Do you have chills, body ache, or cough along with your symptoms?',
        textOr: 'ଆପଣଙ୍କର ଥଣ୍ଡା, ଶରୀର ବିନ୍ଧା କିମ୍ବା କାଶ ହେଉଛି କି?',
        textHi: 'क्या आपको ठंड, शरीर में दर्द या खांसी है?',
        placeholderOr: 'ହଁ / ନା ବାଛନ୍ତୁ',
        placeholderHi: 'हाँ / नहीं चुनें',
        placeholderEn: 'Select Yes / No',
        isTerminal: false,
      };
    }

    return {
      status: 'success',
      source: 'client-fallback-engine',
      clinicalConsiderations: {
        primarySuspicions: suspicions,
        symptomsIdentified: [latestEnglish || latestRegional || 'Reported symptom'],
        redFlags: [],
        riskLevel: isBreathless ? 'High' : isFever ? 'Moderate' : 'Mild',
        ayushCorrelation: {
          doshaImbalance: dosha,
          agniState: 'Mandagni',
        },
        clinicalNotes: 'Dynamic clinical follow-up question prepared based on patient response.',
      },
      nextQuestion: nextQ,
    };
  }
}

export const clinicalReasoningService = new ClinicalReasoningService();
