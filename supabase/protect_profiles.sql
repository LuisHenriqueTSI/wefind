-- Protege os dados pessoais da tabela profiles no próprio banco.
-- Depois deste arquivo:
--   * cada pessoa lê o próprio perfil completo pela função get_my_profile();
--   * o perfil de outra pessoa só mostra colunas públicas (nome, foto, cidade...);
--     e-mail, telefone, WhatsApp, localização salva (extra_fields) e token de push ficam fechados;
--   * ninguém consegue se promover a administrador editando o próprio perfil;
--   * o admin lista e muda cargos por funções que conferem se ele é admin.
-- Para desfazer, veja o bloco "DESFAZER" no fim do arquivo.

BEGIN;

-- 1. Função de administrador (usada pelas funções abaixo)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS me
    WHERE me.id = (auth.uid())::text
      AND (lower(COALESCE(me.role, '')) IN ('admin', 'superadmin')
           OR lower(COALESCE(me.adm::text, 'false')) = 'true')
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- 2. O próprio perfil, completo
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(p) FROM public.profiles AS p WHERE p.id = (auth.uid())::text;
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 3. Dados públicos de gamificação de qualquer perfil (sem localização nem dados dos pets)
CREATE OR REPLACE FUNCTION public.get_public_gamification_profile(p_user_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- to_jsonb evita erro caso a coluna extra_fields não exista nesta base.
  SELECT jsonb_build_object(
    'created_at', to_jsonb(p) -> 'created_at',
    'extra_fields', jsonb_strip_nulls(jsonb_build_object(
      'bonus_gamification_xp', to_jsonb(p) #> '{extra_fields,bonus_gamification_xp}',
      'shared_flyers_count', to_jsonb(p) #> '{extra_fields,shared_flyers_count}',
      'my_pets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', pet -> 'id'))
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(to_jsonb(p) #> '{extra_fields,my_pets}') = 'array'
               THEN to_jsonb(p) #> '{extra_fields,my_pets}' ELSE '[]'::jsonb END
        ) AS pet
      ), '[]'::jsonb)
    ))
  )
  FROM public.profiles AS p
  WHERE p.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.get_public_gamification_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_gamification_profile(text) TO anon, authenticated;

-- 4. Lista de usuários para a tela de admin
CREATE OR REPLACE FUNCTION public.admin_list_profiles(p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(p)
  FROM public.profiles AS p
  WHERE public.is_current_user_admin()
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR concat_ws(' ', p.name, p.email, p.city) ILIKE '%' || btrim(p_search) || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;
REVOKE ALL ON FUNCTION public.admin_list_profiles(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles(text, integer) TO authenticated;

-- 5. Mudar o cargo de alguém (só admin)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cargos.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'Cargo inválido.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles AS p
     SET role = p_role, adm = (p_role = 'admin')
   WHERE p.id = p_user_id
  RETURNING to_jsonb(p) INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_role(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(text, text) TO authenticated;

-- 6. Permissões por coluna
--    Só concede colunas que existem de fato na tabela (evita erro se alguma não existir).
REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_public_cols text[] := ARRAY['id','name','avatar_url','avatar_path','bio','city','state',
                                'neighborhood','created_at','role','adm','points','level'];
  v_update_cols text[] := ARRAY['name','email','city','state','neighborhood','bio','whatsapp','phone',
                                'instagram','facebook','whatsapp_notifications_enabled','avatar_path',
                                'avatar_url','points','level','extra_fields','expo_push_token',
                                'search_radius_km','updated_at'];
  v_insert_cols text[] := ARRAY['id','name','email','city','state','whatsapp','phone','points','level',
                                'avatar_url','avatar_path','extra_fields','created_at','updated_at'];
  v_existing text[];
  v_cols text;
BEGIN
  SELECT array_agg(column_name::text) INTO v_existing
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles';

  -- Remove também permissões antigas dadas coluna por coluna.
  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(v_existing) AS c;
  EXECUTE format('REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s) ON public.profiles FROM PUBLIC, anon, authenticated', v_cols);

  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(v_public_cols) AS c WHERE c = ANY (v_existing);
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', v_cols);

  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(v_update_cols) AS c WHERE c = ANY (v_existing);
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_cols);

  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(v_insert_cols) AS c WHERE c = ANY (v_existing);
  EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', v_cols);
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Para conferir quais colunas ficaram liberadas para leitura:
--   select column_name from information_schema.column_privileges
--   where table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'SELECT';

-- DESFAZER (só se algo der muito errado): rode as duas linhas abaixo.
--   GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
--   GRANT SELECT ON public.profiles TO anon;
