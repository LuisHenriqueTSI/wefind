import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
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
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
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

  const fieldStyle = [
    styles.inputField,
    {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderColor: isDark ? '#334155' : '#E2E8F0',
      color: colors.text,
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid={true}
        enableResetScrollToCoords={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={needsScroll}
        bounces={false}
        overScrollMode="never"
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 40}
        extraHeight={Platform.OS === 'ios' ? 80 : 100}
        keyboardOpeningTime={0}
      >
        {/* Marca */}
        <View style={styles.brandRow}>
          <View style={[styles.logoBox, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.cardBorder }]}>
            <Image source={require('../../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <WeFindText size={18} uppercase style={{ marginLeft: 10, letterSpacing: -0.4 }} />
        </View>

        {/* Título */}
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>Criar conta</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Vamos confirmar seu número pelo WhatsApp no próximo passo.
          </Text>
        </View>

        {/* Formulário */}
        <Input
          label="Nome completo"
          placeholder="Ex: Maria dos Santos"
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (errors.name) setErrors((prev) => ({ ...prev, name: null }));
          }}
          autoCapitalize="words"
          autoComplete="name"
          error={errors.name}
          style={styles.input}
          inputStyle={fieldStyle}
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
          autoComplete="email"
          error={errors.email}
          style={styles.input}
          inputStyle={fieldStyle}
          returnKeyType="next"
        />

        <Input
          label="WhatsApp"
          placeholder="(11) 99999-9999"
          value={formatBrazilianPhone(whatsapp)}
          onChangeText={(text) => {
            setWhatsapp(text.replace(/\D/g, ''));
            if (errors.whatsapp) setErrors((prev) => ({ ...prev, whatsapp: null }));
          }}
          keyboardType="phone-pad"
          error={errors.whatsapp || errors.phone}
          style={styles.input}
          inputStyle={fieldStyle}
          returnKeyType="next"
        />

        <Input
          label="Senha"
          placeholder="8 caracteres, com letras e números"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
          }}
          secureTextEntry={true}
          autoComplete="password-new"
          error={errors.password}
          style={password.length > 0 ? styles.inputTight : styles.input}
          inputStyle={fieldStyle}
          returnKeyType="next"
        />

        {password.length > 0 && (() => {
          const pwdStrength = calculatePasswordStrength(password);
          return (
            <View style={styles.strengthRow}>
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
            </View>
          );
        })()}

        <Input
          label="Confirmar senha"
          placeholder="Digite a senha novamente"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: null }));
          }}
          secureTextEntry={true}
          error={errors.confirmPassword}
          style={styles.inputLast}
          inputStyle={fieldStyle}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        {confirmPassword.length > 0 && !errors.confirmPassword && password !== confirmPassword ? (
          <Text style={styles.mismatchText}>As senhas não são iguais.</Text>
        ) : null}

        {/* Consentimento */}
        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => setWhatsappConsent((prev) => !prev)}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: whatsappConsent }}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: whatsappConsent ? colors.primary : colors.border, backgroundColor: whatsappConsent ? colors.primary : 'transparent' },
            ]}
          >
            {whatsappConsent ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
          </View>
          <Text style={[styles.consentText, { color: colors.textSecondary }]}>
            Quero receber no WhatsApp avisos de animais perdidos perto de mim
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRegister}
          disabled={isSubmitting}
          style={[styles.primaryButton, { backgroundColor: colors.primary }, isSubmitting && styles.disabledButton]}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Criar conta</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>Já tem conta? </Text>
          <TouchableOpacity onPress={() => navigation.replace('Login')} activeOpacity={0.7} hitSlop={8}>
            <Text style={[styles.footerLink, { color: colors.primary }]}>Entrar</Text>
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    justifyContent: 'flex-start',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1,
    padding: 4,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  titleBlock: {
    marginBottom: 18,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  input: {
    marginBottom: 12,
  },
  inputTight: {
    marginBottom: 8,
  },
  inputLast: {
    marginBottom: 0,
  },
  inputField: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    height: 48,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  strengthBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
  },
  mismatchText: {
    color: '#DC2626',
    fontSize: 13.5,
    marginTop: 6,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    marginBottom: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  consentText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  footerText: {
    fontSize: 15,
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RegisterScreen;
