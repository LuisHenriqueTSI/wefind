import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  Keyboard,
  Platform,
  BackHandler,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import COLORS from '../constants/theme';
import Button from '../components/Button';
import Input from '../components/Input';
import { WeFindText } from '../components/WeFindBrand';

const formatBrazilianPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const calculatePasswordStrength = (pwd = '') => {
  const hasMinLength = pwd.length >= 8;
  const hasUpperCase = /[A-Z]/.test(pwd);
  const hasLowerCase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd);

  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (hasMinLength) score += 1;
  if (hasUpperCase && hasLowerCase) score += 1;
  if (hasNumber) score += 1;
  if (hasSpecial) score += 1;

  let label = 'Muito fraca';
  let color = '#EF4444';
  let level = 1;

  if (score <= 1) {
    label = 'Muito fraca';
    color = '#EF4444';
    level = 1;
  } else if (score === 2) {
    label = 'Fraca';
    color = '#F97316';
    level = 2;
  } else if (score === 3) {
    label = 'Boa';
    color = '#F59E0B';
    level = 3;
  } else if (score >= 4) {
    label = 'Senha forte';
    color = '#10B981';
    level = 4;
  }

  const isValid = hasMinLength && hasUpperCase && hasLowerCase && hasNumber;

  return {
    score,
    level,
    label,
    color,
    isValid,
    rules: {
      hasMinLength,
      hasLetters: hasUpperCase && hasLowerCase,
      hasNumber,
      hasSpecial,
    },
  };
};

