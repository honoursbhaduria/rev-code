import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ─── Security: Helmet.js (15+ HTTP security headers) ─────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow frontend to load resources
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      noSniff: true,            // X-Content-Type-Options: nosniff
      xssFilter: true,          // X-XSS-Protection
      hidePoweredBy: true,      // Remove X-Powered-By header
      frameguard: { action: 'deny' },  // X-Frame-Options: DENY (clickjacking)
    }),
  );

  // ─── Security: Global Validation Pipe ─────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,             // Strip properties not in DTO
      forbidNonWhitelisted: true,  // Reject requests with unknown properties
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Prevent excessively large payloads in validation
      validationError: { target: false, value: false },
    }),
  );

  // ─── Security: Request Size Limits ────────────────────────────────────────
  // Express body-parser limits (prevents oversized payload attacks)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '10mb' }));

  // ─── Security: CORS (strict origin) ──────────────────────────────────────
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  });

  // ─── Global API prefix ────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`🚀 ReCode API is running on: http://localhost:${port}/api`);
  logger.log(`📖 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.log(`🛡️  Security: Helmet.js, CORS, Rate Limiting, Input Validation`);
}

bootstrap();
