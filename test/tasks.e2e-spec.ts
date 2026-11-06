import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TASKS_DATA_FILE } from '../src/tasks/tasks.service';

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let dataDirectory: string;
  let dataFile: string;

  beforeAll(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'tasks-api-'));
    dataFile = join(dataDirectory, 'tasks.json');
  });

  beforeEach(async () => {
    await writeFile(dataFile, '[]', 'utf8');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TASKS_DATA_FILE)
      .useValue(dataFile)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  it('creates, reads, replaces, patches, and removes a task', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        descricao: 'Preparar apresentação',
        inicio: '2026-11-06',
        fim: '2026-11-07',
      })
      .expect(201);
    const taskId = createResponse.body.id as string;

    expect(taskId).toBeDefined();
    await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.descricao).toBe('Preparar apresentação');
      });

    await request(app.getHttpServer())
      .put(`/tasks/${taskId}`)
      .send({
        descricao: 'Revisar apresentação',
        inicio: '2026-11-07',
        fim: '2026-11-08',
        status: 'em andamento',
        resultado: 'rascunho',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.descricao).toBe('Revisar apresentação');
        expect(body.status).toBe('em andamento');
      });

    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .send({ resultado: 'concluído' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('em andamento');
        expect(body.resultado).toBe('concluído');
      });

    await request(app.getHttpServer())
      .get('/tasks')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe(taskId);
      });

    await request(app.getHttpServer()).delete(`/tasks/${taskId}`).expect(200);
    await request(app.getHttpServer()).get('/tasks').expect(200).expect([]);
    await request(app.getHttpServer()).get(`/tasks/${taskId}`).expect(404);
  });

  it('keeps task data available after the app is restarted', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        descricao: 'Persistir tarefa',
        inicio: '2026-11-06',
        fim: '2026-11-06',
      })
      .expect(201);
    const taskId = createResponse.body.id as string;

    await app.close();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TASKS_DATA_FILE)
      .useValue(dataFile)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.descricao).toBe('Persistir tarefa');
      });
  });
});
