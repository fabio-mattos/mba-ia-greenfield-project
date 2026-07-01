import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInteractions1782000000004 implements MigrationInterface {
  name = 'CreateInteractions1782000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // video_likes
    await queryRunner.query(
      `CREATE TYPE "like_type_enum" AS ENUM ('like', 'dislike')`,
    );
    await queryRunner.query(
      `CREATE TABLE "video_likes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "video_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" "like_type_enum" NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_video_likes_video_user" UNIQUE ("video_id", "user_id"), CONSTRAINT "PK_video_likes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_likes" ADD CONSTRAINT "FK_video_likes_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_likes" ADD CONSTRAINT "FK_video_likes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );

    // comments
    await queryRunner.query(
      `CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "body" text NOT NULL, "video_id" uuid NOT NULL, "author_id" uuid NOT NULL, "parent_id" uuid, "deleted" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_comments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comments_video_id" ON "comments" ("video_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_video" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "comments" ADD CONSTRAINT "FK_comments_parent" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE`,
    );

    // subscriptions
    await queryRunner.query(
      `CREATE TABLE "subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subscriber_id" uuid NOT NULL, "channel_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_subscriptions" UNIQUE ("subscriber_id", "channel_id"), CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_subscriber" FOREIGN KEY ("subscriber_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_subscriptions_channel" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(`DROP TABLE "video_likes"`);
    await queryRunner.query(`DROP TYPE "like_type_enum"`);
  }
}
