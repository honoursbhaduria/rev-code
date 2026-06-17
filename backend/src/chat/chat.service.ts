import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProvidersService } from '../ai/ai-providers.service';
import { LangChainService } from '../ai/langchain.service';
import { FilesService } from '../files/files.service';
import { CreateSessionDto, SendMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvidersService: AiProvidersService,
    private readonly langchainService: LangChainService,
    private readonly filesService: FilesService,
  ) {}

  async createSession(userId: string, dto: CreateSessionDto) {
    // Verify project ownership
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, userId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} not found`);
    }

    return this.prisma.chatSession.create({
      data: {
        title: dto.title,
        projectId: dto.projectId,
        userId,
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });
  }

  async getSessions(userId: string, projectId?: string) {
    return this.prisma.chatSession.findMany({
      where: {
        userId,
        ...(projectId && { projectId }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        project: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }

    return session;
  }

  async deleteSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }

    await this.prisma.chatSession.delete({ where: { id: sessionId } });

    return { message: 'Chat session deleted successfully' };
  }

  async sendMessage(
    userId: string,
    sessionId: string,
    dto: SendMessageDto,
  ) {
    // Verify session ownership
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: { project: true },
    });

    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
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

    // Get project files as context
    const projectFiles = await this.filesService.getProjectFilesContent(
      session.projectId,
    );

    // Build system prompt with file context
    const fileContext =
      projectFiles.length > 0
        ? this.buildFileContext(projectFiles)
        : 'No files have been uploaded to this project yet.';

    const systemPrompt = `You are an expert AI code assistant helping developers understand and improve their codebase.

You have access to the following project files:

${fileContext}

Guidelines:
- Answer questions about the code clearly and concisely
- When referencing code, mention the specific file and line numbers if applicable
- If asked to generate code, provide clean, production-ready examples
- Explain complex concepts in simple terms
- Point out potential improvements when relevant
- If you don't know something or if the information isn't in the provided files, say so clearly
- Format code examples with proper syntax highlighting using markdown code blocks`;

    // Get chat history (last 20 messages to stay within context limits)
    const history = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { role: true, content: true },
    });

    // Save user message first
    const userMessage = await this.prisma.message.create({
      data: {
        role: 'USER',
        content: dto.content,
        sessionId,
      },
    });

    // ── Use LangChain for chat ──────────────────────────────────────────
    let aiResponseContent: string;
    try {
      const chatHistory = history.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      }));

      aiResponseContent = await this.langchainService.runChat(
        provider,
        systemPrompt,
        chatHistory,
        dto.content,
      );
    } catch (error) {
      this.logger.error(`Chat AI call failed: ${error.message}`);
      // Save error message
      const errorMessage = await this.prisma.message.create({
        data: {
          role: 'ASSISTANT',
          content:
            'I apologize, but I encountered an error processing your request. Please try again.',
          sessionId,
        },
      });

      // Update session timestamp
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });

      return {
        userMessage,
        assistantMessage: errorMessage,
        error: error.message,
      };
    }

    // Save assistant response
    const assistantMessage = await this.prisma.message.create({
      data: {
        role: 'ASSISTANT',
        content: aiResponseContent,
        sessionId,
      },
    });

    // Update session timestamp
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return {
      userMessage,
      assistantMessage,
    };
  }

  async getMessages(userId: string, sessionId: string) {
    // Verify ownership
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }

    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private buildFileContext(
    files: { path: string; content: string }[],
  ): string {
    const MAX_CONTEXT_CHARS = 80000; // ~20k tokens
    let context = '';
    let totalChars = 0;

    for (const file of files) {
      const fileBlock = `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      if (totalChars + fileBlock.length > MAX_CONTEXT_CHARS) {
        context += `\n[${files.length} files total - some omitted due to context size limit]`;
        break;
      }
      context += fileBlock;
      totalChars += fileBlock.length;
    }

    return context;
  }
}
