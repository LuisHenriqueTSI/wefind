// Envia uma notificação push para outro usuário sem que o app precise ler o token dele.
// O token de push fica protegido no banco; só esta função (com a chave de serviço) o consulta.

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const getCorsHeaders = (request: Request) => {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const origin = request.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

const json = (body: Record<string, unknown>, status: number, request: Request) =>
  new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, request);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'server-configuration-error' }, 500, request);
  const baseUrl = supabaseUrl.replace(/\/$/, '');

  const authorization = request.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'unauthorized' }, 401, request);
  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anonKey } });
  if (!userResponse.ok) return json({ error: 'unauthorized' }, 401, request);

  try {
    const { targetUserId, title, body, data } = await request.json().catch(() => ({}));
    if (!targetUserId || !title || !body) return json({ error: 'missing-data' }, 400, request);

    const response = await fetch(
      `${baseUrl}/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(String(targetUserId))}`,
      { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
    );
    if (!response.ok) throw new Error(await response.text());
    const [profile] = await response.json();
    const token = profile?.expo_push_token || profile?.extra_fields?.expo_push_token;
    if (!token) return json({ sent: false, reason: 'no-token' }, 200, request);

    const push = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        to: token, title: String(title).slice(0, 120), body: String(body).slice(0, 500),
        data: data && typeof data === 'object' ? data : {},
        sound: 'default', priority: 'high', channelId: 'wefind-lost-pets',
      }]),
    });
    return json({ sent: push.ok }, 200, request);
  } catch (error) {
    console.error('[send-push] Erro:', error.message);
    return json({ error: 'failed' }, 500, request);
  }
});
