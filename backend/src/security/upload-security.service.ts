import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';

// ─── Dangerous Extensions ──────────────────────────────────────────────────────

const BLOCKED_EXTENSIONS = new Set([
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.bin', '.com', '.msi', '.scr', '.pif',
  // Scripts that execute on servers
  '.php', '.asp', '.aspx', '.jsp', '.cgi', '.pl', '.war', '.ear',
  // Windows scripts
  '.bat', '.cmd', '.vbs', '.vbe', '.ws', '.wsf', '.wsc', '.wsh',
  // PowerShell
  '.ps1', '.ps1xml', '.psc1', '.psd1', '.psm1',
  // Other dangerous
  '.app', '.action', '.command', '.workflow', '.reg', '.inf', '.hta',
  // Archive bombs (nested)
  '.tar.gz', '.tgz', '.tar.bz2',
]);

const ALLOWED_TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.cs',
  '.c', '.cpp', '.h', '.hpp', '.cc',
  '.html', '.htm', '.xml', '.svg',
  '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.md', '.mdx', '.txt', '.rst', '.adoc',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.gql',
  '.lua', '.r', '.dart', '.ex', '.exs',
  '.vue', '.svelte',
  '.env', '.env.example', '.env.local',
  '.gitignore', '.dockerignore', '.editorconfig',
  '.prisma', '.proto', '.tf', '.hcl',
]);

// ─── Magic Bytes for known dangerous file types ────────────────────────────────

const DANGEROUS_MAGIC_BYTES: { name: string; bytes: number[] }[] = [
  { name: 'EXE/DLL (MZ)', bytes: [0x4d, 0x5a] },
  { name: 'ELF Binary', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'Mach-O Binary', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: 'Mach-O Binary (64)', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: 'Java Class', bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: 'DEX (Android)', bytes: [0x64, 0x65, 0x78, 0x0a] },
];

// ─── Malicious content patterns ────────────────────────────────────────────────

