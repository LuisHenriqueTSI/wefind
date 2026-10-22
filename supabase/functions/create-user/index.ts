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

function createSixDigitCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

async function hashVerificationCode(code: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function getRestHeaders(serviceRoleKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

async function storeVerificationCode(supabaseUrl: string, serviceRoleKey: string, email: string, code: string, whatsapp: string, hashCode = true) {
  const codeHash = hashCode ? await hashVerificationCode(code) : '';

  // Substitui o código anterior deste e-mail: apaga e grava de novo.
  // (O cabeçalho "On-Conflict" não é reconhecido pelo Supabase, então o
  // "upsert" antigo esbarrava no código que já existia.)
  await deleteVerificationCode(supabaseUrl, serviceRoleKey, email);

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/signup_verifications`, {
    method: 'POST',
    headers: {
      ...getRestHeaders(serviceRoleKey),
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([
      {
        email,
        ...(hashCode ? { code_hash: codeHash, attempts: 0 } : { code }),
        whatsapp,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    ]),
  });

  const bodyText = await response.text();
  return { ok: response.ok, status: response.status, body: bodyText };
}

async function fetchVerificationCode(supabaseUrl: string, serviceRoleKey: string, email: string) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/signup_verifications?select=code,code_hash,attempts,created_at,expires_at&email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getRestHeaders(serviceRoleKey),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, body: bodyText, record: null };
  }

  try {
    const parsed = JSON.parse(bodyText);
    const record = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
    return { ok: true, status: response.status, body: bodyText, record };
  } catch {
    return { ok: false, status: response.status, body: bodyText, record: null };
  }
}

async function deleteVerificationCode(supabaseUrl: string, serviceRoleKey: string, email: string) {
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/signup_verifications?email=eq.${encodeURIComponent(email)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: getRestHeaders(serviceRoleKey),
  });

  const bodyText = await response.text();
  return { ok: response.ok, status: response.status, body: bodyText };
}

async function incrementVerificationAttempts(supabaseUrl: string, serviceRoleKey: string, email: string, attempts: number) {
  await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/signup_verifications?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: { ...getRestHeaders(serviceRoleKey), Prefer: 'return=minimal' },
    body: JSON.stringify({ attempts }),
  });
}

async function dispatchVerificationCode(phone: string, code: string) {
  const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'https://wefind-whatsapp-api.onrender.com';
  const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
  const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'wefind';

  const normalizedPhone = normalizeWhatsAppNumber(phone);
  const rawDigits = normalizedPhone ? normalizedPhone.replace(/\D/g, '') : phone.replace(/\D/g, '');

  if (!EVOLUTION_API_KEY) return { ok: false, reason: 'missing-evolution-api-key' };

  try {
    const evoUrl = `${EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${EVOLUTION_INSTANCE}`;
    const evoResponse = await fetch(evoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: rawDigits,
        text: `*Código de confirmação WeFIND*\n\nSeu código de verificação é:\n\n*${code}*\n\nInforme este código no aplicativo para concluir o seu cadastro.`,
      }),
    });

    const evoBody = await evoResponse.text();
    if (evoResponse.ok) {
      return { ok: true, status: evoResponse.status };
    }
  } catch (evoErr) {
    console.warn('[create-user] Falha ao enviar direto via Evolution API:', evoErr);
  }

  return { ok: false, reason: 'failed-all-senders' };
}

// Envia um texto pela Evolution API. Para celulares brasileiros, tenta com e sem o nono dígito,
// porque contas antigas do WhatsApp podem estar registradas sem ele.
async function sendEvolutionText(phone: string, text: string) {
  const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'https://wefind-whatsapp-api.onrender.com';
  const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
  const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'wefind';
  if (!EVOLUTION_API_KEY) return { ok: false, reason: 'missing-evolution-api-key' };

  const digits = (normalizeWhatsAppNumber(phone) ?? phone).replace(/\D/g, '');
  const candidates = [digits];
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') candidates.push(`${digits.slice(0, 4)}${digits.slice(5)}`);
  if (digits.startsWith('55') && digits.length === 12) candidates.push(`${digits.slice(0, 4)}9${digits.slice(4)}`);

  const url = `${EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${EVOLUTION_INSTANCE}`;
  for (const number of candidates) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number, text }),
      });
      const responseText = await response.text();
      if (response.ok) return { ok: true, status: response.status };
      console.warn(`[create-user] Evolution respondeu ${response.status} para ${number.slice(0, 4)}***: ${responseText.slice(0, 300)}`);
    } catch (error) {
      console.warn('[create-user] Não foi possível chegar na Evolution API:', error.message);
      return { ok: false, reason: 'evolution-unreachable' };
    }
  }
  return { ok: false, reason: 'evolution-rejected' };
}

// Roda uma tarefa depois de responder ao app (o envio do WhatsApp pode demorar
// quando o Render está acordando). Sem suporte, roda normalmente.
function runInBackground(task: Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return true;
  }
  return false;
}

async function getAuthenticatedUserId(req: Request, supabaseUrl: string) {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

function jsonResponse(payload: unknown, status = 200, request?: Request) {
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const requestOrigin = request?.headers.get('origin') ?? '';
  const allowOrigin = configuredOrigins.includes(requestOrigin) ? requestOrigin : configuredOrigins[0] ?? 'null';
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization, apikey',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true }, 200, req);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method-not-allowed' }, 405, req);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid-json' }, 400);
  }

  const action = String(body.action ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  const city = String(body.city ?? '').trim();
  const state = String(body.state ?? '').trim();
  const whatsapp = normalizeWhatsAppNumber(String(body.whatsapp ?? ''));
  const verificationCode = String(body.verificationCode ?? '');

  if (action === 'send-verification') {
    if (!email || !password || !name || !whatsapp) {
      return jsonResponse({ ok: false, error: 'missing-fields' }, 400);
    }

    const code = createSixDigitCode();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing-service-role-key' }, 500);
    }

    const previous = await fetchVerificationCode(supabaseUrl, serviceRoleKey, email);
    const previousCreatedAt = previous.record?.created_at ? new Date(String(previous.record.created_at)).getTime() : 0;
    if (previousCreatedAt && Date.now() - previousCreatedAt < 60_000) {
      return jsonResponse({ ok: false, error: 'verification-rate-limited' }, 429);
    }

    const storeResult = await storeVerificationCode(supabaseUrl, serviceRoleKey, email, code, whatsapp);
    if (!storeResult.ok) {
      return jsonResponse({ ok: false, error: 'failed-to-store-verification-code', details: storeResult.body }, 500);
    }

    const whatsappResult = await dispatchVerificationCode(whatsapp, code);
    return jsonResponse({
      ok: true,
      pendingVerification: true,
      phone: whatsapp,
      whatsappSent: whatsappResult.ok,
      whatsappStatus: whatsappResult.status,
    });
  }

  if (action === 'create-user') {
    if (!email || !password || !name || !whatsapp || !verificationCode) {
      return jsonResponse({ ok: false, error: 'missing-fields' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing-service-role-key' }, 500);
    }

    const fetchResult = await fetchVerificationCode(supabaseUrl, serviceRoleKey, email);
    if (!fetchResult.ok || !fetchResult.record) {
      return jsonResponse({ ok: false, error: 'invalid-verification-code', details: 'code-not-found' }, 400);
    }

    const { code_hash: storedCodeHash, expires_at: expiresAt, attempts: attemptsRaw } = fetchResult.record as { code_hash?: string; expires_at?: string; attempts?: number };
    const attempts = Number(attemptsRaw) || 0;
    const enteredCode = String(verificationCode).trim();

    if (attempts >= 5) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, email);
      return jsonResponse({ ok: false, error: 'verification-attempts-exceeded' }, 429);
    }

    const enteredCodeHash = await hashVerificationCode(enteredCode);
    if (!storedCodeHash || !safeEqual(storedCodeHash, enteredCodeHash)) {
      await incrementVerificationAttempts(supabaseUrl, serviceRoleKey, email, attempts + 1);
      return jsonResponse({ ok: false, error: 'invalid-verification-code' }, 400);
    }

    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return jsonResponse({ ok: false, error: 'verification-code-expired' }, 400);
    }

    const whatsappNotificationsEnabled = body.whatsapp_notifications_enabled !== false;

    const adminResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          city,
          state,
          whatsapp,
          phone: whatsapp,
          whatsapp_notifications_enabled: whatsappNotificationsEnabled,
        },
      }),
    });

    const adminBodyText = await adminResponse.text();
    let adminPayload: Record<string, unknown> = {};
    try {
      adminPayload = JSON.parse(adminBodyText);
    } catch {
      adminPayload = { raw: adminBodyText };
    }

    if (!adminResponse.ok) {
      // O Auth do Supabase explica o motivo em `msg` e `error_code`
      const errorCode = String(adminPayload.error_code ?? adminPayload.code ?? '');
      const reason = String(adminPayload.msg ?? adminPayload.message ?? (adminPayload.error as { message?: string })?.message ?? adminPayload.error ?? adminPayload.raw ?? '');
      console.error('[create-user] Auth recusou o cadastro:', adminResponse.status, errorCode, reason);
      const isEmailTaken = errorCode === 'email_exists' || errorCode === 'user_already_exists' || /already (been )?registered|already exists/i.test(reason);
      // O código continua válido para uma nova tentativa (não é apagado aqui)
      return jsonResponse({
        ok: false,
        error: isEmailTaken ? 'email-already-registered' : 'failed-to-create-user',
        details: [errorCode, reason].filter(Boolean).join(': ') || `status ${adminResponse.status}`,
      }, adminResponse.status);
    }

    // Conta criada: agora sim o código é invalidado
    const deleteResult = await deleteVerificationCode(supabaseUrl, serviceRoleKey, email);
    if (!deleteResult.ok) {
      console.warn('[create-user] Falha ao deletar código de verificação:', deleteResult);
    }

    const createdUser = (adminPayload.user ?? adminPayload) as { id?: string };
    if (createdUser?.id) {
      try {
        await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            id: createdUser.id,
            name: name || '',
            email: email || '',
            whatsapp: whatsapp || '',
            phone: whatsapp || '',
            city: city || '',
            state: state || '',
            whatsapp_notifications_enabled: whatsappNotificationsEnabled,
          }),
        });
      } catch (profileErr) {
        console.warn('[create-user] Falha ao upsert em profiles:', profileErr);
      }
    }

    return jsonResponse({
      ok: true,
      user: adminPayload.user ?? adminPayload,
    });
  }

function maskEmail(email: string | undefined | null) {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
}

async function findUserProfilesByPhone(supabaseUrl: string, serviceRoleKey: string, phone: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  const cleanPhone = digits.startsWith('55') ? digits.slice(2) : digits;
  const last8 = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
  const ddd = cleanPhone.length >= 10 ? cleanPhone.slice(0, 2) : '';

  const conditions = [
    `whatsapp.ilike.*${cleanPhone}*`,
    `phone.ilike.*${cleanPhone}*`,
    `whatsapp.ilike.*${last8}*`,
    `phone.ilike.*${last8}*`,
  ];

  if (ddd) {
    const var10 = cleanPhone.length === 11 && cleanPhone[2] === '9' ? `${ddd}${cleanPhone.slice(3)}` : null;
    const var11 = cleanPhone.length === 10 ? `${ddd}9${cleanPhone.slice(2)}` : null;
    if (var10) conditions.push(`whatsapp.ilike.*${var10}*`, `phone.ilike.*${var10}*`);
    if (var11) conditions.push(`whatsapp.ilike.*${var11}*`, `phone.ilike.*${var11}*`);
  }

  const profilesUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?select=id,name,email,whatsapp,phone,created_at&or=(${conditions.join(',')})&order=created_at.desc&limit=10`;
  const profileRes = await fetch(profilesUrl, {
    method: 'GET',
    headers: getRestHeaders(serviceRoleKey),
  });

  if (profileRes.ok) {
    try {
      const list = await profileRes.json();
      if (Array.isArray(list) && list.length > 0) {
        if (ddd) {
          const filtered = list.filter((p: Record<string, unknown>) => {
            const pDigits = String(p.whatsapp || p.phone || '').replace(/\D/g, '');
            return pDigits.includes(ddd) && pDigits.includes(last8);
          });
          if (filtered.length > 0) return filtered;
        }
        return list;
      }
    } catch {
      // ignore
    }
  }

  return [];
}

  // ==========================================
  // ACTION: send-reset-code (Redefinição de Senha via WhatsApp)
  // ==========================================
  if (action === 'send-reset-code') {
    if (!whatsapp) {
      return jsonResponse({ ok: false, error: 'missing-whatsapp' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing-service-role-key' }, 500);
    }

    const rawDigits = whatsapp.replace(/\D/g, '');
    const cleanPhone = rawDigits.startsWith('55') ? rawDigits.slice(2) : rawDigits;

    // Buscar perfis associados a este número
    const foundProfiles = await findUserProfilesByPhone(supabaseUrl, serviceRoleKey, whatsapp);

    if (!foundProfiles || foundProfiles.length === 0) {
      return jsonResponse({
        ok: false,
        error: 'user-not-found',
        message: 'Nenhuma conta encontrada com este número de WhatsApp. Verifique o número informado.',
      }, 404);
    }

    const selectedUserId = String(body.userId ?? '').trim();
    let targetProfile = foundProfiles[0];
    if (selectedUserId) {
      const found = foundProfiles.find((p: Record<string, unknown>) => p.id === selectedUserId);
      if (found) targetProfile = found;
    }

    const code = createSixDigitCode();

    // Grava código para o perfil alvo e também para os perfis vinculados
    for (const p of foundProfiles) {
      const resetKey = `reset_${p.id}`;
      const previous = await fetchVerificationCode(supabaseUrl, serviceRoleKey, resetKey);
      const previousCreatedAt = previous.record?.created_at ? new Date(String(previous.record.created_at)).getTime() : 0;
      if (previousCreatedAt && Date.now() - previousCreatedAt < 60_000) {
        return jsonResponse({ ok: false, error: 'verification-rate-limited' }, 429);
      }
      await storeVerificationCode(supabaseUrl, serviceRoleKey, resetKey, code, whatsapp);
    }

    const userName = targetProfile.name ? String(targetProfile.name).split(' ')[0] : 'Usuário';
    const whatsappResult = await dispatchVerificationCode(whatsapp, code);

    const ddd = cleanPhone.slice(0, 2);
    const lastDigits = cleanPhone.slice(-4);
    const maskedPhone = `(${ddd}) *****-${lastDigits}`;

    const accountsSummary = foundProfiles.map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name || 'Usuário',
      email: p.email || '',
      maskedEmail: maskEmail(String(p.email ?? '')),
    }));

    return jsonResponse({
      ok: true,
      pendingVerification: true,
      maskedPhone,
      accounts: accountsSummary,
      hasMultipleAccounts: accountsSummary.length > 1,
      whatsappSent: whatsappResult.ok,
    });
  }

  // ==========================================
  // ACTION: verify-reset-code (Validação do Código de 6 Dígitos)
  // ==========================================
  if (action === 'verify-reset-code') {
    if (!whatsapp || !verificationCode) {
      return jsonResponse({ ok: false, error: 'missing-fields' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing-service-role-key' }, 500);
    }

    const foundProfiles = await findUserProfilesByPhone(supabaseUrl, serviceRoleKey, whatsapp);

    if (!foundProfiles || foundProfiles.length === 0) {
      return jsonResponse({ ok: false, error: 'user-not-found' }, 404);
    }

    const selectedUserId = String(body.userId ?? '').trim();
    let targetProfile = foundProfiles[0];
    if (selectedUserId) {
      const found = foundProfiles.find((p: Record<string, unknown>) => p.id === selectedUserId);
      if (found) targetProfile = found;
    }

    const resetKey = `reset_${targetProfile.id}`;
    const fetchResult = await fetchVerificationCode(supabaseUrl, serviceRoleKey, resetKey);

    if (!fetchResult.ok || !fetchResult.record) {
      return jsonResponse({ ok: false, error: 'invalid-verification-code', message: 'Código não encontrado ou expirado. Solicite um novo código.' }, 400);
    }

    const { code_hash: storedCodeHash, expires_at: expiresAt, attempts: attemptsRaw } = fetchResult.record as { code_hash?: string; expires_at?: string; attempts?: number };
    const attempts = Number(attemptsRaw) || 0;
    const enteredCode = String(verificationCode).trim();

    if (attempts >= 5) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, resetKey);
      return jsonResponse({ ok: false, error: 'verification-attempts-exceeded' }, 429);
    }

    const enteredCodeHash = await hashVerificationCode(enteredCode);
    if (!storedCodeHash || !safeEqual(storedCodeHash, enteredCodeHash)) {
      await incrementVerificationAttempts(supabaseUrl, serviceRoleKey, resetKey, attempts + 1);
      return jsonResponse({ ok: false, error: 'invalid-verification-code', message: 'Código incorreto. Verifique os números digitados.' }, 400);
    }

    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, resetKey);
      return jsonResponse({ ok: false, error: 'code-expired', message: 'Este código expirou. Solicite um novo código.' }, 400);
    }

    // Invalida o código de 6 dígitos para todos os perfis vinculados
    for (const p of foundProfiles) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, `reset_${p.id}`);
    }

    // Gera token criptográfico de uso único para a troca de senha (válido por 5 minutos)
    const resetToken = crypto.randomUUID();
    const tokenKey = `token_${resetToken}`;
    await storeVerificationCode(supabaseUrl, serviceRoleKey, tokenKey, targetProfile.id, whatsapp, false);

    return jsonResponse({
      ok: true,
      resetToken,
      user: {
        id: targetProfile.id,
        name: targetProfile.name,
        email: targetProfile.email,
        maskedEmail: maskEmail(String(targetProfile.email ?? '')),
      },
    });
  }

  // ==========================================
  // ACTION: reset-password (Criação da Nova Senha com Token)
  // ==========================================
  if (action === 'reset-password') {
    const resetToken = String(body.resetToken ?? '').trim();
    const newPassword = String(body.newPassword ?? '');

    if (!resetToken || !newPassword) {
      return jsonResponse({ ok: false, error: 'missing-fields' }, 400);
    }

    if (newPassword.length < 6) {
      return jsonResponse({ ok: false, error: 'password-too-short', message: 'A senha deve conter no mínimo 6 caracteres.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing-service-role-key' }, 500);
    }

    const tokenKey = `token_${resetToken}`;
    const fetchResult = await fetchVerificationCode(supabaseUrl, serviceRoleKey, tokenKey);

    if (!fetchResult.ok || !fetchResult.record) {
      return jsonResponse({ ok: false, error: 'invalid-reset-token', message: 'Sessão de redefinição expirada. Por favor, solicite o código novamente.' }, 400);
    }

    const { code: userIdRaw, expires_at: expiresAt } = fetchResult.record as { code?: string; expires_at?: string };
    const userId = String(userIdRaw ?? '').trim();

    if (!userId) {
      return jsonResponse({ ok: false, error: 'invalid-user-id' }, 400);
    }

    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, tokenKey);
      return jsonResponse({ ok: false, error: 'token-expired', message: 'Tempo limite esgotado. Solicite o código novamente.' }, 400);
    }

    // Invalida o token imediatamente para consumo único
    await deleteVerificationCode(supabaseUrl, serviceRoleKey, tokenKey);

    // Atualiza a senha no Supabase Auth Admin
    const updateRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        password: newPassword,
      }),
    });

    await updateRes.text();
    if (!updateRes.ok) {
      console.warn('[reset-password] Falha ao atualizar senha via Admin:', updateRes.status);
      return jsonResponse({ ok: false, error: 'failed-to-update-password' }, updateRes.status);
    }

    // Disparar notificação de segurança no WhatsApp informando a alteração
    try {
      const profilesUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?select=whatsapp,phone,name&id=eq.${encodeURIComponent(userId)}&limit=1`;
      const pRes = await fetch(profilesUrl, { method: 'GET', headers: getRestHeaders(serviceRoleKey) });
      if (pRes.ok) {
        const pData = await pRes.json();
        const userPhone = pData?.[0]?.whatsapp || pData?.[0]?.phone;
        if (userPhone) {
          const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL') ?? '';
          const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
          const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE') ?? 'wefind';
          const rawDigits = userPhone.replace(/\D/g, '');

          if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
            await fetch(`${EVOLUTION_API_URL.replace(/\/$/, '')}/message/sendText/${EVOLUTION_INSTANCE}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({
              number: rawDigits,
              text: '*Aviso de segurança WeFIND*\n\nA senha da sua conta WeFIND foi alterada com sucesso.\n\nSe você não reconhece esta operação, entre em contato imediatamente com o suporte.',
            }),
            });
          }
        }
      }
    } catch (secErr) {
      console.warn('[reset-password] Alerta de segurança WhatsApp:', secErr);
    }

    return jsonResponse({
      ok: true,
      success: true,
      message: 'Senha alterada com sucesso!',
    });
  }

  // Troca de WhatsApp no perfil: o código é gerado, guardado e conferido aqui no servidor.
  if (action === 'send-phone-change-code' || action === 'verify-phone-change-code') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing-service-role-key' }, 500);
    }
    const userId = await getAuthenticatedUserId(req, supabaseUrl);
    if (!userId) {
      return jsonResponse({ ok: false, error: 'unauthorized', message: 'Sua sessão expirou. Entre novamente.' }, 401);
    }
    const key = `phone-change:${userId}`;

    if (action === 'send-phone-change-code') {
      if (!whatsapp) {
        return jsonResponse({ ok: false, error: 'invalid-phone', message: 'Informe um número de WhatsApp válido com DDD.' }, 400);
      }
      const previous = await fetchVerificationCode(supabaseUrl, serviceRoleKey, key);
      const previousCreatedAt = previous.record?.created_at ? new Date(String(previous.record.created_at)).getTime() : 0;
      if (previousCreatedAt && Date.now() - previousCreatedAt < 60_000) {
        return jsonResponse({ ok: false, error: 'verification-rate-limited', message: 'Aguarde um minuto para pedir um novo código.' }, 429);
      }

      const code = createSixDigitCode();
      const storeResult = await storeVerificationCode(supabaseUrl, serviceRoleKey, key, code, whatsapp);
      if (!storeResult.ok) {
        console.error('[create-user] Falha ao guardar código de troca:', storeResult.body);
        return jsonResponse({ ok: false, error: 'failed-to-store-verification-code' }, 500);
      }

      const text = `*Código de confirmação WeFIND*\n\nSeu código para confirmar a alteração do seu WhatsApp é:\n\n*${code}*\n\nInforme este código no aplicativo para atualizar seu número com segurança.`;
      const sending = sendEvolutionText(whatsapp, text).then((result) => {
        if (!result.ok) console.warn('[create-user] Código de troca não enviado:', result.reason);
        return result;
      });
      if (runInBackground(sending)) {
        return jsonResponse({ ok: true, pendingVerification: true, sending: true });
      }
      const result = await sending;
      return jsonResponse({ ok: true, pendingVerification: true, whatsappSent: result.ok });
    }

    // verify-phone-change-code
    const record = (await fetchVerificationCode(supabaseUrl, serviceRoleKey, key)).record;
    if (!record) {
      return jsonResponse({ ok: false, error: 'code-not-found', message: 'Nenhum código recente encontrado. Solicite um novo código.' }, 400);
    }
    const attempts = Number(record.attempts ?? 0);
    if (attempts >= 5) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, key);
      return jsonResponse({ ok: false, error: 'too-many-attempts', message: 'Limite de tentativas excedido. Solicite um novo código.' }, 429);
    }
    if (record.expires_at && Date.now() > new Date(String(record.expires_at)).getTime()) {
      await deleteVerificationCode(supabaseUrl, serviceRoleKey, key);
      return jsonResponse({ ok: false, error: 'code-expired', message: 'Código expirado. Solicite um novo código.' }, 400);
    }
    const cleanCode = verificationCode.replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanCode) || (await hashVerificationCode(cleanCode)) !== record.code_hash) {
      await incrementVerificationAttempts(supabaseUrl, serviceRoleKey, key, attempts + 1);
      return jsonResponse({ ok: false, error: 'invalid-code', message: 'Código incorreto. Confira a mensagem recebida no WhatsApp.' }, 400);
    }

    // Lê o número salvo junto com o código, para garantir que é o mesmo que foi confirmado.
    const savedResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/signup_verifications?select=whatsapp&email=eq.${encodeURIComponent(key)}&limit=1`, {
      headers: getRestHeaders(serviceRoleKey),
    });
    const savedRows = savedResponse.ok ? await savedResponse.json() : [];
    const confirmedPhone = normalizeWhatsAppNumber(String(savedRows?.[0]?.whatsapp ?? ''));
    if (!confirmedPhone) {
      return jsonResponse({ ok: false, error: 'missing-phone' }, 500);
    }

    const updateResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { ...getRestHeaders(serviceRoleKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ whatsapp: confirmedPhone, phone: confirmedPhone }),
    });
    if (!updateResponse.ok) {
      console.error('[create-user] Falha ao salvar novo WhatsApp:', await updateResponse.text());
      return jsonResponse({ ok: false, error: 'failed-to-update-profile' }, 500);
    }
    await deleteVerificationCode(supabaseUrl, serviceRoleKey, key);
    return jsonResponse({ ok: true, valid: true, whatsapp: confirmedPhone });
  }

  return jsonResponse({ ok: false, error: 'unknown-action' }, 400);
});
