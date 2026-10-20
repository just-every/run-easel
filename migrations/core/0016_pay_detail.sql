-- Existing credentials gain no compensation authority.
ALTER TABLE e_api_tokens ADD COLUMN pay_detail INTEGER NOT NULL DEFAULT 0 CHECK(pay_detail IN (0,1));
