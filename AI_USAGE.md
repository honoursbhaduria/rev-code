# AI Usage Report

## AI Tools Used

| Tool | Purpose |
|------|---------|
| Antigravity (Google DeepMind) | Primary development assistant - architecture design, code generation, debugging |
| Groq API (llama3) | Runtime AI for code reviews and chat (recommended free provider) |
| Ollama / LM Studio | Local AI option for privacy-conscious users |

## Development Methodology

This project was built using AI-assisted development with Antigravity as the primary coding assistant. The approach was:

1. **Requirements Analysis**: Reviewed the assessment spec and planned the full architecture before writing code
2. **AI Assistance**: Used AI to accelerate boilerplate generation and suggest best practices
3. **Critical Review**: Every generated code segment was reviewed and understood before integration
4. **Manual Refinements**: Business logic, error handling, and prompt engineering were carefully crafted

## Generated vs Manually Written Code

### AI-Generated (with review and understanding)
- NestJS module boilerplate (decorators, module structure)
- Prisma schema syntax
- React component JSX structure
- Tailwind CSS class combinations
- TypeScript interface definitions

### Manually Designed / Heavily Modified
- Database schema relationships and constraints
- Advanced Security Pipeline (Zip bomb, Magic byte, Path traversal prevention)
- GitGuardian-like Secret Scanner using 30+ Regex patterns
- AES-256-GCM Encryption for API Keys
- LangChain / LangGraph pipeline architecture
- Strict Structured Output Parsing using Zod
- File tree construction algorithm
- Chat context assembly logic
- Zero-trust IDOR guard implementation

## Key Prompts Used in AI Review Engine

### Security Review Prompt
```
You are a security expert reviewing code. Analyze the provided code for:
- Hardcoded credentials, API keys, or secrets
- Authentication and authorization flaws
- Input validation vulnerabilities
- SQL/command injection risks
- Insecure data storage or transmission
- Exposed sensitive endpoints

Return a JSON response with:
{
  "summary": "High-level security assessment",
  "issues": [{
    "title": "Issue title",
    "description": "Detailed description",
    "severity": "CRITICAL|HIGH|MEDIUM|LOW",
    "category": "Category name",
    "filePath": "path/to/file",
    "line": 42,
    "recommendation": "How to fix"
  }]
}
```

### Performance Review Prompt
```
You are a performance optimization expert. Analyze for:
- Algorithmic inefficiencies (O(n²) where O(n) possible)
- Unnecessary re-renders or re-computations
- N+1 database query patterns
- Missing indexes or inefficient queries
- Large bundle sizes or unoptimized assets
- Memory leaks or excessive memory usage

Return structured JSON with issues and recommendations.
```

### Code Quality Review Prompt
```
You are a senior engineer reviewing code quality. Assess:
- Naming conventions (variables, functions, classes)
- Code structure and organization
- DRY principle violations
- SOLID principle adherence
- Readability and maintainability
- Documentation and commenting
- Error handling patterns

Return structured JSON with issues and recommendations.
```

## Engineering Decisions Made

### 1. PostgreSQL over MongoDB
**Decision**: PostgreSQL with Prisma ORM
**Reasoning**: Relational data model fits naturally (users → projects → files → reviews → issues). PostgreSQL's JSON support handles flexible AI response data. Prisma provides excellent TypeScript integration.

### 2. Storing File Content in DB
**Decision**: Store file content as TEXT in PostgreSQL
**Reasoning**: For the scope of this assessment, this simplifies the architecture significantly. A `File.content` field makes it trivial to assemble code context for AI calls without additional storage infrastructure.
**Production alternative**: S3/GCS for storage, just store URL in DB.

### 3. LangChain Ecosystem over Raw SDK
**Decision**: Use `@langchain/openai` and `@langchain/core` instead of the raw `openai` package
**Reasoning**: LangChain provides robust `StructuredOutputParser` abstractions with Zod, enabling 100% type-safe JSON returns from any model. It natively supports OpenAI-compatible endpoints through `baseURL` overrides, preserving compatibility with Groq/Ollama while vastly improving prompt template management via `ChatPromptTemplate`.

### 4. Synchronous AI Calls
**Decision**: Reviews processed synchronously (await AI response before returning)
**Reasoning**: Simpler to implement and sufficient for the demo scope. The status field (PENDING→RUNNING→COMPLETED) is designed to support async processing via a job queue (Bull) with minimal refactoring.

### 5. Zustand for State Management
**Decision**: Zustand instead of Redux or Context API
**Reasoning**: Lightweight, zero boilerplate, perfect for the simple auth state needed. Redux would be over-engineered for this use case.

### 6. Next.js App Router
**Decision**: App Router with route groups
**Reasoning**: Modern Next.js pattern, clean URL organization with `(auth)` and `(dashboard)` groups without exposing group names in URLs. Supports React Server Components for future optimization.

### 7. Groq as Default Recommended Provider
**Decision**: Recommend Groq over OpenAI for free usage
**Reasoning**: Groq provides extremely fast inference (LPU chips), is OpenAI-compatible, has a generous free tier (30 req/min, 6000 req/day), and requires no credit card. Perfect for development and demos.

## AI Review Quality Considerations

The review engine is designed to provide genuinely useful feedback:
- Prompts are mode-specific to avoid generic responses
- File context is included (not just snippets)  
- Structured JSON output ensures consistent parsing
- Severity levels are mapped to specific criteria
- Recommendations are actionable, not just descriptive

## Limitations and Future Improvements

1. **Context Window**: Large codebases may exceed AI context limits. Solution: Implement advanced chunking with RAG (pgvector).
2. **No Real-time Streaming**: Reviews appear all at once. Solution: Enable Server-Sent Events (SSE) in LangChain to stream tokens to the frontend.
3. **Distributed Rate Limiting**: Throttler currently operates in-memory. For multi-instance deployments, integrate `@nestjs/throttler-storage-redis`.
4. **Sandboxed Code Execution**: Currently tests and code reviews are static. Future iterations could spin up Firecracker microVMs to execute code safely.
