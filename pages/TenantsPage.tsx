// components/TenantsPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { syncWithdrawalsForCurrentWeek } from '../lib/withdrawalService';

const ACCENT       = '#E597A0';
const ACCENT_LIGHT = '#FDF2F4';
const GAP          = 10;

type Tenant = {
  tenant_id: number;
  tenant_name: string;
  email?: string;
  phone_number?: string;
  status: boolean;
};

type Props = { role: 'owner' | 'storeman' | 'cashier' };

const emptyForm = { tenant_name: '', email: '', phone_number: '' };

type WithdrawalRow = {
  tenant_id: number;
  amount: number | null;
  withdrawn_amount: number | null;
  status: string;
};

function computeWithdrawalState(rows: WithdrawalRow[] | null | undefined) {
  const ids = new Set<number>();
  const amounts: Record<number, number> = {};
  const withdrawn = new Set<number>();
  for (const w of rows || []) {
    let pending = 0;
    if (w.status === 'pending') {
      pending = w.amount || 0;
    } else if (w.status === 'withdrawn') {
      withdrawn.add(w.tenant_id);
      const paid = w.withdrawn_amount ?? w.amount ?? 0;
      pending = Math.max(0, (w.amount || 0) - paid);
    }
    if (pending > 0) {
      ids.add(w.tenant_id);
      amounts[w.tenant_id] = (amounts[w.tenant_id] || 0) + pending;
    }
  }
  return { ids, amounts, withdrawn };
}

