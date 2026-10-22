import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const supabaseAnonKey = SUPABASE_ANON_KEY;

const normalizeWhatsapp = (whatsapp = '') => {
  const digits = String(whatsapp || '').replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;

  if (normalized.startsWith('55')) {
    normalized = normalized.slice(2);
  }

  // No Brasil, para instâncias do WhatsApp (Baileys), números de 11 dígitos com o 9 após o DDD
  // são registrados no WhatsApp com 10 dígitos (DDD + 8 dígitos).
  if (normalized.length === 11 && normalized[2] === '9') {
    normalized = `${normalized.slice(0, 2)}${normalized.slice(3)}`;
  }

  return normalized;
};

const getSupabaseUrl = () => SUPABASE_URL;

const hashVerificationCode = async (code) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getCreateUserFunctionUrl = () => {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    throw new Error('Supabase URL não encontrada. Verifique EXPO_PUBLIC_SUPABASE_URL.');
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-user`;
};

// Atualiza o email do usuário autenticado
export const updateEmail = async (newEmail) => {
  try {
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      throw error;
    }
    return { success: true };
  } catch (error) {
    throw error;
  }
};


// Exclui o usuário autenticado via Edge Function
export const deleteUser = async () => {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user?.id) throw new Error('Usuário não autenticado');

  const { data, error } = await supabase.functions.invoke('delete-user', {
    method: 'POST',
  });

  if (error) {
    if (error.context instanceof Response) {
      const responseBody = await error.context.clone().json().catch(() => null);
      throw new Error(responseBody?.message || responseBody?.error || error.message);
    }
    throw error;
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const userScopedPrefixes = [
      `@wefind_chat_cache_${user.id}_`,
      `@wefind_conversations_cache_${user.id}`,
      `@wefind_foster_profile_${user.id}`,
      `hidden_conversations_${user.id}`,
      `@wefind/gamification_data_${user.id}`,
    ];
    const keysToRemove = keys.filter((key) => userScopedPrefixes.some((prefix) => key.startsWith(prefix)));
    if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);

    const storiesKey = '@wefind_user_submitted_stories';
    const storiesRaw = await AsyncStorage.getItem(storiesKey);
    if (storiesRaw) {
      const stories = JSON.parse(storiesRaw);
      if (Array.isArray(stories)) {
        const retainedStories = stories.filter((story) => String(story?.userId || '') !== user.id);
        await AsyncStorage.setItem(storiesKey, JSON.stringify(retainedStories));
      }
    }

    const fosterRegistryKey = '@wefind_foster_all_registry';
    const fosterRegistryRaw = await AsyncStorage.getItem(fosterRegistryKey);
    if (fosterRegistryRaw) {
      const registry = JSON.parse(fosterRegistryRaw);
      if (registry && typeof registry === 'object') {
        delete registry[user.id];
        await AsyncStorage.setItem(fosterRegistryKey, JSON.stringify(registry));
      }
    }
  } catch (cleanupError) {
    console.warn('[deleteUser] A conta foi excluída, mas não foi possível limpar todos os dados locais:', cleanupError.message);
  }

  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) {
    console.error('[deleteUser] Conta excluída, mas não foi possível limpar a sessão local:', signOutError.message);
    return { ...data, sessionCleanupError: signOutError.message };
  }

  return data;
};

export const getUser = async () => {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.log('[getUser] session error:', sessionError.message);
      return null;
    }

    return session?.user || null;
  } catch (error) {
    console.log('[getUser] Error fetching user:', error.message);
    return null;
  }
};

export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.user.confirmed_at) {
      throw new Error('Por favor, confirme seu email antes de fazer login.');
    }

    return { user: data.user, session: data.session };
  } catch (error) {
    console.warn('[signIn] Falha no login:', error.message);
    throw error;
  }
};

export const signInWithGoogle = async () => {
  const redirectTo = AuthSession.makeRedirectUri({
    scheme: 'wefind',
    path: 'auth/callback',
  });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }
  if (!data.url) {
    throw new Error('O Supabase não retornou a URL de autenticação do Google.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') {
    return null;
  }
  if (result.type !== 'success' || !result.url) {
    throw new Error('Não foi possível concluir a autenticação com o Google.');
  }

  const callbackUrl = new URL(result.url);
  const oauthError = callbackUrl.searchParams.get('error_description')
    || callbackUrl.searchParams.get('error');
  if (oauthError) {
    throw new Error(oauthError);
  }

  const code = callbackUrl.searchParams.get('code');
  if (!code) {
    throw new Error('O retorno do Google não continha o código de autenticação.');
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (sessionError) {
    throw sessionError;
  }

  return sessionData;
};

// Traduz os códigos de erro da função create-user para mensagens claras
const SIGNUP_ERROR_MESSAGES = {
  'invalid-verification-code': 'Código incorreto. Use o código da mensagem mais recente do WhatsApp.',
  'verification-code-expired': 'Este código expirou (vale 15 minutos). Toque em "Reenviar código".',
  'verification-attempts-exceeded': 'Muitas tentativas erradas. Toque em "Reenviar código" para receber um novo.',
  'verification-rate-limited': 'Aguarde 1 minuto antes de pedir um novo código.',
  'email-already-registered': 'Este e-mail já tem uma conta no WeFIND. Faça login ou use "Esqueci minha senha".',
  'missing-fields': 'Preencha nome, e-mail, senha e WhatsApp para continuar.',
  'failed-to-create-user': 'Não foi possível criar a conta agora. Tente novamente em instantes.',
  'failed-to-store-verification-code': 'Não foi possível gerar o código agora. Tente novamente em instantes.',
};

const describeSignUpError = (payload, fallback) => {
  const code = payload?.error;
  if (payload?.details) console.log('[signUp] Detalhe do servidor:', payload.details);
  return SIGNUP_ERROR_MESSAGES[code] || (typeof code === 'string' && code.length > 0 && !/^[a-z-]+$/.test(code) ? code : fallback);
};

export const signUp = async (email, password, name, city, state, whatsapp = '') => {
  try {
    const payloadWhatsapp = normalizeWhatsapp(whatsapp);
    const response = await fetch(getCreateUserFunctionUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({
        action: 'send-verification',
        email,
        password,
        name,
        city,
        state,
        whatsapp: payloadWhatsapp,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(describeSignUpError(data, 'Não foi possível enviar o código de confirmação.'));
    }

    return {
      pendingVerification: true,
      phone: payloadWhatsapp,
      whatsappSent: Boolean(data.whatsappSent),
      devCode: null,
      email,
      password,
      name,
      city,
      state,
      whatsapp: payloadWhatsapp,
    };
  } catch (error) {
    console.warn('[signUp] Falha no cadastro:', error.message);
    throw error;
  }
};

export const confirmSignUp = async ({ email, password, name, city, state, whatsapp, whatsapp_notifications_enabled = true, verificationCode }) => {
  try {
    console.log('[confirmSignUp] Confirmando cadastro com código...');

    const payloadWhatsapp = normalizeWhatsapp(whatsapp);
    const functionUrl = getCreateUserFunctionUrl();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        action: 'create-user',
        email,
        password,
        name,
        city,
        state,
        whatsapp: payloadWhatsapp,
        whatsapp_notifications_enabled,
        verificationCode,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      const text = await response.text();
      payload = { error: text || parseError.message };
    }

    console.log('[confirmSignUp] Resposta da função de cadastro:', response.status);

    if (!response.ok) {
      throw new Error(describeSignUpError(payload, 'Falha ao confirmar o código de verificação.'));
    }

    return { user: payload?.user, ok: true };
  } catch (error) {
    console.log('[confirmSignUp] Exceção:', error.message);
    throw error;
  }
};

export const signOut = async () => {
  try {
    console.log('[signOut] Fazendo logout...');
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.log('[signOut] Erro:', error.message);
      throw error;
    }

    console.log('[signOut] Logout bem-sucedido');
    return { success: true };
  } catch (error) {
    console.log('[signOut] Exceção:', error.message);
    throw error;
  }
};

export const sendPasswordReset = async (email) => {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'wefind://reset-password',
    });
    return error;
  } catch (error) {
    return error;
  }
};

/**
 * Solicita código de 6 dígitos no WhatsApp para redefinir senha
 */
export const requestPasswordResetByWhatsApp = async (whatsapp, userId = null) => {
  try {
    const payloadWhatsapp = normalizeWhatsapp(whatsapp);
    if (!payloadWhatsapp) {
      throw new Error('Informe um número de WhatsApp válido com DDD.');
    }

    const functionUrl = getCreateUserFunctionUrl();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        action: 'send-reset-code',
        whatsapp: payloadWhatsapp,
        userId: userId || undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || data.error || 'Não foi possível enviar o código para este WhatsApp.');
    }

    return {
      success: true,
      pendingVerification: true,
      maskedPhone: data.maskedPhone || `(XX) *****-${payloadWhatsapp.slice(-4)}`,
      whatsapp: payloadWhatsapp,
      accounts: data.accounts || [],
      hasMultipleAccounts: Boolean(data.hasMultipleAccounts),
    };
  } catch (error) {
    console.warn('[requestPasswordResetByWhatsApp] Falha na solicitação:', error.message);
    throw error;
  }
};

/**
 * Valida o código de 6 dígitos do WhatsApp e obtém o reset_token temporário
 */
export const verifyPasswordResetCode = async (whatsapp, code, userId = null) => {
  try {
    const payloadWhatsapp = normalizeWhatsapp(whatsapp);
    const trimmedCode = String(code || '').trim();

    if (!trimmedCode || trimmedCode.length !== 6) {
      throw new Error('Informe o código de 6 dígitos recebido.');
    }

    const functionUrl = getCreateUserFunctionUrl();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        action: 'verify-reset-code',
        whatsapp: payloadWhatsapp,
        verificationCode: trimmedCode,
        userId: userId || undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || data.error || 'Código incorreto ou expirado. Tente novamente.');
    }

    return {
      success: true,
      resetToken: data.resetToken,
      user: data.user,
    };
  } catch (error) {
    console.warn('[verifyPasswordResetCode] Falha na validação:', error.message);
    throw error;
  }
};

/**
 * Salva a nova senha utilizando o reset_token de uso único
 */
export const resetPasswordWithToken = async (resetToken, newPassword) => {
  try {
    console.log('[resetPasswordWithToken] Salvando nova senha...');
    if (!resetToken) {
      throw new Error('Sessão expirada. Solicite o código novamente.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
    }

    const functionUrl = getCreateUserFunctionUrl();
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        action: 'reset-password',
        resetToken,
        newPassword,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || data.error || 'Não foi possível atualizar a senha.');
    }

    return {
      success: true,
      message: 'Senha redefinida com sucesso!',
    };
  } catch (error) {
    console.warn('[resetPasswordWithToken] Erro:', error.message);
    throw error;
  }
};

export const updatePassword = async (newPassword) => {
  try {
    console.log('[updatePassword] Atualizando senha...');
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.log('[updatePassword] Erro:', error.message);
      throw error;
    }

    console.log('[updatePassword] Senha atualizada com sucesso');
    return { success: true };
  } catch (error) {
    console.log('[updatePassword] Exceção:', error.message);
    throw error;
  }
};

/**
 * Dispara código de verificação para validar a alteração de número de WhatsApp
 */
const callPhoneChangeFunction = async (payload) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Sua sessão expirou. Entre novamente e tente outra vez.');
  }
  const response = await fetch(getCreateUserFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Não foi possível concluir a verificação. Tente novamente.');
  }
  return data;
};

// O código de troca de WhatsApp é gerado, guardado e conferido no servidor (função create-user).
// O app só manda o número novo e, depois, o código digitado.
export const sendPhoneChangeVerificationCode = async (newWhatsapp, _email) => {
  try {
    const payloadWhatsapp = normalizeWhatsapp(newWhatsapp);
    if (!payloadWhatsapp || payloadWhatsapp.length < 10) {
      throw new Error('Informe um número de WhatsApp válido com DDD.');
    }
    await callPhoneChangeFunction({ action: 'send-phone-change-code', whatsapp: payloadWhatsapp });
    return { success: true, phone: payloadWhatsapp };
  } catch (error) {
    console.warn('[sendPhoneChangeVerificationCode] Erro:', error.message);
    throw error;
  }
};

/**
 * Valida o código de verificação para alteração de número de WhatsApp
 */
export const verifyPhoneChangeCode = async (_email, inputCode) => {
  try {
    const cleanCode = String(inputCode || '').trim();
    if (!cleanCode || cleanCode.length !== 6) {
      throw new Error('Digite o código de 6 dígitos enviado ao seu WhatsApp.');
    }
    const data = await callPhoneChangeFunction({ action: 'verify-phone-change-code', verificationCode: cleanCode });
    return { valid: true, whatsapp: data.whatsapp };
  } catch (error) {
    console.warn('[verifyPhoneChangeCode] Erro:', error.message);
    throw error;
  }
};
