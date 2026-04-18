-- CreateTable
CREATE TABLE "where_used_cache" (
    "id" TEXT NOT NULL,
    "item_number" TEXT NOT NULL,
    "result_count" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "queried_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "where_used_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "where_used_cache_item_number_key" ON "where_used_cache"("item_number");

-- CreateIndex
CREATE INDEX "where_used_cache_item_number_idx" ON "where_used_cache"("item_number");
