import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { logger } from './logger';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: {
      log: (message: string) => logger.info(message),
      error: (message: string, trace?: string) =>
        logger.error(message, { trace }),
      warn: (message: string) => logger.warn(message),
      debug: (message: string) => logger.debug(message),
      verbose: (message: string) => logger.verbose(message),
    },
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Global error interceptor
  app.useGlobalInterceptors(new ErrorInterceptor());

  logger.info('Global interceptors configured');

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('MindStrike API')
    .setDescription('Comprehensive AI knowledge assistant platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('chat', 'Chat and conversation management')
    .addTag('mindmap', 'Mind mapping operations')
    .addTag('workspace', 'Workspace and file management')
    .addTag('music', 'Music and audio management')
    .addTag('agents', 'AI agents and threads')
    .addTag('llm', 'Local LLM management')
    .addTag('mcp', 'Model Context Protocol')
    .addTag('tasks', 'Background task management')
    .addTag('audio', 'Audio file operations')
    .addTag('playlists', 'Playlist management')
    .addTag('events', 'Server-sent events')
    .addTag('content', 'Large content management')
    .addTag('lfs', 'Large file storage')
    .addTag('debug', 'Debug and development tools')
    .addServer('http://localhost:3002', 'NestJS Development Server')
    .addServer('http://localhost:3001', 'Express Development Server (primary)')
    .build();

  logger.info('Creating Swagger document...');
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  logger.info('Setting up Swagger UI...');
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'MindStrike API - NestJS',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Start server on port 3002 (to run alongside Express on 3001)
  const port = process.env.NEST_PORT || 3002;
  logger.info(`Starting server on port ${port}...`);
  await app.listen(port);

  logger.info(`🚀 NestJS server running on http://localhost:${port}`);
  logger.info(
    `📚 Swagger documentation available at http://localhost:${port}/api`
  );
  logger.info(
    `🔄 Running alongside Express server on port 3001 for comparison`
  );
}

bootstrap().catch(error => {
  logger.error('Failed to start NestJS server:', error);
  process.exit(1);
});
