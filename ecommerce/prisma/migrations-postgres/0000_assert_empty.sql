DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
  ) THEN
    RAISE EXCEPTION 'db:bootstrap richiede uno schema PostgreSQL completamente vuoto; usa db:deploy su database esistenti';
  END IF;
END $$;
