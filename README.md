# Cars — Workshop & Business Management System (BMS)

> A modern, full-featured automotive workshop management system built with Next.js 16, Tailwind CSS, Supabase, and an offline-first local database architecture.

---

## 🌟 The Two-Part Architecture

This repository powers **two integrated experiences** from a single, unified codebase:

| Part | Component | Description | Tech Stack |
|---|---|---|---|
| **Part 1** | **Web Application (Cloud Portal)** | The central online portal for garage managers and owners to access and manage workshop operations from anywhere. | Next.js 16 App Router, Supabase Auth, PostgreSQL (RLS), Vercel |
| **Part 2** | **Offline-Compatible Desktop App** | A resilient desktop application engineered for garage environments where internet can be intermittent or offline. | Dexie (IndexedDB), Bi-directional Sync Engine, PWA / Desktop Wrapper |

👉 **Read the full architectural breakdown in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).**

---

## 🚀 Key Features

- **🧾 Smart Invoicing & Billing**:
  - Instant invoice creation with customer auto-suggest, vehicle selector, and line item calculations.
  - Quick status management (Draft, Pending, Partially Paid, Paid, Cancelled).
  - Instant local saving with automatic background sync when connected.
- **👥 Customer & Fleet Tracking**:
  - Customer profiles, multi-vehicle linkages, complete service visit history, and total revenue tracking.
- **📊 Financial Analytics**:
  - Real-time revenue analytics, period filtering (Today, 7D, 30D, Custom Range), GST breakdown, and Recharts visualization.
- **👷 Worker Payroll & Attendance**:
  - Worker directory, salary logs, advance payment tracking, and balance management.
- **🔄 Seamless Offline Sync**:
  - Automatic IndexedDB storage on every write with zero UI lag.
  - Background sync engine with conflict resolution and connectivity watcher.
  - Service Worker precaching Next.js application shells and static bundles.

---

## 📁 Repository Directory Structure

```text
Business-Management-System/
├── electron/                   # Desktop application process & preload
│   ├── main.cjs                # Electron window & embedded standalone server
│   └── preload.cjs             # Safe desktop bridge API
├── src/
│   ├── app/                    # Next.js 16 App Router pages & API routes
│   │   ├── (dashboard)         # Dashboard overview (src/app/page.js)
│   │   ├── billing/            # Invoices & billing module
│   │   ├── customers/          # Customer & vehicle management
│   │   ├── finance/            # Revenue analytics & charts
│   │   ├── workers/            # Payroll & staff directory
│   │   ├── profile/            # Workshop profile & bank settings
│   │   ├── login/              # Authentication & password reset
│   │   └── api/                # Cloud endpoints:
│   │       └── health/         # System health check
│   ├── components/             # Reusable UI components & layouts
│   ├── context/                # React Contexts (AuthContext, SyncContext)
│   ├── hooks/                  # Custom React hooks (useReconnectReload, etc.)
│   └── lib/                    # Core business logic & services:
│       ├── data-layer.js       # Unified data access (offline-first switch)
│       ├── local-db.js         # IndexedDB schema & Dexie tables
│       ├── local-repo.js       # Local CRUD operations
│       ├── sync-engine.js      # Bi-directional cloud sync engine
│       ├── supabase.js         # Supabase client & authentication
│       └── helpers.js          # Currency, phone, date formatters
├── public/                     # Static assets (logo, favicon, sw.js, offline.html)
├── supabase/                   # PostgreSQL migrations, schema, and RPC scripts
├── docs/                       # Guides, deployment checklists, and architecture docs
└── scripts/                    # Build scripts (e.g. generate-sw-precache.mjs)
```

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Node.js**: v18.18 or higher (v20+ recommended)
- **Package Manager**: npm, pnpm, or yarn
- **Supabase Account**: A Supabase project with database configured (see [supabase/schema.sql](supabase/schema.sql))

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/Business-Management-System.git
cd Business-Management-System

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy the template and fill in your Supabase credentials:
```bash
cp .env.example .env
```
Edit `.env` with your actual project keys:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Database Setup
1. Open your Supabase project's **SQL Editor**.
2. Run `supabase/schema.sql` to initialize tables.
3. Run `supabase/rls-migration.sql` to enforce Row Level Security.
4. Run `supabase/create_save_bill_rpc.sql` for atomic bill transactions.

### 5. Running Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 💻 Running as an Offline Desktop App

### Option 1: Standalone Windows App (.exe via Electron)
Run the desktop app locally with an embedded Next.js server:
```bash
# Development mode with hot reload:
npm run electron:dev

# Run production standalone app:
npm run electron:start

# Build installer (.exe) & portable Windows packages into dist-electron/:
npm run electron:pack
```

### Option 2: PWA Desktop Installation
1. Open the application in **Google Chrome**, **Microsoft Edge**, or **Brave**.
2. Click the **Install** icon in the browser address bar (or go to Menu > **Install Cars**).
3. The app will launch in a clean desktop window with its own taskbar icon and offline cache enabled.

---

## 📚 Documentation Index

Detailed guides are located in the [`docs/`](docs/) directory:

- 🏛️ [System Architecture](docs/ARCHITECTURE.md) — Two-part web & desktop design.
- 🎯 [Setup Summary](docs/SETUP-SUMMARY.md) — Comprehensive overview of modules and database.
- 🔐 [RLS Security Guide](docs/RLS-SETUP.md) — Multi-tenant data isolation and security policies.
- 🛡️ [RLS Setup Verification](docs/RLS-SETUP-COMPLETE.md) — RLS deployment verification steps.
- 🚀 [Deployment Checklist](docs/DEPLOYMENT-CHECKLIST.md) — Production deployment instructions (Vercel).
- 🎨 [Design System & Tokens](docs/DESIGN-SYSTEM-NEUMORPHIC.md) — Soft UI / Neumorphic styling tokens.

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs the Next.js development server with Turbopack |
| `npm run build` | Builds production standalone app, SW precache, and static bundles |
| `npm run start` | Starts the production Next.js server |
| `npm run electron:dev` | Launches Next.js dev server and connects Electron window |
| `npm run electron:start` | Builds standalone server and launches Electron in production mode |
| `npm run electron:pack` | Builds standalone Windows installer & portable `.exe` in `dist-electron/` |
| `npm run lint` | Runs ESLint checks |

---

## 📄 License
Private & Proprietary — Cars. All rights reserved.
