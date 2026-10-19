import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import * as supabaseAuth from '../services/supabaseAuth';
import * as userService from '../services/user';
import { registerForPushNotificationsAsync } from '../services/pushNotifications';
import { syncRatingNotifications } from '../services/ratings';
import { supabase } from '../lib/supabase';
import { useTheme } from './ThemeContext';

export const AuthContext = createContext();

export const profileIsAdmin = (profile, user = null) => (
  profile?.adm === true ||
  profile?.adm === 'true' ||
  profile?.adm === 1 ||
  profile?.role === 'admin' ||
  profile?.role === 'superadmin' ||
  profile?.is_admin === true ||
  profile?.is_admin === 'true' ||
  user?.user_metadata?.role === 'admin' ||
  user?.email?.toLowerCase().includes('admin@') ||
  profile?.email?.toLowerCase().includes('admin@')
);

export const AuthProvider = ({ children }) => {
  const { setThemeMode, resetThemeToLight } = useTheme();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const activeUserIdRef = useRef(null);
  const profileRequestsRef = useRef(new Map());
  const authStateVersionRef = useRef(0);

  const ensureProfile = useCallback((authUser) => {
    if (!authUser?.id) return Promise.resolve(null);

    const pendingRequest = profileRequestsRef.current.get(authUser.id);
    if (pendingRequest) return pendingRequest;

    const phone = authUser.user_metadata?.whatsapp || authUser.user_metadata?.phone || '';
    const request = userService.createProfileIfMissing(authUser.id, {
      name: authUser.user_metadata?.name || authUser.user_metadata?.full_name,
      email: authUser.email,
      city: authUser.user_metadata?.city,
      state: authUser.user_metadata?.state,
      whatsapp: phone,
      phone,
    }).then((profile) => {
      if (profile && activeUserIdRef.current === authUser.id) {
        setUserProfile(profile);
        setIsAdmin(profileIsAdmin(profile, authUser));
      }
      return profile;
    }).finally(() => {
      profileRequestsRef.current.delete(authUser.id);
    });

    profileRequestsRef.current.set(authUser.id, request);
    return request;
  }, []);

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      const authStateVersion = authStateVersionRef.current;
      try {
        console.log('[Auth] Iniciando verificação de sessão...');
        const currentUser = await supabaseAuth.getUser();
        if (authStateVersionRef.current !== authStateVersion) return;
        
        if (currentUser) {
          console.log('[Auth] Usuário encontrado:', currentUser.id);
          activeUserIdRef.current = currentUser.id;
          setUser(currentUser);
          setLoading(false);

          // Registra token para push notifications
          registerForPushNotificationsAsync(currentUser.id).catch(() => {});
          syncRatingNotifications(currentUser.id).catch((error) => {
            console.warn('[Auth] Não foi possível sincronizar notificações de classificação:', error.message);
          });

          // Garante que o perfil exista após restaurar a sessão
          try {
            const profile = await ensureProfile(currentUser);
            if (profile) {
            console.log('[Auth] Perfil carregado, isAdmin:', profileIsAdmin(profile, currentUser));
            }
          } catch (error) {
            console.warn('[Auth] Não foi possível inicializar o perfil:', error.message);
          }
        } else {
          console.log('[Auth] Nenhum usuário autenticado');
          activeUserIdRef.current = null;
          setUser(null);
          setUserProfile(null);
          setIsAdmin(false);
        }
      } catch (error) {
        console.log('[Auth] Erro ao inicializar:', error.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] Auth state changed:', event);
        
        if (event === 'SIGNED_IN') {
          authStateVersionRef.current += 1;
          if (session?.user) {
            activeUserIdRef.current = session.user.id;
            setUser(session.user);
            syncRatingNotifications(session.user.id).catch((error) => {
              console.warn('[Auth] Não foi possível sincronizar notificações de classificação:', error.message);
            });
            Promise.resolve().then(() => ensureProfile(session.user)).catch((error) => {
              console.error('[Auth] Não foi possível inicializar o perfil após autenticação:', error.message);
            });
          }
        } else if (event === 'USER_UPDATED') {
          if (session?.user) {
            setUser(session.user);
          }
        } else if (event === 'SIGNED_OUT') {
          authStateVersionRef.current += 1;
          activeUserIdRef.current = null;
          setUser(null);
          setUserProfile(null);
          setIsAdmin(false);
          if (typeof resetThemeToLight === 'function') {
            resetThemeToLight();
          } else if (typeof setThemeMode === 'function') {
            setThemeMode('light');
          }
        }
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [ensureProfile, resetThemeToLight, setThemeMode]);

  const signUp = useCallback(async (email, password, name, city, state, whatsapp) => {
    try {
      console.log('[signUp] Registrando novo usuário...');
      const result = await supabaseAuth.signUp(email, password, name, city, state, whatsapp);
      return result;
    } catch (error) {
      console.log('[signUp] Erro:', error.message);
      throw error;
    }
  }, []);

  const confirmSignUp = useCallback(async (payload) => {
    try {
      console.log('[confirmSignUp] Confirmando cadastro...');
      const result = await supabaseAuth.confirmSignUp(payload);
      return result;
    } catch (error) {
      console.log('[confirmSignUp] Erro:', error.message);
      throw error;
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    try {
      console.log('[signIn] Fazendo login...');
      const result = await supabaseAuth.signIn(email, password);
      activeUserIdRef.current = result.user.id;
      setUser(result.user);
      await ensureProfile(result.user);
      
      return result;
    } catch (error) {
      console.log('[signIn] Erro:', error.message);
      throw error;
    }
  }, [ensureProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await supabaseAuth.signInWithGoogle();
      if (!result?.user) {
        return result;
      }

      activeUserIdRef.current = result.user.id;
      setUser(result.user);
      Promise.resolve().then(() => ensureProfile(result.user)).catch((error) => {
        console.error('[signInWithGoogle] Não foi possível carregar o perfil após autenticação:', error.message);
      });

      return result;
    } catch (error) {
      console.log('[signInWithGoogle] Erro:', error.message);
      throw error;
    }
  }, [ensureProfile]);

  const signOut = useCallback(async () => {
    try {
      console.log('[signOut] Fazendo logout...');
      await supabaseAuth.signOut();
      activeUserIdRef.current = null;
      setUser(null);
      setUserProfile(null);
      setIsAdmin(false);
      if (typeof resetThemeToLight === 'function') {
        await resetThemeToLight();
      } else if (typeof setThemeMode === 'function') {
        await setThemeMode('light');
      }
    } catch (error) {
      console.log('[signOut] Erro:', error.message);
      throw error;
    }
  }, [resetThemeToLight, setThemeMode]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      try {
        const profile = await userService.getUser(user.id);
        if (profile) {
          setUserProfile(profile);
          setIsAdmin(profileIsAdmin(profile, user));
        }
      } catch (error) {
        console.log('[refreshProfile] Erro:', error.message);
      }
    }
  }, [user?.id]);

  const value = {
    user,
    userProfile,
    setUserProfile,
    loading,
    isAdmin,
    signUp,
    confirmSignUp,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};
