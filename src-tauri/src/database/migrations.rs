use rusqlite::{params, Connection, Result};

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    conn.prepare(&format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"))?
        .query_row(params![column], |row| row.get(0))
}

fn ensure_column(conn: &Connection, table: &str, column: &str, sql_type: &str) -> Result<()> {
    if !has_column(conn, table, column)? {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {sql_type};"))?;
    }
    Ok(())
}

fn rebuild_wordbook_with_scope(conn: &Connection) -> Result<()> {
    if has_column(conn, "wordbook", "user_id")? {
        return Ok(());
    }

    // Make sure legacy rows have the same content columns before migration.
    ensure_column(conn, "wordbook", "phonetic", "TEXT")?;
    ensure_column(conn, "wordbook", "collocations", "TEXT")?;
    ensure_column(conn, "wordbook", "memory_trick", "TEXT")?;
    ensure_column(conn, "wordbook", "familiarity", "INTEGER DEFAULT 0")?;

    conn.execute_batch(
        "
        ALTER TABLE wordbook RENAME TO wordbook_legacy;

        CREATE TABLE wordbook (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 0,
            word TEXT NOT NULL COLLATE NOCASE,
            translation TEXT NOT NULL,
            notes TEXT,
            phonetic TEXT,
            collocations TEXT,
            memory_trick TEXT,
            familiarity INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, word)
        );

        INSERT INTO wordbook (
            user_id,
            word,
            translation,
            notes,
            phonetic,
            collocations,
            memory_trick,
            familiarity,
            created_at
        )
        SELECT
            0,
            word,
            translation,
            notes,
            phonetic,
            collocations,
            memory_trick,
            COALESCE(familiarity, 0),
            COALESCE(created_at, datetime('now'))
        FROM wordbook_legacy;

        DROP TABLE wordbook_legacy;
        ",
    )?;

    Ok(())
}

pub fn run(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL UNIQUE COLLATE NOCASE,
            phonetic TEXT,
            translation TEXT NOT NULL,
            collocations TEXT,
            memory_trick TEXT,
            example_sentences TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sentences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sentence TEXT NOT NULL,
            translation TEXT NOT NULL,
            grammar_analysis TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS wordbook (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 0,
            word TEXT NOT NULL COLLATE NOCASE,
            translation TEXT NOT NULL,
            notes TEXT,
            phonetic TEXT,
            collocations TEXT,
            memory_trick TEXT,
            familiarity INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, word)
        );

        CREATE TABLE IF NOT EXISTS cache (
            cache_key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            password_sha256 TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS user_config (
            user_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        ",
    )?;

    rebuild_wordbook_with_scope(conn)?;

    ensure_column(conn, "words", "example_sentences", "TEXT")?;
    ensure_column(conn, "wordbook", "phonetic", "TEXT")?;
    ensure_column(conn, "wordbook", "collocations", "TEXT")?;
    ensure_column(conn, "wordbook", "memory_trick", "TEXT")?;
    ensure_column(conn, "wordbook", "familiarity", "INTEGER DEFAULT 0")?;
    ensure_column(conn, "users", "password_sha256", "TEXT")?;

    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_wordbook_user_word ON wordbook(user_id, word);
        CREATE INDEX IF NOT EXISTS idx_wordbook_user_created ON wordbook(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_user_config_user_id ON user_config(user_id);
        ",
    )?;

    Ok(())
}
