-- CreateEnum
CREATE TYPE "ShortUrlModerationStatus" AS ENUM ('APPROVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AbuseReportReason" AS ENUM ('PHISHING', 'MALWARE', 'SPAM', 'SCAM', 'OTHER');

-- CreateEnum
CREATE TYPE "AbuseReportStatus" AS ENUM ('PENDING', 'DISMISSED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "SecurityEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SecurityEventStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED');


-- AlterTable
ALTER TABLE "short_urls" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderatedByAdminId" UUID,
ADD COLUMN     "moderationReason" VARCHAR(500),
ADD COLUMN     "moderationStatus" "ShortUrlModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedByAdminId" UUID,
ADD COLUMN     "suspensionReason" VARCHAR(500);

-- CreateTable
CREATE TABLE "abuse_reports" (
    "id" UUID NOT NULL,
    "shortUrlId" UUID,
    "shortCode" VARCHAR(16) NOT NULL,
    "reporterUserId" UUID,
    "reason" "AbuseReportReason" NOT NULL,
    "description" VARCHAR(2000),
    "status" "AbuseReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "metadata" JSONB,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'LOW',
    "status" "SecurityEventStatus" NOT NULL DEFAULT 'OPEN',
    "sourceUserId" UUID,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "details" JSONB,
    "reviewedByAdminId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abuse_reports_status_createdAt_idx" ON "abuse_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "abuse_reports_shortUrlId_status_idx" ON "abuse_reports"("shortUrlId", "status");

-- CreateIndex
CREATE INDEX "abuse_reports_reporterUserId_createdAt_idx" ON "abuse_reports"("reporterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "abuse_reports_reviewedByAdminId_idx" ON "abuse_reports"("reviewedByAdminId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "security_events_status_severity_createdAt_idx" ON "security_events"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_sourceUserId_createdAt_idx" ON "security_events"("sourceUserId", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_ipAddress_createdAt_idx" ON "security_events"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_reviewedByAdminId_idx" ON "security_events"("reviewedByAdminId");

-- CreateIndex
CREATE INDEX "short_urls_moderationStatus_createdAt_idx" ON "short_urls"("moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "short_urls_moderatedByAdminId_idx" ON "short_urls"("moderatedByAdminId");

-- CreateIndex
CREATE INDEX "users_status_createdAt_idx" ON "users"("status", "createdAt");

-- CreateIndex
CREATE INDEX "users_suspendedByAdminId_idx" ON "users"("suspendedByAdminId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_suspendedByAdminId_fkey" FOREIGN KEY ("suspendedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_urls" ADD CONSTRAINT "short_urls_moderatedByAdminId_fkey" FOREIGN KEY ("moderatedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_shortUrlId_fkey" FOREIGN KEY ("shortUrlId") REFERENCES "short_urls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
