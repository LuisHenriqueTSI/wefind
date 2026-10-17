-- Corrige o erro PGRST204 ("Could not find the 'attempts' column of
-- 'signup_verifications'"), que impedia gerar o código de cadastro.
-- O código guarda apenas o hash (code_hash) e conta as tentativas erradas
-- (limite de 5), então as duas colunas precisam existir.
ALTER TABLE public.signup_verifications
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- A coluna antiga "code" (texto puro) deixa de ser obrigatória.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'signup_verifications' AND column_name = 'code'
  ) THEN
    EXECUTE 'ALTER TABLE public.signup_verifications ALTER COLUMN code DROP NOT NULL';
  END IF;
END $$;

-- Faz a API do Supabase enxergar as colunas novas na hora.
NOTIFY pgrst, 'reload schema';
