-- CreateEnum
CREATE TYPE "PcnType" AS ENUM ('PCN', 'EOL', 'PDN', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'AI_ANALYZED', 'CE_REVIEWED', 'WHERE_USED_DONE', 'NOTIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CeDecision" AS ENUM ('ACCEPT', 'REJECT', 'NEED_EVALUATION', 'LAST_TIME_BUY');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_RD', 'WAITING_CUSTOMER', 'CLOSED');

-- CreateTable
CREATE TABLE "pcn_event_master" (
    "id" TEXT NOT NULL,
    "notification_source" TEXT NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "distributor_name" TEXT,
    "pcn_number" TEXT NOT NULL,
    "pcn_title" TEXT NOT NULL,
    "pcn_type" "PcnType" NOT NULL,
    "effective_date" TIMESTAMP(3),
    "source_email" TEXT,
    "pdf_file_path" TEXT,
    "raw_text" TEXT,
    "ce_owner_name" TEXT,
    "ce_notified_date" TIMESTAMP(3),
    "ce_reply_date" TIMESTAMP(3),
    "ce_comment" TEXT,
    "pm_notified" BOOLEAN NOT NULL DEFAULT false,
    "completion_date" TIMESTAMP(3),
    "follow_up_notes" TEXT,
    "change_type_for_iqc" TEXT,
    "additional_notes" TEXT,
    "sharepoint_folder" TEXT,
    "sharepoint_url" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pcn_event_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analysis_result" (
    "id" TEXT NOT NULL,
    "pcn_event_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "change_description" TEXT NOT NULL,
    "form_changed" BOOLEAN NOT NULL DEFAULT false,
    "fit_changed" BOOLEAN NOT NULL DEFAULT false,
    "function_changed" BOOLEAN NOT NULL DEFAULT false,
    "risk_level" "RiskLevel" NOT NULL,
    "risk_reason" TEXT,
    "affected_parts" JSONB,
    "ai_model_version" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "raw_ai_response" JSONB,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ce_assessment" (
    "id" TEXT NOT NULL,
    "pcn_event_id" TEXT NOT NULL,
    "assessor_id" TEXT NOT NULL,
    "assessor_name" TEXT NOT NULL,
    "ce_decision" "CeDecision" NOT NULL,
    "comments" TEXT,
    "override_risk_level" "RiskLevel",
    "need_rd_verification" BOOLEAN NOT NULL DEFAULT false,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ce_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whereused_result" (
    "id" TEXT NOT NULL,
    "ce_assessment_id" TEXT NOT NULL,
    "mpn" TEXT NOT NULL,
    "item_number" TEXT NOT NULL,
    "mfr_name" TEXT,
    "mfr_part_lifecycle" TEXT,
    "preferred_status" TEXT,
    "item_desc" TEXT,
    "part_cat" TEXT,
    "lifecycle_phase" TEXT,
    "phase_out_date" TEXT,
    "ltb_date" TEXT,
    "estimated_eol_date" TEXT,
    "replaced_by" TEXT,
    "key_component" TEXT,
    "is_mainstream" TEXT,
    "inactive" TEXT,
    "bom_level" TEXT,
    "component_id" TEXT,
    "semi_product_id" TEXT,
    "qty" DOUBLE PRECISION,
    "pcb_matnr" TEXT,
    "model_name" TEXT,
    "product_line" TEXT,
    "product_group" TEXT,
    "product_division" TEXT,
    "product_owner" TEXT,
    "product_owner_email" TEXT,
    "request_for_plant" TEXT,
    "product_part_cat" TEXT,
    "product_lifecycle" TEXT,
    "ce_owner_name" TEXT,
    "ce_owner_email" TEXT,
    "material_cat_id" TEXT,
    "sub_cat_id" TEXT,
    "part_category_api4" TEXT,
    "raw_denodo_data" JSONB,
    "query_source" TEXT NOT NULL DEFAULT 'DENODO_REST',
    "queried_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whereused_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pcn_case_master" (
    "id" TEXT NOT NULL,
    "ce_assessment_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "case_status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pcn_case_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_master" (
    "id" TEXT NOT NULL,
    "customer_code" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "notification_rule_set" TEXT NOT NULL,
    "contact_email" TEXT,
    "contact_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivery_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pcn_event_master_pcn_number_key" ON "pcn_event_master"("pcn_number");

-- CreateIndex
CREATE UNIQUE INDEX "ai_analysis_result_pcn_event_id_key" ON "ai_analysis_result"("pcn_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "pcn_case_master_case_number_key" ON "pcn_case_master"("case_number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_master_customer_code_key" ON "customer_master"("customer_code");

-- AddForeignKey
ALTER TABLE "ai_analysis_result" ADD CONSTRAINT "ai_analysis_result_pcn_event_id_fkey" FOREIGN KEY ("pcn_event_id") REFERENCES "pcn_event_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ce_assessment" ADD CONSTRAINT "ce_assessment_pcn_event_id_fkey" FOREIGN KEY ("pcn_event_id") REFERENCES "pcn_event_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whereused_result" ADD CONSTRAINT "whereused_result_ce_assessment_id_fkey" FOREIGN KEY ("ce_assessment_id") REFERENCES "ce_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pcn_case_master" ADD CONSTRAINT "pcn_case_master_ce_assessment_id_fkey" FOREIGN KEY ("ce_assessment_id") REFERENCES "ce_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pcn_case_master" ADD CONSTRAINT "pcn_case_master_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pcn_case_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
