-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('WAITING_FOR_OPPONENT', 'CATEGORY_SELECTION', 'WAITING_FOR_CATEGORY_RESPONSE', 'NUMBER_SELECTION', 'WAITING_FOR_ANSWER', 'TRUTH_DARE_SELECTION', 'COMPLETED', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TRUTH', 'DARE', 'NORMAL');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('COMMUNITY', 'ADMIN');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('DUPLICATE', 'WRONG_ANSWER', 'INAPPROPRIATE', 'SPAM', 'OFF_TOPIC', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SUBMISSION', 'APPROVED', 'REJECTED', 'CATEGORY_REQ', 'REPORT', 'CONTRIBUTION', 'AD', 'SYSTEM', 'SYSTEM_ALERT', 'ADMIN_ALERT', 'BROADCAST', 'SESSION_INVITE', 'SESSION_JOINED', 'SESSION_EXPIRED', 'SESSION_TIMEOUT', 'SESSION_ENDED', 'OPPONENT_LEFT', 'GAME_ENDED', 'VERIFICATION_REQUIRED', 'VERIFICATION_COMPLETED', 'CONTRIBUTION_REVIEW', 'CAMPAIGN_COMPLETED');

-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RevenueEventType" AS ENUM ('VERIFICATION', 'CLICK', 'IMPRESSION', 'PAYOUT', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProviderRevenueModel" AS ENUM ('CPM', 'CPC', 'CPA', 'FIXED');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "publicProfile" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "totalSessions" INTEGER NOT NULL DEFAULT 0,
    "totalAnswered" INTEGER NOT NULL DEFAULT 0,
    "totalAsked" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rules" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Sparkles',
    "color" TEXT NOT NULL DEFAULT '#2F80ED',
    "gameType" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'NORMAL',
    "categoryId" TEXT NOT NULL,
    "number" INTEGER,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "source" "QuestionSource" NOT NULL DEFAULT 'COMMUNITY',
    "contributorId" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "playsCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "aiScore" DOUBLE PRECISION,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'WAITING',
    "state" "SessionState" NOT NULL DEFAULT 'WAITING_FOR_OPPONENT',
    "round" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "pendingCategoryId" TEXT,
    "categoryProposerId" TEXT,
    "creatorId" TEXT NOT NULL,
    "joinerId" TEXT,
    "leaverId" TEXT,
    "currentTurnUserId" TEXT,
    "currentQuestionId" TEXT,
    "currentNumber" INTEGER,
    "turnsPlayed" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "proposalHistory" JSONB,
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMove" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "number" INTEGER,
    "askedBy" TEXT NOT NULL,
    "answeredBy" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ANSWER',
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "GameMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "userPhone" TEXT,
    "userId" TEXT,
    "categoryId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'NORMAL',
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "aiResult" JSONB,
    "aiScore" DOUBLE PRECISION,
    "duplicateOfId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "ticket" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "questionId" TEXT,
    "reporterPhone" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" "ReportReason" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "screenshotUrl" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "examples" TEXT,
    "reason" TEXT,
    "requestorPhone" TEXT NOT NULL,
    "requestorId" TEXT,
    "status" "CategoryRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "status" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "group" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'Award',
    "color" TEXT NOT NULL DEFAULT '#F2994A',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "userId" TEXT,
    "phone" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "channel" TEXT NOT NULL DEFAULT 'WEB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'message',
    "phone" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL,
    "data" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM',
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "configuration" JSONB,
    "placements" JSONB,
    "revenueModel" "ProviderRevenueModel" NOT NULL DEFAULT 'CPA',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "cpmRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpcRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpaRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fixedPayoutPerVerification" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedPayoutPerVerification" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedPayoutPerClick" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedPayoutPerImpression" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSnippet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'HTML',
    "content" TEXT,
    "directLink" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'TOP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPlacement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "providerId" TEXT,
    "providerPlacementId" TEXT,
    "format" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetizationGate" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 0,
    "publicToken" TEXT NOT NULL,
    "status" "GateStatus" NOT NULL DEFAULT 'PENDING',
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "providerId" TEXT,
    "snippetIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetizationGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonetizationEvent" (
    "id" TEXT NOT NULL,
    "gateId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "providerId" TEXT,
    "placement" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetizationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "language" TEXT NOT NULL DEFAULT 'en',
    "header" TEXT,
    "body" TEXT NOT NULL,
    "footer" TEXT,
    "buttons" JSONB,
    "variables" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "waTemplateId" TEXT,
    "metaTemplateName" TEXT,
    "metaStatus" TEXT,
    "metaRejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "metaUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "content" JSONB NOT NULL,
    "templateId" TEXT,
    "campaignDeliveryId" TEXT,
    "waMessageId" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "templateId" TEXT,
    "messageBody" TEXT,
    "headerText" TEXT,
    "footerText" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'all_users',
    "audienceFilter" JSONB,
    "scheduleType" TEXT NOT NULL DEFAULT 'now',
    "scheduledAt" TIMESTAMP(3),
    "cronExpression" TEXT,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "messageLogId" TEXT,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueLedger" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTO',
    "eventType" "RevenueEventType" NOT NULL DEFAULT 'VERIFICATION',
    "providerId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "gateId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "revenueAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payoutAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isEstimated" BOOLEAN NOT NULL DEFAULT true,
    "providerReference" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_waId_key" ON "User"("waId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_status_trending_idx" ON "Category"("status", "trending");

-- CreateIndex
CREATE INDEX "Category_status_questionCount_idx" ON "Category"("status", "questionCount");

-- CreateIndex
CREATE INDEX "Question_categoryId_status_idx" ON "Question"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Question_status_createdAt_idx" ON "Question"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Question_text_idx" ON "Question"("text");

-- CreateIndex
CREATE UNIQUE INDEX "Question_categoryId_number_key" ON "Question"("categoryId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Session_inviteCode_key" ON "Session"("inviteCode");

-- CreateIndex
CREATE INDEX "Session_status_createdAt_idx" ON "Session"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Session_inviteCode_idx" ON "Session"("inviteCode");

-- CreateIndex
CREATE INDEX "Session_creatorId_status_idx" ON "Session"("creatorId", "status");

-- CreateIndex
CREATE INDEX "Session_joinerId_status_idx" ON "Session"("joinerId", "status");

-- CreateIndex
CREATE INDEX "Session_state_idx" ON "Session"("state");

-- CreateIndex
CREATE INDEX "Session_lastActivityAt_idx" ON "Session"("lastActivityAt");

-- CreateIndex
CREATE INDEX "GameMove_sessionId_idx" ON "GameMove"("sessionId");

-- CreateIndex
CREATE INDEX "GameMove_sessionId_round_status_idx" ON "GameMove"("sessionId", "round", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameMove_sessionId_number_key" ON "GameMove"("sessionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "GameMove_sessionId_questionId_key" ON "GameMove"("sessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_ticket_key" ON "Contribution"("ticket");

-- CreateIndex
CREATE INDEX "Contribution_status_createdAt_idx" ON "Contribution"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Contribution_userId_idx" ON "Contribution"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReport_ticket_key" ON "QuestionReport"("ticket");

-- CreateIndex
CREATE INDEX "QuestionReport_status_createdAt_idx" ON "QuestionReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CategoryRequest_status_createdAt_idx" ON "CategoryRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE INDEX "Notification_adminId_readAt_idx" ON "Notification"("adminId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_channel_status_createdAt_idx" ON "Notification"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_createdAt_idx" ON "AuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_component_createdAt_idx" ON "SystemEvent"("component", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEvent_eventId_key" ON "ProcessedEvent"("eventId");

-- CreateIndex
CREATE INDEX "ProcessedEvent_eventId_idx" ON "ProcessedEvent"("eventId");

-- CreateIndex
CREATE INDEX "ProcessedEvent_processedAt_idx" ON "ProcessedEvent"("processedAt");

-- CreateIndex
CREATE INDEX "JobLog_queue_status_createdAt_idx" ON "JobLog"("queue", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JobLog_status_createdAt_idx" ON "JobLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JobLog_jobId_idx" ON "JobLog"("jobId");

-- CreateIndex
CREATE INDEX "JobLog_createdAt_idx" ON "JobLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdProvider_enabled_archived_priority_idx" ON "AdProvider"("enabled", "archived", "priority");

-- CreateIndex
CREATE INDEX "AdSnippet_enabled_archived_placement_priority_idx" ON "AdSnippet"("enabled", "archived", "placement", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AdPlacement_key_key" ON "AdPlacement"("key");

-- CreateIndex
CREATE INDEX "AdPlacement_key_idx" ON "AdPlacement"("key");

-- CreateIndex
CREATE INDEX "AdPlacement_providerId_idx" ON "AdPlacement"("providerId");

-- CreateIndex
CREATE INDEX "AdPlacement_enabled_priority_idx" ON "AdPlacement"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "MonetizationGate_publicToken_key" ON "MonetizationGate"("publicToken");

-- CreateIndex
CREATE INDEX "MonetizationGate_sessionId_status_idx" ON "MonetizationGate"("sessionId", "status");

-- CreateIndex
CREATE INDEX "MonetizationGate_userId_status_idx" ON "MonetizationGate"("userId", "status");

-- CreateIndex
CREATE INDEX "MonetizationGate_status_createdAt_idx" ON "MonetizationGate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MonetizationGate_expiresAt_idx" ON "MonetizationGate"("expiresAt");

-- CreateIndex
CREATE INDEX "MonetizationEvent_gateId_idx" ON "MonetizationEvent"("gateId");

-- CreateIndex
CREATE INDEX "MonetizationEvent_sessionId_createdAt_idx" ON "MonetizationEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "MonetizationEvent_userId_idx" ON "MonetizationEvent"("userId");

-- CreateIndex
CREATE INDEX "MonetizationEvent_providerId_createdAt_idx" ON "MonetizationEvent"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "MonetizationEvent_placement_createdAt_idx" ON "MonetizationEvent"("placement", "createdAt");

-- CreateIndex
CREATE INDEX "MonetizationEvent_type_createdAt_idx" ON "MonetizationEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "MessageTemplate_status_idx" ON "MessageTemplate"("status");

-- CreateIndex
CREATE INDEX "MessageTemplate_category_idx" ON "MessageTemplate"("category");

-- CreateIndex
CREATE INDEX "MessageTemplate_metaStatus_idx" ON "MessageTemplate"("metaStatus");

-- CreateIndex
CREATE INDEX "MessageLog_direction_createdAt_idx" ON "MessageLog"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_phone_idx" ON "MessageLog"("phone");

-- CreateIndex
CREATE INDEX "MessageLog_status_idx" ON "MessageLog"("status");

-- CreateIndex
CREATE INDEX "MessageLog_templateId_idx" ON "MessageLog"("templateId");

-- CreateIndex
CREATE INDEX "MessageLog_campaignDeliveryId_idx" ON "MessageLog"("campaignDeliveryId");

-- CreateIndex
CREATE INDEX "MessageLog_waMessageId_idx" ON "MessageLog"("waMessageId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_scheduleType_nextRunAt_idx" ON "Campaign"("scheduleType", "nextRunAt");

-- CreateIndex
CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");

-- CreateIndex
CREATE INDEX "Campaign_scheduledAt_idx" ON "Campaign"("scheduledAt");

-- CreateIndex
CREATE INDEX "CampaignDelivery_campaignId_status_idx" ON "CampaignDelivery"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignDelivery_status_scheduledFor_idx" ON "CampaignDelivery"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "CampaignDelivery_userId_idx" ON "CampaignDelivery"("userId");

-- CreateIndex
CREATE INDEX "RevenueLedger_status_createdAt_idx" ON "RevenueLedger"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RevenueLedger_type_createdAt_idx" ON "RevenueLedger"("type", "createdAt");

-- CreateIndex
CREATE INDEX "RevenueLedger_eventType_createdAt_idx" ON "RevenueLedger"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "RevenueLedger_isEstimated_createdAt_idx" ON "RevenueLedger"("isEstimated", "createdAt");

-- CreateIndex
CREATE INDEX "RevenueLedger_providerId_createdAt_idx" ON "RevenueLedger"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "RevenueLedger_sessionId_idx" ON "RevenueLedger"("sessionId");

-- CreateIndex
CREATE INDEX "RevenueLedger_userId_idx" ON "RevenueLedger"("userId");

-- CreateIndex
CREATE INDEX "RevenueLedger_gateId_idx" ON "RevenueLedger"("gateId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSnapshot_date_key" ON "AnalyticsSnapshot"("date");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_joinerId_fkey" FOREIGN KEY ("joinerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_currentQuestionId_fkey" FOREIGN KEY ("currentQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_askedBy_fkey" FOREIGN KEY ("askedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_answeredBy_fkey" FOREIGN KEY ("answeredBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRequest" ADD CONSTRAINT "CategoryRequest_requestorId_fkey" FOREIGN KEY ("requestorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRequest" ADD CONSTRAINT "CategoryRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSnippet" ADD CONSTRAINT "AdSnippet_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AdProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPlacement" ADD CONSTRAINT "AdPlacement_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AdProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationGate" ADD CONSTRAINT "MonetizationGate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationGate" ADD CONSTRAINT "MonetizationGate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationGate" ADD CONSTRAINT "MonetizationGate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AdProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationEvent" ADD CONSTRAINT "MonetizationEvent_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "MonetizationGate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationEvent" ADD CONSTRAINT "MonetizationEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationEvent" ADD CONSTRAINT "MonetizationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonetizationEvent" ADD CONSTRAINT "MonetizationEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AdProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDelivery" ADD CONSTRAINT "CampaignDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDelivery" ADD CONSTRAINT "CampaignDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedger" ADD CONSTRAINT "RevenueLedger_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AdProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedger" ADD CONSTRAINT "RevenueLedger_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedger" ADD CONSTRAINT "RevenueLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedger" ADD CONSTRAINT "RevenueLedger_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "MonetizationGate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueLedger" ADD CONSTRAINT "RevenueLedger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SiteAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteAsset_key_key" ON "SiteAsset"("key");


-- CreateTable
CREATE TABLE "LandingContent" (
    "id" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "content" TEXT,
    "image_url" TEXT,
    "button_text" TEXT,
    "button_url" TEXT,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LandingContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LandingContent_section_key_key" ON "LandingContent"("section_key");

-- CreateIndex
CREATE INDEX "LandingContent_sort_order_idx" ON "LandingContent"("sort_order");
