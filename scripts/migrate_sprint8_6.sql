-- Sprint 8.6A — Knowledge Graph Foundation
-- Idempotente: usa IF NOT EXISTS en todo

CREATE TABLE IF NOT EXISTS entity_relationships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_a_id     UUID NOT NULL,
  entity_b_id     UUID NOT NULL,
  shared_articles INT  NOT NULL DEFAULT 0,
  shared_events   INT  NOT NULL DEFAULT 0,
  strength_score  FLOAT GENERATED ALWAYS AS (
                    shared_articles::float * 1.0 + shared_events::float * 5.0
                  ) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fk_er_entity_a FOREIGN KEY (entity_a_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  CONSTRAINT fk_er_entity_b FOREIGN KEY (entity_b_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  CONSTRAINT ck_er_order    CHECK (entity_a_id < entity_b_id),
  CONSTRAINT uq_er_pair     UNIQUE (entity_a_id, entity_b_id)
);

CREATE INDEX IF NOT EXISTS idx_er_entity_a    ON entity_relationships(entity_a_id);
CREATE INDEX IF NOT EXISTS idx_er_entity_b    ON entity_relationships(entity_b_id);
CREATE INDEX IF NOT EXISTS idx_er_strength    ON entity_relationships(strength_score DESC);
