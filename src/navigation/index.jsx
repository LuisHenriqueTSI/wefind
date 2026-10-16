import React, { useEffect, useState, useRef } from 'react';
import { TouchableOpacity, Text, View, Image, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// Auth Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerifyPhoneScreen from '../screens/VerifyPhoneScreen';

// Main Screens
import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import RegisterItemScreen from '../screens/RegisterItemScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import InboxScreen from '../screens/InboxScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ClaimsManagementScreen from '../screens/ClaimsManagementScreen';

import DashboardScreen from '../screens/DashboardScreen';
import MapScreen from '../screens/MapScreen';
import AdminScreen from '../screens/AdminScreen';
import NotificationBell from '../components/NotificationBell';
import TabBarButton from '../components/TabBarButton';
import MeusAnunciosScreen from '../screens/MeusAnunciosScreen';
import ConfigScreen from '../screens/ConfigScreen';
import AjudaSuporteScreen from '../screens/AjudaSuporteScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import SobreScreen from '../screens/SobreScreen';
import MuralReencontrosScreen from '../screens/MuralReencontrosScreen';
import RecoveredPetsScreen from '../screens/RecoveredPetsScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import FosterVolunteersScreen from '../screens/FosterVolunteersScreen';
import MyPetsScreen from '../screens/MyPetsScreen';
import AddEditPetScreen from '../screens/AddEditPetScreen';
import RankingScreen from '../screens/RankingScreen';
import GamificationScreen from '../screens/GamificationScreen';
import { listItems } from '../services/items';
import { buildRenewalAlerts } from '../services/notifications';
import { WeFindText } from '../components/WeFindBrand';
import { APP_FEATURES } from '../constants/features';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Header Right Button for Public App - navigates to Login
const PublicHeaderRight = ({ navigation }) => (
  <TouchableOpacity
    onPress={() => navigation.navigate('Login')}
    style={{ marginRight: 16 }}
  >
    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Entrar</Text>
  </TouchableOpacity>
);

// Public Stack (no auth required - shows Home, Map and Login with safe insets & modern styling)
const PublicAppTabs = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom > 0 ? insets.bottom + 4 : (Platform.OS === 'android' ? 14 : 8);
  const tabHeight = 64 + (insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 14 : 0));

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabHeight,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Explorar',
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? colors.primary : colors.textSecondary,
                fontSize: 12,
                marginTop: 2,
                textAlign: 'center',
                fontWeight: focused ? '700' : '500',
              }}
            >
              Explorar
            </Text>
          ),
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : 'transparent',
              }}
            >
              <MaterialIcons name="grid-view" size={23} color={focused ? colors.primary : colors.textSecondary} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapScreen}
        options={{
          title: 'Mapa',
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? colors.primary : colors.textSecondary,
                fontSize: 12,
                marginTop: 2,
                textAlign: 'center',
                fontWeight: focused ? '700' : '500',
              }}
            >
              Mapa
            </Text>
          ),
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : 'transparent',
              }}
            >
              <MaterialIcons name="location-on" size={24} color={focused ? colors.primary : colors.textSecondary} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SobreTab"
        component={SobreScreen}
        options={{
          title: 'Conhecer',
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? colors.primary : colors.textSecondary,
                fontSize: 12,
                marginTop: 2,
                textAlign: 'center',
                fontWeight: focused ? '700' : '500',
              }}
            >
              Conhecer
            </Text>
          ),
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: 42,
                height: 28,
                borderRadius: 14,
                backgroundColor: focused ? colors.primaryLight : 'transparent',
              }}
            >
              <MaterialIcons name="auto-awesome" size={22} color={focused ? colors.primary : colors.textSecondary} />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Public Stack for unauthenticated users
