import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AiProvidersModule } from '../ai/ai-providers.module';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AiProvidersModule, FilesModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
