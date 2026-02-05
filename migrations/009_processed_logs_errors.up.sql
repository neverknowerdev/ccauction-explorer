-- Processed logs errors: detailed error info for failed log processing.

CREATE TABLE processed_logs_errors (
  id               bigserial   NOT NULL PRIMARY KEY,
  processed_log_id bigint      NOT NULL REFERENCES processed_logs (id) ON DELETE CASCADE,
  error_type       event_error_type,
  error            text        NOT NULL,
  stacktrace       text,
  time             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_processed_logs_errors_processed_log_id ON processed_logs_errors (processed_log_id);
CREATE INDEX idx_processed_logs_errors_error_type ON processed_logs_errors (error_type);
