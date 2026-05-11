import hashlib
import sqlite3
import json
import os
from typing import Optional

CACHE_DB = "invoice_cache.db"

def _get_connection():
    # check_same_thread=False allows FastAPI async usage without blocking
    conn = sqlite3.connect(CACHE_DB, check_same_thread=False)
    # Enable WAL mode for high concurrency
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute('''
        CREATE TABLE IF NOT EXISTS cache (
            file_hash TEXT PRIMARY KEY,
            result_json TEXT
        )
    ''')
    return conn

def get_hash(file_bytes: bytes) -> str:
    # Stable hash over raw binary
    return hashlib.md5(file_bytes).hexdigest()

def get_cached_result(file_bytes: bytes) -> Optional[dict]:
    try:
        key = get_hash(file_bytes)
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT result_json FROM cache WHERE file_hash = ?", (key,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
    except Exception as e:
        print(f"SQL Cache Read Error: {e}")
    return None

def save_cached_result(file_bytes: bytes, result: dict):
    try:
        key = get_hash(file_bytes)
        with _get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO cache (file_hash, result_json) VALUES (?, ?)",
                (key, json.dumps(result))
            )
            conn.commit()
    except Exception as e:
        print(f"SQL Cache Write Error: {e}")