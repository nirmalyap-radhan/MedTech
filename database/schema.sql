-- ==============================================================================
-- MediKiok Enterprise Clinical Architecture — Database Schema (PostgreSQL + pgvector)
-- ==============================================================================
-- Compatible with: PostgreSQL 14+, Supabase, Neon, AWS RDS PostgreSQL, TimescaleDB
-- Compliance: India ABDM (Ayushman Bharat Digital Mission), FHIR R4 Ready, HIPAA/DISHA
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector"; -- Enables pgvector for high-dimensional medical embeddings

-- ==============================================================================
-- 2. ENUMS & DOMAINS
-- ==============================================================================
DO $$ BEGIN
    CREATE TYPE doctor_role_enum AS ENUM (
        'CHIEF_MEDICAL_OFFICER',
        'CONSULTANT_PHYSICIAN',
        'AYUSH_SPECIALIST',
        'RESIDENT_DOCTOR'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE case_status_enum AS ENUM (
        'Draft',
        'Case Ready',
        'Doctor Verified',
        'Closed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE risk_level_enum AS ENUM (
        'Low',
        'Mild',
        'Moderate',
        'High',
        'Emergency'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. DOCTORS & AUTHENTICATION TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    mci_reg_number VARCHAR(128) UNIQUE NOT NULL,
    department VARCHAR(255) NOT NULL,
    room_number VARCHAR(64) NOT NULL,
    role doctor_role_enum NOT NULL DEFAULT 'CONSULTANT_PHYSICIAN',
    phone VARCHAR(32) NOT NULL,
    avatar VARCHAR(16) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    lockout_until BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_doctors_email ON doctors (email);
CREATE INDEX IF NOT EXISTS idx_doctors_mci ON doctors (mci_reg_number);

-- ==============================================================================
-- 4. DOCTOR AUTH SESSIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS auth_sessions (
    token VARCHAR(128) PRIMARY KEY,
    doctor_id VARCHAR(64) NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    doctor_profile JSONB NOT NULL,
    issued_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_doctor_id ON auth_sessions (doctor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth_sessions (expires_at);

-- ==============================================================================
-- 5. AUDIT LOGS TABLE (Clinical Compliance & Traceability)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    doctor_id VARCHAR(64) NOT NULL,
    doctor_name VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    ip_address VARCHAR(64) NOT NULL,
    details TEXT,
    target_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_doctor_id ON audit_logs (doctor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);

-- ==============================================================================
-- 6. PATIENTS TABLE (Demographics & ABDM Integration)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(16) NOT NULL,
    mobile VARCHAR(32) NOT NULL,
    preferred_language VARCHAR(8) NOT NULL DEFAULT 'or',
    abha_id VARCHAR(64),
    emergency_contact VARCHAR(32),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients (mobile);
CREATE INDEX IF NOT EXISTS idx_patients_abha ON patients (abha_id);

-- ==============================================================================
-- 7. PATIENT CASES TABLE (Multimodal Kiosk Intake)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS patient_cases (
    id VARCHAR(64) PRIMARY KEY,
    patient_id VARCHAR(64) REFERENCES patients(id) ON DELETE SET NULL,
    patient JSONB NOT NULL,
    chief_complaint TEXT NOT NULL,
    duration VARCHAR(128),
    associated_symptoms JSONB DEFAULT '[]'::jsonb,
    past_medical_history JSONB DEFAULT '[]'::jsonb,
    current_medications JSONB DEFAULT '[]'::jsonb,
    allergies JSONB DEFAULT '[]'::jsonb,
    relevant_previous_history TEXT,
    arrival_time VARCHAR(32),
    status case_status_enum NOT NULL DEFAULT 'Case Ready',
    answers JSONB DEFAULT '[]'::jsonb,
    documents JSONB DEFAULT '[]'::jsonb,
    ayush JSONB DEFAULT '{}'::jsonb,
    clinical_considerations JSONB DEFAULT '{}'::jsonb,
    ai_summary TEXT,
    timeline JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON patient_cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON patient_cases (updated_at DESC);

-- ==============================================================================
-- 8. VECTOR EMBEDDINGS TABLE (pgvector RAG & Semantic Medical Search)
-- ==============================================================================
-- 768 dimensions for Gemini Embeddings / standard dense clinical vector representations
CREATE TABLE IF NOT EXISTS vector_embeddings (
    id VARCHAR(64) PRIMARY KEY,
    entity_type VARCHAR(32) NOT NULL, -- 'guideline' | 'patient_case' | 'medicine'
    entity_id VARCHAR(64) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vector_entity ON vector_embeddings (entity_type, entity_id);

-- HNSW Index for rapid approximate nearest neighbor cosine similarity search
CREATE INDEX IF NOT EXISTS idx_vector_embeddings_hnsw 
ON vector_embeddings USING hnsw (embedding vector_cosine_ops);

-- ==============================================================================
-- 9. INITIAL SEED: REGISTERED HOSPITAL DOCTORS
-- ==============================================================================
-- Passwords seeded with SHA-256 + salt ("Doctor@123")
INSERT INTO doctors (id, name, email, password_hash, salt, mci_reg_number, department, room_number, role, phone, avatar)
VALUES
    ('DOC-2026-001', 'Dr. Suresh Mishra', 'dr.mishra@hospital.gov.in', 'c180029b46036b0432ae38ff7227c9d9ba0d3c0b1bb8d99c4c7959958fa1a4e1', 'a1b2c3d4e5f60718', 'MCI-48920/OD', 'Internal Medicine & Critical Care', 'Room 104', 'CONSULTANT_PHYSICIAN', '+91 94370 12890', 'SM'),
    ('DOC-2026-002', 'Dr. Sneha Patnaik', 'dr.patnaik@hospital.gov.in', 'c180029b46036b0432ae38ff7227c9d9ba0d3c0b1bb8d99c4c7959958fa1a4e1', 'a1b2c3d4e5f60718', 'NMC-92384/AIIMS', 'General Surgery & Acute Triage', 'Room 108', 'CHIEF_MEDICAL_OFFICER', '+91 98610 88231', 'SP'),
    ('DOC-2026-003', 'Dr. Rajesh Panda (Vaidya)', 'dr.panda@ayush.gov.in', 'c180029b46036b0432ae38ff7227c9d9ba0d3c0b1bb8d99c4c7959958fa1a4e1', 'a1b2c3d4e5f60718', 'AYUSH-CCRAS-3382', 'AYUSH & Integrative Medicine', 'Room 102', 'AYUSH_SPECIALIST', '+91 94388 47120', 'RP'),
    ('DOC-2026-004', 'Dr. Debabrata Jena', 'dr.jena@hospital.gov.in', 'c180029b46036b0432ae38ff7227c9d9ba0d3c0b1bb8d99c4c7959958fa1a4e1', 'a1b2c3d4e5f60718', 'MCI-55102/OD', 'Gastroenterology & Hepatology', 'Room 110', 'CONSULTANT_PHYSICIAN', '+91 97761 33491', 'DJ')
ON CONFLICT (email) DO NOTHING;
