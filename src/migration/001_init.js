export const up = (pgm) => {
  pgm.createExtension("citext", { ifNotExists: true });

  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    email: { type: "citext", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    role: { type: "text", notNull: true, default: "reader" }, // reader | editor | admin
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createTable("categories", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true, unique: true },
    slug: { type: "text", notNull: true, unique: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createTable("articles", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    author_id: { type: "uuid", notNull: true, references: "users", onDelete: "cascade" },
    title: { type: "text", notNull: true },
    slug: { type: "text", notNull: true, unique: true },
    excerpt: { type: "text" },
    body: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "draft" }, // draft|published
    published_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createTable("article_categories", {
    article_id: { type: "uuid", notNull: true, references: "articles", onDelete: "cascade" },
    category_id: { type: "uuid", notNull: true, references: "categories", onDelete: "cascade" }
  });
  pgm.addConstraint("article_categories", "article_categories_pk", {
    primaryKey: ["article_id", "category_id"]
  });

  // Full-text search simple (Postgres)
  pgm.addColumn("articles", {
    search_tsv: { type: "tsvector", generated: "ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) STORED" }
  });
  pgm.createIndex("articles", "search_tsv", { method: "gin" });
};

export const down = (pgm) => {
  pgm.dropTable("article_categories");
  pgm.dropTable("articles");
  pgm.dropTable("categories");
  pgm.dropTable("users");
};
