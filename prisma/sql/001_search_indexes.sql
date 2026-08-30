-- Full-text + fuzzy search support.
-- Run after `prisma migrate deploy` (Prisma cannot express these natively).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Weighted tsvector: title > summary > description.
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS content_search_vector_idx ON content USING GIN (search_vector);

-- Typo-tolerant matching for header search suggestions.
CREATE INDEX IF NOT EXISTS content_title_trgm_idx ON content USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS creators_name_trgm_idx ON creators USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tags_name_trgm_idx     ON tags     USING GIN (name gin_trgm_ops);

-- Trending window: views in the last N days, grouped per item.
CREATE INDEX IF NOT EXISTS views_recent_idx ON views (created_at DESC, content_id);