const MALICIOUS_CONTENT_PATTERNS = [
  // PHP code injection
  /(<\?php|<\?=)/i,
  // Server-side includes
  /<!--\s*#\s*(exec|include|echo|config)\b/i,
  // Shell injection in filenames
  /[;&|`$(){}[\]!]/,
];

// ─── Configuration ─────────────────────────────────────────────────────────────

export interface UploadSecurityConfig {
  maxDecompressedSize: number;    // Max total decompressed size in bytes
  maxCompressionRatio: number;    // Max compression ratio (decompressed/compressed)
  maxFileCount: number;           // Max number of files in ZIP
  maxSingleFileSize: number;      // Max size per individual file
  maxFilenameLength: number;      // Max filename length
  blockExecutables: boolean;      // Whether to block executable files
}

const DEFAULT_CONFIG: UploadSecurityConfig = {
  maxDecompressedSize: 100 * 1024 * 1024,  // 100MB
  maxCompressionRatio: 100,                 // 100:1 ratio
  maxFileCount: 5000,
  maxSingleFileSize: 5 * 1024 * 1024,      // 5MB per file
  maxFilenameLength: 255,
  blockExecutables: true,
};

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityViolation {
  type: 'ZIP_BOMB' | 'PATH_TRAVERSAL' | 'BLOCKED_EXTENSION' | 'MAGIC_BYTE' | 'MALICIOUS_CONTENT' | 'FILENAME' | 'SIZE_LIMIT' | 'SYMLINK';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  message: string;
  filePath?: string;
}

export interface UploadSecurityResult {
  safe: boolean;
  violations: SecurityViolation[];
  filesScanned: number;
  totalSize: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class UploadSecurityService {
  private readonly logger = new Logger(UploadSecurityService.name);
  private readonly config: UploadSecurityConfig;

  constructor() {
    this.config = DEFAULT_CONFIG;
  }

  /**
   * Validate a ZIP file before extraction
   */
  validateZipEntries(
    entries: { path: string; compressedSize: number; uncompressedSize?: number; type: string }[],
    compressedSize: number,
  ): UploadSecurityResult {
    const violations: SecurityViolation[] = [];
    let totalDecompressed = 0;

    // Check file count
    if (entries.length > this.config.maxFileCount) {
      violations.push({
        type: 'ZIP_BOMB',
        severity: 'CRITICAL',
        message: `ZIP contains ${entries.length} entries (max: ${this.config.maxFileCount}). Possible zip bomb.`,
      });
    }

    for (const entry of entries) {
      const entryPath = entry.path.replace(/\\/g, '/');

      // ── Path Traversal Detection ──────────────────────────────────────
      if (this.hasPathTraversal(entryPath)) {
        violations.push({
          type: 'PATH_TRAVERSAL',
          severity: 'CRITICAL',
          message: `Path traversal detected: "${entryPath}"`,
          filePath: entryPath,
        });
      }

      // ── Symlink Detection ────────────────────────────────────────────
      if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
        violations.push({
          type: 'SYMLINK',
          severity: 'HIGH',
          message: `Symbolic link detected: "${entryPath}"`,
          filePath: entryPath,
        });
      }

      // ── Extension Blocking ───────────────────────────────────────────
      if (this.config.blockExecutables && this.isBlockedExtension(entryPath)) {
        violations.push({
          type: 'BLOCKED_EXTENSION',
          severity: 'HIGH',
          message: `Blocked file extension: "${entryPath}"`,
          filePath: entryPath,
        });
      }

      // ── Filename Validation ──────────────────────────────────────────
      const filename = entryPath.split('/').pop() || '';
      if (filename.length > this.config.maxFilenameLength) {
        violations.push({
          type: 'FILENAME',
          severity: 'MEDIUM',
          message: `Filename too long (${filename.length} chars): "${filename.substring(0, 50)}..."`,
          filePath: entryPath,
        });
      }

      // Check for null bytes in filename
      if (filename.includes('\0') || filename.includes('%00')) {
        violations.push({
          type: 'FILENAME',
          severity: 'CRITICAL',
          message: `Null byte detected in filename: "${entryPath}"`,
          filePath: entryPath,
        });
      }

      // ── Size tracking ────────────────────────────────────────────────
      const size = entry.uncompressedSize || entry.compressedSize;
      totalDecompressed += size;

      if (size > this.config.maxSingleFileSize) {
        violations.push({
          type: 'SIZE_LIMIT',
          severity: 'MEDIUM',
          message: `File exceeds size limit (${(size / 1024 / 1024).toFixed(1)}MB > ${(this.config.maxSingleFileSize / 1024 / 1024).toFixed(0)}MB): "${entryPath}"`,
          filePath: entryPath,
        });
      }
    }

    // ── Zip Bomb Detection (compression ratio) ──────────────────────────
    if (compressedSize > 0) {
      const ratio = totalDecompressed / compressedSize;
      if (ratio > this.config.maxCompressionRatio) {
        violations.push({
          type: 'ZIP_BOMB',
          severity: 'CRITICAL',
          message: `Suspicious compression ratio: ${ratio.toFixed(0)}:1 (max: ${this.config.maxCompressionRatio}:1). Possible zip bomb.`,
        });
      }
    }

    // ── Total size check ─────────────────────────────────────────────────
    if (totalDecompressed > this.config.maxDecompressedSize) {
      violations.push({
        type: 'ZIP_BOMB',
        severity: 'CRITICAL',
        message: `Total decompressed size ${(totalDecompressed / 1024 / 1024).toFixed(0)}MB exceeds limit of ${(this.config.maxDecompressedSize / 1024 / 1024).toFixed(0)}MB.`,
      });
    }

    const hasCritical = violations.some((v) => v.severity === 'CRITICAL');

    return {
      safe: !hasCritical,
      violations,
      filesScanned: entries.length,
      totalSize: totalDecompressed,
    };
  }

  /**
   * Validate individual file content (for both ZIP entries and drag-and-drop)
   */
  validateFileContent(
    filePath: string,
    content: Buffer | string,
  ): SecurityViolation[] {
    const violations: SecurityViolation[] = [];
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

    // ── Magic Byte Detection ───────────────────────────────────────────
    for (const magic of DANGEROUS_MAGIC_BYTES) {
      if (buffer.length >= magic.bytes.length) {
        const matches = magic.bytes.every((b, i) => buffer[i] === b);
        if (matches) {
          violations.push({
            type: 'MAGIC_BYTE',
            severity: 'CRITICAL',
            message: `File contains ${magic.name} magic bytes (disguised binary): "${filePath}"`,
            filePath,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Validate a single uploaded file (drag-and-drop)
   */
  validateUploadedFile(file: {
    originalname: string;
    size: number;
    buffer?: Buffer;
  }): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Extension check
    if (this.config.blockExecutables && this.isBlockedExtension(file.originalname)) {
      violations.push({
        type: 'BLOCKED_EXTENSION',
        severity: 'HIGH',
        message: `Blocked file extension: "${file.originalname}"`,
        filePath: file.originalname,
      });
    }

    // Size check
    if (file.size > this.config.maxSingleFileSize) {
      violations.push({
        type: 'SIZE_LIMIT',
        severity: 'MEDIUM',
        message: `File exceeds size limit: "${file.originalname}" (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
        filePath: file.originalname,
      });
    }

    // Filename sanitization
    if (this.hasPathTraversal(file.originalname)) {
      violations.push({
        type: 'PATH_TRAVERSAL',
        severity: 'CRITICAL',
        message: `Path traversal detected in filename: "${file.originalname}"`,
        filePath: file.originalname,
      });
    }

    if (file.originalname.includes('\0') || file.originalname.includes('%00')) {
      violations.push({
        type: 'FILENAME',
        severity: 'CRITICAL',
        message: `Null byte in filename: "${file.originalname}"`,
        filePath: file.originalname,
      });
    }

    // Magic byte check
    if (file.buffer) {
      violations.push(...this.validateFileContent(file.originalname, file.buffer));
    }

    return violations;
  }

  /**
   * Sanitize a file path to prevent directory traversal
   */
  sanitizePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')           // normalize separators
      .replace(/\.\.\//g, '')        // remove ../
      .replace(/^\/+/, '')           // remove leading /
      .replace(/\0/g, '')            // remove null bytes
      .replace(/%00/g, '')           // remove encoded null bytes
      .replace(/%2e%2e%2f/gi, '')    // remove encoded ../
      .replace(/%2e%2e\//gi, '')     // remove mixed encoded ../
      .trim();
  }

  // ─── Private Methods ──────────────────────────────────────────────────────────

  private hasPathTraversal(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.includes('../') ||
      normalized.includes('..\\') ||
      normalized.startsWith('/') ||
      normalized.includes('%2e%2e') ||
      normalized.includes('..%2f') ||
      normalized.includes('..%5c') ||
      /^[a-zA-Z]:[/\\]/.test(normalized)  // Windows absolute path
    );
  }

  private isBlockedExtension(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    for (const ext of BLOCKED_EXTENSIONS) {
      if (lower.endsWith(ext)) return true;
    }
    return false;
  }
}
