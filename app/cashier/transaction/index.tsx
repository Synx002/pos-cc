import React, { useState, useEffect, useMemo } from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../stores/cartStore';

const ACCENT       = '#E597A0';
const ACCENT_LIGHT = '#FDF2F4';

export default function POSScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const items         = useCartStore(state => state.items);
  const addItem       = useCartStore(state => state.addItem);
  const updateQty     = useCartStore(state => state.updateQty);
  const subtotalFunc  = useCartStore(state => state.subtotal);
  const grandTotalFunc = useCartStore(state => state.grandTotal);
  const clearCart     = useCartStore(state => state.clearCart);

  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);

  const fetchProducts = async (keyword = '') => {
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select('*, tenants(tenant_name, status), stocks(available_quantity)')
        .eq('is_active', true)
        .order('product_name', { ascending: true })
        .limit(300);

      if (keyword.trim()) {
        query = query.ilike('product_name', `%${keyword.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Sembunyikan produk dari tenant yang nonaktif
      const getTenant = (p: any) => Array.isArray(p.tenants) ? p.tenants[0] : p.tenants;
      const visible = (data || []).filter(
        (p) => !p.tenant_id || getTenant(p)?.status === true
      );
      setProducts(visible);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const totalItems = useMemo(
    () => items.reduce((acc, curr) => acc + curr.quantity, 0),
    [items]
  );

  const filteredProducts = products;

  const subtotal   = subtotalFunc();
  const grandTotal = grandTotalFunc();

  const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

  // ── Product Card ──────────────────────────────────────────────────────────
  const ProductCard = ({ item }: { item: any }) => {
    const stock = Array.isArray(item.stocks)
      ? item.stocks[0]?.available_quantity
      : item.stocks?.available_quantity;
    const isOutOfStock = (stock || 0) <= 0;
    const colWidth     = isMobile ? '50%' : '33.333%';

    return (
      <View style={{ width: colWidth, padding: 6 }}>
        <TouchableOpacity
          onPress={() => !isOutOfStock && addItem(item)}
          activeOpacity={isOutOfStock ? 1 : 0.75}
          style={[s.productCard, isOutOfStock && { opacity: 0.55 }]}
        >
          {/* Image */}
          <View style={s.productImageWrap}>
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={s.productImage}
                resizeMode="cover"
              />
            ) : (
              <MaterialIcons name="fastfood" size={32} color={ACCENT} />
            )}
            {isOutOfStock && (
              <View style={s.outOfStockOverlay}>
                <Text style={s.outOfStockText}>Stok Habis</Text>
              </View>
            )}
          </View>

          {/* Info */}
          <View style={s.nameRow}>
            <Text style={s.productName} numberOfLines={2}>{item.product_name}</Text>
            {item.discount_price ? (
              <View style={s.discountBadge}>
                <Text style={s.discountBadgeText}>DISKON</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.tenantLabel} numberOfLines={1}>
            {item.tenants?.tenant_name ?? 'Produk Sendiri'}
          </Text>
          <View style={s.priceRow}>
            {item.discount_price ? (
              <>
                <Text style={s.productPriceOriginal}>{rp(item.selling_price)}</Text>
                <Text style={s.productPriceDiscount}>{rp(item.discount_price)}</Text>
              </>
            ) : (
              <Text style={s.productPrice}>{rp(item.selling_price)}</Text>
            )}
          </View>

          {/* Stock badge */}
          <View style={s.stockRow}>
            <MaterialIcons
              name="inventory"
              size={10}
              color={isOutOfStock ? '#EF4444' : '#9CA3AF'}
            />
            <Text style={[s.stockText, isOutOfStock && s.stockTextEmpty]}>
              Stok: {stock || 0}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Cart Item ─────────────────────────────────────────────────────────────
  const CartItem = ({ item }: { item: any }) => {
    const [qtyInput, setQtyInput] = React.useState(item.quantity.toString());

    React.useEffect(() => {
      setQtyInput(item.quantity.toString());
    }, [item.quantity]);

    const commitQty = (val: string) => {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) {
        updateQty(item.product_id, parsed);
      } else {
        setQtyInput(item.quantity.toString());
      }
    };

    return (
      <View style={s.cartItem}>
        <View style={s.cartImageWrap}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={s.cartImage} resizeMode="cover" />
          ) : (
            <MaterialIcons name="fastfood" size={16} color={ACCENT} />
          )}
        </View>

        <View style={s.cartInfo}>
          <Text style={s.cartName} numberOfLines={1}>{item.product_name}</Text>
          <Text style={s.cartPrice}>{rp(item.discount_price ?? item.selling_price)}</Text>
        </View>

        <View style={s.qtyControl}>
          <TouchableOpacity
            style={s.qtyBtn}
            onPress={() => updateQty(item.product_id, item.quantity - 1)}
          >
            <MaterialIcons name="remove" size={14} color={ACCENT} />
          </TouchableOpacity>
          <TextInput
            style={s.qtyInput}
            value={qtyInput}
            onChangeText={setQtyInput}
            onBlur={() => commitQty(qtyInput)}
            onSubmitEditing={() => commitQty(qtyInput)}
            keyboardType="numeric"
            selectTextOnFocus
            maxLength={4}
          />
          <TouchableOpacity
            style={s.qtyBtn}
            onPress={() => updateQty(item.product_id, item.quantity + 1)}
          >
            <MaterialIcons name="add" size={14} color={ACCENT} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, isMobile ? s.rootMobile : s.rootDesktop]}>

      {/* ════════════════ LEFT: Product Area ════════════════ */}
      <View style={s.productArea}>

        {/* Desktop header */}
        {!isMobile && (
          <View style={s.desktopHeader}>
            <View style={s.desktopHeaderLeft}>
              <Text style={s.desktopHeaderTitle}>Menu Tersedia</Text>
              <Text style={s.desktopHeaderSub}>Klik menu untuk menambah pesanan</Text>
            </View>
            <View style={[s.searchWrap, s.searchWrapDesktop]}>
              <MaterialIcons name="search" size={18} color="#9CA3AF" />
              <TextInput
                placeholder="Cari menu..."
                value={search}
                onChangeText={setSearch}
                style={s.searchInput}
                placeholderTextColor="#C4C9D4"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialIcons name="close" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Mobile search bar */}
        {isMobile && (
          <View style={s.mobileSearch}>
            <View style={[s.searchWrap, s.searchWrapMobile]}>
              <MaterialIcons name="search" size={18} color="#9CA3AF" />
              <TextInput
                placeholder="Cari menu..."
                value={search}
                onChangeText={setSearch}
                style={s.searchInput}
                placeholderTextColor="#C4C9D4"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialIcons name="close" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Product Grid */}
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator color={ACCENT} size="large" />
            <Text style={s.loadingText}>Memuat menu...</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.gridContent}
          >
            <View style={s.grid}>
              {filteredProducts.length === 0 ? (
                <View style={s.emptyWrap}>
                  <MaterialIcons name="inventory-2" size={48} color="#E5E7EB" />
                  <Text style={s.emptyText}>Menu tidak ditemukan</Text>
                </View>
              ) : (
                filteredProducts.map(item => (
                  <ProductCard key={item.product_id} item={item} />
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ════════════════ RIGHT: Cart Panel ════════════════ */}
      <View style={[s.cartPanel, isMobile ? s.cartPanelMobile : s.cartPanelDesktop]}>

        {/* Cart Header */}
        <View style={s.cartHeader}>
          <View style={s.cartHeaderLeft}>
            <View style={s.cartIconWrap}>
              <MaterialIcons name="shopping-bag" size={18} color={ACCENT} />
            </View>
            <View>
              <Text style={s.cartTitle}>Pesanan</Text>
              <Text style={s.cartCount}>{totalItems} item dipilih</Text>
            </View>
          </View>
          {totalItems > 0 && (
            <TouchableOpacity style={s.clearBtn} onPress={clearCart}>
              <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
              <Text style={s.clearText}>Hapus</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cart Items */}
        <FlatList
          key={isMobile ? 'mobile-2col' : 'desktop-3col'}
          data={items}
          keyExtractor={item => item.product_id.toString()}
          contentContainerStyle={s.cartList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <CartItem item={item} />}
          ListEmptyComponent={
            <View style={s.cartEmpty}>
              <MaterialIcons name="shopping-basket" size={36} color="#E5E7EB" />
              <Text style={s.cartEmptyText}>Belum ada pesanan</Text>
            </View>
          }
        />

        {/* Footer Summary */}
        <View style={s.cartFooter}>
          {/* Breakdown */}
          <View style={s.breakdown}>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Subtotal</Text>
              <Text style={s.breakdownValue}>{rp(subtotal)}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={s.dashed} />

          {/* Grand Total */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{rp(grandTotal)}</Text>
          </View>

          {/* Pay Button */}
          <TouchableOpacity
            onPress={() => router.push('/cashier/transaction/payment')}
            disabled={items.length === 0}
            activeOpacity={0.85}
            style={[s.payBtn, items.length === 0 && s.payBtnDisabled]}
          >
            <MaterialIcons
              name="payment"
              size={20}
              color={items.length === 0 ? '#9CA3AF' : '#fff'}
            />
            <Text style={[s.payBtnText, items.length === 0 && s.payBtnTextDisabled]}>
              Bayar Sekarang
            </Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#F8F9FB' },
  rootMobile:    { flexDirection: 'column' },
  rootDesktop:   { flexDirection: 'row' },

  // ── Product Area ──
  productArea: { flex: 1 },

  desktopHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  desktopHeaderLeft: { flexShrink: 0 },
  desktopHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  desktopHeaderSub:   { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

  mobileSearch: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8F9FB', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, borderWidth: 1, borderColor: '#F0F0F0',
  },
  searchWrapDesktop: { maxWidth: 320, flexShrink: 1, minWidth: 0 },
  searchWrapMobile:  { alignSelf: 'stretch', minWidth: 0 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0, minWidth: 0 },

  gridContent: { padding: 10, paddingBottom: 20 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap' },

  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingText: { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, width: '100%' },
  emptyText:   { fontSize: 13, color: '#C4C9D4', marginTop: 10, fontWeight: '500' },

  // ── Product Card ──
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    maxWidth: 260,       // ← prevents over-stretching
    alignSelf: 'flex-start', // ← stays natural width
  },
  // Ganti productImageWrap style
productImageWrap: {
  width: '100%',
  aspectRatio: 1,        // ← square, menyesuaikan lebar card otomatis
  borderRadius: 12,
  backgroundColor: '#FDF2F4',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 10,
  overflow: 'hidden',
},
productImage: {
  width: '100%',
  height: '100%',
},
  outOfStockText: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.3 },
  outOfStockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
  nameRow:              { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 2 },
  productName:          { flex: 1, fontSize: 13, fontWeight: '700', color: '#111827', lineHeight: 18 },
  tenantLabel:          { fontSize: 10, color: '#9CA3AF', marginBottom: 4, lineHeight: 14 },
  priceRow:             { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  productPrice:         { fontSize: 15, fontWeight: '800', color: '#E597A0' },
  productPriceDiscount: { fontSize: 15, fontWeight: '800', color: '#10B981' },
  productPriceOriginal: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', textDecorationLine: 'line-through' },
  discountBadge:        { backgroundColor: '#DCFCE7', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, flexShrink: 0 },
  discountBadgeText:    { fontSize: 7, fontWeight: '800', color: '#166534', letterSpacing: 0.4 },
  stockRow:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stockText:      { fontSize: 9, color: '#9CA3AF' },
  stockTextEmpty: { color: '#EF4444', fontWeight: '700' },

  // ── Cart Panel ──
  cartPanel:        { backgroundColor: '#fff' },
  cartPanelDesktop: { width: 360, borderLeftWidth: 1, borderLeftColor: '#F0F0F0' },
  cartPanelMobile:  { height: 340, borderTopWidth: 1, borderTopColor: '#F0F0F0' },

  cartHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9F9F9',
  },
  cartHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartIconWrap: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#FDF2F4', alignItems: 'center', justifyContent: 'center',
  },
  cartTitle:  { fontSize: 14, fontWeight: '800', color: '#111827' },
  cartCount:  { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  clearText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },

  cartList: { padding: 12, paddingBottom: 0 },
  cartItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FAFAFA', borderRadius: 14,
    padding: 10, marginBottom: 8,
  },
  cartImageWrap: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: '#fff', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, borderWidth: 1, borderColor: '#F0F0F0',
  },
  cartImage:  { width: '100%', height: '100%' },
  cartInfo:   { flex: 1, marginRight: 8 },
  cartName:   { fontSize: 12, fontWeight: '700', color: '#111827' },
  cartPrice:  { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  qtyControl: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#F0F0F0', padding: 2,
  },
  qtyBtn:   { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  qtyText:  { width: 28, textAlign: 'center', fontSize: 12, fontWeight: '800', color: '#111827' },
  qtyInput: { width: 32, textAlign: 'center', fontSize: 12, fontWeight: '800', color: '#111827', padding: 0 },

  cartEmpty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, opacity: 0.35 },
  cartEmptyText: { fontSize: 11, color: '#9CA3AF', marginTop: 8, fontWeight: '500' },

  // ── Cart Footer ──
  cartFooter: {
    padding: 16, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F5F5F5',
  },
  breakdown: {
    backgroundColor: '#F8F9FB', borderRadius: 14,
    padding: 12, marginBottom: 12, gap: 8,
  },
  breakdownRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 12, color: '#9CA3AF' },
  breakdownValue: { fontSize: 12, color: '#374151', fontWeight: '600' },
  dashed: {
    borderStyle: 'dashed', borderWidth: 1, borderColor: '#E5E7EB',
    marginBottom: 12, borderRadius: 1,
  },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  payBtn: {
    height: 52, backgroundColor: '#E597A0', borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  payBtnDisabled: { backgroundColor: '#F3F4F6' },
  payBtnText:     { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  payBtnTextDisabled: { color: '#9CA3AF' },
});