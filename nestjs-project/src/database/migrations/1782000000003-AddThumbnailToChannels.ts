import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThumbnailToChannels1782000000003 implements MigrationInterface {
  name = 'AddThumbnailToChannels1782000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "channels" ADD "thumbnail_key" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "channels" DROP COLUMN "thumbnail_key"`,
    );
  }
}
