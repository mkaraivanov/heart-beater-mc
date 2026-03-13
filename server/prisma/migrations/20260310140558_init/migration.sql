-- CreateTable
CREATE TABLE "BpmRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bpm" INTEGER NOT NULL,
    "spotifyUri" TEXT NOT NULL,
    "spotifyType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BpmRule_bpm_key" ON "BpmRule"("bpm");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_service_key" ON "OAuthToken"("service");
