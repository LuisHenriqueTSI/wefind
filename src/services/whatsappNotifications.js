import { supabase } from '../lib/supabase';

function normalizeWhatsAppNumber(phone) {
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
    if (withoutPlus.length === 10 || withoutPlus.length === 11) {
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

  if (digitsOnly.length === 10 || digitsOnly.length === 11) {
    return `+55${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

// Envia o código de confirmação de troca de WhatsApp. O texto da mensagem é
// montado pela função no servidor; o app manda apenas o número e o código.
export async function sendWhatsAppVerificationCode({ phone, code }) {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  if (!normalizedPhone) return { sent: false, reason: 'invalid-phone' };

  let rawDigits = normalizedPhone.replace(/\D/g, '');
  if (rawDigits.startsWith('55') && rawDigits.length === 13 && rawDigits[4] === '9') {
    rawDigits = `${rawDigits.slice(0, 4)}${rawDigits.slice(5)}`;
  }

  const { data, error } = await supabase.functions.invoke('notify-whatsapp', {
    body: {
      phone: rawDigits,
      type: 'verification-code',
      code: String(code),
    },
  });
  if (error) {
    console.warn('[whatsapp-notifications] Falha no envio via função protegida:', error.message);
    return { sent: false, reason: 'notification-function-error' };
  }
  return { sent: Boolean(data?.ok), data };
}

// Envia um aviso do sistema para o WhatsApp de um usuário.
// O número e a autorização (whatsapp_notifications_enabled) são consultados
// pela função de borda no servidor: o aparelho de quem dispara o aviso
// nunca recebe o telefone do destinatário.
export async function dispatchSystemNotificationToWhatsApp({ userId, title, message, type }) {
  if (!userId || !title || !message) {
    console.warn('[dispatchSystemNotificationToWhatsApp] Dados insuficientes');
    return { sent: false, reason: 'missing-data' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('notify-whatsapp', {
      body: { userId, title, message, type },
    });

    if (error) {
      console.warn('[whatsapp-notifications] Falha no envio via função protegida:', error.message);
      return { sent: false, reason: 'notification-function-error' };
    }

    if (!data?.ok) {
      return { sent: false, reason: data?.reason || 'not-sent', data };
    }

    return { sent: true, data };
  } catch (error) {
    console.warn('[whatsapp-notifications] Exceção ao encaminhar para WhatsApp:', error);
    return { sent: false, reason: 'exception', error };
  }
}
