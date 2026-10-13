import os

# 測試一律使用記憶體 SQLite：不需要 .env，也不會連到 Supabase
os.environ["DATABASE_URL"] = "sqlite://"