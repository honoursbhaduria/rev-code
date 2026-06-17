# Architecture Documentation

## Overview

ReCode is a full-stack AI-powered code review assistant built with a modern, production-oriented architecture that prioritizes maintainability, scalability, and developer experience.

## Frontend Architecture

### Framework & Tooling
- **Next.js 14** with App Router for file-based routing and server/client component separation
- **TypeScript** for end-to-end type safety
- **Tailwind CSS** for utility-first styling
- **Zustand** for lightweight global state management (auth state)

### Directory Structure
```
frontend/src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth route group (login, register)
│   ├── (dashboard)/       # Protected dashboard routes
│   │   ├── dashboard/     # Overview page
│   │   ├── projects/      # Project management
│   │   ├── reviews/       # Review history
│   │   ├── providers/     # AI provider settings
│   │   └── settings/      # User settings
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx           # Landing page
├── components/            # Reusable UI components
├── lib/
│   ├── api.ts             # Axios API client
│   └── types.ts           # TypeScript types
├── store/
│   └── auth.store.ts      # Zustand auth store
└── middleware.ts           # Route protection
```

### State Management
- **Server State**: Fetched directly in components with useEffect + Axios
- **Auth State**: Zustand store persisted to localStorage
- **UI State**: React useState for local component state

### Authentication Flow
1. User submits credentials → POST /auth/login
2. Backend returns JWT access token
3. Token stored in localStorage
4. Axios interceptor attaches token to all requests
5. Next.js middleware protects dashboard routes
6. 401 response → clear token → redirect to login

## Backend Architecture

### Framework
- **NestJS** - modular, dependency-injected Node.js framework
- **TypeScript** - full type safety
- **Prisma ORM** - type-safe database client

### Module Structure
```
backend/src/
├── auth/           # JWT authentication module
├── security/       # Upload security & Secret scanning (GitGuardian-like)
├── common/         # Global services (EncryptionService AES-256)
├── projects/       # Project management
├── files/          # File upload & management
├── ai/             # LangChain & AI provider abstraction
├── reviews/        # Review engine
├── chat/           # AI chat sessions
├── prisma/         # Prisma service (global)
└── app.module.ts   # Root module (Helmet, Throttler)
```

### AI Provider Abstraction (LangChain)
The AI module leverages LangChain to provide a unified, type-safe interface for any OpenAI-compatible API:

```
User configures provider (URL + API key + model)
        ↓
LangChainService constructs ChatOpenAI instance (with custom baseURL)
        ↓
Prompt assembled via ChatPromptTemplate
        ↓
StructuredOutputParser enforces Zod schema validation
        ↓
Returns strongly-typed structured issues
```

This design guarantees JSON structural integrity and enables advanced parsing fallbacks.

### Review Engine Flow
```
1. User requests review (projectId + fileIds + mode)
2. Review record created with PENDING status
3. File contents fetched from DB
4. Mode-specific prompt constructed
5. AI called with code context + prompt
6. Response parsed into structured issues
7. Issues stored in DB
8. Review status updated to COMPLETED
```

### Review Prompt Engineering
Each review mode uses a carefully crafted system prompt:

| Mode | Focus |
|------|-------|
| SECURITY | Credentials, auth flaws, injection, input validation |
| PERFORMANCE | Algorithms, N+1 queries, caching, rendering |
| QUALITY | Naming, SOLID principles, readability, DRY |
| DOCUMENTATION | README generation, API docs, setup guides |
| TESTS | Unit tests, integration tests, mocks |

## Database Design

### Schema Overview
```
Users ──< Projects ──< Files
  │              │
  │              └──< Reviews ──< Issues
  │              │
  │              └──< ChatSessions ──< Messages
  │
  └──< AiProviders
```

### Key Design Decisions

**Files Table**: Stores file content directly in PostgreSQL (TEXT column) for simplicity. For production scale, this would move to S3/object storage with just a reference URL in DB.

**SecurityScans Table**: Tracks hardcoded secrets and structural upload vulnerabilities linked per-project to present on the frontend security dashboard.

**AiProviders per User**: Each user manages their own API keys. Keys are strictly encrypted via AES-256-GCM before DB insertion and decrypted on-the-fly at runtime.

**Reviews**: Status enum (PENDING→RUNNING→COMPLETED/FAILED) enables async processing. Currently synchronous but designed for future async queue processing.

**Chat Context**: On each message, all project file contents are included in the system prompt. This works for small projects; production would use RAG (vector embeddings + similarity search).

## AI Integration Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Frontend      │────▶│   NestJS Backend  │────▶│  AI Provider        │
│   (Next.js)     │     │   (AI Module)     │     │  (OpenAI/Groq/etc)  │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         │              │   PostgreSQL      │
         │              │   (Reviews/Chat)  │
         └──────────────└──────────────────┘
```

### Provider Configuration
Users configure providers via the UI:
- Name (e.g., "My Groq Account")
- Base URL (e.g., https://api.groq.com/openai/v1)
- API Key (optional for local providers)
- Model Name (e.g., llama3-8b-8192)
- Default flag

The backend uses the openai npm package with custom `baseURL`, making any OpenAI-compatible API work identically.

## Security Layers (Zero-Trust Architecture)

- **Network Layer**: Helmet.js for 15+ HTTP security headers (CSP, HSTS).
- **DDoS Layer**: ThrottlerModule for rate limiting (strict limits on AI/Auth endpoints).
- **Authorization**: Granular IDOR guards verifying `file → project → user` ownership on every request.
- **Upload Integrity**: Rejection of Zip bombs (>100:1 compression), path traversal attempts, and disguised executables via Magic Byte analysis.
- **Secret Scanning**: Built-in regex engine tracking 30+ credential patterns (AWS, Stripe, OpenAI).
- **Encryption**: AES-256-GCM encryption for all third-party API Keys stored in PostgreSQL.
- **Input Hardening**: Comprehensive `class-validator` limits and regex validations on all DTOs.

## Scalability Considerations

The current architecture can handle small-to-medium teams. For production scale:

1. **File Storage**: Move to S3/GCS instead of DB storage
2. **AI Review Processing**: Move to async queue (Bull + Redis)
3. **Chat Context**: Implement RAG with pgvector for large codebases
4. **Caching**: Redis for frequently accessed project/file data
5. **Horizontal Scaling**: NestJS is stateless, easily containerized
