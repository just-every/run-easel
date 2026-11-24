-- Reads that must not scan the whole append-only activity log: payroll identity
-- history for erasure, and the once-a-day history-retention marker.
CREATE INDEX e_activity_record_kind ON e_activity(action, json_extract(detail,'$.kind'), seq);
