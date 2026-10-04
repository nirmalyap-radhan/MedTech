import type { DoctorProfile, DoctorRecord, AuthSession, AuditLog, DoctorRole } from '../types';

const DB_NAME = 'MedikioskClinicalDB';
const DB_VERSION = 1;
const DOCTORS_STORE = 'doctors';
const SESSIONS_STORE = 'sessions';
const AUDIT_LOGS_STORE = 'auditLogs';
const LOCAL_STORAGE_TOKEN_KEY = 'medikiosk_doctor_auth_token';

import { VOICE_API_BASE_URL } from './apiConfig';

const BACKEND_AUTH_URL = VOICE_API_BASE_URL;

// Cryptographic helpers using browser Web Crypto API
async function generateSalt(): Promise<string> {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${password}:${salt}:medikiosk_clinical_secure_v1`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateSessionToken(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Initial Registered Hospital Doctors Seed
const INITIAL_DOCTORS: Array<{
  name: string;
  email: string;
  passwordPlain: string;
  mciRegNumber: string;
  department: string;
  roomNumber: string;
  role: DoctorRole;
  phone: string;
  avatar: string;
}> = [
  {
    name: 'Dr. Suresh Mishra',
    email: 'dr.mishra@hospital.gov.in',
    passwordPlain: 'Doctor@123',
    mciRegNumber: 'MCI-48920/OD',
    department: 'Internal Medicine & Critical Care',
    roomNumber: 'Room 104',
    role: 'CONSULTANT_PHYSICIAN',
    phone: '+91 94370 12890',
    avatar: 'SM',
  },
  {
    name: 'Dr. Sneha Patnaik',
    email: 'dr.patnaik@hospital.gov.in',
    passwordPlain: 'Doctor@123',
    mciRegNumber: 'NMC-92384/AIIMS',
    department: 'General Surgery & Acute Triage',
    roomNumber: 'Room 108',
    role: 'CHIEF_MEDICAL_OFFICER',
    phone: '+91 98610 88231',
    avatar: 'SP',
  },
  {
    name: 'Dr. Rajesh Panda (Vaidya)',
    email: 'dr.panda@ayush.gov.in',
    passwordPlain: 'Doctor@123',
    mciRegNumber: 'AYUSH-CCRAS-3382',
    department: 'AYUSH & Integrative Medicine',
    roomNumber: 'Room 102',
    role: 'AYUSH_SPECIALIST',
    phone: '+91 94388 47120',
    avatar: 'RP',
  },
  {
    name: 'Dr. Debabrata Jena',
    email: 'dr.jena@hospital.gov.in',
    passwordPlain: 'Doctor@123',
    mciRegNumber: 'MCI-55102/OD',
    department: 'Gastroenterology & Hepatology',
    roomNumber: 'Room 110',
    role: 'CONSULTANT_PHYSICIAN',
    phone: '+91 97761 33491',
    avatar: 'DJ',
  },
];

class AuthDatabaseService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // Initialize and open IndexedDB
  public getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Doctors Store
        if (!db.objectStoreNames.contains(DOCTORS_STORE)) {
          const docStore = db.createObjectStore(DOCTORS_STORE, { keyPath: 'id' });
          docStore.createIndex('email', 'email', { unique: true });
          docStore.createIndex('mciRegNumber', 'mciRegNumber', { unique: true });
        }

        // 2. Auth Sessions Store
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'token' });
          sessStore.createIndex('doctorId', 'doctorId', { unique: false });
        }

        // 3. Security Audit Logs Store
        if (!db.objectStoreNames.contains(AUDIT_LOGS_STORE)) {
          const logStore = db.createObjectStore(AUDIT_LOGS_STORE, { keyPath: 'id' });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
          logStore.createIndex('doctorId', 'doctorId', { unique: false });
        }
      };

      request.onsuccess = async () => {
        const db = request.result;
        await this.seedInitialDoctors(db);
        resolve(db);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB database: ${request.error?.message}`));
      };
    });

    return this.dbPromise;
  }

  // Seed default doctor accounts if store is empty
  private async seedInitialDoctors(db: IDBDatabase): Promise<void> {
    return new Promise((resolve) => {
      const tx = db.transaction([DOCTORS_STORE, AUDIT_LOGS_STORE], 'readwrite');
      const store = tx.objectStore(DOCTORS_STORE);
      const countReq = store.count();

      countReq.onsuccess = async () => {
        if (countReq.result === 0) {
          for (let i = 0; i < INITIAL_DOCTORS.length; i++) {
            const seed = INITIAL_DOCTORS[i];
            const salt = await generateSalt();
            const passwordHash = await hashPassword(seed.passwordPlain, salt);
            const doctorId = `DOC-2026-0${i + 1}`;

            const record: DoctorRecord = {
              id: doctorId,
              name: seed.name,
              email: seed.email.toLowerCase().trim(),
              passwordHash,
              salt,
              mciRegNumber: seed.mciRegNumber,
              department: seed.department,
              roomNumber: seed.roomNumber,
              role: seed.role,
              avatar: seed.avatar,
              phone: seed.phone,
              createdAt: new Date().toISOString(),
              failedLoginAttempts: 0,
            };

            store.put(record);
          }

          // Initial audit log
          const logStore = tx.objectStore(AUDIT_LOGS_STORE);
          const initialLog: AuditLog = {
            id: `log-${Date.now()}-init`,
            timestamp: new Date().toISOString(),
            doctorId: 'SYSTEM',
            doctorName: 'Hospital Triage Server',
            action: 'DOCTOR_REGISTERED',
            ipAddress: '127.0.0.1 (Local Workstation)',
            details: `Initialized Medikiosk Clinical DB with ${INITIAL_DOCTORS.length} seeded hospital practitioners.`,
          };
          logStore.put(initialLog);
        }
        resolve();
      };

      countReq.onerror = () => resolve();
    });
  }

  // Doctor Login with Production Database authentication and rate-limiting
  public async login(
    emailInput: string,
    passwordInput: string
  ): Promise<{ success: boolean; session?: AuthSession; doctor?: DoctorProfile; error?: string }> {
    let cleanEmail = emailInput.toLowerCase().trim();
    if (['dr.suresh@hospital.gov.in', 'dr.suresh.mishra@hospital.gov.in', 'suresh.mishra@hospital.gov.in', 'suresh', 'dr.suresh', 'dr.mishra'].includes(cleanEmail)) {
      cleanEmail = 'dr.mishra@hospital.gov.in';
    }

    // 1. Try production remote database first
    try {
      const resp = await fetch(`${BACKEND_AUTH_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email: cleanEmail, password: passwordInput }),
      });
      const data = await resp.json();
      if (resp.ok && data.status === 'success' && data.session && data.doctor) {
        localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, data.session.token);
        try {
          const db = await this.getDB();
          const tx = db.transaction([SESSIONS_STORE], 'readwrite');
          tx.objectStore(SESSIONS_STORE).put(data.session);
        } catch (_) {}
        return { success: true, session: data.session, doctor: data.doctor };
      }
      if (data.message) {
        return { success: false, error: data.message };
      }
    } catch (netErr) {
      console.warn('[AuthDB] Remote database offline, falling back to local client store:', netErr);
    }

    // 2. Client-side IndexedDB Fallback
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction([DOCTORS_STORE, SESSIONS_STORE, AUDIT_LOGS_STORE], 'readwrite');
      const docStore = tx.objectStore(DOCTORS_STORE);
      const emailIndex = docStore.index('email');
      const getReq = emailIndex.get(cleanEmail);

      getReq.onsuccess = async () => {
        const doctorRecord: DoctorRecord | undefined = getReq.result;

        if (!doctorRecord) {
          // Record failed audit
          this.writeAuditLog(tx, {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            doctorId: 'UNKNOWN',
            doctorName: cleanEmail,
            action: 'LOGIN_FAILED',
            ipAddress: '127.0.0.1 (Workstation Room 104)',
            details: `Failed login attempt for unknown email: "${cleanEmail}".`,
          });
          resolve({ success: false, error: 'No medical staff account registered with this email.' });
          return;
        }

        // Check lockout
        if (doctorRecord.lockoutUntil && doctorRecord.lockoutUntil > Date.now()) {
          const remainingSec = Math.ceil((doctorRecord.lockoutUntil - Date.now()) / 1000);
          resolve({
            success: false,
            error: `Account locked due to consecutive failed attempts. Please retry in ${remainingSec} seconds.`,
          });
          return;
        }

        // Verify password hash
        const computedHash = await hashPassword(passwordInput, doctorRecord.salt);
        if (computedHash !== doctorRecord.passwordHash) {
          // Increment failed attempts
          const updatedAttempts = (doctorRecord.failedLoginAttempts || 0) + 1;
          let lockoutUntil: number | undefined = undefined;

          if (updatedAttempts >= 5) {
            lockoutUntil = Date.now() + 60 * 1000; // 60s lockout
          }

          docStore.put({
            ...doctorRecord,
            failedLoginAttempts: updatedAttempts,
            lockoutUntil,
          });

          this.writeAuditLog(tx, {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            doctorId: doctorRecord.id,
            doctorName: doctorRecord.name,
            action: 'LOGIN_FAILED',
            ipAddress: '127.0.0.1 (Workstation Room 104)',
            details: `Invalid password entered. Attempt ${updatedAttempts} of 5.`,
          });

          const remainingAttempts = Math.max(0, 5 - updatedAttempts);
          resolve({
            success: false,
            error: remainingAttempts > 0
              ? `Incorrect password. ${remainingAttempts} attempts remaining before temporary lockout.`
              : 'Account locked for 60 seconds due to 5 consecutive failed attempts.',
          });
          return;
        }

        // Success: Reset failed attempts and update lastLogin
        const now = Date.now();
        const lastLoginAt = new Date(now).toISOString();
        docStore.put({
          ...doctorRecord,
          failedLoginAttempts: 0,
          lockoutUntil: undefined,
          lastLoginAt,
        });

        // Create sanitized profile
        const { passwordHash: _, salt: __, failedLoginAttempts: ___, lockoutUntil: ____, ...safeProfile } = doctorRecord;
        const profile: DoctorProfile = { ...safeProfile, lastLoginAt };

        // Generate session token (8 hours validity)
        const token = generateSessionToken();
        const expiresAt = now + 8 * 60 * 60 * 1000;

        const session: AuthSession = {
          token,
          doctorId: profile.id,
          doctor: profile,
          issuedAt: now,
          expiresAt,
        };

        const sessStore = tx.objectStore(SESSIONS_STORE);
        sessStore.put(session);

        // Store active token in localStorage
        try {
          localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token);
        } catch {
          // ignore storage quota issues
        }

        // Audit log success
        this.writeAuditLog(tx, {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: lastLoginAt,
          doctorId: profile.id,
          doctorName: profile.name,
          action: 'LOGIN_SUCCESS',
          ipAddress: '127.0.0.1 (OPD Room 104 Terminal)',
          details: `Authenticated via SHA-256 Web Crypto. Shift session token issued: ${token.substring(0, 8)}...`,
        });

        resolve({ success: true, session, doctor: profile });
      };

      getReq.onerror = () => {
        resolve({ success: false, error: 'Database transaction error during login query.' });
      };
    });
  }

  // Restore session from token
  public async getActiveSession(): Promise<AuthSession | null> {
    try {
      const token = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
      if (!token) return null;

      // Check remote database first
      try {
        const resp = await fetch(`${BACKEND_AUTH_URL}/api/auth/session`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.status === 'success' && data.session) {
            return data.session;
          }
        }
      } catch (_) {}

      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction([SESSIONS_STORE], 'readonly');
        const sessStore = tx.objectStore(SESSIONS_STORE);
        const getReq = sessStore.get(token);

        getReq.onsuccess = () => {
          const session: AuthSession | undefined = getReq.result;
          if (!session) {
            localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
            resolve(null);
            return;
          }

          if (session.expiresAt <= Date.now()) {
            localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
            resolve(null);
            return;
          }

          resolve(session);
        };

        getReq.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  // Logout doctor
  public async logout(token?: string): Promise<void> {
    const activeToken = token || localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);

    if (activeToken) {
      try {
        await fetch(`${BACKEND_AUTH_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: activeToken }),
        });
      } catch (_) {}
    }

    if (!activeToken) return;

    try {
      const db = await this.getDB();
      const tx = db.transaction([SESSIONS_STORE, AUDIT_LOGS_STORE], 'readwrite');
      const sessStore = tx.objectStore(SESSIONS_STORE);

      const getReq = sessStore.get(activeToken);
      getReq.onsuccess = () => {
        const session: AuthSession | undefined = getReq.result;
        sessStore.delete(activeToken);

        if (session) {
          this.writeAuditLog(tx, {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            doctorId: session.doctorId,
            doctorName: session.doctor.name,
            action: 'LOGOUT',
            ipAddress: '127.0.0.1 (Workstation)',
            details: 'Doctor signed out. Shift session terminated.',
          });
        }
      };
    } catch {
      // fail safe
    }
  }

  // Register New Doctor with MCI/NMC validation
  public async registerDoctor(data: {
    name: string;
    email: string;
    passwordPlain: string;
    mciRegNumber: string;
    department: string;
    roomNumber: string;
    role: DoctorRole;
    phone: string;
  }): Promise<{ success: boolean; doctor?: DoctorProfile; error?: string }> {
    const cleanEmail = data.email.toLowerCase().trim();
    if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, error: 'Please enter a valid official medical email.' };
    }
    if (data.passwordPlain.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }
    if (!data.mciRegNumber || data.mciRegNumber.trim().length < 4) {
      return { success: false, error: 'Valid MCI/NMC registration number is required for hospital clinical audit.' };
    }

    // Try remote database registration first
    try {
      const resp = await fetch(`${BACKEND_AUTH_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data),
      });
      const res = await resp.json();
      if (resp.ok && res.status === 'success' && res.doctor) {
        return { success: true, doctor: res.doctor };
      }
      if (res.message) {
        return { success: false, error: res.message };
      }
    } catch (_) {}

    const db = await this.getDB();

    return new Promise((resolve) => {
      const tx = db.transaction([DOCTORS_STORE, AUDIT_LOGS_STORE], 'readwrite');
      const docStore = tx.objectStore(DOCTORS_STORE);
      const emailIndex = docStore.index('email');

      const emailCheckReq = emailIndex.get(cleanEmail);

      emailCheckReq.onsuccess = async () => {
        if (emailCheckReq.result) {
          resolve({ success: false, error: 'A doctor account with this email address already exists.' });
          return;
        }

        const countReq = docStore.count();
        countReq.onsuccess = async () => {
          const nextIndex = countReq.result + 1;
          const doctorId = `DOC-2026-${String(nextIndex).padStart(3, '0')}`;
          const salt = await generateSalt();
          const passwordHash = await hashPassword(data.passwordPlain, salt);

          const initials = data.name
            .split(' ')
            .filter((n) => !n.startsWith('Dr.'))
            .map((n) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'DR';

          const newDoctorRecord: DoctorRecord = {
            id: doctorId,
            name: data.name.trim(),
            email: cleanEmail,
            passwordHash,
            salt,
            mciRegNumber: data.mciRegNumber.trim().toUpperCase(),
            department: data.department.trim(),
            roomNumber: data.roomNumber.trim(),
            role: data.role,
            avatar: initials,
            phone: data.phone.trim() || '+91 94370 00000',
            createdAt: new Date().toISOString(),
            failedLoginAttempts: 0,
          };

          docStore.put(newDoctorRecord);

          this.writeAuditLog(tx, {
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            doctorId,
            doctorName: newDoctorRecord.name,
            action: 'DOCTOR_REGISTERED',
            ipAddress: '127.0.0.1 (Clinical Admin)',
            details: `Registered new medical staff: ${newDoctorRecord.name} (${newDoctorRecord.mciRegNumber}) in ${newDoctorRecord.department}.`,
          });

          const { passwordHash: _, salt: __, failedLoginAttempts: ___, lockoutUntil: ____, ...safeProfile } = newDoctorRecord;
          resolve({ success: true, doctor: safeProfile });
        };
      };

      emailCheckReq.onerror = () => {
        resolve({ success: false, error: 'Database check failed during doctor registration.' });
      };
    });
  }

  // Get list of all registered doctors (public profile only)
  public async getAllDoctors(): Promise<DoctorProfile[]> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction([DOCTORS_STORE], 'readonly');
      const store = tx.objectStore(DOCTORS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const records: DoctorRecord[] = req.result || [];
        const safeProfiles: DoctorProfile[] = records.map((r) => {
          const { passwordHash: _, salt: __, failedLoginAttempts: ___, lockoutUntil: ____, ...safe } = r;
          return safe;
        });
        resolve(safeProfiles);
      };

      req.onerror = () => resolve([]);
    });
  }

  // Get audit logs for compliance
  public async getAuditLogs(limit: number = 10): Promise<AuditLog[]> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction([AUDIT_LOGS_STORE], 'readonly');
      const store = tx.objectStore(AUDIT_LOGS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const logs: AuditLog[] = req.result || [];
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(logs.slice(0, limit));
      };

      req.onerror = () => resolve([]);
    });
  }

  // Internal helper to append audit log within an active transaction
  private writeAuditLog(tx: IDBTransaction, log: AuditLog): void {
    try {
      const store = tx.objectStore(AUDIT_LOGS_STORE);
      store.put(log);
    } catch {
      // ignore
    }
  }
}

export const authDatabaseService = new AuthDatabaseService();
