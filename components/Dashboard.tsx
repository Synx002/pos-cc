// components/Dashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { format, startOfMonth, subMonths, subDays, startOfDay, endOfMonth, endOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// ── Design Tokens ────────────────────────────────────────────────────────────
const ACCENT       = '#C8576A';
const SURFACE      = '#FFFFFF';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECOND  = '#6B7280';
const TEXT_LIGHT   = '#B0B5BE';
const BORDER       = '#EBEBEB';
const BG           = '#F8F9FB';
const P            = 16;

// ── Types ────────────────────────────────────────────────────────────────────
type PaymentBreakdown = { method: string; label: string; color: string; total: number };

interface DashboardProps {
  role: 'owner' | 'storeman' | 'cashier';
}

const PHONE_BREAKPOINT = 600;

export default function Dashboard({ role }: DashboardProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { profile } = useAuthStore();
  const isOwner = role === 'owner';
  const isPhone = width < PHONE_BREAKPOINT;

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [todayRevenue, setTodayRevenue]           = useState(0);
  const [totalMenuSold, setTotalMenuSold]         = useState(0);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [totalProductsSold, setTotalProductsSold] = useState(0);
  const [netProfit, setNetProfit]                 = useState(0);
  const [paymentBreakdown, setPaymentBreakdown]   = useState<PaymentBreakdown[]>([]);
  const [lowStockProducts, setLowStockProducts]   = useState<any[]>([]);
  const [topProducts, setTopProducts]             = useState<any[]>([]);

  // Previous month comparison
  const [prevMenuSold, setPrevMenuSold]             = useState(0);
  const [prevTransactions, setPrevTransactions]     = useState(0);
  const [prevProductsSold, setPrevProductsSold]     = useState(0);
  const [prevNetProfit, setPrevNetProfit]           = useState(0);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState<Date>(startOfDay(subDays(now, 6)));
  const [dateTo, setDateTo] = useState<Date>(endOfDay(now));
  const [showDateModal, setShowDateModal] = useState(false);
  const [pickerMode, setPickerMode] = useState<'from' | 'to' | null>(null);
  // Temp values di modal — hanya diterapkan saat klik Terapkan
  const [tempDateFrom, setTempDateFrom] = useState<Date>(dateFrom);
  const [tempDateTo, setTempDateTo] = useState<Date>(dateTo);

  const getDateRange = () => {
    const now = new Date();
    if (!isOwner) {
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      return { since: todayStart.toISOString(), until: endOfDay(now).toISOString() };
    }
    return {
      since: startOfDay(dateFrom).toISOString(),
      until: endOfDay(dateTo).toISOString(),
    };
  };

  const getPrevDateRange = () => {
    const now = new Date();
    if (!isOwner) {
      const yesterday = subDays(now, 1);
      return { since: startOfDay(yesterday).toISOString(), until: endOfDay(yesterday).toISOString() };
    }
    const from = startOfDay(dateFrom);
    const to = endOfDay(dateTo);
    const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // 1. Satu hari → bandingkan dengan hari sebelumnya
    if (daysDiff === 1) {
      const prevDay = subDays(from, 1);
      return { since: startOfDay(prevDay).toISOString(), until: endOfDay(prevDay).toISOString() };
    }

    // 2. Satu bulan penuh (tanggal 1 s/d hari terakhir bulan) → bandingkan dengan bulan sebelumnya
    const monthStart = startOfMonth(dateFrom);
    const monthEnd = endOfMonth(dateFrom);
    const isFullMonth =
      from.getTime() === startOfDay(monthStart).getTime() &&
      to.getTime() === endOfDay(monthEnd).getTime();
    if (isFullMonth) {
      const prevMonth = subMonths(dateFrom, 1);
      const prevMonthStart = startOfMonth(prevMonth);
      const prevMonthEnd = endOfMonth(prevMonth);
      return {
        since: startOfDay(prevMonthStart).toISOString(),
        until: endOfDay(prevMonthEnd).toISOString(),
      };
    }

    // 3. Rentang lain (termasuk 1 minggu) → periode dengan jumlah hari sama, tepat sebelumnya
    const prevEnd = subDays(from, 1);
    const prevStart = subDays(prevEnd, daysDiff - 1);
    return { since: startOfDay(prevStart).toISOString(), until: endOfDay(prevEnd).toISOString() };
  };

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const { since, until } = getDateRange();

      // 1. Transactions in range
      const { data: txns } = await supabase
        .from('transactions')
        .select('*, payments(*)')
        .eq('transaction_status', 'completed')
        .gte('created_at', since)
        .lte('created_at', until);

      const revenue = txns?.reduce(
        (acc, t) => acc + (t.grand_total ?? t.subtotal), 0
      ) ?? 0;
      setTodayRevenue(revenue);
      setTotalTransactions(txns?.length ?? 0);

      // ── Owner-only: payment breakdown ────────────────────────────────────
      if (isOwner) {
        const methods = [
          { method: 'cash', label: 'Tunai', color: '#6B7280' },
          { method: 'qris', label: 'QRIS', color: '#8B5CF6' },
        ];
        const breakdown: PaymentBreakdown[] = methods.map((m) => {
          const total = txns
            ?.filter((t) => t.payments?.[0]?.payment_method === m.method)
            .reduce((acc, t) => acc + (t.grand_total ?? t.subtotal), 0) ?? 0;
          return { ...m, total };
        });
        setPaymentBreakdown(breakdown);
      }

      // ── All roles: total menu items sold + unique products + net profit ──
      const txnIds = txns?.map((t) => t.transaction_id) ?? [];
      let sold = 0;
      let uniqueProducts = new Set<number>();
      let profit = 0;
      if (txnIds.length > 0) {
        const { data: items } = await supabase
          .from('transaction_details')
          .select('quantity, product_id, products(margin)')
          .in('transaction_id', txnIds);
        items?.forEach((i) => {
          const qty = i.quantity ?? 0;
          sold += qty;
          if (i.product_id) uniqueProducts.add(i.product_id);
          const margin  = Array.isArray(i.products)
            ? i.products[0]?.margin  ?? 0
            : (i.products as any)?.margin ?? 0;
            profit += margin * qty;
        });
      }
      setTotalMenuSold(sold);
      setTotalProductsSold(uniqueProducts.size);
      setNetProfit(profit);

      // ── All roles: top products ─────────────────────────────────────────────
      // Owner: gunakan periode date picker. Storeman/Cashier: bulan ini
      const nowDate = new Date();
      const topSince = isOwner ? since : startOfMonth(nowDate).toISOString();
      const topUntil = isOwner ? until : endOfMonth(nowDate).toISOString();
      const { data: topTxns } = await supabase
        .from('transactions')
        .select('transaction_id')
        .eq('transaction_status', 'completed')
        .gte('created_at', topSince)
        .lte('created_at', topUntil);

      const topIds = topTxns?.map((t) => t.transaction_id) ?? [];
      if (topIds.length > 0) {
        const { data: tiData } = await supabase
          .from('transaction_details')
          .select('product_id, quantity, products(product_name, selling_price)')
          .in('transaction_id', topIds);

        const productMap: Record<number, { name: string; price: number; qty: number }> = {};
        tiData?.forEach((ti) => {
          const pid  = ti.product_id;
          const prod = Array.isArray(ti.products) ? ti.products[0] : ti.products;
          if (!productMap[pid]) {
            productMap[pid] = {
              name:  prod?.product_name ?? '—',
              price: prod?.selling_price ?? 0,
              qty:   0,
            };
          }
          productMap[pid].qty += ti.quantity ?? 0;
        });

        const sorted = Object.entries(productMap)
          .sort((a, b) => b[1].qty - a[1].qty)
          .slice(0, 6)
          .map(([, v]) => v);
        setTopProducts(sorted);
      } else {
        setTopProducts([]);
      }

      // ── All roles: low stock products ────────────────────────────────────
      const { data: pData } = await supabase
        .from('products')
        .select('*, tenants(tenant_name), stocks(available_quantity)')
        .eq('is_active', true);

      const low = pData?.filter((p) => {
        const s = Array.isArray(p.stocks) ? p.stocks[0] : p.stocks;
        return (s?.available_quantity ?? 0) <= 5;
      }) ?? [];
      setLowStockProducts(low);

      // ── Previous period data for comparison (sesuai filter) ─────────────────
      const { since: prevSince, until: prevUntil } = getPrevDateRange();

      const { data: prevTxns } = await supabase
        .from('transactions')
        .select('transaction_id, subtotal, grand_total')
        .eq('transaction_status', 'completed')
        .gte('created_at', prevSince)
        .lte('created_at', prevUntil);

      setPrevTransactions(prevTxns?.length ?? 0);

      const prevTxnIds = prevTxns?.map(t => t.transaction_id) ?? [];
      let pSold = 0;
      let pUnique = new Set<number>();
      let pProfit = 0;
      if (prevTxnIds.length > 0) {
        const { data: prevItems } = await supabase
          .from('transaction_details')
          .select('quantity, product_id, products(margin)')
          .in('transaction_id', prevTxnIds);
        prevItems?.forEach((i) => {
          const qty = i.quantity ?? 0;
          pSold += qty;
          if (i.product_id) pUnique.add(i.product_id);
          const margin = Array.isArray(i.products)
            ? i.products[0]?.margin ?? 0
            : (i.products as any)?.margin ?? 0;
          pProfit += margin * qty;
        });
      }
      setPrevMenuSold(pSold);
      setPrevProductsSold(pUnique.size);
      setPrevNetProfit(pProfit);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, [dateFrom, dateTo, isOwner]);

  // Sync temp dates saat modal dibuka
  useEffect(() => {
    if (showDateModal) {
      setTempDateFrom(dateFrom);
      setTempDateTo(dateTo);
    }
  }, [showDateModal]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [dateFrom, dateTo, isOwner]);

  const welcomeMessage = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Selamat Pagi';
    if (h < 15) return 'Selamat Siang';
    if (h < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  };

  const dateRangeLabel = isOwner
    ? `${format(dateFrom, 'd MMM', { locale: id })} - ${format(dateTo, 'd MMM yyyy', { locale: id })}`
    : 'Hari Ini';

  const handlePrint = async () => {
    try {
      const activeFilterLabel = dateRangeLabel;
      const dateStr = format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: id });

      // Untuk PDF kasir/storeman → fetch top products hari ini (bukan bulan ini)
      let pdfTopProducts = topProducts;
      if (!isOwner) {
        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd   = endOfDay(new Date()).toISOString();
        const { data: todayTxns } = await supabase
          .from('transactions')
          .select('transaction_id')
          .eq('transaction_status', 'completed')
          .gte('created_at', todayStart)
          .lte('created_at', todayEnd);
        const todayIds = todayTxns?.map(t => t.transaction_id) ?? [];
        if (todayIds.length > 0) {
          const { data: tiData } = await supabase
            .from('transaction_details')
            .select('product_id, quantity, products(product_name, selling_price)')
            .in('transaction_id', todayIds);
          const productMap: Record<number, { name: string; price: number; qty: number }> = {};
          tiData?.forEach((ti) => {
            const pid  = ti.product_id;
            const prod = Array.isArray(ti.products) ? ti.products[0] : ti.products;
            if (!productMap[pid]) {
              productMap[pid] = { name: prod?.product_name ?? '—', price: prod?.selling_price ?? 0, qty: 0 };
            }
            productMap[pid].qty += ti.quantity ?? 0;
          });
          pdfTopProducts = Object.entries(productMap)
            .sort((a, b) => b[1].qty - a[1].qty)
            .slice(0, 6)
            .map(([, v]) => v);
        } else {
          pdfTopProducts = [];
        }
      }

      const paymentRows = paymentBreakdown.map(p => `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #f0f0f0; padding-bottom:4px;">
          <span style="color:#6b7280">${p.label}</span>
          <span style="font-weight:700; color:${p.total > 0 ? p.color : '#b0b5be'}">Rp ${p.total.toLocaleString('id-ID')}</span>
        </div>
      `).join('');

      const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
      const baseStatCards = [
        { label: 'Menu Terjual', value: totalMenuSold, prev: prevMenuSold, suffix: 'item', isCurrency: false },
        { label: 'Total Transaksi', value: totalTransactions, prev: prevTransactions, suffix: 'transaksi', isCurrency: false },
        { label: 'Produk Terjual', value: totalProductsSold, prev: prevProductsSold, suffix: 'produk', isCurrency: false },
      ];
      const statCards = (isOwner ? [...baseStatCards, { label: 'Laba Bersih', value: netProfit, prev: prevNetProfit, suffix: '', isCurrency: true }] : baseStatCards).map((s) => {
        const diff = s.value - s.prev;
        const pct = s.prev > 0 ? ((diff / s.prev) * 100).toFixed(1) : (s.value > 0 ? '100' : '0');
        const diffLabel = s.isCurrency ? `${diff >= 0 ? '+' : ''}${rp(diff)}` : `${diff >= 0 ? '+' : ''}${diff.toLocaleString('id-ID')}`;
        const isUp = diff >= 0;
        const diffColor = isUp ? '#16A34A' : '#DC2626';
        return `
          <td style="width:50%; padding:8px; vertical-align:top;">
            <div style="background:#fff; border:1px solid #f0f0f0; border-radius:14px; padding:16px;">
              <p style="margin:0; font-size:11px; color:#6b7280; font-weight:600;">${s.label}</p>
              <p style="margin:6px 0 0 0; font-size:18px; font-weight:800; color:#1a1a1a;">${s.isCurrency ? rp(s.value) : s.value.toLocaleString('id-ID')}</p>
              <p style="margin:4px 0 0 0; font-size:10px; color:#9ca3af;">${s.suffix}</p>
              <div style="margin-top:10px; padding:6px 8px; border-radius:8px; background:${isUp ? '#F0FDF4' : '#FEF2F2'}; display:inline-block;">
                <span style="font-size:11px; font-weight:700; color:${diffColor};">${diffLabel} (${pct}%)</span>
              </div>
            </div>
          </td>
        `;
      });
      const statRowsHtml = `
        <tr>${statCards.slice(0, 2).join('')}</tr>
        <tr>${statCards.slice(2, 4).join('')}</tr>
      `;

      const topProductRows = pdfTopProducts.map((p, i) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">${i + 1}</td>
          <td style="padding:8px 0;">${p.name}</td>
          <td style="padding:8px 0; text-align:right;">${p.qty} terjual</td>
          <td style="padding:8px 0; text-align:right;">Rp ${p.price.toLocaleString('id-ID')}</td>
        </tr>
      `).join('');

      const html = `
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a;">
          <h1 style="color: #C8576A; margin-bottom: 4px;">Laporan Dashboard ${role.toUpperCase()}</h1>
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 32px;">Digenerate pada: ${dateStr}</p>

          <div style="background: #fdf2f4; border: 1px solid #e8a0ab; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="margin: 0; color: #6b7280; font-size: 12px; font-weight: 700;">PENDAPATAN (${activeFilterLabel.toUpperCase()})</p>
            <h2 style="margin: 8px 0 0 0; font-size: 32px; color: #1a1a1a;">Rp ${todayRevenue.toLocaleString('id-ID')}</h2>
            <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">Total Transaksi: ${totalTransactions} | Menu Terjual: ${totalMenuSold}</p>
          </div>

          <table style="width:100%; border-collapse: separate; border-spacing: 0 12px; margin-bottom: 32px;">
            <tbody>${statRowsHtml}</tbody>
          </table>

          ${isOwner ? `
          <div style="margin-bottom: 32px;">
            <h3 style="border-bottom: 2px solid #C8576A; padding-bottom: 8px; margin-bottom: 16px;">Rincian Pembayaran</h3>
            ${paymentRows}
          </div>` : ''}

          <div>
            <h3 style="border-bottom: 2px solid #C8576A; padding-bottom: 8px; margin-bottom: 16px;">Top Menu Terlaris (${isOwner ? activeFilterLabel : 'Hari Ini'})</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; color: #6b7280; font-size: 12px;">
                  <th style="padding-bottom: 8px;">RANK</th>
                  <th style="padding-bottom: 8px;">NAMA MENU</th>
                  <th style="padding-bottom: 8px; text-align: right;">QTY</th>
                  <th style="padding-bottom: 8px; text-align: right;">HARGA</th>
                </tr>
              </thead>
              <tbody>${topProductRows}</tbody>
            </table>
          </div>
        </body>
      </html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.error(e);
      alert('Gagal mencetak laporan');
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG }}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Welcome Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.welcome}>{welcomeMessage()}, {profile?.full_name || role} 👋</Text>
          <Text style={s.date}>{format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}</Text>
        </View>
        <TouchableOpacity style={s.notifBtn}>
          <MaterialIcons name="notifications-none" size={22} color={TEXT_SECOND} />
        </TouchableOpacity>
      </View>

      {/* ── Revenue Card ── */}
      <View style={s.revenueCard}>
        {/* Top row: title + controls */}
        <View style={s.revenueTopRow}>
          <Text style={s.revenueLabel}>Pendapatan Transaksi</Text>
          <View style={s.revenueControls}>
            {isOwner ? (
              <TouchableOpacity
                style={[s.dateRangeBtn, isPhone && s.dateRangeBtnIconOnly]}
                onPress={() => setShowDateModal(true)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="calendar-today" size={isPhone ? 18 : 14} color={ACCENT} />
                {!isPhone && <Text style={s.dateRangeBtnText}>{dateRangeLabel}</Text>}
                {!isPhone && <MaterialIcons name="expand-more" size={16} color={TEXT_SECOND} />}
              </TouchableOpacity>
            ) : (
              <View style={[s.dateRangeBtn, isPhone && s.dateRangeBtnIconOnly]}>
                <MaterialIcons name="calendar-today" size={isPhone ? 18 : 14} color={TEXT_SECOND} />
                {!isPhone && <Text style={s.dateRangeBtnText}>Hari Ini</Text>}
              </View>
            )}
            <TouchableOpacity style={[s.printBtn, isPhone && s.printBtnIconOnly]} onPress={handlePrint}>
              <MaterialIcons name="print" size={isPhone ? 18 : 13} color={SURFACE} />
              {!isPhone && <Text style={s.printBtnText}>Print</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Amount */}
        <Text style={s.revenueAmount}>Rp {todayRevenue.toLocaleString('id-ID')}</Text>

        {/* Total label */}
        <View style={s.totalRow}>
          <MaterialIcons name="trending-up" size={14} color={TEXT_SECOND} />
          <Text style={s.totalLabel}>Total {isOwner ? '' : 'Hari Ini'}</Text>
        </View>

        {/* Payment method chips - Only for Owner */}
        {isOwner && (
          <View style={s.paymentRow}>
            {paymentBreakdown.map((pm) => (
              <View key={pm.method} style={s.paymentChip}>
                <Text style={s.paymentChipMethod}>{pm.label}</Text>
                <Text style={[s.paymentChipAmount, { color: pm.total > 0 ? pm.color : TEXT_LIGHT }]}>
                  Rp {pm.total.toLocaleString('id-ID')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Date range modal - Owner only */}
        {isOwner && (
          <Modal visible={showDateModal} transparent animationType="fade">
            <Pressable style={s.dateModalOverlay} onPress={() => setShowDateModal(false)}>
              <Pressable style={s.dateModalContent} onPress={(e) => e.stopPropagation()}>
                <View style={s.dateModalHeader}>
                  <Text style={s.dateModalTitle}>Pilih Periode</Text>
                  <TouchableOpacity onPress={() => setShowDateModal(false)}>
                    <MaterialIcons name="close" size={22} color={TEXT_SECOND} />
                  </TouchableOpacity>
                </View>

                <View style={s.dateModalRow}>
                  <Text style={s.dateModalLabel}>Dari</Text>
                  <TouchableOpacity
                    style={s.dateModalValueBtn}
                    onPress={() => setPickerMode('from')}
                  >
                    <Text style={s.dateModalValueText}>
                      {format(tempDateFrom, 'd MMMM yyyy', { locale: id })}
                    </Text>
                    <MaterialIcons name="edit-calendar" size={18} color={ACCENT} />
                  </TouchableOpacity>
                </View>

                <View style={s.dateModalRow}>
                  <Text style={s.dateModalLabel}>Sampai</Text>
                  <TouchableOpacity
                    style={s.dateModalValueBtn}
                    onPress={() => setPickerMode('to')}
                  >
                    <Text style={s.dateModalValueText}>
                      {format(tempDateTo, 'd MMMM yyyy', { locale: id })}
                    </Text>
                    <MaterialIcons name="edit-calendar" size={18} color={ACCENT} />
                  </TouchableOpacity>
                </View>

                {pickerMode && (
                  <DateTimePicker
                    value={pickerMode === 'from' ? tempDateFrom : tempDateTo}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, selectedDate) => {
                      if (selectedDate) {
                        if (pickerMode === 'from') {
                          setTempDateFrom(startOfDay(selectedDate));
                          if (selectedDate > tempDateTo) setTempDateTo(endOfDay(selectedDate));
                        } else {
                          setTempDateTo(endOfDay(selectedDate));
                          if (selectedDate < tempDateFrom) setTempDateFrom(startOfDay(selectedDate));
                        }
                      }
                      if (Platform.OS === 'android') setPickerMode(null);
                    }}
                  />
                )}

                {Platform.OS === 'ios' && pickerMode && (
                  <TouchableOpacity
                    style={s.datePickerDoneBtn}
                    onPress={() => setPickerMode(null)}
                  >
                    <Text style={s.datePickerDoneText}>Selesai</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={s.dateModalApplyBtn}
                  onPress={() => {
                    setDateFrom(tempDateFrom);
                    setDateTo(tempDateTo);
                    setShowDateModal(false);
                    setPickerMode(null);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={s.dateModalApplyText}>Terapkan</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>

      {/* ── Stats Row — visible to ALL roles (1 kolom di HP) ── */}
      <View style={[s.statsRow, isPhone && s.statsRowPhone]}>
        <StatCard
          icon="restaurant-menu"
          iconColor="#6366F1"
          label="Menu Terjual"
          value={totalMenuSold.toLocaleString('id-ID')}
          suffix="item"
          prev={prevMenuSold}
          current={totalMenuSold}
          cardStyle={isPhone ? s.statCardPhone : undefined}
        />
        <StatCard
          icon="receipt-long"
          iconColor="#F59E0B"
          label="Total Transaksi"
          value={totalTransactions.toLocaleString('id-ID')}
          suffix="transaksi"
          prev={prevTransactions}
          current={totalTransactions}
          cardStyle={isPhone ? s.statCardPhone : undefined}
        />
        <StatCard
          icon="shopping-bag"
          iconColor="#10B981"
          label="Produk Terjual"
          value={totalProductsSold.toLocaleString('id-ID')}
          suffix="produk"
          prev={prevProductsSold}
          current={totalProductsSold}
          cardStyle={isPhone ? s.statCardPhone : undefined}
        />
        {isOwner && (
          <StatCard
            icon="account-balance-wallet"
            iconColor="#16A34A"
            label="Laba Bersih"
            value={`Rp ${netProfit.toLocaleString('id-ID')}`}
            suffix="Laba"
            prev={prevNetProfit}
            current={netProfit}
            isCurrency
            cardStyle={isPhone ? s.statCardPhone : undefined}
          />
        )}
      </View>

      {/* ── Low Stock Warning — visible to ALL roles ── */}
      {lowStockProducts.length > 0 && (
        <View style={s.lowStockSection}>
          <View style={s.lowStockHeader}>
            <MaterialIcons name="trending-down" size={18} color={ACCENT} />
            <Text style={s.lowStockTitle}>Peringatan: Stok Menipis!</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {lowStockProducts.map((p) => {
                const s2  = Array.isArray(p.stocks) ? p.stocks[0] : p.stocks;
                const qty = s2?.available_quantity ?? 0;
                return (
                  <View key={p.product_id} style={s.lowStockChip}>
                    <Text style={s.lowStockChipName}>{p.product_name}</Text>
                    <Text style={[s.lowStockChipQty, { color: qty <= 0 ? '#DC2626' : '#C2410C' }]}>
                      {qty <= 0 ? '0' : `${qty}`} {p.unit ?? 'pcs'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Top Products This Month — visible to ALL roles ── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>
            Menu Terlaris {isOwner ? `(${dateRangeLabel})` : 'Bulan Ini'}
          </Text>
          {isOwner && (
            <TouchableOpacity onPress={() => router.push('/owner/products/')}>
              <Text style={s.sectionLink}>Show all</Text>
            </TouchableOpacity>
          )}
        </View>

        {topProducts.length > 0 ? (
          topProducts.map((p, i) => (
            <View key={i} style={s.topProductRow}>
              <View style={s.topProductRank}>
                <Text style={s.topProductRankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.topProductName}>{p.name}</Text>
                <Text style={s.topProductPrice}>Rp {p.price.toLocaleString('id-ID')}</Text>
              </View>
              <Text style={s.topProductSold}>{p.qty} Sold</Text>
            </View>
          ))
        ) : (
          <View style={s.emptyWrap}>
            <MaterialIcons name="bar-chart" size={40} color="#D1D5DB" />
            <Text style={s.emptyText}>Belum ada data penjualan bulan ini</Text>
          </View>
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── StatCard Sub-component ──────────────────────────────────────────────────
function StatCard({ icon, iconColor, label, value, suffix, prev, current, isCurrency, cardStyle }: {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  suffix?: string;
  prev: number;
  current: number;
  isCurrency?: boolean;
  cardStyle?: object;
}) {
  const diff = current - prev;
  const pct  = prev > 0 ? ((diff / prev) * 100).toFixed(1) : (current > 0 ? '100' : '0');
  const isUp = diff >= 0;

  const diffLabel = isCurrency
    ? `${isUp ? '+' : ''}Rp ${diff.toLocaleString('id-ID')}`
    : `${isUp ? '+' : ''}${diff.toLocaleString('id-ID')}`;

  return (
    <View style={[s.statCard, cardStyle]}>
      <View style={s.statCardInner}>
        <View style={s.statCardTop}>
          <View style={[s.statIconBg, { backgroundColor: iconColor + '15' }]}>
            <MaterialIcons name={icon as any} size={18} color={iconColor} />
          </View>
          <Text style={s.statCardLabel} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={s.statCardValue} numberOfLines={1}>{value}</Text>
        {suffix ? <Text style={s.statCardSuffix}>{suffix}</Text> : null}
        <View style={[s.statCompare, { backgroundColor: isUp ? '#F0FDF4' : '#FEF2F2' }]}>
          <MaterialIcons
            name={isUp ? 'arrow-upward' : 'arrow-downward'}
            size={10}
            color={isUp ? '#16A34A' : '#DC2626'}
          />
          <Text style={[s.statCompareText, { color: isUp ? '#16A34A' : '#DC2626' }]}>
            {diffLabel}
          </Text>
          <Text style={[s.statComparePct, { color: isUp ? '#16A34A' : '#DC2626' }]}>
            {pct}%
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: P, paddingTop: 16, paddingBottom: 12,
  },
  welcome: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY },
  date:    { fontSize: 12, color: TEXT_LIGHT, marginTop: 3 },
  notifBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER,
    justifyContent: 'center', alignItems: 'center',
  },
  revenueCard: {
    backgroundColor: SURFACE, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    marginHorizontal: P, marginBottom: 12,
    padding: 18,
  },
  revenueTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  revenueLabel:    { fontSize: 12, fontWeight: '600', color: TEXT_SECOND },
  revenueControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateRangeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FAFAFA', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER,
  },
  dateRangeBtnIconOnly: { paddingHorizontal: 10, paddingVertical: 8 },
  dateRangeBtnText: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY },
  dateModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  dateModalContent: {
    width: '100%', maxWidth: 360,
    backgroundColor: SURFACE, borderRadius: 20, padding: 20,
  },
  dateModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  dateModalTitle: { fontSize: 18, fontWeight: '800', color: TEXT_PRIMARY },
  dateModalRow: { marginBottom: 16 },
  dateModalLabel: { fontSize: 12, color: TEXT_LIGHT, fontWeight: '600', marginBottom: 6 },
  dateModalValueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F9FAFB', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
  },
  dateModalValueText: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  datePickerDoneBtn: {
    marginTop: 8, paddingVertical: 10, alignItems: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 10,
  },
  datePickerDoneText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  dateModalApplyBtn: {
    marginTop: 20, paddingVertical: 14, alignItems: 'center',
    backgroundColor: ACCENT, borderRadius: 14,
  },
  dateModalApplyText: { fontSize: 15, fontWeight: '700', color: SURFACE },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: ACCENT, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  printBtnIconOnly: { paddingHorizontal: 10, paddingVertical: 8 },
  printBtnText: { fontSize: 11, color: SURFACE, fontWeight: '700' },
  
  filterDropdownText: { fontSize: 11, color: TEXT_SECOND, fontWeight: '500' },
  revenueAmount: { fontSize: 32, fontWeight: '800', color: TEXT_PRIMARY, marginBottom: 4 },
  totalRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  totalLabel:    { fontSize: 12, color: TEXT_SECOND },
  paymentRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  paymentChip: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#FAFAFA', minWidth: 70,
  },
  paymentChipMethod: { fontSize: 10, color: TEXT_LIGHT, fontWeight: '600', marginBottom: 2 },
  paymentChipAmount: { fontSize: 12, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', alignItems: 'stretch',
    marginHorizontal: P, marginBottom: 12, gap: 8,
  },
  statsRowPhone: { flexDirection: 'column' },
  statCard: {
    flex: 1,
  },
  statCardPhone: { flex: 0, width: '100%' },
  statCardInner: {
    flex: 1, backgroundColor: SURFACE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 14,
  },
  statCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  statIconBg: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  statCardLabel: { fontSize: 11, color: TEXT_SECOND, fontWeight: '600', flex: 1 },
  statCardValue: { fontSize: 22, fontWeight: '800', color: TEXT_PRIMARY },
  statCardSuffix: { fontSize: 11, color: TEXT_LIGHT, fontWeight: '500', marginTop: 2 },
  statCompare: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    marginTop: 8, alignSelf: 'flex-start',
  },
  statCompareText: { fontSize: 10, fontWeight: '700' },
  statComparePct:  { fontSize: 10, fontWeight: '600' },

  lowStockSection: {
    backgroundColor: '#FFF5F5', borderRadius: 20,
    borderWidth: 1, borderColor: '#FECACA',
    marginHorizontal: P, marginBottom: 12, padding: 16,
  },
  lowStockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  lowStockTitle:  { fontSize: 13, fontWeight: '700', color: ACCENT },
  lowStockChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#FECACA', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: SURFACE,
  },
  lowStockChipName: { fontSize: 12, fontWeight: '600', color: TEXT_PRIMARY },
  lowStockChipQty:  { fontSize: 12, fontWeight: '700' },
  section: {
    backgroundColor: SURFACE, borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    marginHorizontal: P, marginBottom: 12, padding: 18,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT_PRIMARY },
  sectionLink:  { fontSize: 12, fontWeight: '600', color: ACCENT },
  topProductRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  topProductRank: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#F0F2F5',
    justifyContent: 'center', alignItems: 'center',
  },
  topProductRankText: { fontSize: 13, fontWeight: '800', color: TEXT_SECOND },
  topProductName:     { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 3 },
  topProductPrice:    { fontSize: 11, color: TEXT_LIGHT },
  topProductSold:     { fontSize: 13, fontWeight: '800', color: ACCENT },
  emptyWrap: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 13, color: TEXT_LIGHT, marginTop: 8 },
});