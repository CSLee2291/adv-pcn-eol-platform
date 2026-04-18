-- CreateTable
CREATE TABLE "verification_batch" (
    "id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "run_number" INTEGER NOT NULL DEFAULT 1,
    "parent_batch_id" TEXT,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "pass_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "verification_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pcn_verification_record" (
    "id" TEXT NOT NULL,
    "pcn_number" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "excel_vendor" TEXT NOT NULL,
    "excel_agent" TEXT,
    "excel_title" TEXT,
    "excel_ce_owner" TEXT,
    "excel_category" TEXT,
    "excel_ce_comment" TEXT,
    "excel_notify_pm" TEXT,
    "excel_follow_up" TEXT,
    "excel_folder" TEXT,
    "excel_mpn_count" INTEGER NOT NULL DEFAULT 0,
    "excel_item_count" INTEGER NOT NULL DEFAULT 0,
    "excel_mpns" JSONB,
    "excel_items" JSONB,
    "app_event_id" TEXT,
    "app_vendor" TEXT,
    "app_pcn_number" TEXT,
    "app_risk_level" TEXT,
    "app_form_changed" BOOLEAN,
    "app_fit_changed" BOOLEAN,
    "app_func_changed" BOOLEAN,
    "app_mpn_count" INTEGER,
    "app_item_count" INTEGER,
    "app_mpns" JSONB,
    "mpn_match_count" INTEGER,
    "mpn_only_in_excel" JSONB,
    "mpn_only_in_app" JSONB,
    "vendor_match" BOOLEAN,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "email_file_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pcn_verification_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_batch_batch_number_key" ON "verification_batch"("batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "pcn_verification_record_pcn_number_batch_id_key" ON "pcn_verification_record"("pcn_number", "batch_id");

-- AddForeignKey
ALTER TABLE "pcn_verification_record" ADD CONSTRAINT "pcn_verification_record_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "verification_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
