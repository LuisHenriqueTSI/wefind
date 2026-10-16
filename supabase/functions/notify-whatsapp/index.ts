const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? '';
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'wefind';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '';

function normalizeWhatsAppNumber(phone: string | undefined | null) {
  if (!phone) return null;

  const cleaned = String(phone).trim();
  if (!cleaned) return null;

  const digitsOnly = cleaned.replace(/\D/g, '');
  if (!digitsOnly) return null;

  if (cleaned.startsWith('+')) {
    const withoutPlus = digitsOnly;
    if (withoutPlus.startsWith('55')) {
      return `+${withoutPlus}`;
    }
    if (withoutPlus.length === 11) {
      return `+55${withoutPlus}`;
    }
    return `+${withoutPlus}`;
  }

  if (digitsOnly.startsWith('00')) {
    const withoutCountryCode = digitsOnly.slice(2);
    return `+${withoutCountryCode}`;
  }

  if (digitsOnly.startsWith('55')) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.length === 11) {
    return `+55${digitsOnly}`;
  }

  if (digitsOnly.length === 10) {
    return `+55${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

async function sendViaEvolutionApi(phone: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, reason: 'missing-evolution-env' };
  }

  const rawDigits = phone.replace(/\D/g, '');
  const url = `${EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${EVOLUTION_INSTANCE}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: rawDigits,
      text,
    }),
  });

  await response.text();
  return { ok: response.ok, status: response.status };
}

async function sendViaTwilio(phone: string, text: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    return { ok: false, reason: 'missing-twilio-env' };
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
      Body: text,
    }).toString(),
  });

  await response.text();
  return { ok: response.ok, status: response.status };
}

async function requireAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

function corsHeaders(req: Request) {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    // Suporte a redirecionamento Web / Deep Link para abrir o App ao clicar no link do WhatsApp
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const itemId = url.searchParams.get('item') || url.searchParams.get('id') || '';
      const deepLink = itemId ? `wefind://item/${itemId}` : 'wefind://';

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐾 Abrindo WeFIND...</title>
  <script>
    window.location.href = "${deepLink}";
    setTimeout(function() {
      var btn = document.getElementById('manual-btn');
      if (btn) btn.style.display = 'inline-block';
    }, 1000);
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F8FAFC; color: #0F172A; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center; }
    .card { background: #FFFFFF; border-radius: 24px; padding: 36px 24px; max-width: 400px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #E2E8F0; }
    .logo { width: 64px; height: 64px; border-radius: 20px; background: #EFF6FF; display: inline-flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: #0F172A; }
    p { font-size: 14px; color: #64748B; line-height: 1.5; margin-bottom: 24px; }
    .btn { display: none; background: #2563EB; color: #FFFFFF; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-size: 15px; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🐾</div>
    <h1>Abrindo no WeFIND</h1>
    <p>Redirecionando para a publicação do pet no seu aplicativo...</p>
    <a id="manual-btn" href="${deepLink}" class="btn">Toque para Abrir no App</a>
  </div>
</body>
</html>`;

      const headers = new Headers();
      headers.set('Content-Type', 'text/html; charset=utf-8');
      Object.entries(corsHeaders(req)).forEach(([key, value]) => headers.set(key, value));

      return new Response(html, {
        status: 200,
        headers,
      });
    }

    const user = await requireAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ ok: false, reason: 'authentication-required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    const body = await req.json();
    const { phone, userId, title, message, type } = body ?? {};

    // Avisos do sistema chegam com o id do destinatário, não com o telefone.
    // O número e a autorização são lidos aqui, no servidor, com a chave de serviço,
    // para que o aparelho de quem dispara o aviso nunca receba o telefone de outra pessoa.
    let targetPhone = phone;
    if (userId) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('whatsapp, phone, whatsapp_notifications_enabled')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        return new Response(JSON.stringify({ ok: false, reason: 'profile-error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      if (profile?.whatsapp_notifications_enabled === false) {
        return new Response(JSON.stringify({ ok: false, reason: 'user-opted-out' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      targetPhone = profile?.whatsapp || profile?.phone || null;
      // Mesmo ajuste feito pelo app antes de chamar a função: celulares brasileiros
      // são enviados à Evolution API sem o nono dígito.
      const digits = normalizeWhatsAppNumber(targetPhone)?.replace(/\D/g, '') ?? '';
      if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
        targetPhone = `${digits.slice(0, 4)}${digits.slice(5)}`;
      }
      if (!targetPhone) {
        return new Response(JSON.stringify({ ok: false, reason: 'missing-whatsapp' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
    }

    const normalizedPhone = normalizeWhatsAppNumber(targetPhone);

    if (!normalizedPhone || !message) {
      return new Response(JSON.stringify({ ok: false, reason: 'missing-params' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    const text = `${title ? `*${title}*\n\n` : ''}${message}`;

    // 1. Tenta enviar via Evolution API (100% gratuito e sem restrição Sandbox)
    if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const evoResult = await sendViaEvolutionApi(normalizedPhone, text);
      if (evoResult.ok) {
        return new Response(JSON.stringify({ ok: true, provider: 'evolution' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      console.warn('[notify-whatsapp] Evolution API falhou, tentando fallback Twilio...');
    }

    // 2. Fallback via Twilio
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const twilioResult = await sendViaTwilio(normalizedPhone, text);
      if (twilioResult.ok) {
        return new Response(JSON.stringify({ ok: true, provider: 'twilio' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      return new Response(JSON.stringify({ ok: false, provider: 'twilio' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    return new Response(JSON.stringify({ ok: false, reason: 'no-whatsapp-provider-configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'notification-provider-error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
