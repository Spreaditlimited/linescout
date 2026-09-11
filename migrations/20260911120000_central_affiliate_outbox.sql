CREATE TABLE IF NOT EXISTS linescout_central_affiliate_referrals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referred_user_id BIGINT UNSIGNED NOT NULL,
  referral_code VARCHAR(40) NOT NULL,
  source VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_central_affiliate_ref_user (referred_user_id),
  KEY idx_central_affiliate_ref_code (referral_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS linescout_affiliate_event_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(191) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  aggregate_key VARCHAR(191) NOT NULL,
  payload_json JSON NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_linescout_affiliate_event (event_id),
  KEY idx_linescout_affiliate_outbox_delivery (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO linescout_central_affiliate_referrals
  (referred_user_id, referral_code, source, created_at)
SELECT r.referred_user_id, a.referral_code, COALESCE(r.source, 'LINESCOUT_MIGRATION'), r.created_at
FROM linescout_affiliate_referrals r
JOIN linescout_affiliates a ON a.id = r.affiliate_id;
