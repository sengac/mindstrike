import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { logger } from './logger';
import { ErrorInterceptor } from './common/interceptors/error.interceptor';
import { json, urlencoded } from 'express';
import * as path from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import { fileURLToPath } from 'url';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: {
      log: (message: string) => logger.info(message),
      error: (message: string, trace?: string) =>
        logger.error(message, { trace }),
      warn: (message: string) => logger.warn(message),
      debug: (message: string) => logger.debug(message),
      verbose: (message: string) => logger.verbose(message),
    },
    bodyParser: false, // Disable built-in body parser
  });

  // Configure body parser with 100MB limit
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

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
    .addServer('http://localhost:3001', 'Development Server')
    .build();

  logger.info('Creating Swagger document...');
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  logger.info('Setting up Swagger UI...');

  // In production or Electron, serve bundled Swagger UI assets
  const isProductionOrElectron =
    process.env.NODE_ENV === 'production' || process.versions?.electron;

  if (isProductionOrElectron) {
    // Determine the swagger-ui path
    let swaggerUiPath = path.join(process.cwd(), 'dist', 'swagger-ui');

    // If we're in an asar archive, adjust the path
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    if (currentDir.includes('app.asar')) {
      const unpackedDir = currentDir.replace('app.asar', 'app.asar.unpacked');
      swaggerUiPath = path.join(unpackedDir, 'swagger-ui');
    }

    if (existsSync(swaggerUiPath)) {
      // Serve swagger-ui assets under /swagger-static path
      app.use('/swagger-static', express.static(swaggerUiPath));
      logger.info(`Serving bundled Swagger UI assets from: ${swaggerUiPath}`);
    } else {
      logger.warn(`Swagger UI assets not found at: ${swaggerUiPath}`);
    }
  }

  // Configure Swagger UI with custom CSS/JS URLs
  interface SwaggerCustomOptions {
    customSiteTitle?: string;
    customfavIcon?: string;
    customCssUrl?: string | string[];
    customJs?: string | string[];
    swaggerOptions?: {
      persistAuthorization?: boolean;
      tagsSorter?: string;
      operationsSorter?: string;
    };
  }

  const swaggerOptions: SwaggerCustomOptions = {
    customSiteTitle: 'MindStrike API - NestJS',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  };

  // In production or Electron, use locally bundled assets
  if (isProductionOrElectron) {
    swaggerOptions.customCssUrl = '/swagger-static/swagger-ui.css';
    swaggerOptions.customJs = [
      '/swagger-static/swagger-ui-bundle.js',
      '/swagger-static/swagger-ui-standalone-preset.js',
    ];
  }

  SwaggerModule.setup('api', app, document, swaggerOptions);

  // Start server on port 3001 (primary server, Express now on 3002)
  const port = process.env.PORT || 3001;
  logger.info(`Starting server on port ${port}...`);
  await app.listen(port);

  logger.info(`🚀 NestJS server running on http://localhost:${port}`);
  logger.info(
    `📚 Swagger documentation available at http://localhost:${port}/api`
  );
}

bootstrap().catch(error => {
  logger.error('Failed to start NestJS server:', error);
  process.exit(1);
});
