import { Module } from '@nestjs/common';
import { AiProvidersController } from './ai-providers.controller';
import { AiProvidersService } from './ai-providers.service';
import { LangChainService } from './langchain.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiProvidersController],
  providers: [AiProvidersService, LangChainService],
  exports: [AiProvidersService, LangChainService],
})
export class AiProvidersModule {}
