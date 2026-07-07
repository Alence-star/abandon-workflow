mod migrations;

use rusqlite::{Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};

const APP_DIR_NAME: &str = "com.abandon.english";
const DB_FILE_NAME: &str = "abandon.db";

pub struct Database {
    conn: Connection,
    path: PathBuf,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path();
        if let Some(parent) = db_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        Self::migrate_legacy_database_if_needed(&db_path);

        eprintln!("[Abandon] Database path: {}", db_path.display());
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Database {
            conn,
            path: db_path,
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn get_db_path() -> PathBuf {
        if let Ok(dir) = std::env::var("ABANDON_DATA_DIR") {
            let mut path = PathBuf::from(dir);
            if fs::create_dir_all(&path).is_ok() {
                path.push(DB_FILE_NAME);
                return path;
            }
        }

        if let Some(path) = Self::default_db_path() {
            return path;
        }

        Self::legacy_temp_db_path()
    }

    fn default_db_path() -> Option<PathBuf> {
        #[cfg(target_os = "macos")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let mut path = PathBuf::from(home);
                path.push("Library");
                path.push("Application Support");
                path.push(APP_DIR_NAME);
                fs::create_dir_all(&path).ok()?;
                path.push(DB_FILE_NAME);
                return Some(path);
            }
        }

        #[cfg(target_os = "windows")]
        {
            for env_key in ["APPDATA", "LOCALAPPDATA"] {
                if let Ok(base_dir) = std::env::var(env_key) {
                    let mut path = PathBuf::from(base_dir);
                    path.push(APP_DIR_NAME);
                    if fs::create_dir_all(&path).is_ok() {
                        path.push(DB_FILE_NAME);
                        return Some(path);
                    }
                }
            }
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        {
            if let Ok(xdg_data_home) = std::env::var("XDG_DATA_HOME") {
                let mut path = PathBuf::from(xdg_data_home);
                path.push(APP_DIR_NAME);
                fs::create_dir_all(&path).ok()?;
                path.push(DB_FILE_NAME);
                return Some(path);
            }

            if let Ok(home) = std::env::var("HOME") {
                let mut path = PathBuf::from(home);
                path.push(".local");
                path.push("share");
                path.push(APP_DIR_NAME);
                fs::create_dir_all(&path).ok()?;
                path.push(DB_FILE_NAME);
                return Some(path);
            }
        }

        None
    }

    fn migrate_legacy_database_if_needed(target_path: &Path) {
        if target_path.exists() {
            return;
        }

        let legacy_path = Self::legacy_temp_db_path();
        if legacy_path == target_path || !legacy_path.exists() {
            return;
        }

        if let Some(parent) = target_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        for suffix in ["", "-wal", "-shm"] {
            let source = PathBuf::from(format!("{}{}", legacy_path.display(), suffix));
            if !source.exists() {
                continue;
            }

            let destination = PathBuf::from(format!("{}{}", target_path.display(), suffix));
            let _ = fs::copy(source, destination);
        }
    }

    fn legacy_temp_db_path() -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push("abandon-data");
        let _ = fs::create_dir_all(&path);
        path.push(DB_FILE_NAME);
        path
    }

    fn run_migrations(&self) -> Result<()> {
        migrations::run(&self.conn)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}
