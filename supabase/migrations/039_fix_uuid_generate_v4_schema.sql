-- Supabase installs uuid-ossp in the `extensions` schema. Applied Magnus
-- functions 036 and 038 explicitly call public.uuid_generate_v4() while using
-- an empty search_path, so the missing public symbol is discovered only when
-- those functions execute. Add a locked-down compatibility function rather
-- than editing either applied migration.

DO $migration$
BEGIN
  IF to_regprocedure('public.uuid_generate_v4()') IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'extensions'
        AND procedure.proname = 'uuid_generate_v4'
        AND procedure.pronargs = 0
    ) THEN
      RAISE EXCEPTION 'UUID_OSSP_FUNCTION_NOT_FOUND';
    END IF;

    EXECUTE $function$
      CREATE FUNCTION public.uuid_generate_v4()
      RETURNS uuid
      LANGUAGE sql
      VOLATILE
      SET search_path = ''
      AS 'SELECT extensions.uuid_generate_v4()'
    $function$;
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.uuid_generate_v4()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uuid_generate_v4()
  TO service_role;
