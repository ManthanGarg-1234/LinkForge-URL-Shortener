
-- Preserve existing timestamp values as UTC instants.
-- The previous Prisma DateTime mapping was interpreted as UTC.
-- Do not use the database session timezone for this conversion.

ALTER TABLE "click_events"
    ALTER COLUMN "clickedAt" DROP DEFAULT;

ALTER TABLE "click_events"
    ALTER COLUMN "clickedAt"
    TYPE TIMESTAMPTZ(3)
    USING ("clickedAt" AT TIME ZONE 'UTC');

ALTER TABLE "click_events"
    ALTER COLUMN "clickedAt"
    SET DEFAULT CURRENT_TIMESTAMP;
