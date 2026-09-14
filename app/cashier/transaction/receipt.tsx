// app/cashier/transaction/receipt.tsx
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildReceiptHtml, buildReceiptEscPos } from '../../../lib/receiptTemplate';
import { getStoreInfo } from '../../../lib/storeSettings';
import {
  isBluetoothPrinterAvailable,
  getSavedPrinter,
  connectPrinter,
  getConnectedAddress,
  printReceiptEscPos,
} from '../../../lib/bluetoothPrinter';

const ACCENT = '#C8576A';
const ACCENT_LIGHT = '#FDF2F4';

export default function ReceiptScreen() {
  const { id: transactionId } = useLocalSearchParams();
  const router = useRouter();
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
        .select(`*, transaction_details(*, products(*)), payments(*)`)
        .eq('transaction_id', transactionId)
        .single();
      if (error) throw error;
      setTransaction(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!transaction) return;
    setPrinting(true);
    try {
      // Coba cetak ke printer Bluetooth thermal (Android)
      if (isBluetoothPrinterAvailable()) {
        const saved = await getSavedPrinter();
        if (saved) {
          const connected = await getConnectedAddress();
          if (connected !== saved.address) {
            await connectPrinter(saved.address);
          }
          const store = await getStoreInfo();
          const commands = buildReceiptEscPos(transaction, store);
          await printReceiptEscPos(commands);
          setPrinting(false);
          return;
        }
        // Bluetooth tersedia tapi printer belum disimpan — tanya user
        setPrinting(false);
        Alert.alert(
          'Printer Belum Dihubungkan',
          'Untuk mencetak ke printer thermal Bluetooth, Anda harus menghubungkan printer terlebih dahulu di Pengaturan → Printer Struk.\n\nLanjutkan dengan PDF/share?',
          [
            { text: 'Batal', style: 'cancel' },
            {
              text: 'Ke Pengaturan Printer',
              onPress: () => router.push('/cashier/settings/printer'),
            },
            {
              text: 'Cetak PDF',
              onPress: async () => {
                setPrinting(true);
                try {
                  await doPrintPdf(transaction);
                } catch (e: any) {
                  Alert.alert('Gagal', e?.message || 'Gagal mencetak struk.');
                } finally {
                  setPrinting(false);
                }
              },
            },
          ]
        );
        return;
      }

      // Fallback: PDF/share (Bluetooth tidak tersedia, mis. iOS / Expo Go)
      await doPrintPdf(transaction);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Gagal', e?.message || 'Gagal mencetak struk. Coba lagi.');
    } finally {
      setPrinting(false);
    }
  };

  const doPrintPdf = async (tx: typeof transaction) => {
    if (!tx) return;
    const store = await getStoreInfo();
    const html = buildReceiptHtml(tx, store);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Cetak / Simpan Struk' });
    } else {
      await Print.printAsync({ html });
    }
  };

  // ── Loading / Not Found ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.center}>
        <View style={s.loadingIcon}>
          <MaterialIcons name="receipt-long" size={28} color={ACCENT} />
        </View>
        <Text style={s.loadingText}>Memuat struk...</Text>
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={s.center}>
        <MaterialIcons name="error-outline" size={48} color="#D1D5DB" />
        <Text style={s.notFoundText}>Struk tidak ditemukan</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/cashier/transaction')}>
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
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.headerTitle}>Struk Transaksi</Text>
        </View>

        {/* Receipt Card - Professional layout */}
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

      {/* ── Action Buttons ── */}
      <View style={s.actions}>
        {/* New transaction */}
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => router.replace('/cashier/transaction')}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={20} color={ACCENT} />
          <Text style={s.newBtnText}>Transaksi Baru</Text>
        </TouchableOpacity>
        
        {/* Print */}
        <TouchableOpacity
          style={[s.printBtn, printing && { opacity: 0.7 }]}
          onPress={handlePrint}
          disabled={printing}
          activeOpacity={0.85}
        >
          {printing
            ? <MaterialIcons name="hourglass-top" size={20} color="#fff" />
            : <MaterialIcons name="print" size={20} color="#fff" />
          }
          <Text style={s.printBtnText}>{printing ? 'Mencetak...' : 'Cetak Struk'}</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FB', gap: 12 },
  loadingIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#FDF2F4',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  loadingText:  { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  notFoundText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
  header: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingTop: Platform.OS === 'ios' ? 56 : 16,
  paddingBottom: 14,

  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,  
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },


  backText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    pointerEvents: 'none',
  },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  // Receipt card
  card: {
    backgroundColor: '#fff', borderRadius: 16, marginTop: 24,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  receiptTopBar: {
    height: 4, backgroundColor: ACCENT,
  },

  // Header
  receiptHeader: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  checkCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  cafeName: { fontSize: 18, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  cafeAddr: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  dateText:  { fontSize: 10, color: '#C4C9D4', marginTop: 5 },

  // Meta row
  metaRow: {
    flexDirection: 'row', backgroundColor: '#F9FAFB',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  metaItem:    { flex: 1, alignItems: 'center' },
  metaLabel:   { fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  metaValue:   { fontSize: 12, fontWeight: '800', color: '#111827', marginTop: 4 },
  metaDivider: { width: 1, backgroundColor: '#EEEEEE' },

  // Dashed line
  dashed: {
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#F0F0F0',
    marginVertical: 16, borderRadius: 1,
  },

  // Items
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, paddingHorizontal: 20,
  },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  itemName:  { fontSize: 13, fontWeight: '600', color: '#374151' },
  itemQty:   { fontSize: 11, color: '#6B7280', marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '700', color: '#374151' },

  // Summary
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

  // Cash
  cashSection: {
    backgroundColor: '#ECFDF5', marginHorizontal: 20, marginTop: 16, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  cashRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  cashLabel: { fontSize: 12, color: '#374151' },
  cashValue: { fontSize: 12, color: '#374151' },

  // Footer
  receiptFooter: { alignItems: 'center', padding: 20, backgroundColor: '#F9FAFB' },
  footerThanks: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 4 },
  footerSub:    { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },

  // Action buttons
  actions: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  printBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 14,
  },
  printBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  newBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: ACCENT, borderRadius: 16, paddingVertical: 14,
    backgroundColor: ACCENT_LIGHT,
  },
  newBtnText: { fontSize: 14, fontWeight: '700', color:ACCENT },
});