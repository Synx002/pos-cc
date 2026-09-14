// app/cashier/transaction/payment.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuthStore } from '../../../stores/authStore';
import { useCartStore } from '../../../stores/cartStore';

const ACCENT       = '#E597A0';
const ACCENT_LIGHT = '#FDF2F4';

// Quick cash presets
const QUICK_AMOUNTS = [50000, 100000, 50000, 20000];

export default function PaymentScreen() {
  const router = useRouter();

  const items         = useCartStore(s => s.items);
  const subtotalFunc  = useCartStore(s => s.subtotal);
  const grandTotalFunc = useCartStore(s => s.grandTotal);
  const clearCart     = useCartStore(s => s.clearCart);
  const profile       = useAuthStore(s => s.profile);

  const [method, setMethod] = useState<'cash' | 'qris'>('cash');
  const [cashIn, setCashIn] = useState('');
  const [loading, setLoading] = useState(false);

  const totals = useMemo(() => ({
    sub:   subtotalFunc()   || 0,
    grand: grandTotalFunc() || 0,
  }), [items]);

  const cashAmount = useMemo(() => {
    const n = parseInt(cashIn.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }, [cashIn]);

  const change     = cashAmount - totals.grand;
  const shortage   = change < 0 ? Math.abs(change) : 0;
  const canProcess = method === 'qris'
    ? totals.grand > 0
    : cashAmount >= totals.grand && totals.grand > 0;

  const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

  // Add quick amount to cashIn
  const addQuick = (amount: number) => {
    const current = parseInt(cashIn.replace(/[^0-9]/g, ''), 10) || 0;
    setCashIn((current + amount).toString());
  };

  // Exact amount shortcut
  const setExact = () => setCashIn(totals.grand.toString());

  const processPayment = async () => {
    if (!profile || !canProcess || loading) return;
    setLoading(true);
    try {
      // 1. Final Stock Validation
      const productIds = items.map(i => i.product_id);
      const { data: currentStocks, error: sError } = await supabase
        .from('stocks')
        .select('product_id, available_quantity')
        .in('product_id', productIds);

      if (sError) throw sError;

      for (const item of items) {
        const stock = currentStocks?.find(s => s.product_id === item.product_id);
        const available = stock?.available_quantity ?? 0;
        if (available < item.quantity) {
          throw new Error(`Stok tidak mencukupi untuk ${item.product_name}. Tersedia: ${available}`);
        }
      }

      // 2. Create Transaction (Initially Pending)
      const { data: transaction, error: tError } = await supabase
        .from('transactions')
        .insert({
          user_id: profile.id,
          subtotal: totals.sub,
          tax: 0,
          discount: 0,
          transaction_status: 'pending',
          tenant_id: profile.tenant_id,
        })
        .select()
        .single();

      if (tError || !transaction) throw tError || new Error('Gagal membuat transaksi');

      // 3. Insert Details
      await supabase.from('transaction_details').insert(
        items.map(item => ({
          transaction_id: transaction.transaction_id,
          product_id:     item.product_id,
          quantity:       item.quantity,
          unit_price:     item.selling_price,
          item_discount:  0,
        }))
      );

      // 4. Insert Payment
      await supabase.from('payments').insert({
        transaction_id: transaction.transaction_id,
        payment_method: method,
        amount_paid:    method === 'cash' ? cashAmount : totals.grand,
        payment_status: 'success',
        change_amount:  method === 'cash' ? Math.max(0, change) : 0,
      });

      // 5. Update Status to Completed
      const { error: finalError } = await supabase.from('transactions')
        .update({ transaction_status: 'completed' })
        .eq('transaction_id', transaction.transaction_id);

      if (finalError) throw finalError;

      // 6. Deduct Stock & Log
      for (const item of items) {
        const stockRecord = currentStocks?.find(s => s.product_id === item.product_id);
        const oldQty = stockRecord?.available_quantity ?? 0;
        const newQty = oldQty - item.quantity;

        // Update Stock
        const { error: upError } = await supabase.from('stocks')
          .update({ available_quantity: newQty })
          .eq('product_id', item.product_id);
        
        if (upError) {
          console.error('Stock Update Error:', upError);
          continue; // Skip logging if update failed? Or throw?
        }

        // Log Change
        const { error: logError } = await supabase.from('stock_logs').insert({
          product_id: item.product_id,
          user_id: profile.id,
          old_quantity: oldQty,
          new_quantity: newQty,
          change_type: 'sale',
        });

        if (logError) {
          console.error('Stock Log Error:', logError);
          // Don't throw to avoid blocking the receipt, but alert the user
          alert('Gagal mencatat riwayat stok: ' + logError.message);
        }
      }

      clearCart();
      router.replace(`/cashier/transaction/receipt?id=${transaction.transaction_id}`);
    } catch (error: any) {
      console.error('Payment Error:', error);
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      
      
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Custom Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={18} color="#111827" />
          <Text style={s.backText}>Kembali</Text>
        </TouchableOpacity>

        <Text style={s.headerTitle}>Pembayaran</Text>
      </View>

        {/* ── Method Switcher ── */}
        <View style={s.switcher}>
          {(['cash', 'qris'] as const).map((m) => {
            const active = method === m;
            return (
              <TouchableOpacity
                key={m}
                style={[s.switchBtn, active && s.switchBtnActive]}
                onPress={() => setMethod(m)}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={m === 'cash' ? 'payments' : 'qr-code-scanner'}
                  size={18}
                  color={active ? ACCENT : '#9CA3AF'}
                />
                <Text style={[s.switchText, active && s.switchTextActive]}>
                  {m === 'cash' ? 'Tunai' : 'QRIS'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Cash Input ── */}
        {method === 'cash' ? (
          <View style={s.card}>
            <Text style={s.cardLabel}>Uang Diterima</Text>

            {/* Big input */}
            <View style={s.inputRow}>
              <Text style={s.rpPrefix}>Rp</Text>
              <TextInput
                style={s.bigInput}
                placeholder="0"
                placeholderTextColor="#D1D5DB"
                value={cashIn ? parseInt(cashIn, 10).toLocaleString('id-ID') : ''}
                onChangeText={(v) => setCashIn(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                autoFocus
              />
            </View>

            {/* Quick amounts */}
            <View style={s.quickRow}>
              <TouchableOpacity style={s.exactBtn} onPress={setExact}>
                <MaterialIcons name="check-circle-outline" size={14} color={ACCENT} />
                <Text style={s.exactText}>Uang Pas</Text>
              </TouchableOpacity>
              {[20000, 50000, 100000].map((amt) => (
                <TouchableOpacity key={amt} style={s.quickChip} onPress={() => addQuick(amt)}>
                  <Text style={s.quickChipText}>+{amt / 1000}rb</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Change preview */}
            {cashAmount > 0 && (
              <View style={[s.changeBox, shortage > 0 ? s.changeBoxDanger : s.changeBoxSuccess]}>
                {shortage > 0 ? (
                  <>
                    <MaterialIcons name="warning" size={16} color="#DC2626" />
                    <Text style={s.changeTextDanger}>Kurang {rp(shortage)}</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="arrow-back" size={16} color="#16A34A" />
                    <Text style={s.changeTextSuccess}>Kembalian {rp(change)}</Text>
                  </>
                )}
              </View>
            )}
          </View>
        ) : (
          /* ── QRIS ── */
          <View style={s.card}>
            <View style={s.qrisHeader}>
              <View style={s.qrisIconBg}>
                <MaterialIcons name="qr-code-scanner" size={22} color={ACCENT} />
              </View>
              <View>
                <Text style={s.qrisTitle}>Pembayaran QRIS</Text>
                <Text style={s.qrisSub}>Scan kode QR untuk membayar</Text>
              </View>
            </View>

            {/* <View style={s.qrBox}>
              <MaterialIcons name="qr-code" size={80} color="#D1D5DB" />
              <Text style={s.qrLabel}>QR Code</Text>
            </View> */}

            <View style={s.qrisAmountRow}>
              <Text style={s.qrisAmountLabel}>Total Tagihan</Text>
              <Text style={s.qrisAmount}>{rp(totals.grand)}</Text>
            </View>
          </View>
        )}

        {/* ── Order Detail ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Detail Pesanan</Text>

          {items.map((item, index) => (
            <View key={item.product_id}>
              <View style={s.orderItem}>
                <View style={s.orderItemLeft}>
                  <View style={s.orderQtyBadge}>
                    <Text style={s.orderQtyText}>{item.quantity}x</Text>
                  </View>
                  <View style={s.orderItemInfo}>
                    <Text style={s.orderItemName} numberOfLines={1}>{item.product_name}</Text>
                    <Text style={s.orderItemPrice}>{rp(item.selling_price)} / item</Text>
                  </View>
                </View>
                <View style={s.orderItemRight}>
                  <Text style={s.orderItemTotal}>
                    {rp(item.selling_price * item.quantity)}
                  </Text>
                </View>
              </View>
              {index < items.length - 1 && <View style={s.orderDivider} />}
            </View>
          ))}

          <View style={s.orderFooter}>
            <MaterialIcons name="shopping-bag" size={12} color="#9CA3AF" />
            <Text style={s.orderFooterText}>
              {items.length} produk · {items.reduce((a, i) => a + i.quantity, 0)} item
            </Text>
          </View>
        </View>

        {/* ── Order Summary ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Ringkasan Pembayaran</Text>

          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Subtotal</Text>
            <Text style={s.sumValue}>{rp(totals.sub)}</Text>
          </View>

          <View style={s.totalDivider} />

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{rp(totals.grand)}</Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Footer: Confirm Button ── */}
      <View style={s.footer}>
        {/* Status hint */}
        {method === 'cash' && !canProcess && totals.grand > 0 && (
          <View style={s.hintRow}>
            <MaterialIcons name="info-outline" size={14} color="#9CA3AF" />
            <Text style={s.hintText}>
              {cashAmount === 0 ? 'Masukkan jumlah uang yang diterima' : `Kurang ${rp(shortage)}`}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.confirmBtn, (!canProcess || loading) && s.confirmBtnDisabled]}
          onPress={processPayment}
          disabled={!canProcess || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size={20} />
          ) : (
            <>
              <MaterialIcons
                name="check-circle"
                size={20}
                color={canProcess ? '#fff' : '#9CA3AF'}
              />
              <Text style={[s.confirmText, !canProcess && s.confirmTextDisabled]}>
                Konfirmasi Pembayaran
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F8F9FB' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 8 },

  // Switcher
  switcher: {
    flexDirection: 'row', backgroundColor: '#F3F4F6',
    padding: 4, borderRadius: 16, marginBottom: 16,
  },
  switchBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12,
  },
  switchBtnActive: {
    backgroundColor: '#fff', elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  switchText:       { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  switchTextActive: { color: ACCENT },
  // Header
  header: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingBottom: 34,
  backgroundColor: '#F8F9FB',
  },
  headerTitle: {
    position: 'absolute',   // ← lepas dari flow flexbox
    left: 0,
    right: 0,
    textAlign: 'center',    // ← center terhadap lebar penuh header
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    pointerEvents: 'none',  // ← biar tidak block tombol back di belakangnya
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 8,
    borderRadius: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  headerCenter: {
    flex: 1, 
    alignItems: 'center',
  },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    marginBottom: 12, borderWidth: 1, borderColor: '#F0F0F0',
    elevation: 0,
  },
  cardLabel: {
    fontSize: 10, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16,
  },

  // Cash input
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: '#F5F5F5', paddingBottom: 12, marginBottom: 16,
  },
  rpPrefix:  { fontSize: 22, fontWeight: '700', color: '#D1D5DB', marginRight: 10 },
  bigInput:  { flex: 1, fontSize: 36, fontWeight: '800', color: '#111827', padding: 0 },

  // Quick amounts
  quickRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  exactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#FDF2F4', borderWidth: 1, borderColor: '#F0D0D7',
  },
  exactText: { fontSize: 11, fontWeight: '700', color: ACCENT },
  quickChip: {
    flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
  },
  quickChipText: { fontSize: 12, fontWeight: '700', color: '#374151' },

  // Change box
  changeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 14, padding: 12, borderRadius: 12,
  },
  changeBoxSuccess: { backgroundColor: '#F0FDF4' },
  changeBoxDanger:  { backgroundColor: '#FEF2F2' },
  changeTextSuccess: { fontSize: 14, fontWeight: '700', color: '#16A34A', flex: 1 },
  changeTextDanger:  { fontSize: 14, fontWeight: '700', color: '#DC2626', flex: 1 },

  // QRIS
  qrisHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  qrisIconBg: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: '#FDF2F4', justifyContent: 'center', alignItems: 'center',
  },
  qrisTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  qrisSub:   { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  qrBox: {
    width: 160, height: 160, borderRadius: 20, backgroundColor: '#FAFAFA',
    alignSelf: 'center', borderWidth: 1.5, borderColor: '#E5E7EB',
    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center',
    gap: 8, marginBottom: 20,
  },
  qrLabel: { fontSize: 11, color: '#C4C9D4', fontWeight: '600' },
  qrisAmountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FAFAFA', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
  },
  qrisAmountLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  qrisAmount:      { fontSize: 20, fontWeight: '800', color: ACCENT },

    // Order Detail
    orderItem: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', paddingVertical: 10,
    },
    orderItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
    orderQtyBadge: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: '#FDF2F4', justifyContent: 'center', alignItems: 'center',
    },
    orderQtyText:    { fontSize: 12, fontWeight: '800', color: ACCENT },
    orderItemInfo:   { flex: 1 },
    orderItemName:   { fontSize: 13, fontWeight: '700', color: '#111827' },
    orderItemPrice:  { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    orderItemRight:  { alignItems: 'flex-end' },
    orderItemTotal:  { fontSize: 13, fontWeight: '700', color: '#374151' },
    orderItemDiscount: { fontSize: 11, color: ACCENT, marginTop: 2 },
    orderDivider:    { height: 1, backgroundColor: '#F5F5F5' },
    orderFooter: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5',
    },
    orderFooterText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

    // Summary
    sumRow: {
      flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
    },
    sumLabel: { fontSize: 13, color: '#9CA3AF' },
    sumValue: { fontSize: 13, color: '#374151', fontWeight: '600' },
    totalDivider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 12 },
    totalRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    totalLabel: { fontSize: 15, fontWeight: '800', color: '#111827' },
    totalValue: { fontSize: 24, fontWeight: '800', color: ACCENT },

    // Footer
    footer: {
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0',
      gap: 10,
    },
    hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    hintText: { fontSize: 12, color: '#9CA3AF' },
    confirmBtn: {
      height: 56, backgroundColor: ACCENT, borderRadius: 16,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    },
    confirmBtnDisabled: { backgroundColor: '#E5E7EB' },
    confirmText:         { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
    confirmTextDisabled: { color: '#9CA3AF' },
});