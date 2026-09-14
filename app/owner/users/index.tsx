// app/owner/users/index.tsx — Owner: Manajemen Pengguna
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Text, ActivityIndicator, Surface } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';

const ACCENT       = '#E597A0';
const ACCENT_LIGHT = '#FDF2F4';
const DOMAIN       = '@selasarkafe.com';

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  owner:    { label: 'Pemilik',        color: '#7C3AED', bg: '#F5F3FF', icon: 'verified-user' },
  cashier:  { label: 'Kasir',          color: '#0284C7', bg: '#F0F9FF', icon: 'point-of-sale' },
  storeman: { label: 'Pengelola Toko', color: '#059669', bg: '#ECFDF5', icon: 'storefront'    },
};

interface UserProfile {
  id: string;
  user_name: string;
  role: string;
  status?: boolean;
  created_at?: string;
}

const PHONE_BREAKPOINT = 600;

const callAdminFn = async (body: Record<string, any>) => {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // Ekstrak pesan error asli dari response body Edge Function
    let message = (error as any).message || 'Terjadi kesalahan';
    try {
      const errBody = await (error as any).context?.json?.();
      if (errBody?.error) message = errBody.error;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

/** Tampilkan bagian sebelum @domain untuk UI, simpan lengkapnya di DB */
const displayName = (userName: string) =>
  userName.endsWith(DOMAIN) ? userName.replace(DOMAIN, '') : userName;

export default function OwnerUsersScreen() {
  const { width } = useWindowDimensions();
  const isPhone = width < PHONE_BREAKPOINT;

  const [users, setUsers]           = useState<UserProfile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving]         = useState(false);

  // ── Filter ───────────────────────────────────────────────────────────────
  const [filterRole, setFilterRole] = useState<string>('all');

  // ── Edit modal ───────────────────────────────────────────────────────────
  const [editVisible, setEditVisible]   = useState(false);
  const [editUser, setEditUser]         = useState<UserProfile | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole]         = useState('cashier');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPwd, setShowEditPwd]   = useState(false);

  // ── Create modal ─────────────────────────────────────────────────────────
  const [createVisible, setCreateVisible] = useState(false);
  const [newUsername, setNewUsername]     = useState('');
  const [newRole, setNewRole]             = useState('cashier');
  const [newPassword, setNewPassword]     = useState('');
  const [showNewPwd, setShowNewPwd]       = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_name, role, status, created_at')
        .order('user_name');
      if (error) throw error;
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, []);

  // ── Open Edit ────────────────────────────────────────────────────────────
  const openEdit = (user: UserProfile) => {
    setEditUser(user);
    setEditUsername(displayName(user.user_name));
    setEditRole(user.role || 'cashier');
    setEditPassword('');
    setShowEditPwd(false);
    setEditVisible(true);
  };

  // ── Open Create ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setNewUsername('');
    setNewRole('cashier');
    setNewPassword('');
    setShowNewPwd(false);
    setCreateVisible(true);
  };

  // ── Save Edit ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editUser) return;
    if (!editUsername.trim()) {
      Alert.alert('Validasi', 'Username tidak boleh kosong.');
      return;
    }
    if (editPassword && editPassword.length < 6) {
      Alert.alert('Validasi', 'Password minimal 6 karakter.');
      return;
    }
    setSaving(true);
    try {
      const currentDisplay = displayName(editUser.user_name);
      await callAdminFn({
        action: 'update',
        user_id: editUser.id,
        // Hanya kirim user_name jika berubah
        user_name: editUsername.trim() !== currentDisplay ? editUsername.trim() : undefined,
        password: editPassword.trim() || undefined,
        role: editRole,
      });
      setEditVisible(false);
      fetchUsers();
      Alert.alert('Berhasil', 'Data pengguna berhasil diperbarui.');
    } catch (e: any) {
      Alert.alert('Gagal', e.message || 'Gagal menyimpan perubahan.');
    } finally {
      setSaving(false);
    }
  };

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newUsername.trim()) {
      Alert.alert('Validasi', 'Username tidak boleh kosong.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validasi', 'Password minimal 6 karakter.');
      return;
    }
    setSaving(true);
    try {
      const result = await callAdminFn({
        action: 'create',
        user_name: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      setCreateVisible(false);
      fetchUsers();
      Alert.alert('Berhasil', `Akun "${result.email}" berhasil dibuat.`);
    } catch (e: any) {
      Alert.alert('Gagal', e.message || 'Gagal membuat akun.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = (user: UserProfile) => {
    Alert.alert(
      'Hapus Pengguna',
      `Yakin ingin menghapus akun "${displayName(user.user_name)}"?\nTindakan ini tidak dapat dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await callAdminFn({ action: 'delete', user_id: user.id });
              fetchUsers();
            } catch (e: any) {
              Alert.alert('Gagal', e.message || 'Gagal menghapus pengguna.');
            }
          },
        },
      ]
    );
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const filtered    = filterRole === 'all' ? users : users.filter((u) => u.role === filterRole);
  const roleCounts  = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  const RoleSelector = ({ value, onChange }: { value: string; onChange: (r: string) => void }) => (
    <View style={s.roleGrid}>
      {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
        const active = value === role;
        return (
          <TouchableOpacity
            key={role}
            style={[s.roleOption, { borderColor: active ? cfg.color : '#E5E7EB' }, active && { backgroundColor: cfg.bg }]}
            onPress={() => onChange(role)}
          >
            <View style={[s.roleOptionIcon, { backgroundColor: active ? cfg.color + '20' : '#F3F4F6' }]}>
              <MaterialIcons name={cfg.icon as any} size={20} color={active ? cfg.color : '#9CA3AF'} />
            </View>
            <Text style={[s.roleOptionText, active && { color: cfg.color, fontWeight: '700' }]}>
              {cfg.label}
            </Text>
            {active && (
              <View style={[s.roleCheck, { backgroundColor: cfg.color }]}>
                <MaterialIcons name="check" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Render item ──────────────────────────────────────────────────────────
  const renderUser = ({ item }: { item: UserProfile }) => {
    const cfg      = ROLE_CONFIG[item.role] || { label: item.role, color: '#6B7280', bg: '#F9FAFB', icon: 'person' };
    const name     = displayName(item.user_name);
    const initials = (name[0] || '?').toUpperCase();

    return (
      <Surface style={s.card}>
        <View style={[s.avatar, { backgroundColor: cfg.bg }]}>
          <Text style={[s.avatarText, { color: cfg.color }]}>{initials}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.userName} numberOfLines={1}>{name}</Text>
          <Text style={s.userEmail} numberOfLines={1}>{item.user_name}</Text>
          {isPhone && (
            <View style={[s.roleBadgeInline, { backgroundColor: cfg.bg }]}>
              <MaterialIcons name={cfg.icon as any} size={10} color={cfg.color} />
              <Text style={[s.roleText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          )}
        </View>

        {!isPhone && (
          <View style={[s.roleBadge, { backgroundColor: cfg.bg }]}>
            <MaterialIcons name={cfg.icon as any} size={11} color={cfg.color} />
            <Text style={[s.roleText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        )}

        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(item)}>
            <MaterialIcons name="edit" size={18} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.actionBtnDanger]} onPress={() => handleDelete(item)}>
            <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </Surface>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
      <FlatList
        data={filtered}
        keyExtractor={(u) => u.id}
        refreshing={refreshing}
        onRefresh={fetchUsers}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            <View style={s.headerRow}>
              <View>
                <Text style={s.headerSub}>Owner</Text>
                <Text style={s.heading}>Manajemen Pengguna</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={s.totalBadge}>
                  <Text style={s.totalBadgeText}>{users.length} Akun</Text>
                </View>
                {!isPhone && (
                  <TouchableOpacity style={s.addBtn} onPress={openCreate}>
                    <MaterialIcons name="person-add" size={16} color="#fff" />
                    <Text style={s.addBtnText}>Tambah</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                <Surface key={role} style={s.statCard}>
                  <View style={[s.statIcon, { backgroundColor: cfg.bg }]}>
                    <MaterialIcons name={cfg.icon as any} size={18} color={cfg.color} />
                  </View>
                  <Text style={s.statCount}>{roleCounts[role] || 0}</Text>
                  <Text style={s.statLabel}>{cfg.label}</Text>
                </Surface>
              ))}
            </View>

            {/* Filter chips */}
            <View style={s.filterRow}>
              {[
                { key: 'all', label: 'Semua' },
                ...Object.entries(ROLE_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
              ].map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[s.filterChip, filterRole === f.key && s.filterChipActive]}
                  onPress={() => setFilterRole(f.key)}
                >
                  <Text style={[s.filterText, filterRole === f.key && s.filterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.listLabel}>
              {filtered.length} pengguna{filterRole !== 'all' ? ` · ${ROLE_CONFIG[filterRole]?.label}` : ''}
            </Text>
          </View>
        }
        renderItem={renderUser}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <MaterialIcons name="group-off" size={48} color="#D1D5DB" />
            <Text style={s.emptyText}>Tidak ada pengguna ditemukan</Text>
          </View>
        }
      />

      {/* FAB (mobile) */}
      {isPhone && (
        <TouchableOpacity style={s.fab} onPress={openCreate}>
          <MaterialIcons name="person-add" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <Modal visible={editVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setEditVisible(false)}>
            <Pressable style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <View>
                  <Text style={s.sheetTitle}>Edit Pengguna</Text>
                  <Text style={s.sheetSub}>{editUser?.user_name}</Text>
                </View>
                <TouchableOpacity onPress={() => setEditVisible(false)} style={s.closeBtn}>
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Username */}
                <Text style={s.fieldLabel}>Username</Text>
                <View style={s.inputWrapper}>
                  <MaterialIcons name="person-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                  <TextInput
                    style={s.input}
                    value={editUsername}
                    onChangeText={setEditUsername}
                    placeholder="nama_pengguna"
                    placeholderTextColor="#D1D5DB"
                    autoCapitalize="none"
                  />
                  <Text style={s.domainHint}>{DOMAIN}</Text>
                </View>

                {/* Password baru */}
                <Text style={s.fieldLabel}>
                  Password Baru{' '}
                  <Text style={s.fieldLabelNote}>(kosongkan jika tidak ingin ubah)</Text>
                </Text>
                <View style={s.inputWrapper}>
                  <MaterialIcons name="lock-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                  <TextInput
                    style={s.input}
                    value={editPassword}
                    onChangeText={setEditPassword}
                    placeholder="Min. 6 karakter"
                    placeholderTextColor="#D1D5DB"
                    secureTextEntry={!showEditPwd}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowEditPwd(!showEditPwd)}>
                    <MaterialIcons name={showEditPwd ? 'visibility-off' : 'visibility'} size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                {/* Role */}
                <Text style={s.fieldLabel}>Role</Text>
                <RoleSelector value={editRole} onChange={setEditRole} />

                <TouchableOpacity
                  style={[s.saveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size={18} color="#fff" />
                    : <MaterialIcons name="check" size={18} color="#fff" />}
                  <Text style={s.saveBtnText}>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Tambah User Modal ────────────────────────────────────────────────── */}
      <Modal visible={createVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setCreateVisible(false)}>
            <Pressable style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}>
                <View>
                  <Text style={s.sheetTitle}>Tambah Pengguna</Text>
                  <Text style={s.sheetSub}>Buat akun baru untuk staf</Text>
                </View>
                <TouchableOpacity onPress={() => setCreateVisible(false)} style={s.closeBtn}>
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Username */}
                <Text style={s.fieldLabel}>
                  Username <Text style={s.fieldLabelRequired}>*</Text>
                </Text>
                <View style={s.inputWrapper}>
                  <MaterialIcons name="person-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                  <TextInput
                    style={s.input}
                    value={newUsername}
                    onChangeText={setNewUsername}
                    placeholder="kasir3"
                    placeholderTextColor="#D1D5DB"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={s.domainHint}>{DOMAIN}</Text>
                </View>

                {/* Password */}
                <Text style={s.fieldLabel}>
                  Password <Text style={s.fieldLabelRequired}>*</Text>
                </Text>
                <View style={s.inputWrapper}>
                  <MaterialIcons name="lock-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                  <TextInput
                    style={s.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Min. 6 karakter"
                    placeholderTextColor="#D1D5DB"
                    secureTextEntry={!showNewPwd}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowNewPwd(!showNewPwd)}>
                    <MaterialIcons name={showNewPwd ? 'visibility-off' : 'visibility'} size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                {/* Role */}
                <Text style={s.fieldLabel}>
                  Role <Text style={s.fieldLabelRequired}>*</Text>
                </Text>
                <RoleSelector value={newRole} onChange={setNewRole} />

                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: '#059669' }, saving && { opacity: 0.7 }]}
                  onPress={handleCreate}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size={18} color="#fff" />
                    : <MaterialIcons name="person-add" size={18} color="#fff" />}
                  <Text style={s.saveBtnText}>{saving ? 'Membuat akun...' : 'Buat Akun'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingTop: 16, paddingBottom: 16,
  },
  headerSub: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  heading:   { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 2 },
  totalBadge: { backgroundColor: ACCENT_LIGHT, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  totalBadgeText: { fontSize: 12, fontWeight: '700', color: ACCENT },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ACCENT, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1, elevation: 0, borderRadius: 16, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#F0F0F0', padding: 12, alignItems: 'center',
  },
  statIcon:  { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statCount: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textAlign: 'center', marginTop: 2 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterText:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  filterTextActive: { color: '#fff' },
  listLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 8 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    elevation: 0, borderRadius: 18, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#F0F0F0', padding: 14,
  },
  avatar:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 19, fontWeight: '800' },
  userName:  { fontSize: 14, fontWeight: '700', color: '#111827' },
  userEmail: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, flexShrink: 0,
  },
  roleBadgeInline: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
    alignSelf: 'flex-start', marginTop: 4,
  },
  roleText: { fontSize: 10.5, fontWeight: '700' },
  actions:  { flexDirection: 'row', gap: 6, flexShrink: 0 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  actionBtnDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },

  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6,
  },

  empty:     { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, maxHeight: '90%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontWeight: '800', color: '#111827' },
  sheetSub:    { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center',
  },

  fieldLabel:         { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  fieldLabelNote:     { fontSize: 10, fontWeight: '400', textTransform: 'none', color: '#9CA3AF', letterSpacing: 0 },
  fieldLabelRequired: { color: '#EF4444', textTransform: 'none', letterSpacing: 0 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAFA', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  input:      { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
  domainHint: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },

  roleGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleOption: {
    flex: 1, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA', padding: 12, alignItems: 'center', gap: 6,
  },
  roleOptionIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  roleOptionText: { fontSize: 11, fontWeight: '600', color: '#6B7280', textAlign: 'center' },
  roleCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 15, marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
