import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommentLikes1782000000005 implements MigrationInterface {
  name = 'CreateCommentLikes1782000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."comment_like_type_enum" AS ENUM ('like', 'dislike')`,
    );
    await queryRunner.query(`
      CREATE TABLE "comment_likes" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "comment_id" uuid        NOT NULL,
        "user_id"    uuid        NOT NULL,
        "type"       "public"."comment_like_type_enum" NOT NULL,
        "created_at" TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_comment_likes_comment_user" UNIQUE ("comment_id", "user_id"),
        CONSTRAINT "PK_comment_likes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "comment_likes"
        ADD CONSTRAINT "FK_comment_likes_comment"
        FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "comment_likes"
        ADD CONSTRAINT "FK_comment_likes_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comment_likes" DROP CONSTRAINT "FK_comment_likes_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_likes" DROP CONSTRAINT "FK_comment_likes_comment"`,
    );
    await queryRunner.query(`DROP TABLE "comment_likes"`);
    await queryRunner.query(`DROP TYPE "public"."comment_like_type_enum"`);
  }
}
