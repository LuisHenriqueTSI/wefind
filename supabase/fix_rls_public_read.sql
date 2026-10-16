BEGIN;

-- The invoker view required relation-level SELECT on items and still failed
-- with column-only grants. Remove it and expose a fixed, explicit projection
-- through a narrowly scoped RPC instead.
DROP POLICY IF EXISTS "Limitar fotos publicas a anuncios ativos" ON public.item_photos;
DROP POLICY IF EXISTS "Limitar recompensas publicas a anuncios ativos" ON public.rewards;
DROP VIEW IF EXISTS public.public_feed_items;
ALTER TABLE public.items DROP COLUMN IF EXISTS public_extra_fields;

CREATE OR REPLACE FUNCTION public.get_public_feed_items(
  p_item_id integer DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_species text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_search_term text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'id', i.id,
    'title', i.title,
    'description', i.description,
    'category', i.category,
    'item_type', i.item_type,
    'status', i.status,
    'state', i.state,
    'city', i.city,
    'neighborhood', i.neighborhood,
    'latitude', CASE WHEN i.latitude IS NULL THEN NULL ELSE round(i.latitude::numeric, 2)::double precision END,
    'longitude', CASE WHEN i.longitude IS NULL THEN NULL ELSE round(i.longitude::numeric, 2)::double precision END,
    'date', i.date,
    'species', i.species,
    'breed', i.breed,
    'size', i.size,
    'age', i.age,
    'collar', i.collar,
    'animal_name', i.animal_name,
    'brand', i.brand,
    'color', i.color,
    'extra_fields', jsonb_strip_nulls(jsonb_build_object(
      'brand', i.extra_fields -> 'brand',
      'color', i.extra_fields -> 'color',
      'species', i.extra_fields -> 'species',
      'gender', i.extra_fields -> 'gender',
      'breed', i.extra_fields -> 'breed',
      'size', i.extra_fields -> 'size',
      'age', i.extra_fields -> 'age',
      'collar', i.extra_fields -> 'collar',
      'neutered', i.extra_fields -> 'neutered',
      'has_collar', i.extra_fields -> 'has_collar',
      'castrated', i.extra_fields -> 'castrated',
      'is_neutered', i.extra_fields -> 'is_neutered',
      'temperament', i.extra_fields -> 'temperament',
      'is_direct_adoption', i.extra_fields -> 'is_direct_adoption',
      'found_custody', i.extra_fields -> 'found_custody',
      'available_for_adoption', i.extra_fields -> 'available_for_adoption',
      'recovery_search', jsonb_strip_nulls(jsonb_build_object(
        'started_at', i.extra_fields #> '{recovery_search,started_at}',
        'minimum_days', i.extra_fields #> '{recovery_search,minimum_days}',
        'status', i.extra_fields #> '{recovery_search,status}'
      )),
      'help_network', jsonb_strip_nulls(jsonb_build_object(
        'needs', i.extra_fields #> '{help_network,needs}',
        'anonymous', i.extra_fields #> '{help_network,anonymous}'
      ))
    )),
    'resolved', i.resolved,
    'created_at', i.created_at
  )
  FROM public.items AS i
  WHERE i.resolved IS FALSE
    AND (p_item_id IS NULL OR i.id = p_item_id)
    AND (p_category IS NULL OR i.category = p_category)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_species IS NULL OR i.species ILIKE '%' || p_species || '%')
    AND (p_state IS NULL OR i.state = p_state)
    AND (p_city IS NULL OR i.city = p_city)
    AND (p_neighborhood IS NULL OR i.neighborhood = p_neighborhood)
    AND (
      p_search_term IS NULL
      OR concat_ws(' ', i.title, i.description, i.city, i.state, i.neighborhood, i.species)
        ILIKE '%' || p_search_term || '%'
    )
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$function$;

CREATE OR REPLACE FUNCTION public.is_public_feed_item(p_item_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.items AS i
    WHERE i.id = p_item_id
      AND i.resolved IS FALSE
  );
$function$;

REVOKE ALL ON FUNCTION public.get_public_feed_items(integer, text, text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_feed_items(integer, text, text, text, text, text, text, text, integer) TO anon;
REVOKE ALL ON FUNCTION public.is_public_feed_item(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_feed_item(integer) TO anon;

-- Anonymous clients get no direct privileges on the full items table.
REVOKE ALL ON TABLE public.items FROM PUBLIC, anon;
REVOKE SELECT (
  id, title, description, category, latitude, longitude, owner_id, created_at,
  item_type, status, state, city, neighborhood, date, species, breed, size, age,
  collar, microchip, animal_name, brand, color, serial_number, resolved, updated_at,
  street, house_number, postal_code, address, extra_fields
) ON TABLE public.items FROM PUBLIC, anon;

-- Related public data is readable only for currently active public items.
REVOKE ALL ON TABLE public.item_photos FROM anon;
GRANT SELECT (id, item_id, url) ON TABLE public.item_photos TO anon;
ALTER TABLE public.item_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Limitar fotos publicas a anuncios ativos"
  ON public.item_photos
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (public.is_public_feed_item(item_id));

REVOKE ALL ON TABLE public.rewards FROM anon;
GRANT SELECT (id, item_id, amount, currency, status, description) ON TABLE public.rewards TO anon;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Limitar recompensas publicas a anuncios ativos"
  ON public.rewards
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (public.is_public_feed_item(item_id));

COMMIT;
