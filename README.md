# B2B Research & Outreach Agent

An enterprise-grade, multi-tenant B2B lead research and automated outreach platform powered by **Google Gemini 3.1 Pro (High)** and **Chroma Vector Database**.

## 🚀 Overview

This repository contains the complete stack for the **Meridian Realty Group** AI Agent demo (Milestones 1–6):
- **AI Research & RAG Pipeline:** Ingests case studies and product knowledge into Chroma vector embeddings to generate personalized outreach drafts.
- **Agent Action Tracking:** Logs full reasoning traces, execution steps, and simulated reply loops.
- **Next.js Dashboard:** Modern, responsive UI built with Next.js 16 (Turbopack), Tailwind CSS, and shadcn/ui.

---

## 📁 Repository Structure (Monorepo)

```
├── b2b-outreach-agent/       # Express backend API, Chroma RAG engine, Gemini Agents, SQLite DB
├── dashboard/                # Next.js 16 Frontend UI (App Router, Tailwind CSS, Base UI)
├── DEMO_WALKTHROUGH.md       # Step-by-step presentation script & talking points
└── B2B_Research_Outreach_Agent_Requirements.md # Technical specification & milestone breakdown
```

---

## 🛠️ Quick Start (Local Development)

### Prerequisites
- Node.js v18+ (v20+ recommended)
- Docker Desktop (for Chroma Vector DB)
- Google AI Studio API Key (`GEMINI_API_KEY`)

### 1. Start Vector Database
From inside `b2b-outreach-agent/`:
```bash
cd b2b-outreach-agent
docker compose up -d
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in `b2b-outreach-agent/`:
```bash
cp .env.example .env
```
Edit `.env` and paste your Google Gemini API Key:
```env
GEMINI_API_KEY=AIzaSyYourActualKeyHere
```

### 3. Install Dependencies & Ingest Knowledge Base
```bash
npm install
npm run seed        # Seed demo tenant, leads, and initial data
npm run ingest-kb   # Embed case studies into Chroma Vector DB
npm start           # Start backend server on http://localhost:4000
```

### 4. Launch Next.js Dashboard
In a new terminal window:
```bash
cd dashboard
npm install
npm run dev         # Start frontend dev server on http://localhost:3000
```

Open **http://localhost:3000** and log in:
- **Email:** `admin@meridianrealty.test`
- **Password:** `demo-password-123`

---

## ☁️ Cloud Deployment Guide (Vercel & Render)

This project is configured as a Monorepo and deploys natively to cloud platforms without separating codebases.

### Frontend Deployment (Vercel)
1. Import this GitHub repository into Vercel.
2. In **Project Settings → Root Directory**, select **`dashboard`**.
3. In **Environment Variables**, set:
   - `NEXT_PUBLIC_API_URL`: `https://your-backend-service.onrender.com`
4. Click **Deploy**.

### Backend Deployment (Render)
1. In Render, create a **New Web Service** connected to this GitHub repo.
2. Set **Root Directory** to **`b2b-outreach-agent`**.
3. Configure build commands:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add Environment Variables:
   - `PORT`: `4000`
   - `GEMINI_API_KEY`: *Your AI Studio API Key*
   - `JWT_SECRET`: *Any secure random string*
   - `EMAIL_PROVIDER`: `simulated` *(or `resend` with API key)*
   - `DATABASE_URL`: `file:./dev.db` *(Note: Switch to PostgreSQL like Supabase or Neon for persistent production storage on cloud hosts)*

---

## 📄 Documentation
See `DEMO_WALKTHROUGH.md` for a full presentation guide and `b2b-outreach-agent/README.md` for deep-dive backend architecture documentation.
