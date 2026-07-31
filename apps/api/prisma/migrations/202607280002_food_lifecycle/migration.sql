CREATE TYPE "food_category" AS ENUM (
    'PRODUCE',
    'MEAT_EGGS_SEAFOOD',
    'DAIRY',
    'STAPLES',
    'SNACKS_DRINKS',
    'CONDIMENTS',
    'OTHER'
);

CREATE TYPE "food_status" AS ENUM ('ACTIVE', 'EATEN', 'DISCARDED');

CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" "food_category" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "expiry_date" DATE NOT NULL,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "status" "food_status" NOT NULL DEFAULT 'ACTIVE',
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "foods_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "foods_processing_consistent" CHECK (
        ("status" = 'ACTIVE' AND "processed_at" IS NULL)
        OR ("status" <> 'ACTIVE' AND "processed_at" IS NOT NULL)
    )
);

CREATE INDEX "foods_user_id_status_expiry_date_id_idx"
ON "foods"("user_id", "status", "expiry_date", "id");

CREATE INDEX "foods_user_id_status_created_at_id_idx"
ON "foods"("user_id", "status", "created_at", "id");

CREATE INDEX "foods_user_id_status_processed_at_id_idx"
ON "foods"("user_id", "status", "processed_at", "id");

ALTER TABLE "foods"
ADD CONSTRAINT "foods_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
