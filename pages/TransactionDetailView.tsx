// components/TransactionDetailView.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildReceiptHtml } from '../lib/receiptTemplate';
import { getStoreInfo } from '../lib/storeSettings';

const ACCENT = '#C8576A';
const ACCENT_LIGHT = '#FDF2F4';

interface Props {
  transactionId: string;
  onBack: () => void;
  role?: 'cashier' | 'owner' | 'storeman';
}

export default function TransactionDetailView({ transactionId, onBack, role = 'cashier' }: Props) {
  const [transaction, setTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [storeInfo, setStoreInfo] = useState<{ store_name: string; store_address: string } | null>(null);

  useEffect(() => {
    if (transactionId) fetchTransaction();
  }, [transactionId]);

  useEffect(() => {
    getStoreInfo().then(setStoreInfo);
  }, []);

  const fetchTransaction = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`*, transaction_details(*, products(*)), payments(*), profiles(user_name)`)
        .eq('transaction_id', transactionId)
        .single();
      if (error) throw error;
      setTransaction(data);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Gagal memuat detail transaksi');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!transaction) return;
    setPrinting(true);
    try {
      const store = await getStoreInfo();
      const html = buildReceiptHtml(transaction, store);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Cetak Struk' });
      } else {
        await Print.printAsync({ html });
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Gagal mencetak struk. Coba lagi.');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={s.loadingText}>Memuat detail...</Text>
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={s.center}>
        <MaterialIcons name="error-outline" size={48} color="#D1D5DB" />
        <Text style={s.notFoundText}>Detail tidak ditemukan</Text>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backBtnText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const payment = transaction.payments?.[0];
  const total = transaction.grand_total ?? transaction.subtotal;
  const dateStr = format(new Date(transaction.created_at), 'dd MMMM yyyy, HH:mm', { locale: idLocale });
  const receiptNo = `#${transaction.transaction_id.toString().padStart(8, '0').slice(-8)}`;
  const statusLabel = transaction.transaction_status === 'completed' ? 'LUNAS' : (transaction.transaction_status ?? '-').toUpperCase();

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backIcon}>
          <MaterialIcons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={s.title}>Detail Transaksi</Text>
        <TouchableOpacity onPress={handlePrint} disabled={printing} style={s.printIcon}>
          {printing ? <ActivityIndicator size={20} color={ACCENT} /> : <MaterialIcons name="print" size={24} color={ACCENT} />}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <View style={s.card}>
          <View style={s.receiptTopBar} />
          <View style={s.receiptHeader}>
            <View style={s.checkCircle}>
              <MaterialIcons name="check" size={28} color="#059669" />
            </View>
            <Text style={s.cafeName}>{storeInfo?.store_name ?? 'Selasar Kafe'}</Text>
            <Text style={s.cafeAddr}>{storeInfo?.store_address ?? 'Jl. Raya No. 123, Bandung'}</Text>
            <Text style={s.dateText}>{dateStr}</Text>
          </View>

          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>No. Struk</Text>
              <Text style={s.metaValue}>{receiptNo}</Text>
            </View>
            <View style={s.metaDivider} />
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Pembayaran</Text>
              <Text style={s.metaValue}>{(payment?.payment_method ?? '-').toUpperCase()}</Text>
            </View>
            <View style={s.metaDivider} />
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Status</Text>
              <Text style={[s.metaValue, { color: '#059669' }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={s.dashed} />
          <Text style={s.sectionLabel}>Daftar Pesanan</Text>
          {transaction.transaction_details?.map((item: any, idx: number) => (
            <View key={idx} style={s.itemRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={s.itemName} numberOfLines={2}>{item.products?.product_name ?? '-'}</Text>
                <Text style={s.itemQty}>{item.quantity} × Rp {item.unit_price?.toLocaleString('id-ID')}</Text>
              </View>
              <Text style={s.itemTotal}>Rp {(item.quantity * item.unit_price).toLocaleString('id-ID')}</Text>
            </View>
          ))}

          <View style={s.dashed} />
          <View style={s.summaryBlock}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Subtotal</Text>
              <Text style={s.summaryValue}>Rp {transaction.subtotal?.toLocaleString('id-ID')}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total Pembayaran</Text>
              <Text style={s.totalValue}>Rp {total.toLocaleString('id-ID')}</Text>
            </View>
          </View>

          {payment?.payment_method === 'cash' && (
            <View style={s.cashSection}>
              <View style={s.cashRow}>
                <Text style={s.cashLabel}>Bayar Tunai</Text>
                <Text style={s.cashValue}>Rp {payment.amount_paid?.toLocaleString('id-ID')}</Text>
              </View>
              <View style={s.cashRow}>
                <Text style={s.cashLabel}>Kembalian</Text>
                <Text style={[s.cashValue, { color: '#059669', fontWeight: '700' }]}>
                  Rp {payment.change_amount?.toLocaleString('id-ID')}
                </Text>
              </View>
            </View>
          )}

          <View style={s.dashed} />
          <View style={s.receiptFooter}>
            <Text style={s.footerThanks}>Terima kasih atas kunjungan Anda</Text>
            <Text style={s.footerSub}>Sampai jumpa di kunjungan berikutnya</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },
  notFoundText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  backBtn: { backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backIcon: { width: 40, height: 40, justifyContent: 'center' },
  printIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  title: { fontSize: 17, fontWeight: '700', color: '#111' },

  scrollContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  receiptTopBar: { height: 4, backgroundColor: ACCENT },

  receiptHeader: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  checkCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  cafeName: { fontSize: 18, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  cafeAddr: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  dateText: { fontSize: 11, color: '#9CA3AF', marginTop: 5 },

  metaRow: {
    flexDirection: 'row', backgroundColor: '#F9FAFB',
    paddingVertical: 14, paddingHorizontal: 12,
  },
  metaItem: { flex: 1, alignItems: 'center' },
  metaLabel: { fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600', marginBottom: 4 },
  metaValue: { fontSize: 11, fontWeight: '700', color: '#111827' },
  metaDivider: { width: 1, backgroundColor: '#E5E7EB' },

  dashed: {
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB',
    marginVertical: 16, marginHorizontal: 20, borderRadius: 1,
  },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, paddingHorizontal: 20,
  },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  itemName: { fontSize: 13, fontWeight: '600', color: '#374151' },
  itemQty: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: '#374151' },

  summaryBlock: {
    backgroundColor: '#FAFAFA', padding: 16, marginHorizontal: 20, marginVertical: 4, borderRadius: 12,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 12, color: '#6B7280' },
  summaryValue: { fontSize: 12, color: '#374151', fontWeight: '500' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 20, fontWeight: '800', color: ACCENT },

  cashSection: {
    backgroundColor: '#ECFDF5', marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  cashLabel: { fontSize: 12, color: '#374151' },
  cashValue: { fontSize: 12, color: '#374151' },

  receiptFooter: { alignItems: 'center', padding: 20, backgroundColor: '#F9FAFB' },
  footerThanks: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 4 },
  footerSub: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
});