const RegisterScreen = ({ navigation, route }) => {
  const { signUp, loading, user } = useAuth();
  const { colors, isDark } = useTheme();

  // Dados pre-preenchidos ao voltar da tela de verificacao
  const prefill = route?.params?.prefill || {};

  // Captura o botão físico de voltar do Android e redireciona para a tela inicial
  useFocusEffect(
    useCallback(() => {
      const onHardwareBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.reset({
            index: 0,
            routes: [{ name: user ? 'MainApp' : 'PublicApp' }],
          });
        }
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
      return () => subscription.remove();
    }, [navigation, user])
  );

  const [name, setName] = useState(prefill.name || '');
  const [email, setEmail] = useState(prefill.email || '');
  const [password, setPassword] = useState(prefill.password || '');
  const [confirmPassword, setConfirmPassword] = useState(prefill.password || '');
  const [whatsapp, setWhatsapp] = useState(prefill.whatsapp || '');
  const [whatsappConsent, setWhatsappConsent] = useState(
    prefill.whatsappConsent !== undefined ? prefill.whatsappConsent : true
  );

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const scrollRef = useRef(null);
  // A tela de cadastro não rola: só libera a rolagem se o conteúdo não couber (celulares muito pequenos)
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const needsScroll = viewportHeight > 0 && contentHeight > viewportHeight + 2;

  const validateForm = () => {
    const newErrors = {};
    if (!name.trim()) {
      newErrors.name = 'Nome é obrigatório';
    }
    if (!email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email inválido';
    }
    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    } else {
      const strength = calculatePasswordStrength(password);
      if (!strength.isValid) {
        if (!strength.rules.hasMinLength) {
          newErrors.password = 'A senha deve ter no mínimo 8 caracteres';
        } else if (!strength.rules.hasLetters) {
          newErrors.password = 'A senha deve ter letras maiúsculas e minúsculas';
        } else if (!strength.rules.hasNumber) {
          newErrors.password = 'A senha deve conter pelo menos um número';
        } else {
          newErrors.password = 'Senha fraca. Use letras maiúsculas, minúsculas e números';
        }
      }
    }
    if (!whatsapp.trim()) {
      newErrors.whatsapp = 'WhatsApp é obrigatório';
    } else if (!/^\d{10,15}$/.test(whatsapp.replace(/\D/g, ''))) {
      newErrors.whatsapp = 'WhatsApp inválido';
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Senhas não conferem';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const result = await signUp(
        email.trim(),
        password,
        name.trim(),
        '',
        '',
        whatsapp.replace(/\D/g, ''),
        whatsappConsent
      );
      if (result?.pendingVerification) {
        navigation.navigate('VerifyPhone', {
          email: email.trim(),
          password,
          name: name.trim(),
          whatsapp: whatsapp.replace(/\D/g, ''),
          whatsappConsent,
          devCode: result.devCode || null,
        });
      }
    } catch (error) {
      Alert.alert('Erro de cadastro', error?.message || 'Falha ao criar conta');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent]}
        enableOnAndroid={true}
        enableResetScrollToCoords={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={needsScroll}
        bounces={false}
        overScrollMode="never"
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        extraScrollHeight={Platform.OS === 'ios' ? 80 : 120}
        extraHeight={Platform.OS === 'ios' ? 120 : 160}
        keyboardOpeningTime={0}
      >


        {/* Top App Logo & Brand */}
        <View style={styles.brandHeroContainer}>
          <View style={[styles.logoSquircle, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? colors.cardBorder : COLORS.primaryBorder }]}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <WeFindText size={20} uppercase style={{ marginTop: 4, letterSpacing: -0.4 }} />
        </View>

        <View style={styles.headerBox}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Criar nova conta</Text>
        </View>

        <View style={[styles.formBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Input
            label="Nome Completo"
            placeholder="Ex: Maria dos Santos"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errors.name) setErrors((prev) => ({ ...prev, name: null }));
            }}
            error={errors.name}
            editable
            style={styles.input}
            inputStyle={[styles.inputField, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: colors.text }]}
            returnKeyType="next"
          />

          <Input
            label="E-mail"
            placeholder="seu@email.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((prev) => ({ ...prev, email: null }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            editable
            error={errors.email}
            style={styles.input}
            inputStyle={[styles.inputField, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: colors.text }]}
            returnKeyType="next"
          />

          <Input
            label="WhatsApp (com DDD)"
            placeholder="(11) 99999-9999"
            value={formatBrazilianPhone(whatsapp)}
            onChangeText={(text) => {
              setWhatsapp(text.replace(/\D/g, ''));
              if (errors.whatsapp) setErrors((prev) => ({ ...prev, whatsapp: null }));
            }}
            keyboardType="phone-pad"
            editable
            error={errors.whatsapp || errors.phone}
            style={styles.input}
            inputStyle={[styles.inputField, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: colors.text }]}
            returnKeyType="next"
          />

          <Input
            label="Senha"
            placeholder="Mínimo 8 caracteres com letras e números"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
            }}
            secureTextEntry={true}
            editable
            error={errors.password}
            style={styles.input}
            inputStyle={[styles.inputField, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: colors.text }]}
            returnKeyType="next"
          />

          {/* INDICADOR DE FORÇA DA SENHA COMPACTO EM TEMPO REAL */}
          {password.length > 0 && (() => {
            const pwdStrength = calculatePasswordStrength(password);
            return (
              <View style={styles.passwordStrengthInline}>
                <View style={[styles.strengthBarRow, { flex: 1, marginBottom: 0 }]}>
                  {[1, 2, 3, 4].map((seg) => (
                    <View
                      key={seg}
                      style={[
                        styles.strengthBarSegment,
                        { backgroundColor: seg <= pwdStrength.level ? pwdStrength.color : (isDark ? '#334155' : '#E2E8F0') },
                      ]}
                    />
                  ))}
                </View>
                <Text style={{ fontSize: 11, fontWeight: '800', color: pwdStrength.color, marginLeft: 8 }}>
                  {pwdStrength.label}
                </Text>
              </View>
            );
          })()}

          <Input
            label="Confirmar Senha"
            placeholder="Repita sua senha"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: null }));
            }}
            secureTextEntry={true}
            editable
            error={errors.confirmPassword}
            style={styles.input}
            inputStyle={[styles.inputField, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: colors.text }]}
            returnKeyType="done"
          />

          {/* Feedback de Confirmação de Senha em Tempo Real */}
          {confirmPassword.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -4, marginBottom: 8, paddingHorizontal: 2 }}>
              <MaterialIcons
                name={password === confirmPassword ? 'check-circle' : 'cancel'}
                size={13}
                color={password === confirmPassword ? '#10B981' : '#EF4444'}
                style={{ marginRight: 4 }}
              />
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: '700',
                  color: password === confirmPassword ? (isDark ? '#34D399' : '#2E5634') : '#EF4444',
                }}
              >
                {password === confirmPassword ? 'As senhas conferem!' : 'As senhas não conferem'}
              </Text>
            </View>
          )}

          {/* Checkbox de Consentimento de Notificações por WhatsApp */}
          <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setWhatsappConsent(prev => !prev)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }, whatsappConsent && [styles.checkboxChecked, { backgroundColor: colors.primary, borderColor: colors.primary }]]}>
                {whatsappConsent ? <MaterialIcons name="check" size={15} color="#FFFFFF" /> : null}
              </View>
              <Text style={[styles.consentText, { color: colors.textSecondary }]}>
                Desejo receber avisos em tempo real de animais encontrados no meu WhatsApp
              </Text>
            </TouchableOpacity>


          <TouchableOpacity
            onPress={handleRegister}
            disabled={isSubmitting}
            style={[styles.registerButton, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={styles.registerButtonText}>
              {isSubmitting ? 'Processando...' : 'Criar Minha Conta'}
            </Text>
            {!isSubmitting && <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />}
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Já possui uma conta? </Text>
          <TouchableOpacity onPress={() => navigation.replace('Login')} activeOpacity={0.75}>
            <Text style={[styles.loginLinkText, { color: colors.primary }]}>Acessar conta</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandHeroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 0,
  },
  logoSquircle: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    padding: 8,  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  headerBox: {
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 0,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  formBox: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  input: {
    marginBottom: 4,
  },
  inputField: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    height: 44,
  },
  passwordStrengthBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    marginBottom: 8,
    marginTop: -2,
  },
  passwordStrengthInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  strengthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  strengthLabelTitle: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  strengthBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  strengthBarRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  strengthBarSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderWidth: 0,
  },
  consentText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
  },
  consentError: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: -5,
    marginBottom: 4,
    marginLeft: 26,
  },
  verificationBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    marginVertical: 8,
  },
  verificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  verificationTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  editDataText: {
    fontSize: 12,
    fontWeight: '700',
  },
  verificationDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  resendBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  resendBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    paddingVertical: 11,
    marginTop: 4,  },
  registerButtonText: {
    fontWeight: '800',
    fontSize: 14.5,
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  loginLinkText: {
    fontWeight: '800',
    fontSize: 13,
  },
});

export default RegisterScreen;
