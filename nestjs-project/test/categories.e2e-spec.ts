import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { Category } from '../src/categories/entities/category.entity';

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let categoryRepository: Repository<Category>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    categoryRepository = dataSource.getRepository(Category);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  async function seedCategories(): Promise<void> {
    await categoryRepository.save([
      categoryRepository.create({ name: 'Tecnologia', slug: 'tecnologia' }),
      categoryRepository.create({ name: 'Arte', slug: 'arte' }),
    ]);
  }

  describe('GET /categories', () => {
    it('returns 200 with categories ordered by name', async () => {
      await seedCategories();

      const res = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);

      expect(res.body.map((c: { name: string }) => c.name)).toEqual([
        'Arte',
        'Tecnologia',
      ]);
    });

    it('returns 200 with an empty array when there are no categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /categories/:slug', () => {
    it('returns 200 with the category matching the slug', async () => {
      await seedCategories();

      const res = await request(app.getHttpServer())
        .get('/categories/arte')
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Arte', slug: 'arte' });
    });

    it('returns 404 with CATEGORY_NOT_FOUND for an unknown slug', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories/does-not-exist')
        .expect(404);

      expect(res.body.error).toBe('CATEGORY_NOT_FOUND');
    });
  });
});
