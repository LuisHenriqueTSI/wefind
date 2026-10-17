import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { updatePassword } from '../services/supabaseAuth';
import { WeFindText } from '../components/WeFindBrand';
import { TERMS_URL, PRIVACY_URL } from '../constants/links';

const preferenceKeys = {
  notifications: '@recover/preferences/notifications',
  reminders: '@recover/preferences/reminders',
  whatsappNotifications: '@recover/preferences/whatsapp_notifications',
};

const ConfigScreen = ({ navigation }) => {
  const { user, userProfile, signOut, refreshProfile, isAdmin } = useAuth();
  const { themeMode, isDark, colors, setThemeMode } = useTheme();

  const [preferences, setPreferences] = useState({
    notifications: true,
    reminders: true,
    whatsappNotifications: userProfile?.whatsapp_notifications_enabled !== false,
  });
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      const values = await AsyncStorage.multiGet(Object.values(preferenceKeys));
      setPreferences({
        notifications: values[0][1] !== 'false',
        reminders: values[1][1] !== 'false',
        whatsappNotifications: userProfile?.whatsapp_notifications_enabled !== false,
      });
    };
    loadPreferences();
  }, [userProfile]);

  const togglePreference = async (name) => {
    const value = !preferences[name];
    setPreferences(current => ({ ...current, [name]: value }));
    await AsyncStorage.setItem(preferenceKeys[name], String(value));

    if (name === 'whatsappNotifications' && user?.id) {
      try {
        const { supabase } = require('../lib/supabase');
        await supabase.from('profiles').update({
          whatsapp_notifications_enabled: value,
        }).eq('id', user.id);
        if (typeof refreshProfile === 'function') refreshProfile();
      } catch (err) {
        console.warn('[ConfigScreen] Falha ao atualizar preferência de WhatsApp:', err.message);
      }
    }
  };

  const handlePasswordChange = () => {
    setNewPassword('');
    setPasswordModalVisible(true);
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Senha inválida', 'A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    try {
      setUpdatingPassword(true);
      await updatePassword(newPassword);
      setPasswordModalVisible(false);
      Alert.alert('Senha atualizada', 'Sua nova senha já está ativa.');
    } catch (error) {
      Alert.alert('Não foi possível atualizar', error?.message || 'Tente novamente.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const SettingRow = ({ icon, iconColor, iconBg, title, description, onPress, right }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg || colors.primaryLight }]}>
        <MaterialIcons name={icon} size={20} color={iconColor || colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {description ? (
          <Text style={[styles.rowDescription, { color: colors.textSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {right || <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />}
    </TouchableOpacity>
  );

  const handleTestWhatsAppNotification = async () => {
    if (!user?.id) {
      Alert.alert('Login necessário', 'Você precisa estar logado para testar.');
      return;
    }

    try {
      const { dispatchSystemNotificationToWhatsApp } = require('../services/whatsappNotifications');
      const result = await dispatchSystemNotificationToWhatsApp({
        userId: user.id,
        title: 'Teste de notificação WeFIND',
        message: 'Olá! Este é um teste confirmando que o seu WhatsApp está 100% configurado para receber notificações do WeFIND.',
        type: 'test_alert',
      });

      if (result?.sent) {
        Alert.alert('Mensagem enviada', 'Mensagem de teste enviada para o seu WhatsApp cadastrado.');
      } else if (result?.reason === 'user-opted-out') {
        Alert.alert('Notificações desativadas', 'Você desativou o recebimento de mensagens no WhatsApp. Ative a chave acima para receber.');
      } else if (result?.reason === 'missing-whatsapp') {
        Alert.alert('WhatsApp não cadastrado', 'Edite seu perfil para informar seu número de WhatsApp.');
      } else {
        Alert.alert('Status do Envio', result?.reason || 'Verifique o status da Evolution API.');
      }
    } catch (err) {
      Alert.alert('Erro ao enviar', err.message || 'Falha ao disparar mensagem.');
    }
  };

  const handleTestPushNotification = () => {
    Alert.alert(
      'Testar notificação no celular',
      'Como deseja testar o alerta de pet perdido?',
      [
        {
          text: 'Disparar Agora (Instantâneo)',
          onPress: async () => {
            const { triggerLocalNotification } = require('../services/pushNotifications');
            await triggerLocalNotification({
              title: 'Cão perdido perto de você',
              body: 'Cão ("Thor", Labrador) perdido no seu bairro. Abra o WeFIND para ver as fotos e os detalhes.',
              data: { type: 'nearby_lost_pet' },
              delaySeconds: 0,
            });
            Alert.alert('Notificação enviada', 'Verifique a barra de notificações no topo do seu celular!');
          },
        },
        {
          text: 'Disparar em 4s (Para Minimizar)',
          onPress: async () => {
            const { triggerLocalNotification } = require('../services/pushNotifications');
            await triggerLocalNotification({
              title: 'Cão perdido perto de você',
              body: 'Cão ("Thor", Labrador) perdido no seu bairro. Abra o WeFIND para ver as fotos e os detalhes.',
              data: { type: 'nearby_lost_pet' },
              delaySeconds: 4,
            });
            Alert.alert('⏳ Agendado em 4s!', 'Você tem 4 segundos para ir para a tela inicial do celular e ver o push descer com som!');
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const themeOptions = [
    { id: 'light', label: 'Modo Claro', icon: 'light-mode', description: 'Visual clássico e luminoso' },
    { id: 'dark', label: 'Modo Escuro', icon: 'dark-mode', description: 'Descanso visual e economia de bateria' },
    { id: 'system', label: 'Automático (Sistema)', icon: 'settings-suggest', description: 'Seguir configurações do seu dispositivo' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* SEÇÃO: APARÊNCIA */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>APARÊNCIA</Text>
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <SettingRow
          icon={isDark ? 'dark-mode' : 'light-mode'}
          iconColor={isDark ? '#818CF8' : '#F59E0B'}
          iconBg={isDark ? 'rgba(129, 140, 248, 0.15)' : '#FEF3C7'}
          title="Tema Escuro"
          description={
            themeMode === 'system'
              ? `Automático (Sistema: ${isDark ? 'Escuro' : 'Claro'})`
              : isDark
              ? 'Ativado (Modo Escuro)'
              : 'Desativado (Modo Claro)'
          }
          right={
            <Switch
              value={isDark}
              onValueChange={(val) => setThemeMode(val ? 'dark' : 'light')}
              trackColor={{ false: isDark ? '#334155' : '#D1FAE5', true: colors.primary }}
              thumbColor={isDark ? '#FFFFFF' : colors.primary}
            />
          }
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="palette"
          iconColor={colors.primary}
          iconBg={isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight}
          title="Opções de Tema"
          description={
            themeMode === 'light'
              ? 'Modo Claro ☀️'
              : themeMode === 'dark'
              ? 'Modo Escuro 🌙'
              : 'Automático (Sistema do Celular) 📱'
          }
          onPress={() => setThemeModalVisible(true)}
        />
      </View>

      {/* SEÇÃO: PREFERÊNCIAS */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PREFERÊNCIAS & NOTIFICAÇÕES</Text>
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <SettingRow
          icon="notifications-active"
          iconColor={colors.primary}
          iconBg={isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight}
          title="Notificações no App"
          description="Receber alertas sobre pets e mensagens no app"
          right={
            <Switch
              value={preferences.notifications}
              onValueChange={() => togglePreference('notifications')}
              trackColor={{ false: isDark ? '#334155' : '#D1FAE5', true: colors.primary }}
              thumbColor={preferences.notifications ? (isDark ? '#FFFFFF' : colors.primary) : '#F8FAFC'}
            />
          }
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="chat"
          iconColor="#10B981"
          iconBg={isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7'}
          title="Notificações por WhatsApp"
          description="Receber avisos instantâneos de pets no seu número"
          right={
            <Switch
              value={preferences.whatsappNotifications}
              onValueChange={() => togglePreference('whatsappNotifications')}
              trackColor={{ false: isDark ? '#334155' : '#D1FAE5', true: colors.primary }}
              thumbColor={preferences.whatsappNotifications ? (isDark ? '#FFFFFF' : colors.primary) : '#F8FAFC'}
            />
          }
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="schedule"
          iconColor="#F59E0B"
          iconBg={isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7'}
          title="Lembretes de Renovação"
          description="Avisar quando seu anúncio precisar de renovação"
          right={
            <Switch
              value={preferences.reminders}
              onValueChange={() => togglePreference('reminders')}
              trackColor={{ false: isDark ? '#334155' : '#D1FAE5', true: colors.primary }}
              thumbColor={preferences.reminders ? (isDark ? '#FFFFFF' : colors.primary) : '#F8FAFC'}
            />
          }
        />
        {isAdmin && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <SettingRow
              icon="notifications-active"
              iconColor="#DC2626"
              iconBg={isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2'}
              title="Testar Notificação Push"
              description="Disparar push com som e banner no celular (Admin)"
              onPress={handleTestPushNotification}
            />
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            <SettingRow
              icon="send"
              iconColor="#6366F1"
              iconBg={isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF'}
              title="Testar Envio no WhatsApp"
              description="Disparar um alerta de teste para seu número (Admin)"
              onPress={handleTestWhatsAppNotification}
            />
          </>
        )}
      </View>

      {/* SEÇÃO: CONTA */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CONTA & SEGURANÇA</Text>
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <SettingRow
          icon="person"
          iconColor={colors.primary}
          iconBg={isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight}
          title="Editar perfil"
          description="Nome, telefone, WhatsApp e cidade padrão"
          onPress={() => navigation.navigate('EditProfile')}
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="lock"
          iconColor="#8B5CF6"
          iconBg={isDark ? 'rgba(139, 92, 246, 0.15)' : '#F5F3FF'}
          title="Alterar senha"
          description="Mantenha sua conta sempre protegida"
          onPress={handlePasswordChange}
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="sync"
          iconColor="#06B6D4"
          iconBg={isDark ? 'rgba(6, 182, 212, 0.15)' : '#ECFEFF'}
          title="Sincronizar dados"
          description="Atualizar as informações do seu perfil com o servidor"
          onPress={async () => {
            await refreshProfile();
            Alert.alert('Dados sincronizados', 'Seu perfil foi atualizado com sucesso.');
          }}
        />
      </View>

      {/* SEÇÃO: INFORMAÇÕES */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>INFORMAÇÕES & SUPORTE</Text>
      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <SettingRow
          icon="info-outline"
          iconColor={colors.primary}
          iconBg={isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight}
          title="Sobre o WeFIND"
          description="Conheça nossa missão e tecnologia"
          onPress={() => navigation.navigate('Sobre', { forceFullView: true })}
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="help-outline"
          iconColor={colors.primary}
          iconBg={isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight}
          title="Ajuda e suporte"
          description="Dúvidas frequentes e canais de atendimento"
          onPress={() => navigation.navigate('AjudaSuporte')}
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="description"
          iconColor="#64748B"
          iconBg={isDark ? '#1E293B' : '#F1F5F9'}
          title="Termos de uso"
          onPress={() => Linking.openURL(TERMS_URL)}
        />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow
          icon="privacy-tip"
          iconColor="#64748B"
          iconBg={isDark ? '#1E293B' : '#F1F5F9'}
          title="Política de privacidade"
          onPress={() => Linking.openURL(PRIVACY_URL)}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.logout,
          {
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
            borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FEE2E2',
          },
        ]}
        onPress={signOut}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={18} color="#DC2626" />
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>
      <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
        <WeFindText size={15} uppercase suffix=" • Versão 1.0.0" />
      </View>

      {/* MODAL DE SELEÇÃO DE TEMA */}
      <Modal
        visible={themeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Escolha o Tema</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              Selecione o esquema de cores de sua preferência:
            </Text>

            {themeOptions.map((opt) => {
              const isSelected = themeMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => {
                    setThemeMode(opt.id);
                    setThemeModalVisible(false);
                  }}
                  style={[
                    styles.themeOptionCard,
                    {
                      backgroundColor: isSelected ? (isDark ? 'rgba(5, 150, 105, 0.15)' : colors.primaryLight) : (isDark ? '#0F172A' : '#F8FAFC'),
                      borderColor: isSelected ? colors.primary : colors.cardBorder,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.themeOptionIcon, { backgroundColor: isSelected ? colors.primary : (isDark ? '#1E293B' : '#E2E8F0') }]}>
                    <MaterialIcons name={opt.icon} size={18} color={isSelected ? '#FFFFFF' : (isDark ? '#94A3B8' : '#475569')} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.themeOptionLabel, { color: isSelected ? colors.primary : colors.text }]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.themeOptionDesc, { color: colors.textSecondary }]}>
                      {opt.description}
                    </Text>
                  </View>
                  <MaterialIcons
                    name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
                    size={22}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() => setThemeModalVisible(false)}
              style={[styles.closeModalButton, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.closeModalText, { color: colors.text }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL DE ALTERAÇÃO DE SENHA */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Alterar senha</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              Crie uma nova senha com pelo menos 6 caracteres.
            </Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Nova senha"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoFocus
              style={[styles.passwordInput, { borderColor: colors.border, color: colors.text, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)} style={styles.cancelButton}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={savePassword}
                disabled={updatingPassword}
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                {updatingPassword ? (
                  <Text style={styles.saveText}>Salvando...</Text>
                ) : (
                  <Text style={styles.saveText}>Salvar senha</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 42 },
  sectionLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8, marginLeft: 4 },
  panel: {
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,  },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center' },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowCopy: { flex: 1, paddingVertical: 10 },
  rowTitle: { fontSize: 14.5, fontWeight: '700' },
  rowDescription: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, marginLeft: 50 },
  logout: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  logoutText: { color: '#DC2626', fontSize: 14.5, fontWeight: '800' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 18, fontWeight: '500' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    width: '100%',
    borderRadius: 12,
    padding: 22,
    borderWidth: 1,  },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalDescription: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  passwordInput: { height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 18 },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 12 },
  cancelText: { fontWeight: '700', fontSize: 13.5 },
  saveButton: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  themeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  themeOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionLabel: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  themeOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  closeModalButton: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalText: {
    fontWeight: '800',
    fontSize: 13.5,
  },
});

export default ConfigScreen;
