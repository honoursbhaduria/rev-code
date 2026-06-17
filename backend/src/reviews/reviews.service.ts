import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvidersService } from '../ai/ai-providers.service';
import { LangChainService, ReviewResult } from '../ai/langchain.service';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvidersService: AiProvidersService,
    private readonly langchainService: LangChainService,
  ) {}

  async createReview(userId: string, dto: CreateReviewDto) {
    // Verify project ownership
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, userId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} not found`);
    }

    // Get the selected files with content
    const files = await this.prisma.file.findMany({
      where: {
        id: { in: dto.fileIds },
        projectId: dto.projectId,
        isFolder: false,
      },
      select: { id: true, name: true, path: true, content: true },
    });

    if (files.length === 0) {
      throw new BadRequestException(
        'No valid files found for the selected IDs',
      );
    }

    // Get AI provider
    let provider;
    if (dto.providerId) {
      provider = await this.aiProvidersService.getProviderById(
        userId,
        dto.providerId,
      );
    } else {
      provider = await this.aiProvidersService.getDefaultProvider(userId);
    }

    // Create review record with PENDING status
    const review = await this.prisma.review.create({
      data: {
        title: dto.title,
        reviewMode: dto.reviewMode.toUpperCase(),
        status: 'PENDING',
        projectId: dto.projectId,
        providerId: provider.id,
        files: {
          create: dto.fileIds.map((fileId) => ({ fileId })),
        },
      },
      include: {
        files: { include: { file: { select: { id: true, name: true, path: true } } } },
      },
    });

    // Run AI review asynchronously using LangChain
    this.runReview(review.id, files, dto.reviewMode.toUpperCase(), provider).catch(
      (err) => {
        this.logger.error(`Review ${review.id} failed: ${err.message}`);
        this.prisma.review
          .update({
            where: { id: review.id },
            data: { status: 'FAILED' },
          })
          .catch(() => {});
      },
    );

    return {
      ...review,
      message: 'Review started. Results will be available shortly.',
    };
  }

  private async runReview(
    reviewId: string,
    files: { name: string; path: string; content: string | null }[],
    reviewMode: string,
    provider: { baseUrl: string; apiKey?: string | null; model: string },
  ) {
    // Mark as running
    await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: 'RUNNING' },
    });

    // Build file context string
    const fileContext = files
      .filter((f) => f.content)
      .map((f) => `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join('\n\n');

    if (!fileContext) {
      await this.prisma.review.update({
        where: { id: reviewId },
        data: {
          status: 'COMPLETED',
          summary: 'No readable file content found to review.',
        },
      });
      return;
    }

    // ── Use LangChain for structured review ──────────────────────────────
    let result: ReviewResult;
    try {
      result = await this.langchainService.runReview(
        provider,
        fileContext,
        reviewMode,
      );
    } catch (error) {
      this.logger.error(`LangChain review failed: ${error.message}`);
      // Mark as failed
      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: 'FAILED', summary: `Review failed: ${error.message}` },
      });
      return;
    }

    // Store results in DB
    const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: 'COMPLETED',
        summary: result.summary,
        issues: {
          create: result.issues.map((issue) => ({
            title: String(issue.title || 'Untitled Issue'),
            description: String(issue.description || ''),
            severity: validSeverities.includes(String(issue.severity).toUpperCase())
              ? (String(issue.severity).toUpperCase() as any)
              : 'MEDIUM',
            category: String(issue.category || 'General'),
            line: issue.line ?? null,
            filePath: issue.filePath ?? null,
            recommendation: String(issue.recommendation || ''),
          })),
        },
      },
    });
  }

  async getReviews(userId: string, projectId?: string, search?: string) {
    return this.prisma.review.findMany({
      where: {
        project: { userId },
        ...(projectId && { projectId }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { summary: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { issues: true } },
      },
    });
  }

  async getReviewDetail(userId: string, id: string) {
    const review = await this.prisma.review.findFirst({
      where: { id, project: { userId } },
      include: {
        project: { select: { id: true, name: true } },
        files: {
          include: {
            file: { select: { id: true, name: true, path: true } },
          },
        },
        issues: {
          orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        },
        provider: {
          select: { id: true, name: true, model: true },
        },
      },
    });

    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    return review;
  }

  async deleteReview(userId: string, id: string) {
    const review = await this.prisma.review.findFirst({
      where: { id, project: { userId } },
    });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }

    await this.prisma.review.delete({ where: { id } });

    return { message: 'Review deleted successfully' };
  }
}
