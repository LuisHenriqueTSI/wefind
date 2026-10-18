-- Return only the map-history fields and coarse coordinates; never expose contact_info.
DROP FUNCTION IF EXISTS public.get_public_item_sighting_history(integer);

CREATE OR REPLACE FUNCTION public.get_public_item_sighting_history(p_item_id integer)
RETURNS TABLE (
  sighting_id text,
  created_at timestamptz,
  user_name text,
  latitude double precision,
  longitude double precision,
  animal_place text,
  location_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    s.id::text,
    s.created_at,
    COALESCE(NULLIF(BTRIM(p.name), ''), 'Membro da Comunidade'),
    CASE
      WHEN s.created_at >= now() - interval '7 days'
        AND coords.latitude_text ~ '^-?[0-9]+([.][0-9]+)?$' THEN
        CASE
          WHEN coords.latitude_text::numeric BETWEEN -90 AND 90 THEN
            ROUND(
              coords.latitude_text::numeric,
              CASE WHEN s.contact_info ->> 'animal_place' = 'private' THEN 2 ELSE 4 END
            )::double precision
        END
    END,
    CASE
      WHEN s.created_at >= now() - interval '7 days'
        AND coords.longitude_text ~ '^-?[0-9]+([.][0-9]+)?$' THEN
        CASE
          WHEN coords.longitude_text::numeric BETWEEN -180 AND 180 THEN
            ROUND(
              coords.longitude_text::numeric,
              CASE WHEN s.contact_info ->> 'animal_place' = 'private' THEN 2 ELSE 4 END
            )::double precision
        END
    END,
    CASE WHEN s.contact_info ->> 'animal_place' = 'private' THEN 'private' ELSE 'street' END,
    CASE
      WHEN s.contact_info ->> 'animal_place' = 'private' THEN
        COALESCE(
          NULLIF(BTRIM(CONCAT_WS(' - ', coords.city, coords.state)), ''),
          'Local aproximado'
        )
      ELSE
        COALESCE(
          NULLIF(BTRIM(CONCAT_WS(' - ', coords.district, coords.city, coords.state)), ''),
          NULLIF(BTRIM(CONCAT_WS(' - ', i.neighborhood, i.city, i.state)), ''),
          'Localidade não informada'
        )
    END
  FROM public.sightings AS s
  JOIN public.items AS i ON i.id = s.item_id
  LEFT JOIN public.profiles AS p ON p.id = s.user_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(
        s.contact_info #>> '{coordinate,latitude}',
        s.contact_info #>> '{location_details,latitude}'
      ) AS latitude_text,
      COALESCE(
        s.contact_info #>> '{coordinate,longitude}',
        s.contact_info #>> '{location_details,longitude}'
      ) AS longitude_text,
      NULLIF(BTRIM(s.contact_info #>> '{location_details,district}'), '') AS district,
      NULLIF(BTRIM(s.contact_info #>> '{location_details,city}'), '') AS city,
      NULLIF(BTRIM(s.contact_info #>> '{location_details,state}'), '') AS state
  ) AS coords
  WHERE s.item_id = p_item_id
    AND s.description IS DISTINCT FROM '[DELETED_BY_ADMIN]'
    AND i.resolved IS FALSE
    AND (
      i.status = 'lost'
      OR (
        i.status = 'found'
        AND i.extra_fields ->> 'found_custody' = 'spotted'
      )
    )
  ORDER BY s.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_public_item_sighting_history(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_item_sighting_history(integer) TO anon, authenticated;
