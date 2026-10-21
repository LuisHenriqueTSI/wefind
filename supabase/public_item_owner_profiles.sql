-- Nome e foto públicos de quem publicou (usado quando o visitante não está logado).
-- Relatos anônimos continuam sem nome real e sem foto.
-- Rode este arquivo no SQL Editor do Supabase.
CREATE OR REPLACE FUNCTION public.get_public_item_owner_profiles(p_item_ids integer[])
RETURNS TABLE (
  item_id integer,
  owner_name text,
  owner_avatar_url text
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
    END,
    CASE
      WHEN lower(COALESCE(i.extra_fields #>> '{help_network,anonymous}', 'false'))
        IN ('true', '1', 'yes', 'sim')
        THEN NULL
      ELSE NULLIF(BTRIM(p.avatar_url), '')
    END
  FROM public.items AS i
  LEFT JOIN public.profiles AS p ON p.id = i.owner_id
  WHERE i.id = ANY(COALESCE(p_item_ids, ARRAY[]::integer[]))
    AND i.resolved IS FALSE;
$function$;

REVOKE ALL ON FUNCTION public.get_public_item_owner_profiles(integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_item_owner_profiles(integer[]) TO anon, authenticated;
