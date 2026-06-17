# 🤖 AI-Powered Code Review Assistant

A production-oriented full-stack application that enables developers to upload source code, repositories, or project files and receive structured AI-generated code reviews.

## ✨ Features

- 🔐 **Authentication & Security** — JWT-based auth, AES-256-GCM API key encryption, Helmet headers, Throttler rate limiting
- 📁 **Project Management** — Create, view, and delete projects with strict IDOR protections
- 📦 **Secure Code Upload** — Advanced ZIP upload with zip-bomb detection, magic byte validation, and executable filtering
- 🛡️ **Secret Scanner** — Built-in GitGuardian-like scanner catching 30+ exposed credential patterns
- 🌲 **Code Explorer** — File tree with syntax highlighting
- 🤖 **LangChain AI Engine** — Multi-step AI review pipeline using Zod for structured output validation
- 🎯 **Review Templates** — Security, Performance, Code Quality modes
- 📜 **Review History** — Search and view past reviews
- 💬 **AI Chat** — LangGraph-powered chat to ask questions about your uploaded code
- 📊 **Documentation Generator** — Auto-generate README, API docs (bonus)
- 🧪 **Test Generator** — Generate unit/integration tests (bonus)

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript, Helmet, Throttler |
| Database | PostgreSQL + Prisma ORM |
| Auth & Security | JWT (access + refresh), AES-256-GCM Encryption |
| File Storage | Local filesystem with Zip Bomb & Magic Byte Protection |
| AI Pipeline | LangChain, LangGraph, Zod |
| Providers | OpenAI-compatible APIs (Groq, Ollama, LM Studio, OpenAI) |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- (Optional) Ollama or LM Studio for local AI

### 1. Install Dependencies

```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install
```

### 2. Configure Environment Variables

**Backend** (`backend/.env`):
```env
DATABASE_URL="postgresql://user:password@localhost:5432/recode_db"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-refresh-secret-change-in-production"
PORT=3001
FRONTEND_URL=http://localhost:3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Database Setup

```bash
cd backend
createdb recode_db
npx prisma migrate dev
```

### 4. Run Development Servers

```bash
# Terminal 1 — Backend
cd backend && npm run start:dev

# Terminal 2 — Frontend  
cd frontend && npm run dev
```

Visit http://localhost:3000

## 🤖 Free AI Provider Options

### Groq (Recommended - Cloud Free Tier)
- Sign up: https://console.groq.com
- Base URL: https://api.groq.com/openai/v1
- Models: llama3-8b-8192, mixtral-8x7b-32768, llama3-70b-8192
- Free tier: 30 req/min, 6000 req/day

### Ollama (Local, Completely Free)
- Install: https://ollama.ai
- Run: ollama serve && ollama pull codellama
- Base URL: http://localhost:11434/v1
- API Key: ollama

### LM Studio (Local, Completely Free)
- Install: https://lmstudio.ai
- Start local server in LM Studio
- Base URL: http://localhost:1234/v1

### OpenRouter (Free Models Available)
- Base URL: https://openrouter.ai/api/v1
- Free models: google/gemini-flash-1.5, meta-llama/llama-3.1-8b-instruct:free

## 📁 Project Structure

```
re-code/
├── frontend/          # Next.js application
├── backend/           # NestJS application
├── README.md
├── ARCHITECTURE.md
└── AI_USAGE.md
```
