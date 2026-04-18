-- CreateEnum
CREATE TYPE "NotificationRuleType" AS ENUM ('RISK_THRESHOLD', 'EOL_ALERT', 'FFF_CHANGE', 'ALWAYS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING_CE_REVIEW', 'PENDING_SEND', 'SENT', 'SKIPPED');

-- AlterTable
ALTER TABLE "customer_master" ALTER COLUMN "notification_rule_set" SET DEFAULT '';

-- CreateTable
CREATE TABLE "notification_rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule_type" "NotificationRuleType" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "require_ce_review" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_rule" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracked_product" (
    "id" TEXT NOT NULL,
    "item_number" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_lifecycle" TEXT NOT NULL DEFAULT 'M/P',
    "product_line" TEXT,
    "product_owner" TEXT,
    "product_owner_email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracked_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_rule" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_queue" (
    "id" TEXT NOT NULL,
    "pcn_event_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "product_id" TEXT,
    "triggered_rule_id" TEXT NOT NULL,
    "trigger_source" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING_CE_REVIEW',
    "ce_reviewed_by" TEXT,
    "ce_reviewed_at" TIMESTAMP(3),
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_rule_name_key" ON "notification_rule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_rule_customer_id_rule_id_key" ON "customer_rule"("customer_id", "rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_product_item_number_key" ON "tracked_product"("item_number");

-- CreateIndex
CREATE UNIQUE INDEX "product_rule_product_id_rule_id_customer_id_key" ON "product_rule"("product_id", "rule_id", "customer_id");

-- AddForeignKey
ALTER TABLE "customer_rule" ADD CONSTRAINT "customer_rule_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rule" ADD CONSTRAINT "customer_rule_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "notification_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rule" ADD CONSTRAINT "product_rule_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "tracked_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rule" ADD CONSTRAINT "product_rule_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "notification_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_rule" ADD CONSTRAINT "product_rule_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_pcn_event_id_fkey" FOREIGN KEY ("pcn_event_id") REFERENCES "pcn_event_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_triggered_rule_id_fkey" FOREIGN KEY ("triggered_rule_id") REFERENCES "notification_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
