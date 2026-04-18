-- CreateTable
CREATE TABLE "mpn_cache_entry" (
    "id" TEXT NOT NULL,
    "search_mpn" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "item_number" TEXT NOT NULL DEFAULT 'NOT_FOUND',
    "manufacture_name" TEXT,
    "mfr_part_number" TEXT,
    "mfr_part_lifecycle_phase" TEXT,
    "preferred_status" TEXT,
    "raw_data" JSONB,
    "queried_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpn_cache_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mpn_cache_entry_search_mpn_idx" ON "mpn_cache_entry"("search_mpn");

-- CreateIndex
CREATE UNIQUE INDEX "mpn_cache_entry_search_mpn_item_number_key" ON "mpn_cache_entry"("search_mpn", "item_number");
