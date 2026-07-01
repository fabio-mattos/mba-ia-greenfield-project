import { CategoryNotFoundException } from '../common/exceptions/domain.exception';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Tecnologia',
    slug: 'tecnologia',
    created_at: new Date('2026-01-01'),
    videos: [],
    ...overrides,
  } as Category;
}

function makeCategoryRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    ...overrides,
  };
}

describe('CategoriesService', () => {
  describe('findAll', () => {
    it('returns all categories ordered by name ascending', async () => {
      const categories = [makeCategory({ name: 'Arte', slug: 'arte' })];
      const repo = makeCategoryRepository({
        find: jest.fn().mockResolvedValue(categories),
      });
      const service = new CategoriesService(repo as any);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
      expect(result).toEqual(categories);
    });
  });

  describe('findBySlug', () => {
    it('returns the category when found', async () => {
      const category = makeCategory();
      const repo = makeCategoryRepository({
        findOne: jest.fn().mockResolvedValue(category),
      });
      const service = new CategoriesService(repo as any);

      const result = await service.findBySlug('tecnologia');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { slug: 'tecnologia' },
      });
      expect(result).toEqual(category);
    });

    it('throws CategoryNotFoundException when no category matches the slug', async () => {
      const repo = makeCategoryRepository({
        findOne: jest.fn().mockResolvedValue(null),
      });
      const service = new CategoriesService(repo as any);

      await expect(service.findBySlug('missing')).rejects.toThrow(
        CategoryNotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('returns the category when found', async () => {
      const category = makeCategory();
      const repo = makeCategoryRepository({
        findOne: jest.fn().mockResolvedValue(category),
      });
      const service = new CategoriesService(repo as any);

      const result = await service.findById('cat-1');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
      expect(result).toEqual(category);
    });

    it('throws CategoryNotFoundException when no category matches the id', async () => {
      const repo = makeCategoryRepository({
        findOne: jest.fn().mockResolvedValue(null),
      });
      const service = new CategoriesService(repo as any);

      await expect(service.findById('missing-id')).rejects.toThrow(
        CategoryNotFoundException,
      );
    });
  });
});
