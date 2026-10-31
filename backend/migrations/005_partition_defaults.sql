CREATE TABLE IF NOT EXISTS audit_events_default PARTITION OF audit_events DEFAULT;
CREATE TABLE IF NOT EXISTS dashboard_daily_default PARTITION OF dashboard_daily DEFAULT;
