import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  TouchableWithoutFeedback,
  View,
  Text,
  StyleSheet,
  Alert,
  Image,
  TouchableOpacity,
  Platform,
  Keyboard,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Input from '../components/Input';
import { WeFindText } from '../components/WeFindBrand';
import { getFriendlyAuthErrorMessage } from '../utils/authErrors';

const LoginScreen = ({ navigation }) => {
  const { signIn, signInWithGoogle, loading, user } = useAuth();
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [googleLoading, setGoogleLoading] = useState(false);

  // Teclado: a tela não rola e o layout não muda. Se o teclado for cobrir o botão
  // "Entrar", o conteúdo inteiro desliza para cima só o necessário.
  const submitRef = useRef(null);
  const shiftY = useRef(new Animated.Value(0)).current;
  const currentShift = useRef(0);
  const topSpacing = Math.round(Math.min(72, Dimensions.get('screen').height * 0.07));

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animateTo = (value, duration) => {
      currentShift.current = value;
      Animated.timing(shiftY, {
        toValue: value,
        duration: duration || 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const onShow = (e) => {
      const keyboardTop = e?.endCoordinates?.screenY;
      if (!submitRef.current || typeof keyboardTop !== 'number') return;
      submitRef.current.measureInWindow((x, y, w, h) => {
        // y já inclui o deslocamento atual; somamos de volta para medir a posição original
        const originalBottom = y - currentShift.current + h;
        const overlap = originalBottom + 16 - keyboardTop;
        animateTo(overlap > 0 ? -overlap : 0, e?.duration);
      });
    };
    const onHide = (e) => animateTo(0, e?.duration);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [shiftY]);

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

  const validateForm = () => {
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = 'Email é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email inválido';
    }

    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (password.length < 6) {
      newErrors.password = 'Senha deve ter no mínimo 6 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!validateForm()) return;

    try {
      const result = await signIn(email.trim(), password);
      if (result?.user && !result?.user.confirmed_at && !result?.user.email_confirmed_at && !result?.session) {
        Alert.alert(
          'Confirmação necessária',
          'Você precisa confirmar seu cadastro antes de fazer login. Verifique o código de validação no seu WhatsApp.',
        );
        return;
      }
    } catch (error) {
      const friendlyMessage = getFriendlyAuthErrorMessage(error);
      Alert.alert('Acesso não autorizado', friendlyMessage);
    }
  };

  const handleGoogleLogin = async () => {
    Keyboard.dismiss();
    setGoogleLoading(true);

    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert(
        'Não foi possível entrar com Google',
        getFriendlyAuthErrorMessage(error) || error.message || 'Tente novamente.',
      );
    } finally {
      setGoogleLoading(false);
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
  const busy = loading || googleLoading;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <Animated.View
          style={[styles.container, { paddingTop: topSpacing, transform: [{ translateY: shiftY }] }]}
        >
          {/* Marca */}
          <View style={styles.brand}>
            <View
              style={[
                styles.logoBox,
                { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.cardBorder },
              ]}
            >
              <Image source={require('../../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
            </View>
            <WeFindText size={24} uppercase style={{ marginTop: 12, letterSpacing: -0.5 }} />
          </View>

          {/* Título */}
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.text }]}>Entrar</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Use o e-mail e a senha da sua conta.
            </Text>
          </View>

          {/* Formulário */}
          <View style={styles.form}>
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
              textContentType="emailAddress"
              error={errors.email}
              style={styles.input}
              inputStyle={fieldStyle}
              returnKeyType="next"
            />

            <Input
              label="Senha"
              placeholder="Sua senha"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors((prev) => ({ ...prev, password: null }));
              }}
              secureTextEntry={true}
              autoComplete="password"
              textContentType="password"
              error={errors.password}
              style={styles.inputLast}
              inputStyle={fieldStyle}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate('EsqueciSenha')}
              style={styles.forgotPassword}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Esqueci minha senha</Text>
            </TouchableOpacity>

            <TouchableOpacity
              ref={submitRef}
              collapsable={false}
              onPress={handleLogin}
              disabled={busy}
              style={[styles.primaryButton, { backgroundColor: colors.primary }, busy && styles.disabledButton]}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Entrar</Text>
              )}
            </TouchableOpacity>

                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.cardBorder }]} />
                  <Text style={[styles.dividerText, { color: colors.textMuted }]}>ou</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.cardBorder }]} />
                </View>

                <TouchableOpacity
                  onPress={handleGoogleLogin}
                  disabled={busy}
                  style={[
                    styles.googleButton,
                    { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
                    busy && styles.disabledButton,
                  ]}
                  activeOpacity={0.85}
                >
                  {googleLoading ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="google" size={19} color={colors.text} />
                      <Text style={[styles.googleButtonText, { color: colors.text }]}>Continuar com Google</Text>
                    </>
                  )}
                </TouchableOpacity>
          </View>

          {/* Rodapé */}
            <View style={styles.footer}>
              <View style={styles.footerRow}>
                <Text style={[styles.footerText, { color: colors.textSecondary }]}>Não tem conta? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Register')} activeOpacity={0.7} hitSlop={8}>
                  <Text style={[styles.footerLink, { color: colors.primary }]}>Criar conta</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('PublicApp')}
                style={styles.guestLink}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Text style={[styles.guestLinkText, { color: colors.textSecondary }]}>Continuar sem entrar</Text>
              </TouchableOpacity>
            </View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'flex-start',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  titleBlock: {
    marginBottom: 22,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15.5,
    lineHeight: 22,
    marginTop: 6,
  },
  form: {
    width: '100%',
  },
  input: {
    marginBottom: 14,
  },
  inputLast: {
    marginBottom: 0,
  },
  inputField: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
    height: 52,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 10,
    marginBottom: 20,
  },
  forgotPasswordText: {
    fontSize: 14.5,
    fontWeight: '600',
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
  },
  googleButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    marginTop: 28,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '600',
  },
  guestLink: {
    marginTop: 14,
    paddingVertical: 4,
  },
  guestLinkText: {
    fontSize: 14.5,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});

export default LoginScreen;
