-- CreateTable
CREATE TABLE "short_urls" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shortCode" VARCHAR(16) NOT NULL,
    "originalUrl" VARCHAR(2048) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "short_urls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "short_urls_shortCode_key" ON "short_urls"("shortCode");

-- CreateIndex
CREATE INDEX "short_urls_userId_createdAt_idx" ON "short_urls"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "short_urls_expiresAt_idx" ON "short_urls"("expiresAt");

-- AddForeignKey
ALTER TABLE "short_urls" ADD CONSTRAINT "short_urls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
