-- Capture all added authority dimensions at issuance. NULL identifies earlier
-- credentials, which cannot acquire group or newly introduced dimension grants.
ALTER TABLE e_api_tokens ADD COLUMN grants TEXT CHECK(grants IS NULL OR json_valid(grants));
