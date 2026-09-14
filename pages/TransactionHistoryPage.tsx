// pages/TransactionHistoryPage.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const ACCENT       = '#C8576A';
const ACCENT_SOFT  = '#F7E8EB';
const ACCENT_MED   = '#E8A0AB';
const SURFACE      = '#FFFFFF';
const BG           = '#F8F9FB';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECOND  = '#6B7280';
const TEXT_LIGHT   = '#B0B5BE';
const BORDER       = '#EBEBEB';
const PADDING      = 16;

type Role = 'cashier' | 'owner' | 'storeman';

type TransactionHistoryPageProps = {
  role: Role;
};

const routePrefix: Record<Role, string> = {
  cashier:  '/cashier/history',
  owner:    '/owner/history',
  storeman: '/storeman/history',
};

export default function TransactionHistoryPage({ role }: TransactionHistoryPageProps) {
  const router = useRouter();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  
  // Date searching
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker]     = useState(false);

  const [detailVisible, setDetailVisible]   = useState(false);
  const [detailTransaction, setDetailTransaction] = useState<any | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`*, payments(*), profiles(user_name)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const filtered = transactions.filter((t) => {
    if (!selectedDate) return true;
    const tDate = new Date(t.created_at);
    return (
      tDate.getDate() === selectedDate.getDate() &&
      tDate.getMonth() === selectedDate.getMonth() &&
      tDate.getFullYear() === selectedDate.getFullYear()
    );
  });

  const onDateChange = (event: any, date?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
    }
  };

  const openDetail = (item: any) => {
    setDetailTransaction(item);
    setDetailVisible(true);
  };

  const closeDetail = () => setDetailVisible(false);

  const getTotal = (item: any) =>
    item.grand_total ?? item.subtotal;

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed': return { color: '#059669', bg: '#ECFDF5' };
      case 'pending':   return { color: '#D97706', bg: '#FFFBEB' };
      default:          return { color: '#C2410C', bg: '#FFF7ED' };
    }
  };

  // ── List Item ─────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: any }) => {
    const payment  = item.payments?.[0];
    const total    = getTotal(item);
    const date     = new Date(item.created_at);
    const { color: statusColor, bg: statusBg } = getStatusStyle(item.transaction_status);
    const shortId  = item.transaction_id.toString().slice(-6).toUpperCase();

    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.85}
        onPress={() => openDetail(item)}
      >
        {/* Icon */}
        <View style={s.cardIcon}>
          <MaterialIcons name="receipt-long" size={20} color={ACCENT} />
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={s.cardTopRow}>
            <Text style={s.cardId}>#{shortId}</Text>
            <View style={[s.statusPill, { backgroundColor: statusBg }]}>
              <Text style={[s.statusText, { color: statusColor }]}>
                {item.transaction_status?.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={s.cardPrice}>Rp {total.toLocaleString('id-ID')}</Text>

          <View style={s.cardMeta}>
            <MaterialIcons name="access-time" size={12} color={TEXT_LIGHT} />
            <Text style={s.cardMetaText}>
              {format(date, 'dd MMM yyyy, HH:mm', { locale: id })}
            </Text>
            <Text style={s.cardMetaDot}>•</Text>
            <MaterialIcons name="payment" size={12} color={TEXT_LIGHT} />
            <Text style={s.cardMetaText}>
              {payment?.payment_method?.toUpperCase() ?? '—'}
            </Text>
            <Text style={s.cardMetaDot}>•</Text>
            <MaterialIcons name="person" size={12} color={TEXT_LIGHT} />
            <Text style={s.cardMetaText}>
              {item.profiles?.user_name ?? 'Kasir'}
            </Text>
          </View>
        </View>

        <MaterialIcons name="chevron-right" size={18} color={TEXT_LIGHT} />
      </TouchableOpacity>
    );
  };

  // ── Detail Modal ──────────────────────────────────────────────────────────
  const renderDetail = () => {
    const t = detailTransaction;
    if (!t) return null;

    const payment  = t.payments?.[0];
    const total    = getTotal(t);
    const date     = new Date(t.created_at);
    const shortId  = t.transaction_id.toString().slice(-6).toUpperCase();
    const { color: statusColor, bg: statusBg } = getStatusStyle(t.transaction_status);

    return (
      <Modal visible={detailVisible} transparent animationType="slide" onRequestClose={closeDetail}>
        <Pressable style={s.overlay} onPress={closeDetail}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />

            {/* Hero Header */}
            <View style={s.detailHeaderStrip}>
              <View style={s.detailHeroIcon}>
                <MaterialIcons name="receipt-long" size={28} color={ACCENT} />
              </View>

              <View style={{ flex: 1, gap: 5 }}>
                <Text style={s.detailHeroId}>#{shortId}</Text>
                <View style={[s.statusPill, { backgroundColor: statusBg, alignSelf: 'flex-start' }]}>
                  <Text style={[s.statusText, { color: statusColor }]}>
                    {t.transaction_status?.toUpperCase()}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={s.closeBtn} onPress={closeDetail}>
                <MaterialIcons name="close" size={18} color={TEXT_SECOND} />
              </TouchableOpacity>
            </View>

            {/* Amount Banner */}
            <View style={s.priceBanner}>
              <View style={s.priceCol}>
                <Text style={s.priceLabel}>Subtotal</Text>
                <Text style={s.priceValueMuted}>
                  Rp {(t.subtotal ?? 0).toLocaleString('id-ID')}
                </Text>
              </View>
              <View style={s.priceDivider} />
              <View style={s.priceCol}>
                <Text style={s.priceLabel}>Total</Text>
                <Text style={s.priceValueAccent}>
                  Rp {total.toLocaleString('id-ID')}
                </Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Info Grid */}
              <View style={s.infoGrid}>
                <InfoTile
                  icon="calendar-today"
                  label="Tanggal"
                  value={format(date, 'dd MMM yyyy', { locale: id })}
                />
                <InfoTile
                  icon="access-time"
                  label="Waktu"
                  value={format(date, 'HH:mm', { locale: id })}
                />
              </View>

              <View style={s.infoGrid}>
                <InfoTile
                  icon="payment"
                  label="Metode Bayar"
                  value={payment?.payment_method?.toUpperCase() ?? '—'}
                />
                <InfoTile
                  icon="person"
                  label="Kasir"
                  value={t.profiles?.user_name ?? 'Kasir'}
                />
              </View>

              <View style={s.sectionDivider} />

              {/* Actions */}
              <View style={s.detailActions}>
                <TouchableOpacity
                  style={s.actionBtnSecondary}
                  activeOpacity={0.8}
                  onPress={() => {
                    closeDetail();
                    router.push(`${routePrefix[role]}/${t.transaction_id}`);
                  }}
                >
                  <MaterialIcons name="open-in-new" size={16} color={TEXT_SECOND} />
                  <Text style={s.actionBtnSecondaryText}>Lihat Detail</Text>
                </TouchableOpacity>

                {role === 'owner' && (
                  <TouchableOpacity style={s.actionBtnAccent} activeOpacity={0.8}>
                    <MaterialIcons name="print" size={16} color={SURFACE} />
                    <Text style={s.actionBtnAccentText}>Cetak Struk</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  // ── Main ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.heading}>Riwayat Transaksi</Text>
          <Text style={s.subheading}>{transactions.length} transaksi tercatat</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={fetchData}>
          <MaterialIcons name="refresh" size={20} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {/* Search by Date */}
      <View style={s.searchRow}>
        <MaterialIcons name="calendar-today" size={18} color={ACCENT} />
        <TouchableOpacity 
          style={{ flex: 1, marginLeft: 8, justifyContent: 'center' }}
          onPress={() => setShowPicker(true)}
        >
          <Text style={{ fontSize: 13, color: selectedDate ? TEXT_PRIMARY : TEXT_LIGHT }}>
            {selectedDate 
              ? format(selectedDate, 'dd MMMM yyyy', { locale: id }) 
              : 'Semua Tanggal'}
          </Text>
        </TouchableOpacity>
        {selectedDate && (
          <TouchableOpacity onPress={() => setSelectedDate(null)}>
            <MaterialIcons name="close" size={16} color={TEXT_LIGHT} />
          </TouchableOpacity>
        )}
      </View>

      {showPicker && (
        <DateTimePicker
          value={selectedDate || new Date()}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.transaction_id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: PADDING, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <MaterialIcons name="history" size={30} color="#D1D5DB" />
              </View>
              <Text style={s.emptyText}>Belum ada transaksi</Text>
            </View>
          }
        />
      )}

      {renderDetail()}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoTile({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={it.tile}>
      <View style={it.iconWrap}>
        <MaterialIcons name={icon} size={14} color={ACCENT} />
      </View>
      <Text style={it.label}>{label}</Text>
      <Text style={it.value}>{value}</Text>
    </View>
  );
}

const it = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: '#FAFAFA', borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    paddingVertical: 14, paddingHorizontal: 14, gap: 4,
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: ACCENT_SOFT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  label: { fontSize: 11, color: TEXT_LIGHT, fontWeight: '600', letterSpacing: 0.3 },
  value: { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY },
});

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: PADDING, paddingTop: 8, paddingBottom: 12,
  },
  heading:    { fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY },
  subheading: { fontSize: 12, color: TEXT_LIGHT, marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: SURFACE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE,
    marginHorizontal: PADDING, marginBottom: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER, height: 44,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: TEXT_PRIMARY },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: SURFACE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 10,
  },
  cardIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: ACCENT_SOFT,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3,
  },
  cardId:    { fontSize: 14, fontWeight: '800', color: TEXT_PRIMARY },
  cardPrice: { fontSize: 15, fontWeight: '700', color: ACCENT, marginBottom: 5 },
  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 11, color: TEXT_LIGHT },
  cardMetaDot:  { fontSize: 11, color: TEXT_LIGHT },

  statusPill: {
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  emptyText: { fontSize: 13, color: TEXT_LIGHT, fontWeight: '500' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2,
    alignSelf: 'center', marginBottom: 18,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#F5F5F5',
    justifyContent: 'center', alignItems: 'center',
  },

  detailHeaderStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16,
  },
  detailHeroIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: ACCENT_SOFT,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: ACCENT_MED + '40',
  },
  detailHeroId: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY },

  priceBanner: {
    flexDirection: 'row', backgroundColor: '#FAFAFA',
    borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    marginBottom: 18, overflow: 'hidden',
  },
  priceCol:         { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
  priceDivider:     { width: 1, backgroundColor: BORDER },
  priceLabel:       { fontSize: 10, color: TEXT_LIGHT, fontWeight: '600', marginBottom: 4 },
  priceValueMuted:  { fontSize: 13, fontWeight: '700', color: TEXT_PRIMARY },
  priceValueAccent: { fontSize: 13, fontWeight: '800', color: ACCENT },

  infoGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },

  discountBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderRadius: 12,
    borderWidth: 1, borderColor: '#A7F3D0',
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 4, marginBottom: 4,
  },
  discountText: { fontSize: 13, fontWeight: '600', color: '#059669' },

  sectionDivider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },

  detailActions: { flexDirection: 'row', gap: 10 },
  actionBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#F3F4F6', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  actionBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: TEXT_SECOND },
  actionBtnAccent: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 14,
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  actionBtnAccentText: { fontSize: 14, fontWeight: '700', color: SURFACE },
});