// Avisos de proximidade calculados no servidor.
// O app só informa o id da publicação de animal perdido. A função busca a localização
// dos usuários no banco (com a chave de serviço), escolhe quem está a até 15 km
// (ou na mesma cidade, se a pessoa não tiver coordenadas) e envia os avisos.
// Assim, a localização dos outros usuários nunca chega ao celular de quem publicou.

const MAX_ALERT_RADIUS_KM = 15;
const MAX_ITEM_AGE_MS = 24 * 60 * 60 * 1000; // só avisa publicações recentes
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

const toNumber = (value: unknown) => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || Number.isNaN(n) ? null : n;
};

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

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
  const caller = await userResponse.json();
  const callerId = caller?.id as string | undefined;
  if (!callerId) return json({ error: 'unauthorized' }, 401, request);

  const serviceHeaders = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey, 'Content-Type': 'application/json' };
  const rest = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      method,
      headers: { ...serviceHeaders, Prefer: 'return=minimal' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : [];
  };

  try {
    const { itemId } = await request.json().catch(() => ({}));
    if (!itemId) return json({ error: 'missing-item' }, 400, request);

    const [item] = await rest('GET', `items?select=*&id=eq.${encodeURIComponent(String(itemId))}`) as Record<string, any>[];
    if (!item) return json({ error: 'item-not-found' }, 404, request);
    if (item.owner_id !== callerId) return json({ error: 'forbidden' }, 403, request);
    if (item.status !== 'lost') return json({ notifiedCount: 0, reason: 'not-lost' }, 200, request);
    if (Date.now() - new Date(item.created_at).getTime() > MAX_ITEM_AGE_MS) {
      return json({ notifiedCount: 0, reason: 'too-old' }, 200, request);
    }

    // Evita avisar duas vezes a mesma publicação.
    const already = await rest('GET', `notifications?select=id&type=eq.nearby_lost_pet&item_id=eq.${item.id}&limit=1`) as unknown[];
    if (already.length > 0) return json({ notifiedCount: 0, reason: 'already-sent' }, 200, request);

    const petLat = toNumber(item.latitude ?? item.extra_fields?.location_details?.latitude);
    const petLng = toNumber(item.longitude ?? item.extra_fields?.location_details?.longitude);
    const petCity = normalize(item.city || item.extra_fields?.location_details?.city);
    const petDistrict = item.neighborhood || item.extra_fields?.location_details?.district || '';

    const profiles = await rest('GET', `profiles?select=*&id=neq.${callerId}`) as Record<string, any>[];
    const targets = profiles.filter((profile) => {
      const lat = toNumber(profile.extra_fields?.coords?.latitude ?? profile.extra_fields?.latitude);
      const lng = toNumber(profile.extra_fields?.coords?.longitude ?? profile.extra_fields?.longitude);
      if (petLat !== null && petLng !== null && lat !== null && lng !== null) {
        return distanceKm(petLat, petLng, lat, lng) <= MAX_ALERT_RADIUS_KM;
      }
      return Boolean(petCity) && normalize(profile.city) === petCity;
    });

    if (targets.length === 0) return json({ notifiedCount: 0 }, 200, request);

    const species = normalize(item.species);
    const speciesLabel = ['dog', 'cachorro', 'cão'].includes(species) ? 'Cão' : (['cat', 'gato'].includes(species) ? 'Gato' : (item.species || 'Pet'));
    const breedText = item.breed || item.extra_fields?.breed || '';
    const identification = [item.title ? `"${item.title}"` : '', breedText ? `(${breedText})` : ''].filter(Boolean).join(' ') || speciesLabel;
    const locationHint = petDistrict ? `no Bairro ${petDistrict}` : (item.city ? `em ${item.city}` : 'na sua região');
    const title = `${speciesLabel} perdido perto de você`;
    const message = `${speciesLabel} ${identification} perdido ${locationHint}. Abra o WeFIND para ver as fotos e os detalhes.`;
    const now = new Date().toISOString();

    // 1. Avisos dentro do app
    await rest('POST', 'notifications', targets.map((t) => ({
      user_id: t.id, title, message, type: 'nearby_lost_pet', read: false, item_id: item.id, created_at: now,
    })));

    // 2. Push do Expo (em lotes de 100)
    const tokens = targets.map((t) => t.expo_push_token || t.extra_fields?.expo_push_token).filter(Boolean);
    for (let i = 0; i < tokens.length; i += 100) {
      const messages = tokens.slice(i, i + 100).map((to) => ({
        to, title, body: message, sound: 'default', priority: 'high', channelId: 'wefind-lost-pets',
        data: { itemId: item.id, type: 'nearby_lost_pet', screen: 'ItemDetail' },
      }));
      await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      }).catch((error) => console.warn('[notify-nearby-lost-pet] Falha no push:', error.message));
    }

    // 3. WhatsApp, pela função já existente (ela respeita a opção de cada usuário)
    await Promise.allSettled(targets.map((t) => fetch(`${baseUrl}/functions/v1/notify-whatsapp`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: t.id, title, message, type: 'nearby_lost_pet' }),
    })));

    return json({ notifiedCount: targets.length }, 200, request);
  } catch (error) {
    console.error('[notify-nearby-lost-pet] Erro:', error.message);
    return json({ error: 'failed', message: error.message }, 500, request);
  }
});
