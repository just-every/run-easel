-- Partition existing JSON without assigning legacy installation rows to an entity.
CREATE INDEX IF NOT EXISTS e_actuals_entity_period ON e_actuals(COALESCE(json_extract(value,'$.entity'),''),period);
CREATE INDEX IF NOT EXISTS e_actuals_netsuite_source ON e_actuals(json_extract(value,'$.netsuiteAccount'),json_extract(value,'$.netsuiteBook'),json_extract(value,'$.netsuiteSubsidiary'),json_extract(value,'$.netsuiteMonth'));
