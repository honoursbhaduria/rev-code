import { Injectable, Logger } from '@nestjs/common';

// ─── Secret Patterns ───────────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  category: string;
  regex: RegExp;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // ── AWS ────────────────────────────────────────────────────────────────
  {
    name: 'AWS Access Key ID',
    category: 'AWS',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: 'CRITICAL',
    description: 'AWS Access Key ID found. This can grant full access to AWS services.',
  },
  {
    name: 'AWS Secret Access Key',
    category: 'AWS',
    regex: /(?:aws_secret_access_key|aws_secret_key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
    severity: 'CRITICAL',
    description: 'AWS Secret Access Key found.',
  },

  // ── GitHub ─────────────────────────────────────────────────────────────
  {
    name: 'GitHub Personal Access Token',
    category: 'GitHub',
    regex: /\bghp_[A-Za-z0-9]{36}\b/g,
    severity: 'CRITICAL',
    description: 'GitHub Personal Access Token found.',
  },
  {
    name: 'GitHub OAuth Token',
    category: 'GitHub',
    regex: /\bgho_[A-Za-z0-9]{36}\b/g,
    severity: 'CRITICAL',
    description: 'GitHub OAuth Access Token found.',
  },
  {
    name: 'GitHub Fine-Grained PAT',
    category: 'GitHub',
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
    severity: 'CRITICAL',
    description: 'GitHub Fine-Grained Personal Access Token found.',
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    name: 'OpenAI API Key',
    category: 'OpenAI',
    regex: /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g,
    severity: 'CRITICAL',
    description: 'OpenAI API Key found.',
  },
  {
    name: 'OpenAI API Key (new format)',
    category: 'OpenAI',
    regex: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/g,
    severity: 'CRITICAL',
    description: 'OpenAI Project API Key found.',
  },

  // ── Groq ───────────────────────────────────────────────────────────────
  {
    name: 'Groq API Key',
    category: 'Groq',
    regex: /\bgsk_[A-Za-z0-9]{52}\b/g,
    severity: 'CRITICAL',
    description: 'Groq API Key found.',
  },

  // ── Google ─────────────────────────────────────────────────────────────
  {
    name: 'Google API Key',
    category: 'Google',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    severity: 'HIGH',
    description: 'Google API Key found.',
  },
  {
    name: 'Google OAuth Client Secret',
    category: 'Google',
    regex: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/g,
    severity: 'CRITICAL',
    description: 'Google OAuth Client Secret found.',
  },

  // ── Stripe ─────────────────────────────────────────────────────────────
  {
    name: 'Stripe Secret Key',
    category: 'Stripe',
    regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'CRITICAL',
    description: 'Stripe Live Secret Key found.',
  },
  {
    name: 'Stripe Publishable Key',
    category: 'Stripe',
    regex: /\bpk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'HIGH',
    description: 'Stripe Live Publishable Key found.',
  },
  {
    name: 'Stripe Restricted Key',
    category: 'Stripe',
    regex: /\brk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'CRITICAL',
    description: 'Stripe Live Restricted Key found.',
  },

  // ── Slack ──────────────────────────────────────────────────────────────
  {
    name: 'Slack Bot Token',
    category: 'Slack',
    regex: /\bxoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24}\b/g,
    severity: 'CRITICAL',
    description: 'Slack Bot Token found.',
  },
  {
    name: 'Slack User Token',
    category: 'Slack',
    regex: /\bxoxp-[0-9]{10,}-[0-9]{10,}-[0-9]{10,}-[a-f0-9]{32}\b/g,
    severity: 'CRITICAL',
    description: 'Slack User Token found.',
  },
  {
    name: 'Slack Webhook',
    category: 'Slack',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    severity: 'HIGH',
    description: 'Slack Webhook URL found.',
  },

  // ── Discord ────────────────────────────────────────────────────────────
  {
    name: 'Discord Bot Token',
    category: 'Discord',
    regex: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/g,
    severity: 'CRITICAL',
    description: 'Discord Bot Token found.',
  },
  {
    name: 'Discord Webhook',
    category: 'Discord',
    regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g,
    severity: 'HIGH',
    description: 'Discord Webhook URL found.',
  },

  // ── Private Keys ───────────────────────────────────────────────────────
  {
    name: 'RSA Private Key',
    category: 'Private Key',
    regex: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    description: 'RSA Private Key found.',
  },
  {
    name: 'EC Private Key',
    category: 'Private Key',
    regex: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    description: 'EC Private Key found.',
  },
  {
    name: 'Generic Private Key',
    category: 'Private Key',
    regex: /-----BEGIN PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    description: 'Private Key found.',
  },
  {
    name: 'PGP Private Key',
    category: 'Private Key',
    regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'CRITICAL',
    description: 'PGP Private Key found.',
  },
  {
    name: 'SSH Private Key',
    category: 'Private Key',
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    description: 'OpenSSH Private Key found.',
  },

  // ── Database URLs ──────────────────────────────────────────────────────
  {
    name: 'PostgreSQL Connection String',
    category: 'Database',
    regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/\s]+/gi,
    severity: 'HIGH',
    description: 'PostgreSQL connection string with credentials found.',
  },
  {
    name: 'MongoDB Connection String',
    category: 'Database',
    regex: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^/\s]+/gi,
    severity: 'HIGH',
    description: 'MongoDB connection string with credentials found.',
  },
  {
    name: 'MySQL Connection String',
    category: 'Database',
    regex: /mysql:\/\/[^:]+:[^@]+@[^/\s]+/gi,
    severity: 'HIGH',
    description: 'MySQL connection string with credentials found.',
  },

  // ── JWT Tokens ─────────────────────────────────────────────────────────
  {
    name: 'JWT Token',
    category: 'Token',
    regex: /\beyJ[A-Za-z0-9-_]{15,}\.eyJ[A-Za-z0-9-_]{15,}\.[A-Za-z0-9-_]{15,}\b/g,
    severity: 'HIGH',
    description: 'JWT token found. This may grant access to services.',
  },

  // ── Generic Secrets ────────────────────────────────────────────────────
  {
    name: 'Hardcoded Password',
    category: 'Generic',
    regex: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]{8,}['"]/gi,
    severity: 'HIGH',
    description: 'Hardcoded password found.',
  },
  {
    name: 'Hardcoded API Key',
    category: 'Generic',
    regex: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    severity: 'HIGH',
    description: 'Hardcoded API key found.',
  },
  {
    name: 'Hardcoded Secret',
    category: 'Generic',
    regex: /(?:secret|secret[_-]?key)\s*[=:]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    severity: 'HIGH',
    description: 'Hardcoded secret found.',
  },
  {
    name: 'Hardcoded Token',
    category: 'Generic',
    regex: /(?:access[_-]?token|auth[_-]?token)\s*[=:]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    severity: 'HIGH',
    description: 'Hardcoded access/auth token found.',
  },
  {
    name: 'Bearer Token in Code',
    category: 'Generic',
    regex: /['"]Bearer\s+[A-Za-z0-9_\-.]{20,}['"]/g,
    severity: 'MEDIUM',
    description: 'Hardcoded Bearer token found.',
  },

  // ── SendGrid ───────────────────────────────────────────────────────────
  {
    name: 'SendGrid API Key',
    category: 'SendGrid',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    severity: 'CRITICAL',
    description: 'SendGrid API Key found.',
  },

  // ── Twilio ─────────────────────────────────────────────────────────────
  {
    name: 'Twilio API Key',
    category: 'Twilio',
    regex: /\bSK[0-9a-fA-F]{32}\b/g,
    severity: 'HIGH',
    description: 'Twilio API Key found.',
  },

  // ── Heroku ─────────────────────────────────────────────────────────────
  {
    name: 'Heroku API Key',
    category: 'Heroku',
    regex: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    severity: 'MEDIUM',
    description: 'Possible Heroku API Key (UUID format) found.',
  },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SecretFinding {
  pattern: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  description: string;
  filePath: string;
  lineNumber: number;
  matchPreview: string;  // redacted preview showing context
}

export interface ScanResult {
  totalFiles: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  findings: SecretFinding[];
  scanDuration: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SecretScannerService {
  private readonly logger = new Logger(SecretScannerService.name);

  /**
   * Scan multiple files for secrets
   */
  scanFiles(
    files: { path: string; content: string | null }[],
  ): ScanResult {
    const startTime = Date.now();
    const allFindings: SecretFinding[] = [];

    for (const file of files) {
      if (!file.content) continue;
      const findings = this.scanContent(file.path, file.content);
      allFindings.push(...findings);
    }

    return {
      totalFiles: files.length,
      totalFindings: allFindings.length,
      criticalCount: allFindings.filter((f) => f.severity === 'CRITICAL').length,
      highCount: allFindings.filter((f) => f.severity === 'HIGH').length,
      mediumCount: allFindings.filter((f) => f.severity === 'MEDIUM').length,
      findings: allFindings,
      scanDuration: Date.now() - startTime,
    };
  }

  /**
   * Scan a single file's content for secrets
   */
  scanContent(filePath: string, content: string): SecretFinding[] {
    const findings: SecretFinding[] = [];
    const lines = content.split('\n');

    // Skip scanning for common false-positive files
    if (this.shouldSkipFile(filePath)) return [];

    for (const pattern of SECRET_PATTERNS) {
      // Reset regex state
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match: RegExpExecArray | null;

        // Reset regex for each line
        const lineRegex = new RegExp(regex.source, regex.flags);
        while ((match = lineRegex.exec(line)) !== null) {
          // Skip if it looks like an example/placeholder
          if (this.isLikelyPlaceholder(match[0], line)) continue;

          findings.push({
            pattern: pattern.name,
            category: pattern.category,
            severity: pattern.severity,
            description: pattern.description,
            filePath,
            lineNumber: lineIndex + 1,
            matchPreview: this.redactMatch(line, match.index, match[0].length),
          });

          // Avoid infinite loops on zero-width matches
          if (match[0].length === 0) break;
        }
      }
    }

    return findings;
  }

  // ─── Private ──────────────────────────────────────────────────────────────────

  /**
   * Skip files that commonly have false positives
   */
  private shouldSkipFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    const skipPatterns = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.min.js',
      '.min.css',
      '.map',
      'node_modules/',
      '.git/',
      'vendor/',
    ];
    return skipPatterns.some((p) => lower.includes(p));
  }

  /**
   * Check if a match looks like a placeholder/example
   */
  private isLikelyPlaceholder(match: string, line: string): boolean {
    const lower = line.toLowerCase();
    const placeholderHints = [
      'example', 'placeholder', 'your-', 'your_', 'xxx', 'test',
      'dummy', 'sample', 'changeme', 'replace', 'todo', 'fixme',
      '// ', '/* ', '# ', '<!-- ',  // Comments
    ];
    return placeholderHints.some((hint) => lower.includes(hint));
  }

  /**
   * Redact the sensitive part of a match, showing only context
   */
  private redactMatch(
    line: string,
    matchIndex: number,
    matchLength: number,
  ): string {
    const contextBefore = line.substring(Math.max(0, matchIndex - 20), matchIndex);
    const matched = line.substring(matchIndex, matchIndex + matchLength);
    const contextAfter = line.substring(
      matchIndex + matchLength,
      Math.min(line.length, matchIndex + matchLength + 20),
    );

    // Redact the matched secret, showing only first 4 and last 4 chars
    let redacted: string;
    if (matched.length > 12) {
      redacted = matched.substring(0, 4) + '****' + matched.substring(matched.length - 4);
    } else {
      redacted = matched.substring(0, 2) + '****';
    }

    return `${contextBefore}${redacted}${contextAfter}`.trim();
  }
}
