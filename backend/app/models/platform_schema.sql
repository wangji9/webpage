-- PostgreSQL 15 schema for the literary knowledge platform.
-- Apply with: psql "$DATABASE_URL" -f backend/app/models/platform_schema.sql

CREATE TABLE IF NOT EXISTS knowledge_domains (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(255),
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'researcher', 'user')),
    institution VARCHAR(255),
    research_area VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sub_modules (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    knowledge_domain_id INT NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('general', 'language', 'topic')),
    language VARCHAR(50),
    enabled_components JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    ,
    UNIQUE (knowledge_domain_id, name)
);

CREATE TABLE IF NOT EXISTS datasets (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sub_module_id INT NOT NULL REFERENCES sub_modules(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255),
    file_path VARCHAR(512),
    file_size BIGINT,
    file_type VARCHAR(50) CHECK (file_type IN ('xlsx', 'csv', 'pdf', 'docx', 'json')),
    record_count INT NOT NULL DEFAULT 0,
    field_count INT NOT NULL DEFAULT 0,
    uploaded_by INT REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'parsing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    field_1 TEXT,
    field_2 TEXT,
    field_3 TEXT,
    field_4 TEXT,
    field_5 TEXT,
    field_6 TEXT,
    field_7 TEXT,
    field_8 TEXT,
    field_9 TEXT,
    field_10 TEXT,
    field_11 TEXT,
    field_12 TEXT,
    field_13 TEXT,
    field_14 TEXT,
    field_15 TEXT,
    field_16 TEXT,
    field_17 TEXT,
    field_18 TEXT,
    field_19 TEXT,
    field_20 TEXT,
    tsv TSVECTOR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_assets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    extraction_kind VARCHAR(50) NOT NULL,
    page_count INT NOT NULL DEFAULT 0,
    ocr_page_count INT NOT NULL DEFAULT 0,
    character_count BIGINT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    preview_text TEXT,
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dataset_id)
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_asset_id BIGINT NOT NULL REFERENCES document_assets(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    page_start INT,
    page_end INT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    tsv TSVECTOR,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (document_asset_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS field_mappings (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset_id INT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    file_column VARCHAR(100) NOT NULL,
    system_field VARCHAR(50) NOT NULL CHECK (system_field IN ('title', 'author', 'translator', 'publisher', 'publish_year', 'country', 'city', 'theme', 'content', 'source', 'preface', 'notes')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visualization_cache (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sub_module_id INT NOT NULL REFERENCES sub_modules(id) ON DELETE CASCADE,
    component_type VARCHAR(50) NOT NULL,
    filter_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS operation_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT REFERENCES users(id),
    operation_type VARCHAR(50) NOT NULL,
    operation_content TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_configs (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'azure')),
    base_url VARCHAR(255),
    api_key VARCHAR(255),
    model VARCHAR(50),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_codes (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_data_records_tsv ON data_records USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv ON document_chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_document_chunks_asset ON document_chunks(document_asset_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_datasets_sub_module_id ON datasets(sub_module_id);
CREATE INDEX IF NOT EXISTS idx_data_records_dataset_id ON data_records(dataset_id);
CREATE INDEX IF NOT EXISTS idx_visualization_cache_submodule_component ON visualization_cache(sub_module_id, component_type);
CREATE INDEX IF NOT EXISTS idx_sub_modules_domain_order ON sub_modules(knowledge_domain_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_type_time ON operation_logs(user_id, operation_type, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'knowledge_domains',
        'users',
        'sub_modules',
        'datasets',
        'data_records',
        'document_assets',
        'document_chunks',
        'field_mappings',
        'llm_configs'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', table_name, table_name);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION data_records_tsv_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.tsv =
        to_tsvector('simple',
            concat_ws(' ',
                NEW.field_1, NEW.field_2, NEW.field_3, NEW.field_4, NEW.field_5,
                NEW.field_6, NEW.field_7, NEW.field_8, NEW.field_9, NEW.field_10,
                NEW.field_11, NEW.field_12, NEW.field_13, NEW.field_14, NEW.field_15,
                NEW.field_16, NEW.field_17, NEW.field_18, NEW.field_19, NEW.field_20
            )
        );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_data_records_tsv ON data_records;
CREATE TRIGGER trg_data_records_tsv
BEFORE INSERT OR UPDATE ON data_records
FOR EACH ROW EXECUTE FUNCTION data_records_tsv_update();

INSERT INTO knowledge_domains (name, description, icon, sort_order)
VALUES
    ('中国典籍海外译介', '中国典籍、译者、出版社、出版地、主题与海外接受知识域。', 'book-open', 1),
    ('上海文学海外传播', '上海作家作品、海外出版、评论接受与跨文化传播路径知识域。', 'building-2', 2),
    ('多语种中国故事集', '多语种故事集、序跋、子故事、神话寓言与民间故事类型知识域。', 'library', 3),
    ('世界文学的中国叙事', '世界文学、影视、汉学与社交媒体中的中国叙事知识域。', 'globe-2', 4),
    ('总库', '跨知识域检索、联合分析、字词平台与全球古籍目录总入口。', 'database', 5)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_active = true;
