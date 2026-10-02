# MediKiok Enterprise Multimodal OPD Patient Intake Monorepo

MediKiok is a state-of-the-art AI-assisted patient kiosk and clinical workstation platform engineered for Indian healthcare OPD workflows. It integrates **Sarvam AI** multi-lingual speech-to-text / text-to-speech, **Gemini Flash** clinical reasoning, **Ollama VLM / Donut OCR** prescription digitization, and **AYUSH Dashavidha Pariksha** triage.

---

## 🏗 Enterprise Monorepo Architecture

```
SIH_TEAM_VERTEX/
├── apps/
│   └── web/                   # Vite + React + TypeScript Patient Kiosk & Doctor Portal
├── services/
│   ├── voice-api/             # Python Backend (Sarvam AI STT/TTS + Gemini Clinical Reasoning)
│   └── ocr-engine/            # Python Microservice (Prescription & Report OCR Scanner)
├── database/
│   └── schema.sql             # PostgreSQL + pgvector Clinical Database Schema
├── docker-compose.yml         # Container Orchestration Configuration
├── render.yaml                # Render Blueprint 1-Click Monorepo Deployment Specification
└── package.json               # Monorepo Workspace Script Registry
```

---

## 🚀 Quick Start & Development Commands

### 1. Root Workspace Commands
Run commands directly from the monorepo root:

```bash
# Start Web Frontend (Port 5173)
npm run dev

# Build Production Web Bundle
npm run build

# Start Voice & Clinical API Backend (Port 5000)
npm run start:voice

# Start OCR Scanner Service (Port 5001)
npm run start:ocr
```

### 2. Docker Compose Monorepo Spin-up
To launch all services (PostgreSQL + pgvector, Web, Voice API, OCR) in isolated containers:

```bash
docker-compose up --build
```

---

## ☁️ 1-Click Cloud Deployment (Render Blueprint)

This repository includes a `render.yaml` specification for Render monorepo deployment:

1. Connect your repository to **Render.com**.
2. Select **Blueprints** -> **New Blueprint Instance**.
3. Render automatically provisions:
   - **`medikiok-web`**: Static Web Site
   - **`medikiok-voice-api`**: Python Web Service (`services/voice-api`)
   - **`medikiok-ocr-engine`**: Python Web Service (`services/ocr-engine`)
