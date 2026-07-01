import { DataSource, Repository } from 'typeorm';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Video } from '../videos/entities/video.entity';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

describe('CategoriesService (integration)', () => {
  let dataSource: DataSource;
  let categoriesService: CategoriesService;
  let categoryRepository: Repository<Category>;

  beforeAll(async () => {
    dataSource = createTestDataSource([Category, User, Channel, Video]);
    await dataSource.initialize();
    categoryRepository = dataSource.getRepository(Category);
    categoriesService = new CategoriesService(categoryRepository);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  async function createCategory(name: string, slug: string): Promise<Category> {
    return categoryRepository.save(categoryRepository.create({ name, slug }));
  }

  describe('findAll', () => {
    it('returns categories ordered by name ascending', async () => {
      await createCategory('Tecnologia', 'tecnologia');
      await createCategory('Arte', 'arte');
      await createCategory('Música', 'musica');

      const result = await categoriesService.findAll();

      expect(result.map((c) => c.name)).toEqual([
        'Arte',
        'Música',
        'Tecnologia',
      ]);
    });
  });

  describe('findBySlug', () => {
    it('returns the persisted category matching the slug', async () => {
      const created = await createCategory('Educação', 'educacao');

      const result = await categoriesService.findBySlug('educacao');

      expect(result.id).toBe(created.id);
      expect(result.name).toBe('Educação');
    });

    it('throws CategoryNotFoundException for an unknown slug', async () => {
      await expect(
        categoriesService.findBySlug('does-not-exist'),
      ).rejects.toThrow('Category not found');
    });
  });

  describe('findById', () => {
    it('returns the persisted category matching the id', async () => {
      const created = await createCategory('Esportes', 'esportes');

      const result = await categoriesService.findById(created.id);

      expect(result.slug).toBe('esportes');
    });

    it('throws CategoryNotFoundException for an unknown id', async () => {
      await expect(
        categoriesService.findById('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow('Category not found');
    });
  });
});
