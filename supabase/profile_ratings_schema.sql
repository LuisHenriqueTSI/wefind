BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS neighborhood text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS adm boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL DEFAULT 'Membro WeFIND',
  reviewer_avatar text,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_ratings_no_self_rating CHECK (target_user_id <> reviewer_id),
  CONSTRAINT user_ratings_one_per_reviewer UNIQUE (target_user_id, reviewer_id)
);

ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_ratings_public_read" ON public.user_ratings;
CREATE POLICY "user_ratings_public_read"
  ON public.user_ratings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "user_ratings_insert_as_reviewer" ON public.user_ratings;
CREATE POLICY "user_ratings_insert_as_reviewer"
  ON public.user_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())::text
    AND reviewer_id <> target_user_id
  );

DROP POLICY IF EXISTS "user_ratings_delete_reviewer_or_admin" ON public.user_ratings;
CREATE POLICY "user_ratings_delete_reviewer_or_admin"
  ON public.user_ratings
  FOR DELETE
  TO authenticated
  USING (
    reviewer_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())::text
        AND (
          lower(COALESCE(p.role, '')) = 'admin'
          OR lower(COALESCE(p.adm::text, 'false')) = 'true'
        )
    )
  );

REVOKE ALL ON public.user_ratings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_ratings TO anon, authenticated;
GRANT INSERT, DELETE ON public.user_ratings TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
