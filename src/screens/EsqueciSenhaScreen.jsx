import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  requestPasswordResetByWhatsApp,
  verifyPasswordResetCode,
  resetPasswordWithToken,
} from '../services/supabaseAuth';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { calculatePasswordStrength } from './RegisterScreen';

export default function EsqueciSenhaScreen({ navigation, route }) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const initialWhatsapp = route?.params?.initialWhatsapp || '';
  // Passos: 1 = WhatsApp, 2 = Código, 3 = Nova Senha, 4 = Sucesso
  const [step, setStep] = useState(1);

  // Estados dos formulários
  const [whatsapp, setWhatsapp] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Token temporário de uso único
  const [resetToken, setResetToken] = useState('');

  // Contas associadas ao WhatsApp (para quando um mesmo número tiver múltiplos cadastros)
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Estados de controle
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Cooldown de reenvio de código
  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Formatação em tempo real do telefone (XX) XXXXX-XXXX
  const handleWhatsappChange = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, 11);
    let formatted = digits;

    if (digits.length > 2 && digits.length <= 6) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    } else if (digits.length > 6 && digits.length <= 10) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    } else if (digits.length > 10) {
      formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }

    setWhatsapp(formatted);
  };

  useEffect(() => {
    if (initialWhatsapp) {
      handleWhatsappChange(initialWhatsapp);
    }
  }, [initialWhatsapp]);

  // PASSO 1: Enviar código para o WhatsApp
  const handleRequestCode = async () => {
    const rawDigits = whatsapp.replace(/\D/g, '');
    if (rawDigits.length < 10) {
      Alert.alert('Atenção', 'Informe seu número de WhatsApp com DDD (ex: 11 99999-9999).');
      return;
    }

    if (cooldownSeconds > 0) {
      Alert.alert('Aguarde', `Você poderá solicitar outro código em ${cooldownSeconds}s.`);
      return;
    }

    setLoading(true);
    try {
      const result = await requestPasswordResetByWhatsApp(rawDigits, selectedAccount?.id);
      setMaskedPhone(result.maskedPhone || whatsapp);
      setAccounts(result.accounts || []);
      if (result.accounts && result.accounts.length > 0) {
        setSelectedAccount(result.accounts[0]);
      }
      setCooldownSeconds(60);
      setStep(2);
    } catch (error) {
      Alert.alert('Não foi possível enviar', error.message || 'Verifique o número informado e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // PASSO 2: Validar o código de 6 dígitos
  const handleVerifyCode = async () => {
    const cleanCode = code.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      Alert.alert('Atenção', 'Digite o código de 6 dígitos enviado ao seu WhatsApp.');
      return;
    }

    setLoading(true);
    try {
      const rawDigits = whatsapp.replace(/\D/g, '');
      const result = await verifyPasswordResetCode(rawDigits, cleanCode, selectedAccount?.id);
      if (result.resetToken) {
        setResetToken(result.resetToken);
        setStep(3);
      } else {
        throw new Error('Token de verificação inválido.');
      }
    } catch (error) {
      Alert.alert('Código Inválido', error.message || 'Código incorreto ou expirado. Verifique e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // PASSO 3: Salvar a nova senha
  const handleSaveNewPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Senha Fraca', 'A nova senha deve conter pelo menos 8 caracteres.');
      return;
    }
    if (!/[0-9]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
      Alert.alert('Senha Fraca', 'A nova senha deve conter letras maiúsculas, minúsculas e pelo menos um número.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Senhas Diferentes', 'A confirmação de senha não confere com a nova senha.');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordWithToken(resetToken, newPassword);
      setStep(4); // Sucesso
    } catch (error) {
      Alert.alert('Erro ao Redefinir', error.message || 'Não foi possível redefinir sua senha. Tente reiniciar o processo.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step === 2) {
      setStep(1);
      setCode('');
    } else if (step === 3) {
      setStep(2);
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Login');
    }
  };

  const fieldBg = isDark ? colors.card : '#FFFFFF';
  const passwordReady =
    newPassword.length >= 8 && /[0-9]/.test(newPassword) && newPassword === confirmPassword;

  const STEP_INFO = {
    1: {
      title: 'Redefinir senha',
      subtitle: 'Informe o WhatsApp cadastrado na sua conta. Vamos enviar um código para confirmar que é você.',
    },
    2: {
      title: 'Digite o código',
      subtitle: `Enviamos um código de 6 dígitos para ${maskedPhone || 'o seu WhatsApp'}.`,
    },
    3: {
      title: 'Crie uma nova senha',
      subtitle: 'Use pelo menos 8 caracteres, com letras maiúsculas, minúsculas e um número.',
    },
  };

  const renderAccountPicker = () => {
    if (accounts.length <= 1) return null;
    return (
      <View style={styles.accountsBlock}>
        <Text style={[styles.inputLabel, { color: colors.text }]}>Qual conta você quer redefinir?</Text>
        <View style={[styles.accountsList, { backgroundColor: fieldBg, borderColor: colors.cardBorder }]}>
          {accounts.map((acc, idx) => {
            const isSelected = selectedAccount?.id === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                onPress={() => setSelectedAccount(acc)}
                style={[
                  styles.accountRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: colors.cardBorder },
                ]}
                activeOpacity={0.7}
              >
                <View style={[styles.accountAvatar, { backgroundColor: isDark ? colors.innerCard : '#F1F5F9' }]}>
                  <Text style={[styles.accountAvatarText, { color: colors.text }]}>
                    {acc.name ? acc.name[0].toUpperCase() : 'U'}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
                    {acc.name || 'Usuário'}
                  </Text>
                  <Text style={[styles.accountEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                    {acc.maskedEmail || acc.email}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: isSelected ? colors.primary : colors.border },
                  ]}
                >
                  {isSelected ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderPrimaryButton = (label, onPress, disabled = false) => (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        { backgroundColor: colors.primary },
        (disabled || loading) && { opacity: 0.45 },
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  const renderPasswordField = (label, value, onChange, visible, toggle, placeholder, autoFocus) => (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.inputWrapper, { backgroundColor: fieldBg, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!visible}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoFocus={autoFocus}
        />
        <TouchableOpacity onPress={toggle} style={styles.eyeButton} hitSlop={8}>
          <Feather name={visible ? 'eye-off' : 'eye'} size={19} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Topo: voltar + etapa */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            style={[styles.backButton, { borderColor: colors.cardBorder, backgroundColor: fieldBg }]}
            accessibilityLabel="Voltar"
            hitSlop={8}
          >
            <Feather name="arrow-left" size={20} color={colors.text} />
          </TouchableOpacity>
          {step < 4 ? (
            <Text style={[styles.stepCounter, { color: colors.textSecondary }]}>Etapa {step} de 3</Text>
          ) : null}
        </View>

        {step < 4 && (
          <View style={styles.progressTrack}>
            {[1, 2, 3].map((n) => (
              <View
                key={n}
                style={[
                  styles.progressSegment,
                  { backgroundColor: n <= step ? colors.primary : (isDark ? '#334155' : '#E2E8F0') },
                ]}
              />
            ))}
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step < 4 && (
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text }]}>{STEP_INFO[step].title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{STEP_INFO[step].subtitle}</Text>
            </View>
          )}

          {/* Etapa 1: número do WhatsApp */}
          {step === 1 && (
            <View>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>WhatsApp com DDD</Text>
                <View style={[styles.inputWrapper, { backgroundColor: fieldBg, borderColor: colors.border }]}>
                  <Feather name="phone" size={18} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="(00) 00000-0000"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    value={whatsapp}
                    onChangeText={handleWhatsappChange}
                    maxLength={15}
                    autoFocus
                  />
                </View>
              </View>

              {renderAccountPicker()}

              {renderPrimaryButton('Enviar código', handleRequestCode)}
            </View>
          )}

          {/* Etapa 2: código */}
          {step === 2 && (
            <View>
              <TextInput
                style={[
                  styles.codeInput,
                  { backgroundColor: fieldBg, color: colors.text, borderColor: code.length === 6 ? colors.primary : colors.border },
                ]}
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                autoFocus
              />

              {renderAccountPicker()}

              {renderPrimaryButton('Verificar código', handleVerifyCode, code.length !== 6)}

              <View style={styles.secondaryActions}>
                <TouchableOpacity
                  onPress={handleRequestCode}
                  disabled={cooldownSeconds > 0 || loading}
                  hitSlop={8}
                >
                  <Text style={[styles.linkText, { color: cooldownSeconds > 0 ? colors.textMuted : colors.primary }]}>
                    {cooldownSeconds > 0 ? `Reenviar código em ${cooldownSeconds}s` : 'Reenviar código'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setStep(1);
                    setCode('');
                  }}
                  hitSlop={8}
                >
                  <Text style={[styles.linkText, { color: colors.textSecondary }]}>Usar outro número</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Etapa 3: nova senha */}
          {step === 3 && (
            <View>
              {renderPasswordField(
                'Nova senha',
                newPassword,
                setNewPassword,
                showPassword,
                () => setShowPassword((p) => !p),
                'Mínimo 8 caracteres',
                true
              )}

              {newPassword.length > 0 && (() => {
                const pwdStrength = calculatePasswordStrength(newPassword);
                const rules = [
                  { ok: pwdStrength.rules.hasMinLength, label: '8 caracteres ou mais' },
                  { ok: pwdStrength.rules.hasNumber, label: 'Pelo menos um número' },
                  { ok: pwdStrength.rules.hasLetters, label: 'Letras maiúsculas e minúsculas' },
                ];
                return (
                  <View style={styles.strengthBlock}>
                    <View style={styles.strengthBars}>
                      {[1, 2, 3, 4].map((seg) => (
                        <View
                          key={seg}
                          style={[
                            styles.strengthBar,
                            { backgroundColor: seg <= pwdStrength.level ? pwdStrength.color : (isDark ? '#334155' : '#E2E8F0') },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.strengthLabel, { color: pwdStrength.color }]}>{pwdStrength.label}</Text>
                    {rules.map((r) => (
                      <View key={r.label} style={styles.ruleRow}>
                        <Feather
                          name={r.ok ? 'check' : 'minus'}
                          size={15}
                          color={r.ok ? colors.primary : colors.textMuted}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={[styles.ruleText, { color: r.ok ? colors.text : colors.textMuted }]}>{r.label}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {renderPasswordField(
                'Confirmar nova senha',
                confirmPassword,
                setConfirmPassword,
                showConfirmPassword,
                () => setShowConfirmPassword((p) => !p),
                'Digite a senha novamente',
                false
              )}

              {confirmPassword.length > 0 && newPassword !== confirmPassword ? (
                <Text style={styles.mismatchText}>As senhas não são iguais.</Text>
              ) : null}

              {renderPrimaryButton('Salvar nova senha', handleSaveNewPassword, !passwordReady)}
            </View>
          )}

          {/* Etapa 4: concluído */}
          {step === 4 && (
            <View style={styles.successBlock}>
              <View style={[styles.successIcon, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5' }]}>
                <Feather name="check" size={30} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>Senha alterada</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, textAlign: 'center', marginBottom: 28 }]}>
                {user
                  ? 'Na próxima vez que entrar no app, use a nova senha.'
                  : 'Agora você já pode entrar com a nova senha.'}
              </Text>
              {renderPrimaryButton(user ? 'Voltar ao perfil' : 'Ir para o login', () => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else if (user) {
                  navigation.navigate('MainApp');
                } else {
                  navigation.navigate('Login');
                }
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCounter: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 80,
  },
  titleBlock: {
    marginBottom: 28,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15.5,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  eyeButton: {
    paddingLeft: 10,
  },
  codeInput: {
    borderWidth: 1.5,
    borderRadius: 14,
    height: 64,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: 24,
  },
  accountsBlock: {
    marginBottom: 20,
  },
  accountsList: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  accountAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarText: {
    fontWeight: '700',
    fontSize: 15.5,
  },
  accountName: {
    fontSize: 15.5,
    fontWeight: '600',
  },
  accountEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActions: {
    marginTop: 22,
    alignItems: 'center',
    gap: 16,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
  },
  strengthBlock: {
    marginTop: -6,
    marginBottom: 20,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ruleText: {
    fontSize: 13.5,
  },
  mismatchText: {
    color: '#DC2626',
    fontSize: 13.5,
    marginTop: -10,
    marginBottom: 16,
  },
  successBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 60,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
});
