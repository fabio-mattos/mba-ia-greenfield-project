import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCategories1782000000001 implements MigrationInterface {
  name = 'CreateCategories1782000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "slug" character varying(100) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_categories_name" UNIQUE ("name"), CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"), CONSTRAINT "PK_categories" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "categories" ("name", "slug") VALUES ('Tecnologia', 'tecnologia'), ('Educação', 'educacao'), ('Entretenimento', 'entretenimento'), ('Música', 'musica'), ('Jogos', 'jogos'), ('Esportes', 'esportes'), ('Notícias', 'noticias'), ('Ciência', 'ciencia'), ('Arte', 'arte'), ('Culinária', 'culinaria')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
