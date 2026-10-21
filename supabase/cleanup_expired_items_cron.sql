-- Agenda a limpeza global de publicações vencidas para rodar todo dia, às 3h (horário de Brasília),
-- mesmo que ninguém abra o aplicativo.
-- Antes de rodar:
--   1. Publique a função:  supabase functions deploy cleanup-expired-items
--   2. Crie o segredo da função:  supabase secrets set CLEANUP_CRON_SECRET=<um-texto-longo-e-aleatorio>
--   3. Troque abaixo youlbpxrvzgjzvhbisbn e <O_MESMO_SEGREDO> e rode este arquivo no SQL Editor do Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda o segredo no Vault, para ele não ficar escrito no agendamento.
select vault.create_secret('<O_MESMO_SEGREDO>', 'cleanup_cron_secret');

-- Remove um agendamento antigo com o mesmo nome, se existir.
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-expired-items-daily';

-- 06:00 UTC = 03:00 em Brasília.
select cron.schedule(
  'cleanup-expired-items-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://youlbpxrvzgjzvhbisbn.supabase.co/functions/v1/cleanup-expired-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para conferir:      select * from cron.job;
-- Para ver execuções: select * from cron.job_run_details order by start_time desc limit 10;
