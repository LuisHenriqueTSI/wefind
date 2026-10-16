-- WhatsApp do autor para o cartaz de divulgação.
-- O número só é devolvido quando o próprio autor autorizou (extra_fields.share_phone_on_flyer)
-- ou quando quem pede é o autor. Assim o app não precisa carregar o contato
-- de todos os donos junto com o mural.
CREATE OR REPLACE FUNCTION public.get_flyer_contact(p_item_id integer)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(NULLIF(p.whatsapp, ''), NULLIF(p.phone, ''))
  FROM public.items i
  JOIN public.profiles p ON p.id = i.owner_id
  WHERE i.id = p_item_id
    AND (
      COALESCE((i.extra_fields ->> 'share_phone_on_flyer')::boolean, false)
      OR i.owner_id = auth.uid()
    );
$function$;

REVOKE ALL ON FUNCTION public.get_flyer_contact(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_flyer_contact(integer) TO authenticated;
