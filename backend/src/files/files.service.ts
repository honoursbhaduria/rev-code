import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadSecurityService } from '../security/upload-security.service';
import { SecretScannerService } from '../security/secret-scanner.service';
import * as unzipper from 'unzipper';
import * as path from 'path';
import * as fs from 'fs';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.cs',
  '.c', '.cpp', '.h', '.hpp', '.cc',
  '.html', '.htm', '.xml', '.svg',
  '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.cfg', '.conf',
  '.md', '.mdx', '.txt', '.rst', '.adoc',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.sql', '.graphql', '.gql',
  '.php', '.lua', '.r', '.dart', '.ex', '.exs',
  '.vue', '.svelte',
]);

const IGNORED_PATH_SEGMENTS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '__pycache__',
  '.DS_Store',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'vendor',
  'venv',
  '.venv',
  'target',
  'out',
]);

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true; // Dockerfile, Makefile, etc.
  return TEXT_EXTENSIONS.has(ext);
}

function shouldIgnorePath(filePath: string): boolean {
  const parts = filePath.split('/');
  return parts.some((part) => IGNORED_PATH_SEGMENTS.has(part));
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.js': 'text/javascript',
    '.jsx': 'text/jsx',
    '.json': 'application/json',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.scss': 'text/scss',
    '.md': 'text/markdown',
    '.py': 'text/x-python',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.java': 'text/x-java',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.sh': 'text/x-sh',
    '.sql': 'text/x-sql',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.xml': 'text/xml',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.vue': 'text/x-vue',
    '.svelte': 'text/x-svelte',
    '.php': 'text/x-php',
    '.rb': 'text/x-ruby',
    '.kt': 'text/x-kotlin',
    '.swift': 'text/x-swift',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  size: number;
  mimeType: string;
  children?: FileTreeNode[];
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadSecurity: UploadSecurityService,
    private readonly secretScanner: SecretScannerService,
  ) {}

  // ─── IDOR: Verify project belongs to user ─────────────────────────────────

  private async verifyProjectOwnership(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new ForbiddenException('You do not have access to this project');
    }
    return project;
  }

  // ─── IDOR: Verify file belongs to user's project ─────────────────────────

  private async verifyFileOwnership(fileId: string, userId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId },
      include: { project: { select: { userId: true } } },
    });
    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }
    if (file.project.userId !== userId) {
      throw new ForbiddenException('You do not have access to this file');
    }
    return file;
  }

  // ─── ZIP Upload (with security scanning) ──────────────────────────────────

  async uploadZip(projectId: string, file: Express.Multer.File, userId: string) {
    if (!file) {
      throw new BadRequestException('No ZIP file provided');
    }

    const lowerName = file.originalname.toLowerCase();
    if (
      !lowerName.endsWith('.zip') &&
      file.mimetype !== 'application/zip' &&
      file.mimetype !== 'application/x-zip-compressed'
    ) {
      throw new BadRequestException('File must be a ZIP archive');
    }

    // IDOR: Verify project ownership
    await this.verifyProjectOwnership(projectId, userId);

    const dirMap = new Map<string, string>();
    const createdFiles: any[] = [];
    const scannedFiles: { path: string; content: string | null }[] = [];

    try {
      const zipBuffer = file.buffer || fs.readFileSync(file.path);
      const directory = await unzipper.Open.buffer(zipBuffer);

      // ── Security: Validate ZIP entries BEFORE extraction ──────────────
      const securityResult = this.uploadSecurity.validateZipEntries(
        directory.files.map((f) => ({
          path: f.path,
          compressedSize: f.compressedSize || 0,
          uncompressedSize: f.uncompressedSize || 0,
          type: f.type,
        })),
        zipBuffer.length,
      );

      if (!securityResult.safe) {
        const criticalViolations = securityResult.violations
          .filter((v) => v.severity === 'CRITICAL')
          .map((v) => v.message);
        throw new BadRequestException({
          message: 'ZIP file rejected due to security violations',
          violations: criticalViolations,
          totalViolations: securityResult.violations.length,
        });
      }

      // Sort: directories first, then files
      const entries = directory.files.sort((a, b) => {
        const aIsDir = a.path.endsWith('/');
        const bIsDir = b.path.endsWith('/');
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.path.localeCompare(b.path);
      });

      // First pass: create directory nodes
      for (const entry of entries) {
        if (shouldIgnorePath(entry.path)) continue;
        const entryPath = this.uploadSecurity.sanitizePath(entry.path);
        if (entry.type === 'Directory' || entryPath.endsWith('/')) {
          const cleanPath = entryPath.replace(/\/$/, '');
          if (!cleanPath) continue;
          await this.ensureDirectoryPath(projectId, cleanPath, dirMap);
        }
      }

      // Second pass: create file nodes
      for (const entry of entries) {
        if (shouldIgnorePath(entry.path)) continue;
        const entryPath = this.uploadSecurity.sanitizePath(entry.path);
        if (entryPath.endsWith('/')) continue;

        // ── Security: Validate individual file ──────────────────────────
        const fileViolations = this.uploadSecurity.validateUploadedFile({
          originalname: entryPath,
          size: entry.compressedSize || 0,
        });
        if (fileViolations.some((v) => v.severity === 'CRITICAL')) {
          this.logger.warn(`Skipping blocked file: ${entryPath}`);
          continue;
        }

        const name = path.basename(entryPath);
        const parentPath = path.dirname(entryPath);
        const normalizedParent =
          parentPath === '.' ? null : parentPath.replace(/\\/g, '/');

        let parentId: string | null = null;
        if (normalizedParent) {
          if (!dirMap.has(normalizedParent)) {
            await this.ensureDirectoryPath(projectId, normalizedParent, dirMap);
          }
          parentId = dirMap.get(normalizedParent) || null;
        }

        let content: string | null = null;
        if (isTextFile(entryPath)) {
          try {
            const buffer = await streamToBuffer(entry.stream());

            // ── Security: Magic byte check on content ───────────────────
            const contentViolations = this.uploadSecurity.validateFileContent(entryPath, buffer);
            if (contentViolations.some((v) => v.severity === 'CRITICAL')) {
              this.logger.warn(`Blocked disguised binary: ${entryPath}`);
              continue;
            }

            content = buffer.toString('utf-8');
          } catch (err) {
            this.logger.warn(`Could not read ${entryPath}: ${err}`);
          }
        }

        const dbFile = await this.prisma.file.create({
          data: {
            name,
            path: entryPath,
            isFolder: false,
            size: entry.compressedSize || 0,
            mimeType: guessMimeType(entryPath),
            content,
            projectId,
            parentId,
          },
        });

        createdFiles.push(dbFile);
        scannedFiles.push({ path: entryPath, content });
      }

      // Clean up temp file
      if (file.path) {
        try { fs.unlinkSync(file.path); } catch (_) {}
      }

      // ── Secret Scanning ─────────────────────────────────────────────────
      const scanResult = this.secretScanner.scanFiles(scannedFiles);

      // Store security scan results
      if (scanResult.totalFindings > 0) {
        await this.prisma.securityScan.create({
          data: {
            projectId,
            findings: scanResult as any,
            totalIssues: scanResult.totalFindings,
            criticalCount: scanResult.criticalCount,
          },
        });
      }

      return {
        message: 'ZIP uploaded and extracted successfully',
        filesCreated: createdFiles.length,
        files: createdFiles,
        securityScan: {
          totalFindings: scanResult.totalFindings,
          criticalCount: scanResult.criticalCount,
          highCount: scanResult.highCount,
          mediumCount: scanResult.mediumCount,
          findings: scanResult.findings.slice(0, 20), // Limit response size
        },
        uploadSecurity: {
          warnings: securityResult.violations
            .filter((v) => v.severity !== 'CRITICAL')
            .map((v) => v.message),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error('Failed to process ZIP file', error);
      throw new BadRequestException(
        `Failed to process ZIP file: ${error.message}`,
      );
    }
  }

  private async ensureDirectoryPath(
    projectId: string,
    dirPath: string,
    dirMap: Map<string, string>,
  ): Promise<string> {
    if (dirMap.has(dirPath)) {
      return dirMap.get(dirPath)!;
    }

    const parts = dirPath.split('/').filter(Boolean);
    let currentPath = '';
    let parentId: string | null = null;

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (dirMap.has(currentPath)) {
        parentId = dirMap.get(currentPath)!;
        continue;
      }

      const existing = await this.prisma.file.findFirst({
        where: { projectId, path: currentPath, isFolder: true },
      });

      if (existing) {
        dirMap.set(currentPath, existing.id);
        parentId = existing.id;
        continue;
      }

      const dir = await this.prisma.file.create({
        data: {
          name: part,
          path: currentPath,
          isFolder: true,
          size: 0,
          mimeType: 'inode/directory',
          content: null,
          projectId,
          parentId,
        },
      });

      dirMap.set(currentPath, dir.id);
      parentId = dir.id;
    }

    return dirMap.get(dirPath)!;
  }

  // ─── File Upload (with security scanning) ─────────────────────────────────

  async uploadFiles(projectId: string, files: Express.Multer.File[], userId: string) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    // IDOR: Verify project ownership
    await this.verifyProjectOwnership(projectId, userId);

    const createdFiles: any[] = [];
    const scannedFiles: { path: string; content: string | null }[] = [];

    for (const file of files) {
      // ── Security: Validate each file ──────────────────────────────────
      const violations = this.uploadSecurity.validateUploadedFile(file);
      if (violations.some((v) => v.severity === 'CRITICAL')) {
        this.logger.warn(`Blocked file: ${file.originalname} — ${violations[0].message}`);
        continue; // Skip this file but continue with others
      }

      let content: string | null = null;

      if (isTextFile(file.originalname)) {
        try {
          if (file.buffer) {
            // ── Security: Magic byte check ────────────────────────────────
            const contentViolations = this.uploadSecurity.validateFileContent(
              file.originalname,
              file.buffer,
            );
            if (contentViolations.some((v) => v.severity === 'CRITICAL')) {
              this.logger.warn(`Blocked disguised binary: ${file.originalname}`);
              continue;
            }
            content = file.buffer.toString('utf-8');
          } else if (file.path) {
            content = fs.readFileSync(file.path, 'utf-8');
          }
        } catch (err) {
          this.logger.warn(`Could not read ${file.originalname}: ${err}`);
        }
      }

      // Sanitize the filename
      const sanitizedName = this.uploadSecurity.sanitizePath(file.originalname);

      const dbFile = await this.prisma.file.create({
        data: {
          name: sanitizedName,
          path: sanitizedName,
          isFolder: false,
          size: file.size,
          mimeType: file.mimetype || guessMimeType(file.originalname),
          content,
          projectId,
          parentId: null,
        },
      });

      if (file.path) {
        try { fs.unlinkSync(file.path); } catch (_) {}
      }

      createdFiles.push(dbFile);
      scannedFiles.push({ path: sanitizedName, content });
    }

    // ── Secret Scanning ─────────────────────────────────────────────────────
    const scanResult = this.secretScanner.scanFiles(scannedFiles);

    if (scanResult.totalFindings > 0) {
      await this.prisma.securityScan.create({
        data: {
          projectId,
          findings: scanResult as any,
          totalIssues: scanResult.totalFindings,
          criticalCount: scanResult.criticalCount,
        },
      });
    }

    return {
      message: 'Files uploaded successfully',
      filesCreated: createdFiles.length,
      files: createdFiles,
      securityScan: {
        totalFindings: scanResult.totalFindings,
        criticalCount: scanResult.criticalCount,
        highCount: scanResult.highCount,
        mediumCount: scanResult.mediumCount,
        findings: scanResult.findings.slice(0, 20),
      },
    };
  }

  // ─── File Tree (IDOR protected) ───────────────────────────────────────────

  async getFileTree(projectId: string, userId: string): Promise<FileTreeNode[]> {
    // IDOR: Verify project ownership
    await this.verifyProjectOwnership(projectId, userId);

    const rootFiles = await this.prisma.file.findMany({
      where: { projectId, parentId: null },
      orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, path: true, isFolder: true, size: true, mimeType: true },
    });

    const buildTree = async (
      files: { id: string; name: string; path: string; isFolder: boolean; size: number; mimeType: string }[],
    ): Promise<FileTreeNode[]> => {
      const result: FileTreeNode[] = [];
      for (const f of files) {
        const node: FileTreeNode = {
          id: f.id,
          name: f.name,
          path: f.path,
          isFolder: f.isFolder,
          size: f.size,
          mimeType: f.mimeType,
        };
        if (f.isFolder) {
          const children = await this.prisma.file.findMany({
            where: { parentId: f.id },
            orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
            select: { id: true, name: true, path: true, isFolder: true, size: true, mimeType: true },
          });
          node.children = await buildTree(children);
        }
        result.push(node);
      }
      return result;
    };

    return buildTree(rootFiles);
  }

  // ─── File Content (IDOR protected) ────────────────────────────────────────

  async getFileContent(fileId: string, userId: string) {
    // IDOR: Verify file ownership through project chain
    await this.verifyFileOwnership(fileId, userId);

    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        path: true,
        isFolder: true,
        size: true,
        mimeType: true,
        content: true,
        createdAt: true,
      },
    });

    if (!file) {
      throw new NotFoundException(`File with ID ${fileId} not found`);
    }

    return file;
  }

  // ─── Delete File (IDOR protected) ─────────────────────────────────────────

  async deleteFile(fileId: string, userId: string) {
    // IDOR: Verify file ownership
    await this.verifyFileOwnership(fileId, userId);

    await this.prisma.file.delete({ where: { id: fileId } });

    return { message: 'File deleted successfully' };
  }

  // ─── Security Report ──────────────────────────────────────────────────────

  async getSecurityReport(projectId: string, userId: string) {
    // IDOR: Verify project ownership
    await this.verifyProjectOwnership(projectId, userId);

    const scans = await this.prisma.securityScan.findMany({
      where: { projectId },
      orderBy: { scanDate: 'desc' },
      take: 10,
    });

    return {
      projectId,
      scans: scans.map((s) => ({
        id: s.id,
        scanDate: s.scanDate,
        totalIssues: s.totalIssues,
        criticalCount: s.criticalCount,
        findings: s.findings,
      })),
    };
  }

  // ─── Internal: Get project files content (used by chat) ───────────────────

  async getProjectFilesContent(
    projectId: string,
  ): Promise<{ path: string; content: string }[]> {
    const files = await this.prisma.file.findMany({
      where: {
        projectId,
        isFolder: false,
        content: { not: null },
      },
      select: { path: true, content: true },
    });

    return files
      .filter((f) => f.content !== null)
      .map((f) => ({ path: f.path, content: f.content as string }));
  }
}