export default function TenantsPage({ role }: Props) {
  const router            = useRouter();
  const { width, height } = useWindowDimensions();
  const isPortraitPhone   = width < 600 && width < height;
  const colWidth          = isPortraitPhone ? '50%' : '25%';

  const [tenants, setTenants]       = useState<Tenant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingWithdrawalIds, setPendingWithdrawalIds] = useState<Set<number>>(new Set());

  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget]     = useState<Tenant | null>(null);
  const [form, setForm]                 = useState(emptyForm);
  const [saving, setSaving]             = useState(false);

  const [menuTenant, setMenuTenant] = useState<Tenant | null>(null);

  const [pendingAmountByTenant, setPendingAmountByTenant] = useState<Record<number, number>>({});
  const [hasWithdrawnByTenant, setHasWithdrawnByTenant] = useState<Set<number>>(new Set());

  const applyWithdrawalRows = useCallback((rows: WithdrawalRow[] | null | undefined) => {
    const { ids, amounts, withdrawn } = computeWithdrawalState(rows);
    setPendingWithdrawalIds(ids);
    setPendingAmountByTenant(amounts);
    setHasWithdrawnByTenant(withdrawn);
  }, []);

  /** Muat daftar tenant + withdrawal langsung; sync mingguan hanya berjalan untuk role owner. */
  const fetchTenants = useCallback(async (opts?: { showRefreshing?: boolean }) => {
    const showRefreshing = opts?.showRefreshing === true;
    if (showRefreshing) setRefreshing(true);

    try {
      const [tenantsRes, withdrawalsRes] = await Promise.all([
        supabase.from('tenants').select('*').order('tenant_name'),
        supabase.from('tenant_withdrawals').select('tenant_id, amount, withdrawn_amount, status'),
      ]);
      setTenants(tenantsRes.data || []);
      applyWithdrawalRows(withdrawalsRes.data as WithdrawalRow[] | null);
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }

    // Hanya owner yang boleh membuat record withdrawal baru
    if (role !== 'owner') return;

    void (async () => {
      try {
        await syncWithdrawalsForCurrentWeek();
        const { data } = await supabase
          .from('tenant_withdrawals')
          .select('tenant_id, amount, withdrawn_amount, status');
        applyWithdrawalRows(data as WithdrawalRow[] | null);
      } catch (e) {
        console.error('syncWithdrawalsForCurrentWeek', e);
      }
    })();
  }, [applyWithdrawalRows, role]);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalVisible(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditTarget(tenant);
    setForm({
      tenant_name:  tenant.tenant_name  || '',
      email:        tenant.email        || '',
      phone_number: tenant.phone_number || '',
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalVisible(false);
  };

  const handleSave = async () => {
    if (!form.tenant_name.trim()) {
      Alert.alert('Peringatan', 'Nama tenant wajib diisi.');
      return;
    }
    setSaving(true);

    const payload = {
      tenant_name:  form.tenant_name.trim(),
      email:        form.email.trim()        || null,
      phone_number: form.phone_number.trim() || null,
    };

    const { error } = editTarget
      ? await supabase.from('tenants').update(payload).eq('tenant_id', editTarget.tenant_id)
      : await supabase.from('tenants').insert({ ...payload, status: true });

    setSaving(false);

    if (error) {
      Alert.alert('Gagal', error.message);
    } else {
      setModalVisible(false);
      setForm(emptyForm);
      fetchTenants();
    }
  };

  const toggleActive = async (tenant: Tenant) => {
    await supabase
      .from('tenants')
      .update({ status: !tenant.status })
      .eq('tenant_id', tenant.tenant_id);
    fetchTenants();
  };

  const handleDelete = async (tenant: Tenant) => {
    if (role !== 'owner') return;
    Alert.alert(
      'Hapus Tenant',
      `Yakin ingin menghapus "${tenant.tenant_name}"? Tindakan ini tidak dapat dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('tenants')
              .delete()
              .eq('tenant_id', tenant.tenant_id);
            if (error) Alert.alert('Gagal', error.message);
            else fetchTenants();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const isEditMode = !!editTarget;

  // ── Tenant Card ───────────────────────────────────────────────────────────
  const TenantCard = ({ item }: { item: Tenant }) => (
    <View style={{ width: colWidth, padding: GAP / 2 }}>
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/${role}/tenants/${item.tenant_id}` as any)}
      >
        <View style={s.badgeRow}>
          <View style={[s.badge, { backgroundColor: item.status ? '#ECFDF5' : '#F3F4F6' }]}>
            <View style={[s.dot, { backgroundColor: item.status ? '#10B981' : '#D1D5DB' }]} />
            <Text style={[s.badgeText, { color: item.status ? '#10B981' : '#9CA3AF' }]}>
              {item.status ? 'Aktif' : 'Nonaktif'}
            </Text>
          </View>
          {(role === 'storeman' || role === 'owner') && (
            <TouchableOpacity
              style={s.kebabBtn}
              onPress={(e) => { e.stopPropagation(); setMenuTenant(item); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <MaterialIcons name="more-vert" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        <View style={[s.avatar, { backgroundColor: item.status ? ACCENT + '15' : '#F3F4F6' }]}>
          <MaterialIcons name="storefront" size={22} color={item.status ? ACCENT : '#9CA3AF'} />
        </View>

        <Text style={s.name} numberOfLines={2}>{item.tenant_name}</Text>
        {item.email        && <Text style={s.sub} numberOfLines={1}>{item.email}</Text>}
        {item.phone_number && <Text style={s.sub} numberOfLines={1}>{item.phone_number}</Text>}
        <View style={s.payoutBadgeWrap}>
          {pendingWithdrawalIds.has(item.tenant_id) ? (
            <View style={[s.payoutBadge, s.payoutBadgePending]}>
              <MaterialIcons name="pending" size={10} color="#F59E0B" />
              <Text style={[s.payoutBadgeText, { color: '#F59E0B' }]} numberOfLines={1}>
                Belum {(pendingAmountByTenant[item.tenant_id] || 0) >= 1e6
                  ? `Rp ${((pendingAmountByTenant[item.tenant_id] || 0) / 1e6).toFixed(1)}jt`
                  : `Rp ${(pendingAmountByTenant[item.tenant_id] || 0).toLocaleString('id-ID')}`}
              </Text>
            </View>
          ) : hasWithdrawnByTenant.has(item.tenant_id) ? (
            <View style={[s.payoutBadge, s.payoutBadgeDone]}>
              <MaterialIcons name="check-circle" size={10} color="#10B981" />
              <Text style={[s.payoutBadgeText, { color: '#10B981' }]}>Sudah</Text>
            </View>
          ) : (
            <View style={[s.payoutBadge, s.payoutBadgeEmpty]}>
              <MaterialIcons name="remove-circle-outline" size={10} color="#9CA3AF" />
              <Text style={[s.payoutBadgeText, { color: '#9CA3AF' }]}>Rp 0</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: GAP / 2, paddingHorizontal: 16 - GAP / 2, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchTenants({ showRefreshing: true })}
            colors={[ACCENT]}
            tintColor={ACCENT}
          />
        }
      >
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerSub}>{role === 'owner' ? 'Owner' : 'Storeman'}</Text>
            <Text style={s.heading}>Manajemen Tenant</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.refreshBtn}
              onPress={() => void fetchTenants({ showRefreshing: true })}
              disabled={refreshing}
              activeOpacity={0.7}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={ACCENT} />
              ) : (
                <MaterialIcons name="refresh" size={22} color={ACCENT} />
              )}
            </TouchableOpacity>
            <View style={s.totalBadge}>
              <Text style={s.totalBadgeText}>{tenants.length} Tenant</Text>
            </View>
          </View>
        </View>

        {/* Grid */}
        {tenants.length === 0 ? (
          <View style={s.center}>
            <View style={s.emptyIcon}>
              <MaterialIcons name="storefront" size={32} color="#D1D5DB" />
            </View>
            <Text style={s.emptyText}>Belum ada tenant terdaftar</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {tenants.map(item => <TenantCard key={item.tenant_id} item={item} />)}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openAdd} activeOpacity={0.85}>
        <MaterialIcons name="add" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Kebab Menu Modal */}
      <Modal visible={!!menuTenant} transparent animationType="fade" onRequestClose={() => setMenuTenant(null)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuTenant(null)}>
          <Pressable style={s.menuBox} onPress={(e) => e.stopPropagation()}>
            <View style={s.menuHandle} />
            <Text style={s.menuTitle} numberOfLines={1}>{menuTenant?.tenant_name}</Text>

            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setMenuTenant(null); if (menuTenant) toggleActive(menuTenant); }}
              activeOpacity={0.7}
            >
              <View style={[s.menuIconWrap, { backgroundColor: menuTenant?.status ? '#FEF9C3' : '#ECFDF5' }]}>
                <MaterialIcons
                  name={menuTenant?.status ? 'toggle-off' : 'toggle-on'}
                  size={18}
                  color={menuTenant?.status ? '#CA8A04' : '#10B981'}
                />
              </View>
              <Text style={s.menuItemText}>
                {menuTenant?.status ? 'Nonaktifkan' : 'Aktifkan'}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.menuItem}
              onPress={() => { setMenuTenant(null); if (menuTenant) openEdit(menuTenant); }}
              activeOpacity={0.7}
            >
              <View style={s.menuIconWrap}>
                <MaterialIcons name="edit" size={18} color="#6B7280" />
              </View>
              <Text style={s.menuItemText}>Edit Tenant</Text>
              <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.menuItem, s.menuItemDanger]}
              onPress={() => { setMenuTenant(null); if (menuTenant) handleDelete(menuTenant); }}
              activeOpacity={0.7}
            >
              <View style={[s.menuIconWrap, { backgroundColor: '#FEF2F2' }]}>
                <MaterialIcons name="delete-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[s.menuItemText, { color: '#EF4444' }]}>Hapus Tenant</Text>
              <MaterialIcons name="chevron-right" size={18} color="#FCA5A5" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.modalBg} onPress={closeModal}>
            <Pressable style={s.modalBox}>
              <View style={s.modalHandle} />

              <View style={s.modalHeader}>
                <View>
                  <Text style={s.modalTitle}>{isEditMode ? 'Edit Tenant' : 'Tenant Baru'}</Text>
                  <Text style={s.modalSub}>
                    {isEditMode ? editTarget?.tenant_name : 'Tambahkan tenant baru'}
                  </Text>
                </View>
                <TouchableOpacity style={s.closeBtn} onPress={closeModal} disabled={saving}>
                  <MaterialIcons name="close" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <Text style={s.label}>Nama Tenant <Text style={{ color: ACCENT }}>*</Text></Text>
              <TextInput
                style={s.input}
                placeholder="cth. Warung Pak Budi"
                placeholderTextColor="#C0C4CC"
                value={form.tenant_name}
                onChangeText={(v) => setForm({ ...form, tenant_name: v })}
              />

              <Text style={s.label}>Email / Kontak</Text>
              <TextInput
                style={s.input}
                placeholder="cth. budi@email.com"
                placeholderTextColor="#C0C4CC"
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={(v) => setForm({ ...form, email: v })}
              />

              <Text style={s.label}>Nomor HP</Text>
              <TextInput
                style={s.input}
                placeholder="cth. 08123456789"
                placeholderTextColor="#C0C4CC"
                keyboardType="phone-pad"
                value={form.phone_number}
                onChangeText={(v) => setForm({ ...form, phone_number: v })}
              />

              <TouchableOpacity
                style={[s.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name={isEditMode ? 'save' : 'check'} size={18} color="#fff" />
                    <Text style={s.saveBtnText}>{isEditMode ? 'Simpan Perubahan' : 'Simpan Tenant'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: 16, paddingTop: 8, paddingHorizontal: 16,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub:      { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  heading:        { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 2 },
  totalBadge:     { backgroundColor: ACCENT_LIGHT, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  totalBadgeText: { fontSize: 12, fontWeight: '700', color: ACCENT },

  // ── Card ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    padding: 12,
    gap: 6,
  },

  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  pendingWithdrawalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12,
    marginTop: 6, alignSelf: 'flex-start',
  },
  pendingWithdrawalText: { fontSize: 9, fontWeight: '700', color: '#F59E0B' },
  payoutBadgeWrap: { minHeight: 24, marginTop: 6, justifyContent: 'flex-end' },
  payoutBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12,
    alignSelf: 'flex-start',
  },
  payoutBadgePending: { backgroundColor: '#FFFBEB' },
  payoutBadgeDone:   { backgroundColor: '#ECFDF5' },
  payoutBadgeEmpty:  { backgroundColor: '#F3F4F6' },
  payoutBadgeText:   { fontSize: 9, fontWeight: '700' },
  kebabBtn: {
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start',
  },
  dot:       { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  avatar:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  name:       { fontSize: 13, fontWeight: '700', color: '#111827', lineHeight: 18, marginTop: 2 },
  sub:        { fontSize: 11, color: '#9CA3AF', lineHeight: 15 },

  menuOverlay: { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' },
  menuBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
  },
  menuHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16,
  },
  menuTitle: {
    fontSize: 14, fontWeight: '700', color: '#111827',
    marginBottom: 16, paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderRadius: 12,
  },
  menuItemDanger: { marginTop: 4 },
  menuIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  menuItemText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151' },

  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 52, height: 52, borderRadius: 26, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8,
  },

  modalBg:  { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modalSub:   { fontSize: 12, color: '#9CA3AF', marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#EEEEEE', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111827',
    backgroundColor: '#FAFAFA', marginBottom: 14,
  },
  saveBtn: {
    backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});