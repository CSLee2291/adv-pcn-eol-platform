-- CreateTable
CREATE TABLE "ai_feedback" (
    "id" TEXT NOT NULL,
    "pcn_event_id" TEXT NOT NULL,
    "ai_analysis_id" TEXT NOT NULL,
    "assessor_name" TEXT NOT NULL,
    "corrected_field" TEXT NOT NULL,
    "original_value" TEXT NOT NULL,
    "corrected_value" TEXT NOT NULL,
    "rationale" TEXT,
    "vendor_name" TEXT,
    "pcn_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_pcn_event_id_fkey" FOREIGN KEY ("pcn_event_id") REFERENCES "pcn_event_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_ai_analysis_id_fkey" FOREIGN KEY ("ai_analysis_id") REFERENCES "ai_analysis_result"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