const PublicStack = () => {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="PublicApp"
      screenOptions={{
        header: MainStackHeader,
      }}
    >
      <Stack.Screen
        name="PublicApp"
        component={PublicAppTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Map"
        component={MapScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
        initialParams={{}}
      />
      <Stack.Screen
        name="EsqueciSenha"
        component={require('../screens/EsqueciSenhaScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VerifyPhone"
        component={VerifyPhoneScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
        options={{ title: 'Detalhes' }}
      />
      <Stack.Screen
        name="RecoveredPets"
        component={RecoveredPetsScreen}
        options={{ title: 'Animais Reencontrados' }}
      />
      <Stack.Screen
        name="MuralReencontros"
        component={MuralReencontrosScreen}
        options={{ title: 'Mural de Reencontros' }}
      />
      <Stack.Screen
        name="RegisterItem"
        component={RegisterItemScreen}
        options={{ title: 'Cadastrar Animal' }}
      />
      <Stack.Screen
        name="Sobre"
        component={SobreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: 'Perfil do Membro' }}
      />
      {APP_FEATURES.fosterVolunteers && (
        <Stack.Screen
          name="FosterVolunteers"
          component={FosterVolunteersScreen}
          options={{ headerShown: false }}
        />
      )}
      <Stack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};





// Main App Stack with Tabs
import { getUnreadCount } from '../services/messages';
import { getUserNotifications } from '../services/notifications';

const MainAppTabs = ({ navigation }) => {
  const { isAdmin, user } = useAuth();
  const { colors } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const [systemAlertCount, setSystemAlertCount] = useState(0);
  const [renewalAlertCount, setRenewalAlertCount] = useState(0);
  const notificationChannelRef = useRef(null);
  const messageChannelRef = useRef(null);
  const unreadFetchInProgressRef = useRef(false);

  const fetchUnread = async () => {
    if (!user?.id || unreadFetchInProgressRef.current) return;
    unreadFetchInProgressRef.current = true;
    try {
      const [messageCount, notifications, items] = await Promise.all([
        getUnreadCount(user.id),
        getUserNotifications(user.id),
        listItems({ owner_id: user.id, resolved: false }),
      ]);

      const unreadSystemAlerts = (notifications || []).filter(alert =>
        alert?.read !== true &&
        alert?.read !== 'true' &&
        (alert?.type === 'renewal_reminder' || alert?.type === 'item_removed')
      ).length;
      const renewalAlerts = buildRenewalAlerts(items || []);
      const renewalCount = renewalAlerts.length;

      setUnreadCount(messageCount);
      setSystemAlertCount(unreadSystemAlerts);
      setRenewalAlertCount(renewalCount);
    } catch (error) {
      console.warn('[MainAppTabs] Não foi possível atualizar os indicadores:', error.message);
    } finally {
      unreadFetchInProgressRef.current = false;
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const cleanupRealtimeChannels = () => {
      if (notificationChannelRef.current) {
        notificationChannelRef.current.unsubscribe();
        notificationChannelRef.current = null;
      }
      if (messageChannelRef.current) {
        messageChannelRef.current.unsubscribe();
        messageChannelRef.current = null;
      }
    };

    cleanupRealtimeChannels();
    fetchUnread();

    const handleNotificationEvent = (payload) => {
      console.log('[MainAppTabs] realtime notification event', payload);
      fetchUnread();
    };

    const handleMessageEvent = (payload) => {
      console.log('[MainAppTabs] realtime message event', payload);
      fetchUnread();
    };

    console.log('[MainAppTabs] subscribing realtime for user', user.id);

    const notificationChannel = supabase.channel(`notifications-${user.id}`);
    notificationChannelRef.current = notificationChannel;

    notificationChannel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        handleNotificationEvent
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        handleNotificationEvent
      )
      .subscribe();

    const messageChannel = supabase.channel(`messages-${user.id}`);
    messageChannelRef.current = messageChannel;

    messageChannel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        handleMessageEvent
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        handleMessageEvent
      )
      .subscribe();

    const interval = setInterval(fetchUnread, 60000);

    return () => {
      clearInterval(interval);
      cleanupRealtimeChannels();
    };
  }, [user?.id]);

  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom > 0 ? insets.bottom + 4 : (Platform.OS === 'android' ? 12 : 8);
  const tabHeight = 62 + (insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 12 : 0));

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          height: tabHeight,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Início',
          tabBarLabel: 'Início',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapScreen}
        options={{
          title: 'Mapa',
          tabBarLabel: 'Mapa',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="location-on" size={size + 2} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="RegisterItemTab"
        component={RegisterItemScreen}
        options={{
          title: 'Registrar',
          tabBarLabel: '',
          tabBarIcon: () => null,
          tabBarButton: (props) => (
            <TabBarButton
              {...props}
              icon="add"
              onPress={() => navigation.navigate('RegisterItem')}
            />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="ChatTab"
        component={InboxScreen}
        options={{
          title: 'Mensagens',
          tabBarLabel: 'Mensagens',
          headerTitle: 'Mensagens',
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          tabBarIcon: ({ color, size }) => (
            <View style={{ width: size + 10, height: size + 10, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <MaterialIcons name="chat" size={size} color={color} />
              {unreadCount > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, zIndex: 99, borderWidth: 2, borderColor: '#fff' }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
          headerTitle: 'Perfil',
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const MainStackHeader = ({ navigation, route, options, back }) => {
  const { colors } = useTheme();
  const title = route.name === 'RegisterItem'
    ? (route.params?.editItem ? 'Editar Pet' : 'Registrar')
    : options.headerTitle || options.title || '';

  // Exibe o botão de voltar se houver histórico de pilha OU se a tela atual não for a aba principal
  const isMainTabRoute = route.name === 'MainApp' || route.name === 'PublicApp';
  const showBackButton = Boolean(back || navigation.canGoBack() || !isMainTabRoute);

  const handleBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback inteligente: se o histórico foi resetado no login, volta com segurança para o app principal
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainApp' }],
      });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.headerBg }}>
      <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBackPress}
            style={{
              width: 38,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.14)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.28)',
            }}
            accessibilityLabel="Voltar"
          >
            <MaterialIcons name="chevron-left" size={28} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </SafeAreaView>
  );
};

// Main Stack for additional screens not in tabs
const MainStack = () => {
  return (
    <Stack.Navigator
      initialRouteName="MainApp"
      screenOptions={{
        header: MainStackHeader,
      }}
    >
      <Stack.Screen
        name="MainApp"
        component={MainAppTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
        options={{ title: 'Detalhes' }}
      />
      <Stack.Screen
        name="ChatScreen"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RegisterItem"
        component={RegisterItemScreen}
        options={{ title: 'Registrar' }}
      />
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      {APP_FEATURES.communityRanking && (
        <Stack.Screen
          name="Ranking"
          component={RankingScreen}
          options={{ title: 'Ranking da Comunidade' }}
        />
      )}
      {APP_FEATURES.gamification && (
        <Stack.Screen
          name="Gamification"
          component={GamificationScreen}
          options={{ title: 'Conquistas e nível' }}
        />
      )}
      <Stack.Screen
        name="Admin"
        component={AdminScreen}
        options={{ title: 'Administração' }}
      />
      <Stack.Screen
        name="MeusAnuncios"
        component={MeusAnunciosScreen}
        options={{ title: 'Minhas Publicações' }}
      />
      <Stack.Screen
        name="ClaimsManagement"
        component={ClaimsManagementScreen}
        options={{ title: 'Solicitações de devolução' }}
      />
      <Stack.Screen
        name="Config"
        component={ConfigScreen}
        options={{ title: 'Configurações' }}
      />
      <Stack.Screen
        name="AjudaSuporte"
        component={AjudaSuporteScreen}
        options={{ title: 'Ajuda e Suporte' }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Editar Perfil' }}
      />
      <Stack.Screen
        name="Sobre"
        component={SobreScreen}
        options={{ title: 'Sobre o WeFIND' }}
      />
      <Stack.Screen
        name="MuralReencontros"
        component={MuralReencontrosScreen}
        options={{ title: 'Mural de Reencontros' }}
      />
      <Stack.Screen
        name="RecoveredPets"
        component={RecoveredPetsScreen}
        options={{ title: 'Animais Reencontrados' }}
      />
      <Stack.Screen
        name="Map"
        component={MapScreen}
        options={{ title: 'Mapa Interativo' }}
      />
      <Stack.Screen
        name="EsqueciSenha"
        component={require('../screens/EsqueciSenhaScreen').default}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ title: 'Perfil do Membro' }}
      />
      {APP_FEATURES.fosterVolunteers && (
        <Stack.Screen
          name="FosterVolunteers"
          component={FosterVolunteersScreen}
          options={{ headerShown: false }}
        />
      )}
      <Stack.Screen
        name="MyPets"
        component={MyPetsScreen}
        options={{ title: 'Meus Pets & Carteirinhas' }}
      />
      <Stack.Screen
        name="AddEditPet"
        component={AddEditPetScreen}
        options={{ title: 'Cadastrar Pet' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VerifyPhone"
        component={VerifyPhoneScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

// Root Navigator
const RootNavigator = () => {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background || '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 140, height: 140 }}
          resizeMode="contain"
        />
        <WeFindText size={30} uppercase style={{ marginTop: 14, letterSpacing: -0.4 }} />
      </View>
    );
  }

  // If user is authenticated, show full app with all features
  if (user) {
    return <MainStack />;
  }

  // If not authenticated, show public app (can view items but limited features)
  return <PublicStack />;
};

export default RootNavigator;
