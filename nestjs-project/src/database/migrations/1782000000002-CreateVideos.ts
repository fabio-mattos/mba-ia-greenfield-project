import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1782000000002 implements MigrationInterface {
  name = 'CreateVideos1782000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "video_status_enum" AS ENUM ('draft', 'processing', 'ready', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "video_visibility_enum" AS ENUM ('public', 'unlisted')`,
    );
    await queryRunner.query(
      `CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(12) NOT NULL, "title" character varying(255), "description" text, "status" "video_status_enum" NOT NULL DEFAULT 'draft', "visibility" "video_visibility_enum", "duration_seconds" integer, "view_count" integer NOT NULL DEFAULT 0, "file_key" character varying, "thumbnail_key" character varying, "channel_id" uuid NOT NULL, "category_id" uuid, "published_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_videos_slug" UNIQUE ("slug"), CONSTRAINT "PK_videos" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_channel_id" ON "videos" ("channel_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_status" ON "videos" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_visibility" ON "videos" ("visibility")`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_channel_id" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_channel_id"`,
    );
    await queryRunner.query(`DROP TABLE "videos"`);
    await queryRunner.query(`DROP TYPE "video_visibility_enum"`);
    await queryRunner.query(`DROP TYPE "video_status_enum"`);
  }
}
