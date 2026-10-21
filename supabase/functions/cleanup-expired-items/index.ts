// Limpeza global de publicações vencidas (RF16).
// Apaga de vez as publicações que passaram dos 30 dias ativos + 30 dias de carência,
// de TODOS os usuários, junto com fotos, avistamentos, recompensas e notificações ligadas a elas.
// Pode ser chamada pelo app (usuário logado) ou por um agendamento diário (cabeçalho x-cron-secret).

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_DAYS = Number(Deno.env.get('ITEM_EXPIRATION_DAYS') ?? 30) || 30;
const PERMANENT_DELETE_DAYS = Number(Deno.env.get('ITEM_PERMANENT_DELETE_DAYS') ?? 30) || 30;
const BATCH_SIZE = 100;

const getCorsHeaders = (request: Request) => {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = request.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

const jsonResponse = (body: Record<string, unknown>, status: number, request: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
  });

type StoragePaths = Record<string, string[]>;

const addStorageUrl = (paths: StoragePaths, value: unknown) => {
  if (typeof value !== 'string' || !value) return;
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?#]+)\/([^?#]+)/);
  if (!match) return;
  try {
    const bucket = decodeURIComponent(match[1]);
    const path = decodeURIComponent(match[2]).replace(/^\/+/, '');
    if (!path) return;
    const list = paths[bucket] || [];
    if (!list.includes(path)) list.push(path);
    paths[bucket] = list;
  } catch (_error) {
    // URL malformada: ignora o arquivo, sem interromper a limpeza.
  }
};

const collectStorageUrls = (paths: StoragePaths, value: unknown) => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStorageUrls(paths, entry));
    return;
  }
  if (!value || typeof value !== 'object') {
    addStorageUrl(paths, value);
    return;
  }
  Object.values(value).forEach((entry) => collectStorageUrls(paths, entry));
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method-not-allowed' }, 405, request);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CLEANUP_CRON_SECRET') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[cleanup-expired-items] Configuração da função ausente.');
    return jsonResponse({ error: 'server-configuration-error' }, 500, request);
  }
  const baseUrl = supabaseUrl.replace(/\/$/, '');

  // Quem pode chamar: o agendamento (segredo) ou qualquer usuário logado.
  // A função só apaga o que já venceu de verdade, então chamar várias vezes não causa dano.
  const providedSecret = request.headers.get('x-cron-secret') ?? '';
  const calledByCron = cronSecret.length > 0 && providedSecret === cronSecret;
  if (!calledByCron) {
    const authorization = request.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return jsonResponse({ error: 'unauthorized' }, 401, request);
    }
    const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: anonKey },
    });
    if (!userResponse.ok) {
      return jsonResponse({ error: 'unauthorized' }, 401, request);
    }
  }

  const serviceHeaders = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
  };

  const rest = async (method: string, pathAndQuery: string, body?: unknown, optional = false) => {
    const response = await fetch(`${baseUrl}/rest/v1/${pathAndQuery}`, {
      method,
      headers: { ...serviceHeaders, Prefer: 'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      if (optional && response.status === 404 && text.includes('PGRST205')) return [];
      throw new Error(`${method} ${pathAndQuery.split('?')[0]}: ${response.status} ${text}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : [];
  };

  try {
    // Venceu de vez: passou dos 30 dias ativos + 30 de carência.
    // A renovação do app atualiza created_at, então ele marca o início do prazo.
    const now = Date.now();
    const createdCutoff = new Date(now - (EXPIRATION_DAYS + PERMANENT_DELETE_DAYS) * DAY_MS).toISOString();
    const filter = `created_at=lte.${createdCutoff}`;

    const items = await rest('GET', `items?select=*&${filter}&order=created_at.asc&limit=${BATCH_SIZE}`) as Record<string, unknown>[];
    if (!items.length) {
      return jsonResponse({ removed: 0, ids: [] }, 200, request);
    }

    const removedIds: (string | number)[] = [];
    const failed: { id: unknown; error: string }[] = [];

    for (const item of items) {
      const itemId = item.id as string | number;
      try {
        const [photos, sightings] = await Promise.all([
          rest('GET', `item_photos?select=*&item_id=eq.${itemId}`, undefined, true),
          rest('GET', `sightings?select=*&item_id=eq.${itemId}`, undefined, true),
        ]);

        // Arquivos no Storage: fotos da publicação e dos avistamentos.
        const storagePaths: StoragePaths = {};
        collectStorageUrls(storagePaths, item);
        collectStorageUrls(storagePaths, photos);
        collectStorageUrls(storagePaths, sightings);
        for (const [bucket, paths] of Object.entries(storagePaths)) {
          for (let offset = 0; offset < paths.length; offset += 100) {
            const storageResponse = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
              method: 'DELETE',
              headers: serviceHeaders,
              body: JSON.stringify({ prefixes: paths.slice(offset, offset + 100) }),
            });
            if (!storageResponse.ok) {
              throw new Error(`storage ${bucket}: ${await storageResponse.text()}`);
            }
          }
        }

        // Mesma ordem de exclusão usada pelo app (deleteItem). As mensagens do chat são mantidas.
        await rest('DELETE', `item_photos?item_id=eq.${itemId}`, undefined, true);
        await rest('DELETE', `sightings?item_id=eq.${itemId}`, undefined, true);
        await rest('DELETE', `rewards?item_id=eq.${itemId}`, undefined, true);
        await rest('DELETE', `notifications?item_id=eq.${itemId}`, undefined, true);
        await rest('DELETE', `items?id=eq.${itemId}`);

        // Avisa o autor (sem item_id, porque a publicação não existe mais).
        if (item.owner_id) {
          await rest('POST', 'notifications', {
            user_id: item.owner_id,
            type: 'item_removed',
            title: 'Sua publicação foi removida',
            message: `Sua publicação "${(item.title as string) || 'sem título'}" expirou e foi removida automaticamente do sistema para manter o feed organizado.`,
            read: false,
            item_id: null,
            created_at: new Date().toISOString(),
          }, true);
        }

        removedIds.push(itemId);
      } catch (error) {
        console.error('[cleanup-expired-items] Falha ao remover', itemId, error.message);
        failed.push({ id: itemId, error: error.message });
      }
    }

    console.log('[cleanup-expired-items] Removidas:', removedIds.length, 'Falhas:', failed.length);
    return jsonResponse({ removed: removedIds.length, ids: removedIds, failed }, 200, request);
  } catch (error) {
    console.error('[cleanup-expired-items] Erro geral:', error.message);
    return jsonResponse({ error: 'cleanup-failed', message: error.message }, 500, request);
  }
});
