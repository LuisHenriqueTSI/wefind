import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import RootNavigator from './src/navigation';
import * as Clarity from '@microsoft/react-native-clarity';

export const navigationRef = createNavigationContainerRef();

const prefix = Linking.createURL('/');
const clarityProjectId = Constants.expoConfig?.extra?.EXPO_PUBLIC_CLARITY_PROJECT_ID;
const clarityAvailable =
  Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient';
let clarityInitializationAttempted = false;
let clarityInitialized = false;

const initializeClarity = () => {
  if (!clarityAvailable || clarityInitializationAttempted) {
    return;
  }
  clarityInitializationAttempted = true;

  if (!clarityProjectId) {
    console.warn('[Clarity] ID do projeto não configurado.');
    return;
  }

  try {
    console.info('[Clarity] Inicializando SDK:', {
      executionEnvironment: Constants.executionEnvironment,
      platform: Platform.OS,
    });
    const callbackRegistered = Clarity.setOnSessionStartedCallback((sessionId) => {
      console.info('[Clarity] Sessão iniciada:', sessionId);
      Clarity.getCurrentSessionUrl().then((sessionUrl) => {
        if (sessionUrl) {
          console.info('[Clarity] URL da sessão:', sessionUrl);
        }
      }).catch((error) => {
        console.warn('[Clarity] Não foi possível obter a URL da sessão:', error);
      });
    });
    Clarity.initialize(clarityProjectId, {
      logLevel: Clarity.LogLevel.Verbose,
    });
    clarityInitialized = callbackRegistered;
    if (callbackRegistered) {
      console.info('[Clarity] Inicialização solicitada.');
    } else {
      console.error('[Clarity] SDK nativo indisponível. Gere e instale um novo build Android.');
    }
  } catch (error) {
    console.warn('[Clarity] Falha ao inicializar:', error);
  }
};

const linking = {
  prefixes: [prefix, 'wefind://', 'https://wefind.app'],
  config: {
    screens: {
      ItemDetail: 'item/:itemId',
      ChatScreen: 'chat/:conversation',
      Config: 'config',
      MainApp: {
        screens: {
          HomeTab: 'home',
          SearchTab: 'search',
          RegisterTab: 'register',
          InboxTab: 'inbox',
          ProfileTab: 'profile',
        },
      },
    },
  },
};

function MainAppContainer() {
  const { isDark, colors } = useTheme();
  const currentRouteName = useRef(null);

  const trackCurrentScreen = () => {
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (!routeName || routeName === currentRouteName.current) {
      return;
    }

    initializeClarity();
    currentRouteName.current = routeName;
    if (clarityInitialized) {
      Clarity.setCurrentScreenName(routeName).catch((error) => {
        console.warn('[Clarity] Não foi possível registrar a tela:', error);
      });
    }
  };

  useEffect(() => {
    // Redireciona o usuário para os detalhes do pet quando tocar na notificação push do celular
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.itemId && navigationRef.isReady()) {
        navigationRef.navigate('ItemDetail', { itemId: data.itemId });
      }
    });

    return () => subscription.remove();
  }, []);

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  const appContent = (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navigationTheme}
      onReady={trackCurrentScreen}
      onStateChange={trackCurrentScreen}
    >
      <View
        style={[
          styles.viewport,
          Platform.OS === 'web' && {
            alignItems: 'center',
            backgroundColor: isDark ? '#050A07' : '#E8ECE8',
          },
        ]}
      >
        <View
          style={[
            styles.appFrame,
            Platform.OS === 'web' && {
              maxWidth: 480,
              backgroundColor: colors.background,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: colors.cardBorder,
            },
          ]}
        >
          {appContent}
        </View>
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    if (Constants.executionEnvironment === 'storeClient') {
      console.info('[Clarity] Não disponível no Expo Go; use um development build ou APK.');
    }

  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <MainAppContainer />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, width: '100%' },
  appFrame: { flex: 1, width: '100%' },
});
