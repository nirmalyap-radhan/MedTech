/**
 * caseDatabaseService.ts
 * -----------------------
 * Real Clinical Database & Vector Search Service for MediKiok.
 * Connects to http://localhost:5000/api/cases & /api/vector/search.
 *
 * Provides persistent database operations for:
 * - Patient Cases (PostgreSQL / SQLite)
 * - Semantic Vector Search across clinical cases & guidelines
 * - Status updates (Case Ready -> Doctor Verified)
 * - Offline-safe fallback to initial seed cases
 */

import type { PatientCase } from '../types';
import { INITIAL_PATIENT_CASES } from '../data/mockData';

const BASE_API_URL = import.meta.env.VITE_VOICE_API_URL
  ? import.meta.env.VITE_VOICE_API_URL.replace('/api/transcribe', '')
  : 'http://localhost:5000';

class CaseDatabaseService {
  /**
   * Fetch all patient cases from the production database.
   */
  public async getAllCases(): Promise<PatientCase[]> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/cases`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.cases) && data.cases.length > 0) {
          return data.cases;
        }
      }
    } catch (e) {
      console.warn('[CaseDB] Could not connect to remote case database, using cached/mock seed:', e);
    }
    return INITIAL_PATIENT_CASES;
  }

  /**
   * Save (create or update) a patient case in the database.
   * Automatically indexes the case into the medical vector store for semantic matching.
   */
  public async saveCase(caseData: PatientCase): Promise<PatientCase> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(caseData),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.case) {
          return data.case;
        }
      }
    } catch (e) {
      console.error('[CaseDB] Failed to save case to database:', e);
    }
    return caseData;
  }

  /**
   * Update case clinical status (e.g. 'Doctor Verified', 'Case Ready').
   */
  public async updateCaseStatus(caseId: string, status: 'Draft' | 'Case Ready' | 'Doctor Verified' | 'Closed'): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/cases/${encodeURIComponent(caseId)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      return res.ok;
    } catch (e) {
      console.error('[CaseDB] Failed to update case status in database:', e);
      return false;
    }
  }

  /**
   * Update AI clinical summary for a case.
   */
  public async updateCaseSummary(caseId: string, summary: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/cases/${encodeURIComponent(caseId)}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ summary }),
      });
      return res.ok;
    } catch (e) {
      console.error('[CaseDB] Failed to update case summary in database:', e);
      return false;
    }
  }

  /**
   * Search similar patient cases or clinical guidelines using Vector Embeddings.
   */
  public async searchVectorDatabase(query: string, entityType?: 'guideline' | 'patient_case', topK: number = 3): Promise<any[]> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/vector/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query, entity_type: entityType, top_k: topK }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.results || [];
      }
    } catch (e) {
      console.error('[CaseDB] Vector search failed:', e);
    }
    return [];
  }
}

export const caseDatabaseService = new CaseDatabaseService();
