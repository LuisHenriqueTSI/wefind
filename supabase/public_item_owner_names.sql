CREATE OR REPLACE FUNCTION public.get_public_item_owner_names(p_item_ids integer[])
RETURNS TABLE (
  item_id integer,
  owner_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    i.id,
    CASE
      WHEN lower(COALESCE(i.extra_fields #>> '{help_network,anonymous}', 'false'))
        IN ('true', '1', 'yes', 'sim')
        THEN 'Relato anônimo da comunidade'
      ELSE COALESCE(NULLIF(BTRIM(p.name), ''), 'Tutor')
    END
  FROM public.items AS i
  LEFT JOIN public.profiles AS p ON p.id = i.owner_id
  WHERE i.id = ANY(COALESCE(p_item_ids, ARRAY[]::integer[]))
    AND i.resolved IS FALSE;
$function$;

REVOKE ALL ON FUNCTION public.get_public_item_owner_names(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_item_owner_names(integer[]) TO anon, authenticated;
