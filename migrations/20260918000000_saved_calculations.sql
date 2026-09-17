-- Version 20260918000000. Apply explicitly; never execute from a request.
CREATE TABLE IF NOT EXISTS linescout_saved_calculations (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 name VARCHAR(160) NOT NULL,
 platform VARCHAR(16) NOT NULL,
 market CHAR(2) NOT NULL,
 currency CHAR(3) NOT NULL,
 draft JSON NOT NULL,
 result JSON NOT NULL,
 model_version INT UNSIGNED NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 request_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY user_request (user_id,request_key),
 KEY user_updated (user_id,updated_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
