SELECT cron.unschedule('gerar-preventivas-diario');

SELECT cron.schedule(
  'gerar-preventivas-diario',
  '0 11 * * *',
  $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/gerar-preventivas',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
        ),
        body := jsonb_build_object('time', now())
      ) as request_id;
  $$
);