-- Colunas usadas pela função create-user (código salvo como hash + limite de
-- 5 tentativas). Sem elas o cadastro falha com:
--   PGRST204 "Could not find the 'attempts' column of 'signup_verifications'"
ALTER TABLE public.signup_verifications
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Com o hash, o código em texto puro deixa de ser gravado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'signup_verifications'
      AND column_name = 'code' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.signup_verifications ALTER COLUMN code DROP NOT NULL;
  END IF;
END $$;

-- Atualiza o cache de esquema da API para enxergar as colunas novas
NOTIFY pgrst, 'reload schema';
