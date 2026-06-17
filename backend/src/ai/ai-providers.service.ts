import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { LangChainService } from './langchain.service';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';
import OpenAI from 'openai';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiProvidersService {
  private readonly logger = new Logger(AiProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly langchain: LangChainService,
  ) {}

  async create(userId: string, dto: CreateProviderDto) {
    // If isDefault, unset other defaults for this user
    if (dto.isDefault) {
      await this.prisma.aiProvider.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // ── Security: Encrypt API key before storing ────────────────────────
    const encryptedKey = dto.apiKey
      ? this.encryption.encrypt(dto.apiKey)
      : null;

    return this.prisma.aiProvider.create({
      data: {
        name: dto.name,
        baseUrl: dto.baseUrl,
        apiKey: encryptedKey,
        model: dto.model,
        isDefault: dto.isDefault ?? false,
        userId,
      },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        model: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        // NEVER return apiKey
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.aiProvider.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        baseUrl: true,
        model: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        // Do NOT return apiKey in list
      },
    });
  }

  async findOne(userId: string, id: string) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        model: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        // Omit apiKey for security
      },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID ${id} not found`);
    }

    return provider;
  }

  async update(userId: string, id: string, dto: UpdateProviderDto) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: { id, userId },
    });
    if (!provider) {
      throw new NotFoundException(`AI Provider with ID ${id} not found`);
    }

    if (dto.isDefault) {
      await this.prisma.aiProvider.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // ── Security: Encrypt new API key if provided ───────────────────────
    const encryptedKey = dto.apiKey !== undefined
      ? (dto.apiKey ? this.encryption.encrypt(dto.apiKey) : dto.apiKey)
      : undefined;

    return this.prisma.aiProvider.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.baseUrl && { baseUrl: dto.baseUrl }),
        ...(encryptedKey !== undefined && { apiKey: encryptedKey }),
        ...(dto.model && { model: dto.model }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        model: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async delete(userId: string, id: string) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: { id, userId },
    });
    if (!provider) {
      throw new NotFoundException(`AI Provider with ID ${id} not found`);
    }

    await this.prisma.aiProvider.delete({ where: { id } });

    return { message: 'AI Provider deleted successfully' };
  }

  async getDefaultProvider(userId: string) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: { userId, isDefault: true },
    });

    if (!provider) {
      // Fall back to the most recently created provider
      const fallback = await this.prisma.aiProvider.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (!fallback) {
        throw new NotFoundException(
          'No AI provider configured. Please add an AI provider first.',
        );
      }
      return this.decryptProviderKey(fallback);
    }

    return this.decryptProviderKey(provider);
  }

  async getProviderById(userId: string, providerId: string) {
    const provider = await this.prisma.aiProvider.findFirst({
      where: { id: providerId, userId },
    });

    if (!provider) {
      throw new NotFoundException(`AI Provider with ID ${providerId} not found`);
    }

    return this.decryptProviderKey(provider);
  }

  async testConnection(userId: string, providerId: string) {
    const provider = await this.getProviderById(userId, providerId);

    try {
      const response = await this.langchain.callAI(
        provider,
        [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        { maxTokens: 10 },
      );

      return {
        success: true,
        message: `Connection successful. Model responded: "${response}"`,
        model: provider.model,
        baseUrl: provider.baseUrl,
      };
    } catch (error) {
      this.logger.error(`AI provider test failed: ${error.message}`);
      throw new BadRequestException(
        `Connection test failed: ${error.message}`,
      );
    }
  }

  /**
   * Call AI using LangChain (primary method)
   */
  async callAI(
    provider: { baseUrl: string; apiKey?: string | null; model: string },
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    try {
      return await this.langchain.callAI(provider, messages, options);
    } catch (error) {
      this.logger.error(`LangChain AI call failed: ${error.message}`);
      throw new BadRequestException(`AI call failed: ${error.message}`);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Decrypt API key from database before use
   */
  private decryptProviderKey(provider: any) {
    if (provider.apiKey) {
      try {
        provider.apiKey = this.encryption.decrypt(provider.apiKey);
      } catch {
        // If decryption fails, the key might be stored in plaintext (legacy)
        this.logger.warn(`Could not decrypt API key for provider ${provider.id} — using as-is`);
      }
    }
    return provider;
  }
}
