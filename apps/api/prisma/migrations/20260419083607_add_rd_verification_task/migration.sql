-- CreateEnum
CREATE TYPE "RdTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "rd_verification_task" (
    "id" TEXT NOT NULL,
    "ce_assessment_id" TEXT NOT NULL,
    "pcn_event_id" TEXT NOT NULL,
    "assigned_rd_name" TEXT NOT NULL,
    "assigned_rd_email" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "auto_assigned" BOOLEAN NOT NULL DEFAULT false,
    "task_status" "RdTaskStatus" NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "due_date" TIMESTAMP(3),
    "rd_decision" TEXT,
    "rd_comments" TEXT,
    "rd_report_path" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rd_verification_task_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "rd_verification_task" ADD CONSTRAINT "rd_verification_task_ce_assessment_id_fkey" FOREIGN KEY ("ce_assessment_id") REFERENCES "ce_assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rd_verification_task" ADD CONSTRAINT "rd_verification_task_pcn_event_id_fkey" FOREIGN KEY ("pcn_event_id") REFERENCES "pcn_event_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
