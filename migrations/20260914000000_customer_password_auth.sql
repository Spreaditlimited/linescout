-- Additive migration: existing accounts, sessions, wallets and referrals are unchanged.
CREATE TABLE IF NOT EXISTS linescout_user_credentials (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  email_verified_at DATETIME NOT NULL,
  password_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS linescout_password_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  email_normalized VARCHAR(200) NOT NULL,
  purpose VARCHAR(16) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  credential_version VARCHAR(255) NULL,
  next_path VARCHAR(1024) NOT NULL DEFAULT '',
  affiliate_code VARCHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_password_token_email (email_normalized),
  KEY idx_password_token_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS linescout_auth_rate_limits (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NOT NULL,
  KEY idx_auth_limit_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
