-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "sessionTokenId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "browser" TEXT NOT NULL DEFAULT '',
    "browserVersion" TEXT NOT NULL DEFAULT '',
    "operatingSystem" TEXT NOT NULL DEFAULT '',
    "deviceType" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT,
    "country" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiRecipeGenerationCache" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRecipeGenerationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FunnelEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL DEFAULT '',
    "recipeSlug" TEXT NOT NULL DEFAULT '',
    "youtubeVideoId" TEXT NOT NULL DEFAULT '',
    "targetRecipeId" TEXT NOT NULL DEFAULT '',
    "targetVideoId" TEXT NOT NULL DEFAULT '',
    "placement" TEXT NOT NULL DEFAULT '',
    "chapterLabel" TEXT NOT NULL DEFAULT '',
    "chapterTimeSeconds" INTEGER,
    "chapterIndex" INTEGER,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestPageView" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referer" TEXT NOT NULL DEFAULT '',
    "ip" TEXT,
    "country" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "navId" TEXT,

    CONSTRAINT "GuestPageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestPresenceSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "connectionKey" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestPresenceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestVisitor" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPath" TEXT NOT NULL DEFAULT '',
    "ip" TEXT,
    "country" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "utmSource" TEXT,
    "clientKind" TEXT,
    "clientKindAt" TIMESTAMP(3),
    "clientKindReasons" TEXT,
    "ipUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "GuestVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemberPresenceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPresenceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'site',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "unsubscribeTokenHash" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordReset" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recipe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "typeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "seasonal" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "values" TEXT NOT NULL DEFAULT '{}',
    "aiMeta" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeCategory" (
    "recipeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "RecipeCategory_pkey" PRIMARY KEY ("recipeId","categoryId")
);

