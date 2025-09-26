import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same configuration as in main.ts
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

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Workspace Endpoints', () => {
    it('/api/workspace/directory (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/workspace/directory')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('directory');
          expect(res.body).toHaveProperty('exists');
          expect(res.body).toHaveProperty('writable');
        });
    });

    it('/api/workspace/root (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/workspace/root')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('root');
          expect(res.body).toHaveProperty('type');
        });
    });
  });

  describe('MCP Endpoints', () => {
    it('/api/mcp/servers (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/mcp/servers')
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/api/mcp/status (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/mcp/status')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('running');
          expect(res.body).toHaveProperty('serversCount');
          expect(res.body).toHaveProperty('activeServers');
          expect(res.body).toHaveProperty('toolsCount');
        });
    });

    it('/api/mcp/servers (POST) - should create a new server', () => {
      const newServer = {
        name: 'Test Server',
        command: 'echo',
        args: ['hello'],
        enabled: false,
      };

      return request(app.getHttpServer())
        .post('/api/mcp/servers')
        .send(newServer)
        .expect(201)
        .expect(res => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe(newServer.name);
          expect(res.body.command).toBe(newServer.command);
        });
    });
  });

  describe('LLM Endpoints', () => {
    it('/api/local-llm/models (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/local-llm/models')
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/api/local-llm/loaded-model (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/local-llm/loaded-model')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('loaded');
          expect(res.body).toHaveProperty('modelPath');
          expect(res.body).toHaveProperty('memoryUsage');
        });
    });

    it('/api/local-llm/system-info (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/local-llm/system-info')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('cpuInfo');
          expect(res.body).toHaveProperty('memoryInfo');
          expect(res.body).toHaveProperty('recommendedSettings');
        });
    });
  });

  describe('Chat Endpoints', () => {
    it('/api/threads (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/threads')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('threads');
          expect(Array.isArray(res.body.threads)).toBe(true);
        });
    });
  });

  describe('Mindmap Endpoints', () => {
    it('/api/mindmaps (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/mindmaps')
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/api/mindmaps (POST) - should create a new mindmap', () => {
      const newMindmap = {
        name: 'Test Mindmap',
        description: 'Test Description',
      };

      return request(app.getHttpServer())
        .post('/api/mindmaps')
        .send(newMindmap)
        .expect(201)
        .expect(res => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('name', newMindmap.name);
        });
    });
  });

  describe('Task Endpoints', () => {
    it('/api/tasks (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('/api/tasks/status (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/status')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('running');
          expect(res.body).toHaveProperty('pending');
          expect(res.body).toHaveProperty('completed');
        });
    });
  });

  describe('Validation Tests', () => {
    it('should reject invalid MCP server creation', () => {
      const invalidServer = {
        // Missing required 'name' field
        command: 'echo',
      };

      return request(app.getHttpServer())
        .post('/api/mcp/servers')
        .send(invalidServer)
        .expect(400);
    });

    it('should reject invalid workspace directory update', () => {
      const invalidUpdate = {
        // Invalid type for directory
        directory: 123,
      };

      return request(app.getHttpServer())
        .post('/api/workspace/directory')
        .send(invalidUpdate)
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', () => {
      return request(app.getHttpServer()).get('/api/non-existent').expect(404);
    });

    it('should handle server errors gracefully', () => {
      // Test error handling by requesting a non-existent mindmap
      return request(app.getHttpServer())
        .get('/api/mindmap/non-existent-id')
        .expect(404);
    });
  });
});
