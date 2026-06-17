import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { z } from 'zod';

// ─── Zod Schemas for Structured Output ─────────────────────────────────────────

const IssueSchema = z.object({
  title: z.string().describe('Short descriptive title of the issue'),
  description: z.string().describe('Detailed explanation of the problem'),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).describe('Issue severity level'),
  category: z.string().describe('Category of the issue'),
  line: z.number().nullable().optional().describe('Line number if applicable'),
  filePath: z.string().nullable().optional().describe('File path where issue was found'),
  recommendation: z.string().describe('Specific actionable fix advice'),
});

const ReviewResultSchema = z.object({
  summary: z.string().describe('A concise 2-4 sentence overall assessment'),
  issues: z.array(IssueSchema).describe('List of issues found'),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// ─── Review Mode Prompts ───────────────────────────────────────────────────────

const REVIEW_MODE_PROMPTS: Record<string, string> = {
  SECURITY: `You are an expert security code reviewer. Analyze the provided code for security vulnerabilities.
Focus specifically on:
- Hardcoded credentials, secrets, API keys, or passwords
- Authentication and authorization flaws
- SQL injection, XSS, CSRF, and other injection attacks
- Insecure data storage or transmission
- Broken access control
- Insecure deserialization
- Use of vulnerable dependencies or deprecated functions
- Input validation and sanitization issues
- Sensitive data exposure
- Security misconfigurations`,

  PERFORMANCE: `You are an expert performance engineer. Analyze the provided code for performance issues.
Focus specifically on:
- Algorithmic complexity (O(n²) or worse when better is possible)
- Inefficient database queries (N+1 problems, missing indexes, full table scans)
- Memory leaks and excessive memory usage
- Unnecessary re-renders or computations
- Missing caching opportunities
- Blocking synchronous operations that should be async
- Bundle size issues and unused imports
- Inefficient loops and data structures
- Network waterfall issues`,

  QUALITY: `You are an expert code quality reviewer. Analyze the provided code for quality issues.
Focus specifically on:
- Naming conventions (variables, functions, classes should be descriptive)
- Code duplication and DRY principle violations
- Function/class complexity and Single Responsibility Principle
- Error handling completeness
- Code readability and maintainability
- Dead code and unused variables
- Magic numbers and hardcoded values
- Proper use of language features and idioms
- Consistency in coding style`,

  DOCUMENTATION: `You are a technical documentation expert. Analyze the provided code and generate comprehensive documentation.
Focus on:
- Missing or incomplete JSDoc/docstrings for functions and classes
- Missing README or project overview
- Undocumented API endpoints or interfaces
- Complex algorithms that need explanation
- Configuration options that need documenting
- Usage examples for public APIs
- Changelog and versioning`,

  TESTS: `You are a testing expert. Analyze the provided code and identify testing gaps.
Focus on:
- Missing unit tests for business logic
- Missing integration tests for API endpoints
- Untested edge cases and error paths
- Missing mocks for external dependencies
- Test coverage gaps
- Brittle tests that rely on implementation details
- Missing tests for authentication/authorization
- Performance and load testing needs`,
};

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);

  /**
   * Create a ChatOpenAI instance for any OpenAI-compatible provider
   */
  createModel(provider: {
    baseUrl: string;
    apiKey?: string | null;
    model: string;
  }, options?: { temperature?: number; maxTokens?: number }): ChatOpenAI {
    return new ChatOpenAI({
      openAIApiKey: provider.apiKey || 'no-key',
      modelName: provider.model,
      temperature: options?.temperature ?? 0.3,
      maxTokens: options?.maxTokens ?? 4096,
      configuration: {
        baseURL: provider.baseUrl,
      },
    });
  }

  /**
   * Run a structured code review using LangChain chains
   */
  async runReview(
    provider: { baseUrl: string; apiKey?: string | null; model: string },
    fileContext: string,
    reviewMode: string,
  ): Promise<ReviewResult> {
    const model = this.createModel(provider, { temperature: 0.2, maxTokens: 8192 });

    const modePrompt = REVIEW_MODE_PROMPTS[reviewMode] || REVIEW_MODE_PROMPTS['QUALITY'];

    // Create structured output parser from Zod schema
    const parser = StructuredOutputParser.fromZodSchema(ReviewResultSchema);
    const formatInstructions = parser.getFormatInstructions();

    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `${modePrompt}

{format_instructions}

Severity guidelines:
- CRITICAL: Must fix immediately, security breach or data loss risk
- HIGH: Should fix soon, significant impact on security/performance/quality
- MEDIUM: Should fix in next sprint, moderate impact
- LOW: Nice to have fix, minor improvement`
      ),
      HumanMessagePromptTemplate.fromTemplate(
        'Please review the following code files:\n\n{code_context}'
      ),
    ]);

    // Build the chain: prompt → model → parser
    const chain = RunnableSequence.from([
      prompt,
      model,
      // Custom parser that handles markdown-wrapped JSON gracefully
      async (response) => {
        const content = typeof response === 'string' ? response : response.content;
        const text = typeof content === 'string' ? content : String(content);
        try {
          return await parser.parse(text);
        } catch {
          // Fallback: try to extract JSON manually
          return this.fallbackParse(text);
        }
      },
    ]);

    try {
      const result = await chain.invoke({
        format_instructions: formatInstructions,
        code_context: fileContext,
      });
      return result as ReviewResult;
    } catch (error) {
      this.logger.error(`LangChain review failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run a chat completion using LangChain
   */
  async runChat(
    provider: { baseUrl: string; apiKey?: string | null; model: string },
    systemPrompt: string,
    chatHistory: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
  ): Promise<string> {
    const model = this.createModel(provider, { temperature: 0.5, maxTokens: 4096 });

    // Build messages array for the model
    const messages: [string, string][] = [
      ['system', systemPrompt],
      ...chatHistory.map((m): [string, string] => [m.role === 'user' ? 'human' : 'ai', m.content]),
      ['human', userMessage],
    ];

    const prompt = ChatPromptTemplate.fromMessages(messages);

    const chain = RunnableSequence.from([
      prompt,
      model,
    ]);

    try {
      const response = await chain.invoke({});
      return typeof response.content === 'string'
        ? response.content
        : String(response.content);
    } catch (error) {
      this.logger.error(`LangChain chat failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Simple AI call (backward compatible with existing callAI interface)
   */
  async callAI(
    provider: { baseUrl: string; apiKey?: string | null; model: string },
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const model = this.createModel(provider, options);

    const langchainMessages: [string, string][] = messages.map((m) => {
      const role = m.role === 'system' ? 'system' : m.role === 'user' ? 'human' : 'ai';
      return [role, m.content];
    });

    const prompt = ChatPromptTemplate.fromMessages(langchainMessages);
    const chain = RunnableSequence.from([prompt, model]);

    const response = await chain.invoke({});
    return typeof response.content === 'string'
      ? response.content
      : String(response.content);
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  private fallbackParse(text: string): ReviewResult {
    try {
      // Strip markdown code fences
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      if (parsed.summary && Array.isArray(parsed.issues)) {
        return parsed as ReviewResult;
      }
    } catch {
      // Try to extract JSON from within the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.summary && Array.isArray(parsed.issues)) {
            return parsed as ReviewResult;
          }
        } catch { /* ignore */ }
      }
    }

    // Return safe fallback
    return {
      summary: 'AI review completed. The response could not be fully parsed into structured format.',
      issues: [{
        title: 'Raw AI Review Output',
        description: text.substring(0, 2000),
        severity: 'MEDIUM',
        category: 'General',
        line: null,
        filePath: null,
        recommendation: 'Please review the raw AI output above.',
      }],
    };
  }
}