-- CreateTable
CREATE TABLE "public"."RecipeReview" (
    "id" TEXT NOT NULL,
    "recipeSlug" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeReviewReply" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorTitle" TEXT NOT NULL DEFAULT '',
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorPhotoUrl" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RecipeReviewReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeSave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RecipeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeTypeField" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeTypeField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Series" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortTitle" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "heroImage" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "youtubePlaylistId" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "followYoutubeOrder" BOOLEAN NOT NULL DEFAULT true,
    "syncMode" TEXT NOT NULL DEFAULT 'CUSTOM',
    "youtubePlaylistDescription" TEXT NOT NULL DEFAULT '',
    "youtubePlaylistLastSyncedAt" TIMESTAMP(3),
    "youtubePlaylistThumbnail" TEXT NOT NULL DEFAULT '',
    "youtubePlaylistTitle" TEXT NOT NULL DEFAULT '',
    "aiMeta" TEXT NOT NULL DEFAULT '{}',
    "heroImageSource" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SeriesItem" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "recipeId" TEXT,
    "youtubeVideoId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customTitle" TEXT NOT NULL DEFAULT '',
    "customDescription" TEXT NOT NULL DEFAULT '',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedFromPlaylist" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SeriesItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."StudioLessonRecipeLink" (
    "lessonSlug" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioLessonRecipeLink_pkey" PRIMARY KEY ("lessonSlug","recipeId")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "referer" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeAnalyticsChannelDay" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" INTEGER NOT NULL DEFAULT 0,
    "averageViewDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageViewPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subscribersGained" INTEGER NOT NULL DEFAULT 0,
    "subscribersLost" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeAnalyticsChannelDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeAnalyticsConnection" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL DEFAULT '',
    "channelTitle" TEXT NOT NULL DEFAULT '',
    "googleAccountEmail" TEXT NOT NULL DEFAULT '',
    "refreshTokenEnc" TEXT NOT NULL DEFAULT '',
    "tokenIv" TEXT NOT NULL DEFAULT '',
    "tokenAuthTag" TEXT NOT NULL DEFAULT '',
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "connectedAt" TIMESTAMP(3),
    "connectedByAdminId" TEXT NOT NULL DEFAULT '',
    "lastRefreshAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "videoMetricsError" TEXT NOT NULL DEFAULT '',
    "videoMetricsStatus" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "YouTubeAnalyticsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeAnalyticsTrafficDay" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "channelId" TEXT NOT NULL DEFAULT '',
    "videoId" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "dimension" TEXT NOT NULL,
    "dimensionValue" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeAnalyticsTrafficDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeAnalyticsVideoDay" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutesWatched" INTEGER NOT NULL DEFAULT 0,
    "averageViewDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageViewPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subscribersGained" INTEGER NOT NULL DEFAULT 0,
    "subscribersLost" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeAnalyticsVideoDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeChannel" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "customUrl" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "uploadsPlaylistId" TEXT NOT NULL DEFAULT '',
    "viewCount" TEXT NOT NULL DEFAULT '0',
    "subscriberCount" TEXT NOT NULL DEFAULT '0',
    "hiddenSubscriberCount" BOOLEAN NOT NULL DEFAULT false,
    "videoCount" TEXT NOT NULL DEFAULT '0',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncAttemptAt" TIMESTAMP(3),
    "lastSyncError" TEXT NOT NULL DEFAULT '',
    "lastSyncStatus" TEXT NOT NULL DEFAULT 'never',

    CONSTRAINT "YouTubeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeChannelSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" TEXT NOT NULL DEFAULT '0',
    "subscriberCount" TEXT NOT NULL DEFAULT '0',
    "videoCount" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "YouTubeChannelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeRelease" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "workingTitle" TEXT NOT NULL DEFAULT '',
    "videoType" TEXT NOT NULL DEFAULT 'LONG',
    "releaseAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "youtubeVideoId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "skipReason" TEXT NOT NULL DEFAULT '',
    "slotKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeVideo" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationDisplay" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "categoryId" TEXT NOT NULL DEFAULT '',
    "definition" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "privacyStatus" TEXT NOT NULL DEFAULT '',
    "embeddable" BOOLEAN NOT NULL DEFAULT true,
    "madeForKids" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" TEXT NOT NULL DEFAULT '0',
    "likeCount" TEXT NOT NULL DEFAULT '0',
    "commentCount" TEXT NOT NULL DEFAULT '0',
    "lastSyncedAt" TIMESTAMP(3),
    "scheduledPublishAt" TIMESTAMP(3),
    "uploadStatus" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "YouTubeVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."YouTubeVideoSnapshot" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" TEXT NOT NULL DEFAULT '0',
    "likeCount" TEXT NOT NULL DEFAULT '0',
    "commentCount" TEXT NOT NULL DEFAULT '0',

    CONSTRAINT "YouTubeVideoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "public"."Admin"("email" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_adminId_idx" ON "public"."AdminSession"("adminId" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "public"."AdminSession"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_lastSeenAt_idx" ON "public"."AdminSession"("lastSeenAt" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_revokedAt_idx" ON "public"."AdminSession"("revokedAt" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_sessionTokenId_idx" ON "public"."AdminSession"("sessionTokenId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_sessionTokenId_key" ON "public"."AdminSession"("sessionTokenId" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_subjectKey_idx" ON "public"."AdminSession"("subjectKey" ASC);

-- CreateIndex
CREATE INDEX "AdminSession_subjectKey_revokedAt_expiresAt_idx" ON "public"."AdminSession"("subjectKey" ASC, "revokedAt" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE INDEX "AiRecipeGenerationCache_videoId_idx" ON "public"."AiRecipeGenerationCache"("videoId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "AiRecipeGenerationCache_videoId_typeId_schemaVersion_key" ON "public"."AiRecipeGenerationCache"("videoId" ASC, "typeId" ASC, "schemaVersion" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "public"."Category"("slug" ASC);

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "public"."ContactMessage"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "FunnelEvent_createdAt_name_idx" ON "public"."FunnelEvent"("createdAt" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "FunnelEvent_name_visitorId_recipeSlug_createdAt_idx" ON "public"."FunnelEvent"("name" ASC, "visitorId" ASC, "recipeSlug" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "FunnelEvent_recipeSlug_createdAt_idx" ON "public"."FunnelEvent"("recipeSlug" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "FunnelEvent_visitorId_createdAt_idx" ON "public"."FunnelEvent"("visitorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "FunnelEvent_youtubeVideoId_createdAt_idx" ON "public"."FunnelEvent"("youtubeVideoId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "GuestPageView_createdAt_idx" ON "public"."GuestPageView"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GuestPageView_navId_key" ON "public"."GuestPageView"("navId" ASC);

-- CreateIndex
CREATE INDEX "GuestPageView_path_idx" ON "public"."GuestPageView"("path" ASC);

-- CreateIndex
CREATE INDEX "GuestPageView_visitorId_createdAt_idx" ON "public"."GuestPageView"("visitorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "GuestPresenceSession_lastSeenAt_idx" ON "public"."GuestPresenceSession"("lastSeenAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GuestPresenceSession_visitorId_connectionKey_key" ON "public"."GuestPresenceSession"("visitorId" ASC, "connectionKey" ASC);

-- CreateIndex
CREATE INDEX "GuestPresenceSession_visitorId_lastSeenAt_idx" ON "public"."GuestPresenceSession"("visitorId" ASC, "lastSeenAt" ASC);

-- CreateIndex
CREATE INDEX "GuestVisitor_ipUpdatedAt_idx" ON "public"."GuestVisitor"("ipUpdatedAt" ASC);

-- CreateIndex
CREATE INDEX "GuestVisitor_lastSeenAt_idx" ON "public"."GuestVisitor"("lastSeenAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GuestVisitor_visitorKey_key" ON "public"."GuestVisitor"("visitorKey" ASC);

-- CreateIndex
CREATE INDEX "MemberPresenceSession_lastSeenAt_idx" ON "public"."MemberPresenceSession"("lastSeenAt" ASC);

-- CreateIndex
CREATE INDEX "MemberPresenceSession_userId_lastSeenAt_idx" ON "public"."MemberPresenceSession"("userId" ASC, "lastSeenAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MemberPresenceSession_userId_sessionKey_key" ON "public"."MemberPresenceSession"("userId" ASC, "sessionKey" ASC);

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_createdAt_idx" ON "public"."NewsletterSubscriber"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "public"."NewsletterSubscriber"("email" ASC);

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_idx" ON "public"."NewsletterSubscriber"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeTokenHash_key" ON "public"."NewsletterSubscriber"("unsubscribeTokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "public"."PasswordReset"("tokenHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_slug_key" ON "public"."Recipe"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeReview_recipeSlug_authorEmail_key" ON "public"."RecipeReview"("recipeSlug" ASC, "authorEmail" ASC);

-- CreateIndex
CREATE INDEX "RecipeReview_recipeSlug_createdAt_idx" ON "public"."RecipeReview"("recipeSlug" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "RecipeReviewReply_reviewId_createdAt_idx" ON "public"."RecipeReviewReply"("reviewId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeSave_userId_slug_key" ON "public"."RecipeSave"("userId" ASC, "slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeType_slug_key" ON "public"."RecipeType"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipeTypeField_typeId_key_key" ON "public"."RecipeTypeField"("typeId" ASC, "key" ASC);

-- CreateIndex
CREATE INDEX "Series_isPublished_sortOrder_idx" ON "public"."Series"("isPublished" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "public"."Series"("slug" ASC);

-- CreateIndex
CREATE INDEX "Series_youtubePlaylistId_idx" ON "public"."Series"("youtubePlaylistId" ASC);

-- CreateIndex
CREATE INDEX "SeriesItem_recipeId_idx" ON "public"."SeriesItem"("recipeId" ASC);

-- CreateIndex
CREATE INDEX "SeriesItem_seriesId_sortOrder_idx" ON "public"."SeriesItem"("seriesId" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "SeriesItem_youtubeVideoId_idx" ON "public"."SeriesItem"("youtubeVideoId" ASC);

-- CreateIndex
CREATE INDEX "StudioLessonRecipeLink_lessonSlug_sortOrder_idx" ON "public"."StudioLessonRecipeLink"("lessonSlug" ASC, "sortOrder" ASC);

-- CreateIndex
CREATE INDEX "StudioLessonRecipeLink_recipeId_idx" ON "public"."StudioLessonRecipeLink"("recipeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "YouTubeAnalyticsChannelDay_channelId_date_idx" ON "public"."YouTubeAnalyticsChannelDay"("channelId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeAnalyticsChannelDay_channelId_date_key" ON "public"."YouTubeAnalyticsChannelDay"("channelId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "YouTubeAnalyticsTrafficDay_channelId_date_dimension_idx" ON "public"."YouTubeAnalyticsTrafficDay"("channelId" ASC, "date" ASC, "dimension" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeAnalyticsTrafficDay_scope_channelId_videoId_date_dim_key" ON "public"."YouTubeAnalyticsTrafficDay"("scope" ASC, "channelId" ASC, "videoId" ASC, "date" ASC, "dimension" ASC, "dimensionValue" ASC);

-- CreateIndex
CREATE INDEX "YouTubeAnalyticsTrafficDay_videoId_date_dimension_idx" ON "public"."YouTubeAnalyticsTrafficDay"("videoId" ASC, "date" ASC, "dimension" ASC);

-- CreateIndex
CREATE INDEX "YouTubeAnalyticsVideoDay_channelId_date_idx" ON "public"."YouTubeAnalyticsVideoDay"("channelId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "YouTubeAnalyticsVideoDay_videoId_date_idx" ON "public"."YouTubeAnalyticsVideoDay"("videoId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeAnalyticsVideoDay_videoId_date_key" ON "public"."YouTubeAnalyticsVideoDay"("videoId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeChannel_channelId_key" ON "public"."YouTubeChannel"("channelId" ASC);

-- CreateIndex
CREATE INDEX "YouTubeChannelSnapshot_channelId_recordedAt_idx" ON "public"."YouTubeChannelSnapshot"("channelId" ASC, "recordedAt" ASC);

-- CreateIndex
CREATE INDEX "YouTubeRelease_releaseAt_idx" ON "public"."YouTubeRelease"("releaseAt" ASC);

-- CreateIndex
CREATE INDEX "YouTubeRelease_slotKey_idx" ON "public"."YouTubeRelease"("slotKey" ASC);

-- CreateIndex
CREATE INDEX "YouTubeRelease_status_idx" ON "public"."YouTubeRelease"("status" ASC);

-- CreateIndex
CREATE INDEX "YouTubeRelease_youtubeVideoId_idx" ON "public"."YouTubeRelease"("youtubeVideoId" ASC);

-- CreateIndex
CREATE INDEX "YouTubeVideo_channelId_publishedAt_idx" ON "public"."YouTubeVideo"("channelId" ASC, "publishedAt" ASC);

-- CreateIndex
CREATE INDEX "YouTubeVideo_scheduledPublishAt_idx" ON "public"."YouTubeVideo"("scheduledPublishAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeVideo_videoId_key" ON "public"."YouTubeVideo"("videoId" ASC);

-- CreateIndex
CREATE INDEX "YouTubeVideoSnapshot_videoId_recordedAt_idx" ON "public"."YouTubeVideoSnapshot"("videoId" ASC, "recordedAt" ASC);

-- AddForeignKey
ALTER TABLE "public"."AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FunnelEvent" ADD CONSTRAINT "FunnelEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "public"."GuestVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GuestPageView" ADD CONSTRAINT "GuestPageView_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "public"."GuestVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GuestPresenceSession" ADD CONSTRAINT "GuestPresenceSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "public"."GuestVisitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemberPresenceSession" ADD CONSTRAINT "MemberPresenceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recipe" ADD CONSTRAINT "Recipe_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."RecipeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeCategory" ADD CONSTRAINT "RecipeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeCategory" ADD CONSTRAINT "RecipeCategory_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeReview" ADD CONSTRAINT "RecipeReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeReviewReply" ADD CONSTRAINT "RecipeReviewReply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "public"."RecipeReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeSave" ADD CONSTRAINT "RecipeSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeTypeField" ADD CONSTRAINT "RecipeTypeField_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."RecipeType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeriesItem" ADD CONSTRAINT "SeriesItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeriesItem" ADD CONSTRAINT "SeriesItem_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "public"."Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeriesItem" ADD CONSTRAINT "SeriesItem_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "public"."YouTubeVideo"("videoId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudioLessonRecipeLink" ADD CONSTRAINT "StudioLessonRecipeLink_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserConnection" ADD CONSTRAINT "UserConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YouTubeChannelSnapshot" ADD CONSTRAINT "YouTubeChannelSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."YouTubeChannel"("channelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YouTubeRelease" ADD CONSTRAINT "YouTubeRelease_youtubeVideoId_fkey" FOREIGN KEY ("youtubeVideoId") REFERENCES "public"."YouTubeVideo"("videoId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YouTubeVideo" ADD CONSTRAINT "YouTubeVideo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "public"."YouTubeChannel"("channelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."YouTubeVideoSnapshot" ADD CONSTRAINT "YouTubeVideoSnapshot_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "public"."YouTubeVideo"("videoId") ON DELETE CASCADE ON UPDATE CASCADE;
