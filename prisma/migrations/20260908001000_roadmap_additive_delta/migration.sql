-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "publicUpdateNote" TEXT,
ADD COLUMN     "publicUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "relatedRecipeIds" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "scheduledPublishAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RecipeReview" ADD COLUMN     "recipeId" TEXT;

-- AlterTable
ALTER TABLE "RecipeSave" ADD COLUMN     "recipeId" TEXT;

-- AlterTable
ALTER TABLE "YouTubeRelease" ADD COLUMN     "recipeId" TEXT;

-- CreateTable
CREATE TABLE "RecipeRevision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipeId" TEXT,
    "stableRecipeId" TEXT NOT NULL,
    "adminId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "actorRole" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT 'saved',
    "snapshot" TEXT NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL DEFAULT '',
    "changedFields" TEXT NOT NULL DEFAULT '[]',
    "restoredFromRevisionId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RecipeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedRecipeCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedRecipeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedRecipeCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "recipeSaveId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedRecipeCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "queryNorm" TEXT NOT NULL DEFAULT '',
    "queryRaw" TEXT NOT NULL DEFAULT '',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "zeroResult" BOOLEAN NOT NULL DEFAULT false,
    "placement" TEXT NOT NULL DEFAULT '',
    "filters" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'admin',
    "actorName" TEXT NOT NULL DEFAULT '',
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "actorRole" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'content',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "entityLabel" TEXT NOT NULL DEFAULT '',
    "entityPath" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "entityLabel" TEXT NOT NULL DEFAULT '',
    "entityPath" TEXT NOT NULL DEFAULT '',
    "recipientAdminId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminNotificationReceipt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "notificationId" TEXT NOT NULL,
    "adminKey" TEXT NOT NULL,
    "adminId" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "AdminNotificationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "altText" TEXT NOT NULL DEFAULT '',
    "credit" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "byteSize" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "kind" TEXT NOT NULL DEFAULT 'image',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConsoleConnection" (
    "id" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL DEFAULT '',
    "refreshTokenEnc" TEXT NOT NULL DEFAULT '',
    "tokenIv" TEXT NOT NULL DEFAULT '',
    "tokenAuthTag" TEXT NOT NULL DEFAULT '',
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "selectedProperty" TEXT NOT NULL DEFAULT '',
    "selectedPropertyType" TEXT NOT NULL DEFAULT '',
    "connectedAt" TIMESTAMP(3),
    "connectedByAdminId" TEXT NOT NULL DEFAULT '',
    "lastRefreshAt" TIMESTAMP(3),
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncCompletedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastDataDate" TIMESTAMP(3),
    "lastErrorCode" TEXT NOT NULL DEFAULT '',
    "lastErrorMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchConsoleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConsolePageMetric" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "normalizedPath" TEXT NOT NULL DEFAULT '',
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchConsolePageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConsoleQueryMetric" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchConsoleQueryMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeRevision_recipeId_createdAt_idx" ON "RecipeRevision"("recipeId", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeRevision_stableRecipeId_createdAt_idx" ON "RecipeRevision"("stableRecipeId", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeRevision_contentHash_idx" ON "RecipeRevision"("contentHash");

-- CreateIndex
CREATE INDEX "RecipeRevision_adminId_createdAt_idx" ON "RecipeRevision"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedRecipeCollection_userId_updatedAt_idx" ON "SavedRecipeCollection"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRecipeCollection_userId_nameNorm_key" ON "SavedRecipeCollection"("userId", "nameNorm");

-- CreateIndex
CREATE INDEX "SavedRecipeCollectionItem_recipeSaveId_idx" ON "SavedRecipeCollectionItem"("recipeSaveId");

-- CreateIndex
CREATE INDEX "SavedRecipeCollectionItem_collectionId_createdAt_idx" ON "SavedRecipeCollectionItem"("collectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRecipeCollectionItem_collectionId_recipeSaveId_key" ON "SavedRecipeCollectionItem"("collectionId", "recipeSaveId");

-- CreateIndex
CREATE INDEX "SearchEvent_createdAt_idx" ON "SearchEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_queryNorm_createdAt_idx" ON "SearchEvent"("queryNorm", "createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_zeroResult_createdAt_idx" ON "SearchEvent"("zeroResult", "createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_visitorId_createdAt_idx" ON "SearchEvent"("visitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");

-- CreateIndex
CREATE INDEX "Redirect_isActive_fromPath_idx" ON "Redirect"("isActive", "fromPath");

-- CreateIndex
CREATE INDEX "Redirect_toPath_idx" ON "Redirect"("toPath");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_action_createdAt_idx" ON "AdminAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_area_createdAt_idx" ON "AdminAuditEvent"("area", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_entityType_entityId_createdAt_idx" ON "AdminAuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_adminId_createdAt_idx" ON "AdminAuditEvent"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_actorEmail_createdAt_idx" ON "AdminAuditEvent"("actorEmail", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_createdAt_idx" ON "AdminNotification"("createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_type_createdAt_idx" ON "AdminNotification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_recipientAdminId_createdAt_idx" ON "AdminNotification"("recipientAdminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_entityType_entityId_createdAt_idx" ON "AdminNotification"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotification_type_entityId_createdAt_idx" ON "AdminNotification"("type", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotificationReceipt_adminKey_dismissedAt_readAt_create_idx" ON "AdminNotificationReceipt"("adminKey", "dismissedAt", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AdminNotificationReceipt_adminId_createdAt_idx" ON "AdminNotificationReceipt"("adminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminNotificationReceipt_notificationId_adminKey_key" ON "AdminNotificationReceipt"("notificationId", "adminKey");

-- CreateIndex
CREATE INDEX "MediaAsset_url_idx" ON "MediaAsset"("url");

-- CreateIndex
CREATE INDEX "MediaAsset_isActive_updatedAt_idx" ON "MediaAsset"("isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_kind_isActive_idx" ON "MediaAsset"("kind", "isActive");

-- CreateIndex
CREATE INDEX "MediaAsset_createdByAdminId_idx" ON "MediaAsset"("createdByAdminId");

-- CreateIndex
CREATE INDEX "SearchConsolePageMetric_connectionId_date_idx" ON "SearchConsolePageMetric"("connectionId", "date");

-- CreateIndex
CREATE INDEX "SearchConsolePageMetric_connectionId_pageUrl_date_idx" ON "SearchConsolePageMetric"("connectionId", "pageUrl", "date");

-- CreateIndex
CREATE INDEX "SearchConsolePageMetric_connectionId_normalizedPath_date_idx" ON "SearchConsolePageMetric"("connectionId", "normalizedPath", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SearchConsolePageMetric_connectionId_date_pageUrl_key" ON "SearchConsolePageMetric"("connectionId", "date", "pageUrl");

-- CreateIndex
CREATE INDEX "SearchConsoleQueryMetric_connectionId_date_idx" ON "SearchConsoleQueryMetric"("connectionId", "date");

-- CreateIndex
CREATE INDEX "SearchConsoleQueryMetric_connectionId_query_date_idx" ON "SearchConsoleQueryMetric"("connectionId", "query", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SearchConsoleQueryMetric_connectionId_date_query_key" ON "SearchConsoleQueryMetric"("connectionId", "date", "query");

-- CreateIndex
CREATE INDEX "Recipe_scheduledPublishAt_status_idx" ON "Recipe"("scheduledPublishAt", "status");

-- CreateIndex
CREATE INDEX "Recipe_publishedAt_idx" ON "Recipe"("publishedAt");

-- CreateIndex
CREATE INDEX "RecipeReview_recipeId_idx" ON "RecipeReview"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeReview_recipeId_createdAt_idx" ON "RecipeReview"("recipeId", "createdAt");

-- CreateIndex
CREATE INDEX "RecipeSave_recipeId_idx" ON "RecipeSave"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeSave_userId_recipeId_key" ON "RecipeSave"("userId", "recipeId");

-- CreateIndex
CREATE INDEX "YouTubeRelease_recipeId_idx" ON "YouTubeRelease"("recipeId");

-- AddForeignKey
ALTER TABLE "RecipeRevision" ADD CONSTRAINT "RecipeRevision_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeRevision" ADD CONSTRAINT "RecipeRevision_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeSave" ADD CONSTRAINT "RecipeSave_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRecipeCollection" ADD CONSTRAINT "SavedRecipeCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRecipeCollectionItem" ADD CONSTRAINT "SavedRecipeCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "SavedRecipeCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedRecipeCollectionItem" ADD CONSTRAINT "SavedRecipeCollectionItem_recipeSaveId_fkey" FOREIGN KEY ("recipeSaveId") REFERENCES "RecipeSave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeReview" ADD CONSTRAINT "RecipeReview_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchEvent" ADD CONSTRAINT "SearchEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "GuestVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeRelease" ADD CONSTRAINT "YouTubeRelease_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotification" ADD CONSTRAINT "AdminNotification_recipientAdminId_fkey" FOREIGN KEY ("recipientAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotificationReceipt" ADD CONSTRAINT "AdminNotificationReceipt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AdminNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminNotificationReceipt" ADD CONSTRAINT "AdminNotificationReceipt_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsolePageMetric" ADD CONSTRAINT "SearchConsolePageMetric_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SearchConsoleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsoleQueryMetric" ADD CONSTRAINT "SearchConsoleQueryMetric_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SearchConsoleConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
