-- PostgreSQL ER schema for the multilingual literary knowledge platform.
-- The model is organized around module -> corpus -> document -> relation -> visualization.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS language (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  native_name VARCHAR(120),
  script VARCHAR(80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS module (
  id VARCHAR(120) PRIMARY KEY,
  name VARCHAR(240) NOT NULL,
  english_name VARCHAR(240),
  level SMALLINT NOT NULL DEFAULT 1,
  parent_id VARCHAR(120) REFERENCES module(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL CHECK (type IN ('domain', 'subdomain', 'visualization')),
  module_kind VARCHAR(40) CHECK (module_kind IN ('language', 'theme', 'corpus', 'author', 'region', 'repository', 'plugin')),
  language_code VARCHAR(32) REFERENCES language(code),
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corpus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id VARCHAR(120) NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  name VARCHAR(240) NOT NULL,
  description TEXT,
  language_code VARCHAR(32) REFERENCES language(code),
  source_kind VARCHAR(80),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corpus_id UUID REFERENCES corpus(id) ON DELETE SET NULL,
  module_id VARCHAR(120) REFERENCES module(id) ON DELETE SET NULL,
  submodule_id VARCHAR(120) REFERENCES module(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  translated_title TEXT,
  language_code VARCHAR(32) REFERENCES language(code),
  original_language_code VARCHAR(32) REFERENCES language(code),
  publication_year INTEGER,
  publication_date DATE,
  geo_region VARCHAR(240),
  country VARCHAR(160),
  city VARCHAR(160),
  publisher VARCHAR(240),
  version_label VARCHAR(160),
  source_uri TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_text TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(260) NOT NULL,
  normalized_name VARCHAR(260),
  type VARCHAR(40) NOT NULL CHECK (type IN ('person', 'work', 'institution', 'location', 'theme', 'term', 'language')),
  language_code VARCHAR(32) REFERENCES language(code),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (normalized_name, type, language_code)
);

CREATE TABLE IF NOT EXISTS document_entity (
  document_id UUID NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  role VARCHAR(80) NOT NULL DEFAULT 'mention',
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (document_id, entity_id, role)
);

CREATE TABLE IF NOT EXISTS relation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  relation_type VARCHAR(60) NOT NULL CHECK (relation_type IN ('translation', 'citation', 'propagation', 'adaptation', 'publication', 'authorship', 'alignment', 'co_occurrence')),
  document_id UUID REFERENCES document(id) ON DELETE SET NULL,
  weight NUMERIC(12,4) NOT NULL DEFAULT 1,
  time_start INTEGER,
  time_end INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS text_segment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  year INTEGER,
  language_code VARCHAR(32) REFERENCES language(code),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector TSVECTOR
);

CREATE TABLE IF NOT EXISTS visualization_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submodule_id VARCHAR(120) NOT NULL REFERENCES module(id) ON DELETE CASCADE,
  component_type VARCHAR(80) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submodule_id, component_type)
);

CREATE TABLE IF NOT EXISTS term_alignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_segment_id UUID REFERENCES text_segment(id) ON DELETE CASCADE,
  target_segment_id UUID REFERENCES text_segment(id) ON DELETE CASCADE,
  source_term VARCHAR(240) NOT NULL,
  target_term VARCHAR(240) NOT NULL,
  source_language_code VARCHAR(32) REFERENCES language(code),
  target_language_code VARCHAR(32) REFERENCES language(code),
  alignment_type VARCHAR(80) NOT NULL DEFAULT 'lexical',
  score NUMERIC(8,5) NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_document_module ON document(module_id, submodule_id);
CREATE INDEX IF NOT EXISTS idx_document_year_geo ON document(publication_year, country, city);
CREATE INDEX IF NOT EXISTS idx_document_language ON document(language_code);
CREATE INDEX IF NOT EXISTS idx_relation_type ON relation(relation_type);
CREATE INDEX IF NOT EXISTS idx_relation_source_target ON relation(source_entity_id, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_text_segment_document_position ON text_segment(document_id, position);
CREATE INDEX IF NOT EXISTS idx_text_segment_search ON text_segment USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_document_full_text ON document USING GIN(full_text);

INSERT INTO language (code, name, native_name)
VALUES
  ('zh', 'Chinese', '中文'),
  ('de', 'German', 'Deutsch'),
  ('fr', 'French', 'Français'),
  ('ja', 'Japanese', '日本語'),
  ('en', 'English', 'English'),
  ('es', 'Spanish', 'Español'),
  ('global', 'Global / Multilingual', 'Global')
ON CONFLICT (code) DO NOTHING;

INSERT INTO module (id, name, english_name, level, type, module_kind, language_code, description)
VALUES
  ('classics', '中国典籍海外译介', 'Chinese Classics Translation & Reception', 1, 'domain', 'corpus', 'global', '中国典籍、译本、译者、汉学家、出版机构与接受史。'),
  ('shanghai', '上海文学海外传播', 'Shanghai Literary Global Dissemination', 1, 'domain', 'corpus', 'global', '上海文学海外出版、翻译与接受路径。'),
  ('stories', '多语种中国故事集', 'Multilingual Chinese Story Corpus', 1, 'domain', 'corpus', 'global', '故事集、序跋、子故事与卫礼贤专题。'),
  ('world', '世界文学的中国叙事', 'World Literature''s China Narrative', 1, 'domain', 'corpus', 'global', '世界文学中的中国形象、主题与叙事网络。'),
  ('repository', '总库', 'Unified Global Knowledge Repository', 1, 'domain', 'repository', 'global', '跨模块检索、知识图谱与统计中心。')
ON CONFLICT (id) DO NOTHING;
