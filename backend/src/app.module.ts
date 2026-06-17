import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { FilesModule } from './files/files.module';
import { AiProvidersModule } from './ai/ai-providers.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ChatModule } from './chat/chat.module';
import { SecurityModule } from './security/security.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── DDoS / Rate Limiting ─────────────────────────────────────────────
    // Default: 100 requests per 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,    // 60 seconds
        limit: 100,    // 100 requests
      },
      {
        name: 'strict',
        ttl: 60000,    // 60 seconds
        limit: 10,     // 10 requests (for AI endpoints)
      },
      {
        name: 'auth',
        ttl: 60000,    // 60 seconds
        limit: 5,      // 5 attempts (brute force protection)
      },
    ]),

    PrismaModule,
    CommonModule,
    SecurityModule,
    AuthModule,
    ProjectsModule,
    FilesModule,
    AiProvidersModule,
    ReviewsModule,
    ChatModule,
  ],
  providers: [
    // Apply rate limiting globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
