// pages/StocksPage.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  StyleSheet,
  useWindowDimensions,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

const ACCENT   = '#E597A0';
const PADDING  = 16;
const GAP      = 10;

type Role = 'owner' | 'storeman' | 'cashier';
type Props = { role: Role };

export default function StocksPage({ role }: Props) {
  const router  = useRouter();
  const profile = useAuthStore(s => s.profile);
  const { width, height } = useWindowDimensions();

  const isPortraitPhone = width < 600 && width < height;
  const colWidth = isPortraitPhone ? '50%' : '25%';

  const [products, setProducts]           = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [visible, setVisible]             = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [newStock, setNewStock]           = useState('');
  const [updating, setUpdating]           = useState(false);
  const [stockLogs, setStockLogs]         = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs]    = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, tenants(tenant_name), stocks(available_quantity)')
        .eq('is_active', true)
        .order('product_name');
      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const filtered = products.filter((p) =>
    p.product_name.toLowerCase().includes(search.toLowerCase())
  );

  const fetchStockLogs = async (productId: number) => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('stock_logs')
        .select('*, profiles(user_name)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setStockLogs(data || []);
    } catch (e) {
      console.error(e);
      setStockLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const openModal = (product: any) => {
    setSelectedProduct(product);
    const stockData = Array.isArray(product.stocks) ? product.stocks[0] : product.stocks;
    setNewStock(stockData?.available_quantity?.toString() || '0');
    setVisible(true);
    if (product?.product_id) fetchStockLogs(product.product_id);
  };

  const handleUpdate = async () => {
    if (!selectedProduct || !profile) return;
    setUpdating(true);
    try {
      const stockData = Array.isArray(selectedProduct.stocks) ? selectedProduct.stocks[0] : selectedProduct.stocks;
      const oldQty = stockData?.available_quantity ?? 0;
      const newQty = parseInt(newStock, 10) || 0;

      const { error } = await supabase.from('stocks').upsert({
        product_id: selectedProduct.product_id,
        available_quantity: newQty,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'product_id' });

      if (error) throw error;

      const { error: logError } = await supabase.from('stock_logs').insert({
        product_id: selectedProduct.product_id,
        user_id:    profile.id,
        old_quantity: oldQty,
        new_quantity: newQty,
        change_type:  'manual',
      });

      if (logError) {
        console.error('Stock Log Error:', logError);
        alert('Gagal mencatat riwayat stok: ' + logError.message);
      }

      Alert.alert('Sukses', 'Stok berhasil diperbarui');
      setVisible(false);
      fetchProducts();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUpdating(false);
    }
  };

  const historyRoute    = role === 'owner' ? '/owner/stock/history' : '/storeman/stock/history';
  const canViewHistory  = role === 'owner' || role === 'storeman';

  // ── Product Card ─────────────────────────────────────────────────────────
  const ProductCard = ({ item }: { item: any }) => {
    const stockData  = Array.isArray(item.stocks) ? item.stocks[0] : item.stocks;
    const stock      = stockData?.available_quantity ?? 0;
    const isEmpty    = stock === 0;
    const isLow      = stock > 0 && stock <= 5;

    const badgeBg    = isEmpty ? '#FEE2E2' : isLow ? '#FEF3C7' : '#ECFDF5';
    const badgeColor = isEmpty ? '#B91C1C' : isLow ? '#92400E' : '#10B981';
    const dotColor   = isEmpty ? '#EF4444' : isLow ? '#F59E0B' : '#10B981';
    const iconName   = isEmpty ? 'error-outline' : isLow ? 'warning' : 'check-circle';
    const iconBg     = isEmpty ? '#FEE2E2' : isLow ? '#FEF3C7' : ACCENT + '15';
    const iconColor  = isEmpty ? '#B91C1C' : isLow ? '#92400E' : ACCENT;

    return (
      <View style={{ width: colWidth, padding: GAP / 2 }}>
        <TouchableOpacity
          style={s.card}
          onPress={() => openModal(item)}
          activeOpacity={0.8}
        >
          {/* Badge row */}
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: badgeBg }]}>
              <View style={[s.dot, { backgroundColor: dotColor }]} />
              <Text style={[s.badgeText, { color: badgeColor }]}>
                {isEmpty ? 'Habis' : isLow ? 'Menipis' : 'Tersedia'}
              </Text>
            </View>
            <Text style={s.tenantLabel} numberOfLines={1}>
              {item.tenants?.tenant_name ?? 'Produk Sendiri'}
            </Text>
          </View>

          {/* Image — same structure as POSScreen */}
          <View style={s.cardImageWrap}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={s.productImage} resizeMode="cover" />
            ) : (
              <View style={[s.cardIcon, { backgroundColor: iconBg }]}>
                <MaterialIcons name={iconName as any} size={20} color={iconColor} />
              </View>
            )}
          </View>

          <Text style={s.productName} numberOfLines={2}>{item.product_name}</Text>

          {/* Stock count */}
          <View style={[s.stockRow, { backgroundColor: badgeBg }]}>
            <Text style={[s.stockNum, { color: badgeColor }]}>{stock}</Text>
            <Text style={[s.stockLabel, { color: badgeColor }]}>stok</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FB' }}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.heading}>Kelola Stok</Text>
          <Text style={s.subheading}>Update ketersediaan produk</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canViewHistory && (
            <TouchableOpacity style={s.refreshBtn} onPress={() => router.push(historyRoute)}>
              <MaterialIcons name="history" size={20} color={ACCENT} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.refreshBtn} onPress={fetchProducts}>
            <MaterialIcons name="refresh" size={20} color={ACCENT} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <MaterialIcons name="search" size={18} color="#C0C4CC" />
        <TextInput
          style={s.searchInput}
          placeholder="Cari produk..."
          placeholderTextColor="#C0C4CC"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="close" size={16} color="#C0C4CC" />
          </TouchableOpacity>
        )}
      </View>

      {/* Grid */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: GAP / 2, paddingHorizontal: PADDING - GAP / 2, paddingBottom: 40 }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {filtered.length === 0 ? (
              <View style={[s.emptyWrap, { width: '100%' }]}>
                <View style={s.emptyIcon}>
                  <MaterialIcons name="inventory-2" size={30} color="#D1D5DB" />
                </View>
                <Text style={s.emptyText}>Tidak ada produk</Text>
              </View>
            ) : (
              filtered.map(item => <ProductCard key={item.product_id} item={item} />)
            )}
          </View>
        </ScrollView>
      )}

      {/* Update Stock Modal */}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={s.modalBg}>
          <View style={s.modalBox}>
            <View style={s.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>

            <View style={s.modalHeader}>
              {selectedProduct?.image_url ? (
                <Image source={{ uri: selectedProduct.image_url }} style={s.modalHeroImage} resizeMode="cover" />
              ) : (
                <View style={s.modalHeroPlaceholder}>
                  <MaterialIcons name="inventory-2" size={24} color={ACCENT} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.modalTitle}>Ubah Stok</Text>
                <Text style={s.modalSub} numberOfLines={2}>{selectedProduct?.product_name}</Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => { setVisible(false); setStockLogs([]); }}>
                <MaterialIcons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={s.stockInputWrap}>
              <TouchableOpacity
                style={s.qtyBtn}
                onPress={() => setNewStock((prev) => Math.max(0, parseInt(prev || '0', 10) - 1).toString())}
                activeOpacity={0.7}
              >
                <MaterialIcons name="remove" size={20} color={ACCENT} />
              </TouchableOpacity>

              <TextInput
                style={s.stockInput}
                value={newStock}
                onChangeText={setNewStock}
                keyboardType="numeric"
                textAlign="center"
              />

              <TouchableOpacity
                style={s.qtyBtn}
                onPress={() => setNewStock((prev) => (parseInt(prev || '0', 10) + 1).toString())}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add" size={20} color={ACCENT} />
              </TouchableOpacity>
            </View>

            {/* Riwayat Perubahan Stok */}
            <View style={s.historySection}>
              <View style={s.historyHeader}>
                <MaterialIcons name="history" size={18} color={ACCENT} />
                <Text style={s.historyTitle}>Riwayat Perubahan Stok</Text>
              </View>
              {loadingLogs ? (
                <View style={s.historyLoading}>
                  <ActivityIndicator size="small" color={ACCENT} />
                  <Text style={s.historyLoadingText}>Memuat...</Text>
                </View>
              ) : stockLogs.length === 0 ? (
                <View style={s.historyEmpty}>
                  <Text style={s.historyEmptyText}>Belum ada riwayat perubahan</Text>
                </View>
              ) : (
                <ScrollView
                  style={s.historyScroll}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {stockLogs.map((item) => {
                    const isSale = item.change_type === 'sale';
                    const qtyChange = item.new_quantity - item.old_quantity;
                    const isIncrease = qtyChange > 0;
                    return (
                      <View key={item.id ?? item.created_at} style={s.logItem}>
                        <View style={[s.logIconBg, { backgroundColor: isSale ? '#E0F2FE' : isIncrease ? '#DCFCE7' : '#FEE2E2' }]}>
                          <MaterialIcons
                            name={isSale ? 'shopping-cart' : isIncrease ? 'add' : 'remove'}
                            size={16}
                            color={isSale ? '#0369A1' : isIncrease ? '#15803D' : '#B91C1C'}
                          />
                        </View>
                        <View style={s.logInfo}>
                          <Text style={s.logMeta}>
                            Oleh: <Text style={s.logBold}>{item.profiles?.user_name || 'User'}</Text> • {isSale ? 'Penjualan' : 'Manual'}
                          </Text>
                          <Text style={s.logTime}>
                            {format(new Date(item.created_at), 'd MMM yyyy, HH:mm', { locale: id })}
                          </Text>
                        </View>
                        <View style={s.logQtySection}>
                          <Text style={s.logQtyRange}>{item.old_quantity} → {item.new_quantity}</Text>
                          <Text style={[s.logQtyChange, { color: isIncrease ? '#16A34A' : '#DC2626' }]}>
                            {isIncrease ? '+' : ''}{qtyChange}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setVisible(false); setStockLogs([]); }}>
                <Text style={s.cancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, { opacity: updating ? 0.6 : 1 }]}
                onPress={handleUpdate}
                disabled={updating}
                activeOpacity={0.85}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="check" size={16} color="#fff" />
                    <Text style={s.saveBtnText}>Perbarui</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: PADDING, paddingTop: 8, paddingBottom: 12,
  },
  heading:    { fontSize: 17, fontWeight: '700', color: '#111827' },
  subheading: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F0F0F0',
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: PADDING, marginBottom: 12,
    paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#F0F0F0', height: 44,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 13, color: '#111827' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Card ──
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },

  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 20, alignSelf: 'flex-start',
  },
  dot:       { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // ── Image — same as POSScreen ──
  cardImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#FDF2F4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: 8,
  },
  productImage: { width: '100%', height: '100%' },
  cardIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  productName: { fontSize: 12, fontWeight: '700', color: '#111827', lineHeight: 17, marginBottom: 6 },
  tenantLabel: { fontSize: 10, color: '#9CA3AF', lineHeight: 14 },

  stockRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10,
  },
  stockNum:   { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  stockLabel: { fontSize: 10, fontWeight: '600' },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  emptyText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },

  // ── Modal ──
  modalBg:  { flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  modalHeroImage: {
    width: 56, height: 56, borderRadius: 12,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  modalHeroPlaceholder: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: ACCENT + '15', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalSub:   { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },

  stockInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 16, marginBottom: 24,
  },
  qtyBtn: {
    width: 48, height: 48, borderRadius: 14,
    borderWidth: 1, borderColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
    alignItems: 'center', justifyContent: 'center',
  },
  stockInput: {
    width: 88, height: 56, fontSize: 26, fontWeight: '800',
    borderWidth: 1, borderColor: '#F0F0F0', borderRadius: 14,
    color: '#111827', backgroundColor: '#FAFAFA',
  },

  // ── History section in modal ──
  historySection: {
    marginBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  historyLoading: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 20,
  },
  historyLoadingText: { fontSize: 13, color: '#9CA3AF' },
  historyEmpty: { paddingVertical: 20, alignItems: 'center' },
  historyEmptyText: { fontSize: 13, color: '#9CA3AF' },
  historyScroll: {
    maxHeight: 260,
  },
  logItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAFA', borderRadius: 12, padding: 10,
    marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0',
  },
  logIconBg: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  logInfo: { flex: 1 },
  logMeta: { fontSize: 11, color: '#6B7280' },
  logBold: { fontWeight: '700', color: '#374151' },
  logTime: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  logQtySection: { alignItems: 'flex-end' },
  logQtyRange: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  logQtyChange: { fontSize: 14, fontWeight: '800' },

  cancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0',
    backgroundColor: '#FAFAFA',
  },
  cancelText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, backgroundColor: ACCENT,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});