CREATE TABLE IF NOT EXISTS "website_editor_state" (
  "project_id" TEXT PRIMARY KEY,
  "last_saved_version_id" TEXT,
  "preview_version_id" TEXT,
  "published_version_id" TEXT,
  "version_seq" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "website_editor_state_project_fkey" FOREIGN KEY ("project_id") REFERENCES "WebsiteProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "website_editor_state_last_saved_fkey" FOREIGN KEY ("last_saved_version_id") REFERENCES "WebsiteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "website_editor_state_preview_fkey" FOREIGN KEY ("preview_version_id") REFERENCES "WebsiteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "website_editor_state_published_fkey" FOREIGN KEY ("published_version_id") REFERENCES "WebsiteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "website_editor_state_published_idx" ON "website_editor_state" ("published_version_id");

INSERT INTO "website_editor_state" ("project_id", "last_saved_version_id", "version_seq")
SELECT p."id", latest."id", COALESCE(counts."version_count", 0)
FROM "WebsiteProject" p
LEFT JOIN LATERAL (
  SELECT v."id" FROM "WebsiteVersion" v WHERE v."projectId"=p."id" ORDER BY v."createdAt" DESC LIMIT 1
) latest ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INTEGER AS "version_count" FROM "WebsiteVersion" v2 WHERE v2."projectId"=p."id"
) counts ON TRUE
ON CONFLICT ("project_id") DO NOTHING;
