// pages/TenantSalesPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  getOrCreateWithdrawal,
  getWithdrawalsForPeriod,
  getWithdrawalHistory,
  markWithdrawn,
  type TenantWithdrawal,
  type WithdrawalWithUser,
} from '../lib/withdrawalService';
import { useAuthStore } from '../stores/authStore';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const ACCENT       = '#E597A0';
const ACCENT_LIGHT = '#FDF2F4';

interface Props {
  tenantId: string;
  role: 'owner' | 'storeman' | 'cashier';
}

interface TenantInfo {
  tenant_id: number;
  tenant_name: string;
  email?: string;
  phone_number?: string;
  status: boolean;
}

interface ProductStats {
  product_id: number;
  product_name: string;
  selling_price: number;
  purchase_price: number;
  totalQty: number;
  totalRevenue: number;
  totalTenantPayout: number; // harga beli × qty = yang dibayar ke tenant
  totalMargin: number;
}

interface TransactionGroup {
  transaction_id: string;
  created_at: string;
  total: number;
  tenantPayout: number;
  margin: number;
  items: { product_name: string; quantity: number; unit_price: number }[];
}

export default function TenantSalesPage({ tenantId, role }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const now = new Date();
  const getWeekRange = (d: Date) => ({
    from: startOfWeek(d, { weekStartsOn: 1 }),
    to: endOfWeek(d, { weekStartsOn: 1 }),
  });
  const thisWeek = getWeekRange(now);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tenant, setTenant]         = useState<TenantInfo | null>(null);
  const [dateFrom, setDateFrom]     = useState<Date>(thisWeek.from);
  const [dateTo, setDateTo]         = useState<Date>(thisWeek.to);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [withdrawal, setWithdrawal] = useState<TenantWithdrawal | null>(null);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalWithUser[]>([]);
  const [markingWithdrawn, setMarkingWithdrawn] = useState(false);

  // Modal "Lihat Semua"
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyFilter, setHistoryFilter]       = useState<'all' | 'pending' | 'withdrawn'>('all');
  const [showTxModal, setShowTxModal]           = useState(false);

  // Computed stats
  const [totalRevenue, setTotalRevenue]       = useState(0);
  const [totalTenantPayout, setTotalTenantPayout] = useState(0); // yang dibayar ke tenant (harga beli)
  const [totalMargin, setTotalMargin]         = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [productStats, setProductStats]     = useState<ProductStats[]>([]);
  const [transactions, setTransactions]     = useState<TransactionGroup[]>([]);

  const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
  const dateRangeLabel = `${format(dateFrom, 'd MMM', { locale: idLocale })} - ${format(dateTo, 'd MMM yyyy', { locale: idLocale })}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Tenant info
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();
      setTenant(tenantData);

      // 2. Date range
      const fromDate = startOfDay(dateFrom);
      const toDate   = endOfDay(dateTo);

      // 3. Fetch transaction_details for this tenant's products
      const { data: details, error } = await supabase
        .from('transaction_details')
        .select('*, products!inner(product_id, product_name, selling_price, purchase_price, tenant_id), transactions!inner(transaction_id, created_at, transaction_status)')
        .eq('products.tenant_id', Number(tenantId))
        .eq('transactions.transaction_status', 'completed')
        .gte('transactions.created_at', fromDate.toISOString())
        .lte('transactions.created_at', toDate.toISOString());

      if (error) throw error;
      const rows = details || [];

      // 4. Compute stats
      // revenue = pendapatan penjualan (harga jual × qty)
      // tenantPayout = yang dibayar ke tenant (harga beli × qty)
      // margin = laba owner (revenue - tenantPayout)
      let revenue = 0;
      let tenantPayout = 0;
      let margin  = 0;
      const prodMap = new Map<number, ProductStats>();
      const txMap   = new Map<string, TransactionGroup>();

      for (const row of rows) {
        const qty           = row.quantity || 0;
        const unitPrice     = row.unit_price || 0;
        const purchasePrice = row.products?.purchase_price || 0;
        const itemRevenue   = unitPrice * qty;
        const itemTenantPayout = purchasePrice * qty;
        const itemMargin    = (unitPrice - purchasePrice) * qty;

        revenue += itemRevenue;
        tenantPayout += itemTenantPayout;
        margin  += itemMargin;

        // Product stats
        const pid = row.products?.product_id;
        if (pid) {
          const existing = prodMap.get(pid);
          if (existing) {
            existing.totalQty          += qty;
            existing.totalRevenue      += itemRevenue;
            existing.totalTenantPayout += itemTenantPayout;
            existing.totalMargin       += itemMargin;
          } else {
            prodMap.set(pid, {
              product_id:          pid,
              product_name:        row.products.product_name,
              selling_price:       row.products.selling_price,
              purchase_price:     purchasePrice,
              totalQty:            qty,
              totalRevenue:        itemRevenue,
              totalTenantPayout:   itemTenantPayout,
              totalMargin:         itemMargin,
            });
          }
        }

        // Transaction grouping
        const txId = row.transactions?.transaction_id;
        if (txId) {
          const existingTx = txMap.get(txId);
          const item = {
            product_name: row.products?.product_name || '-',
            quantity:     qty,
            unit_price:   unitPrice,
          };
          if (existingTx) {
            existingTx.total         += itemRevenue;
            existingTx.tenantPayout  += itemTenantPayout;
            existingTx.margin       += itemMargin;
            existingTx.items.push(item);
          } else {
            txMap.set(txId, {
              transaction_id: txId,
              created_at:     row.transactions.created_at,
              total:          itemRevenue,
              tenantPayout:   itemTenantPayout,
              margin:         itemMargin,
              items:          [item],
            });
          }
        }
      }

      setTotalRevenue(revenue);
      setTotalTenantPayout(tenantPayout);
      setTotalMargin(margin);

      // 5. Withdrawal: buat record baru hanya untuk owner (storeman/kasir tidak punya izin INSERT)
      let w = null;
      if (role === 'owner') {
        w = await getOrCreateWithdrawal(tenantId, fromDate, toDate, tenantPayout);
      } else {
        const existing = await getWithdrawalsForPeriod(tenantId, fromDate, toDate);
        w = existing.find((r) => r.status === 'pending') || existing[existing.length - 1] || null;
      }
      setWithdrawal(w);

      const history = await getWithdrawalHistory(tenantId);
      setWithdrawalHistory(history);

      const prodArr = Array.from(prodMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
      setProductStats(prodArr);

      const txArr = Array.from(txMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTransactions(txArr);
      setTransactionCount(txArr.length);
    } catch (e) {
      console.error('TenantSalesPage fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const user = useAuthStore((s) => s.user);

  const canMarkWithdrawn = withdrawal && user?.id && withdrawal.status === 'pending' && (withdrawal.amount || 0) > 0;

  const handleMarkWithdrawn = useCallback(async () => {
    if (!withdrawal || !user?.id) return;
    setMarkingWithdrawn(true);
    try {
      const { success, error } = await markWithdrawn(withdrawal.id, user.id);
      if (success) {
        setWithdrawal({
          ...withdrawal,
          status: 'withdrawn',
          withdrawn_amount: withdrawal.amount,
          withdrawn_at: new Date().toISOString(),
          withdrawn_by: user.id,
        });
        const history = await getWithdrawalHistory(tenantId);
        setWithdrawalHistory(history);
      } else {
        alert(error || 'Gagal menandai');
      }
    } catch (e) {
      alert('Gagal menandai penarikan');
    } finally {
      setMarkingWithdrawn(false);
    }
  }, [withdrawal, user?.id, tenantId]);

  const marginPct = totalRevenue > 0
    ? ((totalMargin / totalRevenue) * 100).toFixed(1)
    : '0';

  const handleExportHistoryPDF = async () => {
    if (!tenant) return;
    setExporting(true);
    setShowExportModal(false);
    try {
      const dateStr = format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: idLocale });
      const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
      const totalSudah = withdrawalHistory.filter((w) => w.status === 'withdrawn').reduce(
        (a, w) => a + (w.withdrawn_amount ?? w.amount ?? 0), 0
      );
      const totalBelum = withdrawalHistory.reduce((a, w) => {
        if (w.status === 'pending') return a + (w.amount || 0);
        const paid = w.withdrawn_amount ?? w.amount ?? 0;
        return a + Math.max(0, (w.amount || 0) - paid);
      }, 0);
      const rows = withdrawalHistory.map((w) => {
        const meta = w.status === 'withdrawn' && w.withdrawn_at
          ? `Dibayar ${format(new Date(w.withdrawn_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}${w.withdrawn_by_name ? ` oleh ${w.withdrawn_by_name}` : ''}`
          : 'Belum dibayar';
        return `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">${format(new Date(w.period_start), 'd MMM', { locale: idLocale })} - ${format(new Date(w.period_end), 'd MMM yyyy', { locale: idLocale })}</td>
          <td style="padding:8px 0; text-align:right; font-weight:700;">${rp(w.amount)}</td>
          <td style="padding:8px 0;">${w.status === 'withdrawn' ? 'Sudah' : 'Pending'}</td>
          <td style="padding:8px 0; font-size:11px; color:#6b7280;">${meta}</td>
        </tr>`;
      }).join('');
      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a;">
            <h1 style="color: #E597A0; margin-bottom: 4px;">Riwayat Pembayaran ke Tenant</h1>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">${tenant.tenant_name}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 24px;">Digenerate: ${dateStr}</p>
            <div style="display:flex; gap:20px; margin-bottom:24px;">
              <div style="background:#ECFDF5; padding:16px 24px; border-radius:12px; flex:1;">
                <p style="margin:0; font-size:11px; color:#059669;">Sudah dibayar</p>
                <p style="margin:4px 0 0; font-size:20px; font-weight:800; color:#059669;">${rp(totalSudah)}</p>
              </div>
              <div style="background:#FFFBEB; padding:16px 24px; border-radius:12px; flex:1;">
                <p style="margin:0; font-size:11px; color:#D97706;">Belum dibayar</p>
                <p style="margin:4px 0 0; font-size:20px; font-weight:800; color:#D97706;">${rp(totalBelum)}</p>
              </div>
            </div>
            <h3 style="border-bottom: 2px solid #E597A0; padding-bottom: 8px; margin-bottom: 12px;">Detail per Periode</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; color: #6b7280; font-size: 11px;">
                  <th style="padding-bottom: 8px;">PERIODE</th>
                  <th style="padding-bottom: 8px;">HARGA BELI</th>
                  <th style="padding-bottom: 8px;">STATUS</th>
                  <th style="padding-bottom: 8px;">KETERANGAN</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="4" style="text-align:center; color:#9ca3af; padding:20px;">Belum ada riwayat</td></tr>'}</tbody>
            </table>
          </body>
        </html>`;
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Riwayat Pembayaran' });
      } else {
        alert('PDF berhasil dibuat');
      }
    } catch (e) {
      console.error(e);
      alert('Gagal export PDF');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async (type: 'tenant' | 'owner') => {
    if (!tenant) return;
    setExporting(true);
    setShowExportModal(false);
    try {
      const dateStr = format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: idLocale });
      const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;

      const productRows = productStats.map((p, i) => {
        if (type === 'tenant') {
          return `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:8px 0;">${i + 1}</td>
            <td style="padding:8px 0;">${p.product_name}</td>
            <td style="padding:8px 0; text-align:right;">${p.totalQty}</td>
            <td style="padding:8px 0; text-align:right;">${rp(p.totalTenantPayout)}</td>
          </tr>`;
        }
        return `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">${i + 1}</td>
          <td style="padding:8px 0;">${p.product_name}</td>
          <td style="padding:8px 0; text-align:right;">${p.totalQty}</td>
          <td style="padding:8px 0; text-align:right;">${rp(p.totalRevenue)}</td>
          <td style="padding:8px 0; text-align:right;">${rp(p.totalMargin)}</td>
        </tr>`;
      }).join('');

      const txRows = transactions.map((tx) => {
        const itemsStr = tx.items.map(it => `${it.quantity}× ${it.product_name}`).join(', ');
        if (type === 'tenant') {
          return `<tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:8px 0;">#${tx.transaction_id.toString().slice(-6)}</td>
            <td style="padding:8px 0;">${format(new Date(tx.created_at), 'dd MMM HH:mm', { locale: idLocale })}</td>
            <td style="padding:8px 0;">${itemsStr}</td>
            <td style="padding:8px 0; text-align:right; font-weight:700;">${rp(tx.tenantPayout)}</td>
          </tr>`;
        }
        return `<tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 0;">#${tx.transaction_id.toString().slice(-6)}</td>
          <td style="padding:8px 0;">${format(new Date(tx.created_at), 'dd MMM HH:mm', { locale: idLocale })}</td>
          <td style="padding:8px 0;">${itemsStr}</td>
          <td style="padding:8px 0; text-align:right; font-weight:700;">${rp(tx.total)}</td>
          <td style="padding:8px 0; text-align:right; color:#16A34A;">${rp(tx.margin)}</td>
        </tr>`;
      }).join('');

      const html = type === 'tenant'
        ? `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a;">
            <h1 style="color: #E597A0; margin-bottom: 4px;">Laporan Penjualan</h1>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">${tenant.tenant_name}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 24px;">Periode: ${dateRangeLabel} • Digenerate: ${dateStr}</p>
            <p style="color: #6b7280; font-size: 11px; font-weight: 600; margin-bottom: 16px;">UNTUK TENANT — Berdasarkan harga beli (yang dibayarkan ke tenant)</p>

            <div style="background: #fdf2f4; border: 1px solid #e8a0ab; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0; color: #6b7280; font-size: 11px; font-weight: 700;">TOTAL YANG DIBAYARKAN KE TENANT</p>
              <h2 style="margin: 8px 0 0 0; font-size: 28px;">${rp(totalTenantPayout)}</h2>
              <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${transactionCount} transaksi</p>
            </div>

            <h3 style="border-bottom: 2px solid #E597A0; padding-bottom: 8px; margin-bottom: 12px;">Produk Terjual</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; color: #6b7280; font-size: 11px;">
                  <th style="padding-bottom: 8px;">#</th>
                  <th style="padding-bottom: 8px;">NAMA</th>
                  <th style="padding-bottom: 8px; text-align: right;">QTY</th>
                  <th style="padding-bottom: 8px; text-align: right;">HARGA BELI</th>
                </tr>
              </thead>
              <tbody>${productRows}</tbody>
            </table>

            <h3 style="border-bottom: 2px solid #E597A0; padding-bottom: 8px; margin: 24px 0 12px;">Detail Transaksi</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; color: #6b7280; font-size: 11px;">
                  <th style="padding-bottom: 8px;">ID</th>
                  <th style="padding-bottom: 8px;">WAKTU</th>
                  <th style="padding-bottom: 8px;">ITEMS</th>
                  <th style="padding-bottom: 8px; text-align: right;">HARGA BELI</th>
                </tr>
              </thead>
              <tbody>${txRows || '<tr><td colspan="4" style="text-align:center; color:#9ca3af; padding:20px;">Tidak ada transaksi</td></tr>'}</tbody>
            </table>
          </body>
        </html>`
        : `
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a;">
            <h1 style="color: #E597A0; margin-bottom: 4px;">Laporan Penjualan Tenant</h1>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">${tenant.tenant_name}</p>
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 24px;">Periode: ${dateRangeLabel} • Digenerate: ${dateStr}</p>
            <p style="color: #6b7280; font-size: 11px; font-weight: 600; margin-bottom: 16px;">UNTUK OWNER — Termasuk margin keuntungan</p>

            <div style="background: #fdf2f4; border: 1px solid #e8a0ab; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0; color: #6b7280; font-size: 11px; font-weight: 700;">TOTAL PENDAPATAN</p>
              <h2 style="margin: 8px 0 0 0; font-size: 28px;">${rp(totalRevenue)}</h2>
              <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 13px;">${transactionCount} transaksi</p>
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
                <span style="color: #6b7280; font-size: 11px;">Margin: </span>
                <span style="font-weight: 700; color: #16A34A;">${rp(totalMargin)}</span>
                <span style="color: #6b7280; font-size: 11px;"> (${marginPct}%)</span>
              </div>
            </div>

            <h3 style="border-bottom: 2px solid #E597A0; padding-bottom: 8px; margin-bottom: 12px;">Produk Tenant</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; color: #6b7280; font-size: 11px;">
                  <th style="padding-bottom: 8px;">#</th>
                  <th style="padding-bottom: 8px;">NAMA</th>
                  <th style="padding-bottom: 8px; text-align: right;">QTY</th>
                  <th style="padding-bottom: 8px; text-align: right;">PENDAPATAN</th>
                  <th style="padding-bottom: 8px; text-align: right;">MARGIN</th>
                </tr>
              </thead>
              <tbody>${productRows}</tbody>
            </table>

            <h3 style="border-bottom: 2px solid #E597A0; padding-bottom: 8px; margin: 24px 0 12px;">Detail Transaksi</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="text-align: left; color: #6b7280; font-size: 11px;">
                  <th style="padding-bottom: 8px;">ID</th>
                  <th style="padding-bottom: 8px;">WAKTU</th>
                  <th style="padding-bottom: 8px;">ITEMS</th>
                  <th style="padding-bottom: 8px; text-align: right;">REVENUE</th>
                  <th style="padding-bottom: 8px; text-align: right;">MARGIN</th>
                </tr>
              </thead>
              <tbody>${txRows || '<tr><td colspan="5" style="text-align:center; color:#9ca3af; padding:20px;">Tidak ada transaksi</td></tr>'}</tbody>
            </table>
          </body>
        </html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: type === 'tenant' ? 'Export untuk Tenant' : 'Export untuk Owner',
        });
      } else {
        alert('PDF berhasil dibuat');
      }
    } catch (e) {
      console.error(e);
      alert('Gagal export PDF');
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>DETAIL PENJUALAN</Text>
            <Text style={s.headerTitle} numberOfLines={1}>
              {tenant?.tenant_name || 'Memuat...'}
            </Text>
          </View>
          {tenant && (
            <>
              <TouchableOpacity
                style={s.exportBtn}
                onPress={() => setShowExportModal(true)}
                disabled={exporting}
                activeOpacity={0.7}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={ACCENT} />
                ) : (
                  <MaterialIcons name="picture-as-pdf" size={22} color={ACCENT} />
                )}
              </TouchableOpacity>
              <View style={[s.statusBadge, { backgroundColor: tenant.status ? '#ECFDF5' : '#F3F4F6' }]}>
                <View style={[s.statusDot, { backgroundColor: tenant.status ? '#10B981' : '#D1D5DB' }]} />
                <Text style={[s.statusText, { color: tenant.status ? '#10B981' : '#9CA3AF' }]}>
                  {tenant.status ? 'Aktif' : 'Nonaktif'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Week navigator — periode mingguan Senin–Minggu */}
        <View style={s.periodRow}>
          <TouchableOpacity
            style={s.weekNavBtn}
            onPress={() => {
              const prev = subWeeks(dateFrom, 1);
              const r = getWeekRange(prev);
              setDateFrom(r.from);
              setDateTo(r.to);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="chevron-left" size={24} color={ACCENT} />
          </TouchableOpacity>
          <View style={s.weekNavCenter}>
            <Text style={s.weekNavLabel}>Senin – Minggu</Text>
            <Text style={s.weekNavDates}>{dateRangeLabel}</Text>
          </View>
          <TouchableOpacity
            style={s.weekNavBtn}
            onPress={() => {
              const next = addWeeks(dateFrom, 1);
              const r = getWeekRange(next);
              setDateFrom(r.from);
              setDateTo(r.to);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="chevron-right" size={24} color={ACCENT} />
          </TouchableOpacity>
        </View>

        {/* Export PDF Modal */}
        <Modal visible={showExportModal} transparent animationType="fade">
          <Pressable style={s.modalOverlay} onPress={() => setShowExportModal(false)}>
            <Pressable style={s.dateModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={s.dateModalHeader}>
                <Text style={s.dateModalTitle}>Export ke PDF</Text>
                <TouchableOpacity onPress={() => setShowExportModal(false)}>
                  <MaterialIcons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text style={s.exportModalSub}>Pilih jenis laporan yang ingin dicetak:</Text>

              <TouchableOpacity
                style={s.exportOption}
                onPress={() => handleExportPDF('tenant')}
                activeOpacity={0.85}
              >
                <View style={[s.exportOptionIcon, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialIcons name="person" size={24} color="#0284C7" />
                </View>
                <View style={s.exportOptionBody}>
                  <Text style={s.exportOptionTitle}>Untuk Tenant</Text>
                  <Text style={s.exportOptionDesc}>Rincian pendapatan tanpa margin. Cocok untuk dikirim ke tenant.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={s.exportOption}
                onPress={() => handleExportPDF('owner')}
                activeOpacity={0.85}
              >
                <View style={[s.exportOptionIcon, { backgroundColor: '#DCFCE7' }]}>
                  <MaterialIcons name="business" size={24} color="#16A34A" />
                </View>
                <View style={s.exportOptionBody}>
                  <Text style={s.exportOptionTitle}>Untuk Owner</Text>
                  <Text style={s.exportOptionDesc}>Laporan lengkap termasuk margin keuntungan. Untuk internal owner.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={s.exportOption}
                onPress={handleExportHistoryPDF}
                activeOpacity={0.85}
              >
                <View style={[s.exportOptionIcon, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialIcons name="history" size={24} color="#D97706" />
                </View>
                <View style={s.exportOptionBody}>
                  <Text style={s.exportOptionTitle}>Riwayat Pembayaran</Text>
                  <Text style={s.exportOptionDesc}>Daftar pembayaran ke tenant dengan tanggal & siapa yang menandai. Untuk bukti ke tenant.</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.applyBtn, { marginTop: 16, backgroundColor: '#F3F4F6' }]}
                onPress={() => setShowExportModal(false)}
                activeOpacity={0.85}
              >
                <Text style={[s.applyBtnText, { color: '#6B7280' }]}>Batal</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={s.loadingText}>Memuat data...</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>

            {/* ── Hero Card: Total Revenue ── */}
            <View style={s.heroCard}>
              <View style={s.heroTop}>
                <View style={s.heroIconBg}>
                  <MaterialIcons name="account-balance-wallet" size={24} color={ACCENT} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={s.heroBadge}>
                    <MaterialIcons name="check-circle" size={12} color="#10B981" />
                    <Text style={s.heroBadgeText}>{transactionCount} Transaksi</Text>
                  </View>
                  {withdrawal && (
                    <View style={[s.withdrawalBadge, withdrawal.status === 'withdrawn' ? s.withdrawalBadgeDone : s.withdrawalBadgePending]}>
                      <MaterialIcons
                        name={withdrawal.status === 'withdrawn' ? 'check-circle' : 'pending'}
                        size={12}
                        color={withdrawal.status === 'withdrawn' ? '#10B981' : '#F59E0B'}
                      />
                      <Text style={[s.withdrawalBadgeText, { color: withdrawal.status === 'withdrawn' ? '#10B981' : '#F59E0B' }]}>
                        {withdrawal.status === 'withdrawn' ? 'Sudah diambil' : 'Belum diambil'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={s.heroLabel}>NOMINAL YANG HARUS DIBAYARKAN KE TENANT</Text>
              <Text style={s.heroSubLabel}>Harga beli • Periode {dateRangeLabel}</Text>
              <Text style={s.heroValue}>
                {rp(withdrawal?.status === 'pending' ? (withdrawal.amount || 0) : 0)}
              </Text>
              {canMarkWithdrawn && (
                <TouchableOpacity
                  style={[s.markWithdrawnBtn, markingWithdrawn && { opacity: 0.7 }]}
                  onPress={handleMarkWithdrawn}
                  disabled={markingWithdrawn}
                  activeOpacity={0.85}
                >
                  {markingWithdrawn ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="done-all" size={18} color="#fff" />
                      <Text style={s.markWithdrawnText}>Tandai sudah diambil</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              <View style={s.heroSeparator} />
              <View style={s.heroFooterRow}>
                <View>
                  <Text style={s.heroFooterLabel}>REVENUE</Text>
                  <Text style={s.heroFooterValue}>{rp(totalRevenue)}</Text>
                </View>
                <View style={s.heroDivider} />
                <View>
                  <Text style={s.heroFooterLabel}>MARGIN</Text>
                  <Text style={[s.heroFooterValue, { color: '#16A34A' }]}>{rp(totalMargin)}</Text>
                </View>
                <View style={s.heroDivider} />
                <View>
                  <Text style={s.heroFooterLabel}>PRODUK</Text>
                  <Text style={s.heroFooterValue}>{productStats.length}</Text>
                </View>
              </View>
            </View>

            {/* ── Mini Cards ── */}
            <View style={s.miniGrid}>
              <View style={s.miniCard}>
                <View style={[s.miniIconBg, { backgroundColor: '#16A34A15' }]}>
                  <MaterialIcons name="trending-up" size={20} color="#16A34A" />
                </View>
                <Text style={s.miniValue}>{rp(totalMargin)}</Text>
                <Text style={s.miniLabel}>Total Margin</Text>
                <View style={s.miniSubRow}>
                  <MaterialIcons name="pie-chart" size={10} color="#9CA3AF" />
                  <Text style={s.miniSub}> {marginPct}% dari revenue</Text>
                </View>
              </View>
              <View style={s.miniCard}>
                <View style={[s.miniIconBg, { backgroundColor: '#2563EB15' }]}>
                  <MaterialIcons name="receipt" size={20} color="#2563EB" />
                </View>
                <Text style={s.miniValue}>{transactionCount}</Text>
                <Text style={s.miniLabel}>Total Transaksi</Text>
                <View style={s.miniSubRow}>
                  <MaterialIcons name="star" size={10} color="#9CA3AF" />
                  <Text style={s.miniSub}> {dateRangeLabel}</Text>
                </View>
              </View>
            </View>

            {/* ── Summary & Riwayat penarikan ── */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Pembayaran ke Tenant</Text>
                <Text style={s.sectionSub}>Periode mingguan • Berdasarkan harga beli</Text>
              </View>
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={s.summaryLabel}>Sudah dibayar (seluruh waktu)</Text>
                  <Text style={[s.summaryValue, { color: '#10B981' }]}>
                    {rp(withdrawalHistory.filter((w) => w.status === 'withdrawn').reduce(
                      (a, w) => a + (w.withdrawn_amount ?? w.amount ?? 0), 0
                    ))}
                  </Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={s.summaryLabel}>Belum dibayar (seluruh waktu)</Text>
                  <Text style={[s.summaryValue, { color: '#F59E0B' }]}>
                    {rp(withdrawalHistory.reduce((a, w) => {
                      if (w.status === 'pending') return a + (w.amount || 0);
                      const paid = w.withdrawn_amount ?? w.amount ?? 0;
                      return a + Math.max(0, (w.amount || 0) - paid);
                    }, 0))}
                  </Text>
                </View>
              </View>
              {withdrawalHistory.slice(0, 5).map((w) => (
                <HistoryRow key={w.id} w={w} rp={rp} locale={idLocale} />
              ))}
              {withdrawalHistory.length > 5 && (
                <TouchableOpacity style={s.showAllBtn} onPress={() => setShowHistoryModal(true)}>
                  <Text style={s.showAllText}>Lihat Semua Riwayat ({withdrawalHistory.length})</Text>
                  <MaterialIcons name="chevron-right" size={18} color={ACCENT} />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Detail produk terjual ── */}
            {productStats.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionAccent} />
                  <Text style={s.sectionTitle}>Detail Produk Terjual</Text>
                  <Text style={s.sectionSub}>{productStats.length} produk • {dateRangeLabel}</Text>
                </View>

                {productStats.map((p, i) => {
                  const barPct = totalTenantPayout > 0 ? p.totalTenantPayout / totalTenantPayout : 0;
                  return (
                    <View key={p.product_id} style={s.productCard}>
                      <View style={s.productTop}>
                        <View style={s.productRank}>
                          <Text style={s.productRankText}>#{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.productName} numberOfLines={1}>{p.product_name}</Text>
                          <Text style={s.productQty}>{p.totalQty} terjual</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={s.productPayout}>{rp(p.totalTenantPayout)}</Text>
                          <Text style={s.productMargin}>Margin: {rp(p.totalMargin)}</Text>
                        </View>
                      </View>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${Math.max(barPct * 100, 2)}%` as any }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Detail Transaksi ── */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Detail Transaksi</Text>
                <Text style={s.sectionSub}>{transactions.length} transaksi</Text>
              </View>

              {/* Table header */}
              <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 1 }]}>ID & Waktu</Text>
                <Text style={[s.th, { width: 90, textAlign: 'right' }]}>Revenue</Text>
                <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Margin</Text>
              </View>

              {transactions.length > 0 ? (
                <>
                  {transactions.slice(0, 10).map((tx, i) => (
                    <TxRow key={tx.transaction_id} tx={tx} i={i} rp={rp} locale={idLocale} />
                  ))}
                  {transactions.length > 10 && (
                    <TouchableOpacity style={s.showAllBtn} onPress={() => setShowTxModal(true)}>
                      <Text style={s.showAllText}>Lihat Semua Transaksi ({transactions.length})</Text>
                      <MaterialIcons name="chevron-right" size={18} color={ACCENT} />
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <View style={s.emptyState}>
                  <MaterialIcons name="receipt-long" size={40} color="#D1D5DB" />
                  <Text style={s.emptyText}>Tidak ada transaksi</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Modal Riwayat Pembayaran ─────────────────────────────────────── */}
      <Modal visible={showHistoryModal} transparent animationType="slide">
        <Pressable style={s.sheetOverlay} onPress={() => setShowHistoryModal(false)}>
          <ScrollView
            style={s.bottomSheet}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Riwayat Pembayaran</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={s.sheetClose}>
                <MaterialIcons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Filter chips */}
            <View style={s.filterRow}>
              {([['all', 'Semua'], ['pending', 'Pending'], ['withdrawn', 'Sudah Dibayar']] as const).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.filterChip, historyFilter === key && s.filterChipActive]}
                  onPress={() => setHistoryFilter(key)}
                >
                  <Text style={[s.filterChipText, historyFilter === key && s.filterChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(() => {
              const filtered = withdrawalHistory.filter(w => historyFilter === 'all' || w.status === historyFilter);
              return filtered.length > 0 ? filtered.map((w) => (
                <HistoryRow key={w.id} w={w} rp={rp} locale={idLocale} />
              )) : (
                <View style={s.emptyState}>
                  <MaterialIcons name="history" size={40} color="#D1D5DB" />
                  <Text style={s.emptyText}>Tidak ada riwayat</Text>
                </View>
              );
            })()}
          </ScrollView>
        </Pressable>
      </Modal>

      {/* ── Modal Semua Transaksi ────────────────────────────────────────── */}
      <Modal visible={showTxModal} transparent animationType="slide">
        <Pressable style={s.sheetOverlay} onPress={() => setShowTxModal(false)}>
          <ScrollView
            style={s.bottomSheet}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Detail Transaksi ({transactions.length})</Text>
              <TouchableOpacity onPress={() => setShowTxModal(false)} style={s.sheetClose}>
                <MaterialIcons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={s.tableHeader}>
              <Text style={[s.th, { flex: 1 }]}>ID & Waktu</Text>
              <Text style={[s.th, { width: 90, textAlign: 'right' }]}>Revenue</Text>
              <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Margin</Text>
            </View>

            {transactions.map((tx, i) => (
              <TxRow key={tx.transaction_id} tx={tx} i={i} rp={rp} locale={idLocale} />
            ))}
          </ScrollView>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HistoryRow({ w, rp, locale }: { w: WithdrawalWithUser; rp: (v: number) => string; locale: any }) {
  return (
    <View style={s.historyRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.historyPeriod}>
          {format(new Date(w.period_start), 'd MMM', { locale })} - {format(new Date(w.period_end), 'd MMM yyyy', { locale })}
        </Text>
        <Text style={s.historyAmountLabel}>Harga beli</Text>
        <Text style={s.historyAmount}>{rp(w.amount)}</Text>
        {w.status === 'withdrawn' && w.withdrawn_at && (
          <Text style={s.historyMeta}>
            Dibayar {format(new Date(w.withdrawn_at), 'dd MMM yyyy, HH:mm', { locale })}
            {w.withdrawn_by_name ? ` oleh ${w.withdrawn_by_name}` : ''}
          </Text>
        )}
      </View>
      <View style={[s.historyBadge, w.status === 'withdrawn' ? s.historyBadgeDone : s.historyBadgePending]}>
        <Text style={[s.historyBadgeText, { color: w.status === 'withdrawn' ? '#10B981' : '#F59E0B' }]}>
          {w.status === 'withdrawn' ? 'Sudah' : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

function TxRow({ tx, i, rp, locale }: { tx: TransactionGroup; i: number; rp: (v: number) => string; locale: any }) {
  return (
    <View style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}>
      <View style={{ flex: 1 }}>
        <Text style={s.txId}>#{tx.transaction_id.toString().slice(-6)}</Text>
        <Text style={s.txTime}>{format(new Date(tx.created_at), 'dd MMM HH:mm', { locale })}</Text>
        <Text style={s.txItems} numberOfLines={1}>
          {tx.items.map(it => `${it.quantity}× ${it.product_name}`).join(', ')}
        </Text>
      </View>
      <Text style={[s.td, s.tdAmount, { width: 90 }]}>{rp(tx.total)}</Text>
      <Text style={[s.td, s.tdMargin, { width: 80 }]}>{rp(tx.margin)}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0F0F0',
    alignItems: 'center', justifyContent: 'center',
  },
  headerSub: {
    fontSize: 10, color: '#9CA3AF', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 2 },
  exportBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0F0F0',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },

  // Date Range
  periodRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, gap: 12,
  },
  weekNavBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  weekNavCenter: { flex: 1, alignItems: 'center' },
  weekNavLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  weekNavDates: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  dateModalContent: {
    width: '100%', maxWidth: 360,
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
  },
  dateModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  dateModalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  periodPresetLabel: {
    fontSize: 11, color: '#9CA3AF', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  periodPresetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F0F0F0',
  },
  periodPresetText: { fontSize: 14, fontWeight: '700', color: '#111827', flex: 1 },
  periodPresetSub: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  dateRow: { marginBottom: 16 },
  dateLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 6 },
  dateValueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F9FAFB', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#F0F0F0',
  },
  dateValueText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  pickerDoneBtn: {
    marginTop: 8, paddingVertical: 10, alignItems: 'center',
    backgroundColor: '#F3F4F6', borderRadius: 10,
  },
  pickerDoneText: { fontSize: 14, fontWeight: '700', color: ACCENT },
  applyBtn: {
    marginTop: 20, paddingVertical: 14, alignItems: 'center',
    backgroundColor: ACCENT, borderRadius: 14,
  },
  applyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Export Modal
  exportModalSub: {
    fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 20,
  },
  exportOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0',
  },
  exportOptionIcon: {
    width: 48, height: 48, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  exportOptionBody: { flex: 1 },
  exportOptionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  exportOptionDesc: { fontSize: 12, color: '#6B7280', lineHeight: 18 },

  // Loading
  loadingWrap: { paddingTop: 80, alignItems: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },

  // Hero Card
  heroCard: {
    backgroundColor: '#fff', borderRadius: 24,
    borderWidth: 1, borderColor: '#F0F0F0',
    padding: 20, marginBottom: 12,
  },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  heroIconBg: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: ACCENT_LIGHT, justifyContent: 'center', alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  withdrawalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  withdrawalBadgeDone: { backgroundColor: '#ECFDF5' },
  withdrawalBadgePending: { backgroundColor: '#FFFBEB' },
  withdrawalBadgeText: { fontSize: 11, fontWeight: '700' },
  markWithdrawnBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 12, backgroundColor: '#10B981',
    borderRadius: 12,
  },
  markWithdrawnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  heroLabel: {
    fontSize: 11, color: '#9CA3AF', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  heroSubLabel: { fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: '500' },
  heroValue: {
    fontSize: 28, fontWeight: '800', color: '#111827',
    marginTop: 4, letterSpacing: -0.5,
  },
  heroSeparator: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 16 },
  heroFooterRow: { flexDirection: 'row', alignItems: 'center' },
  heroFooterLabel: {
    fontSize: 10, color: '#9CA3AF', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  heroFooterValue: { fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 3 },
  heroDivider: { width: 1, height: 36, backgroundColor: '#F0F0F0', marginHorizontal: 16 },

  // Mini Cards
  miniGrid: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  miniCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20,
    borderWidth: 1, borderColor: '#F0F0F0', padding: 16,
  },
  miniIconBg: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  miniValue:  { fontSize: 16, fontWeight: '800', color: '#111827' },
  miniLabel:  { fontSize: 11, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  miniSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  miniSub:    { fontSize: 10, color: '#9CA3AF' },

  // Section
  section:       { marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  sectionAccent: { width: 3, height: 20, backgroundColor: ACCENT, borderRadius: 2 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  sectionSub:    { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  summaryRow:    { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard:   { flex: 1, backgroundColor: '#F9FAFB', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#F0F0F0' },
  summaryLabel:  { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue:  { fontSize: 18, fontWeight: '800', marginTop: 4 },
  historyRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', padding: 12, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: '#F0F0F0' },
  historyPeriod: { fontSize: 12, fontWeight: '600', color: '#374151' },
  historyAmountLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '800', color: ACCENT, marginTop: 2 },
  historyMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  historyBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyBadgeDone:   { backgroundColor: '#ECFDF5' },
  historyBadgePending: { backgroundColor: '#FFFBEB' },
  historyBadgeText:   { fontSize: 11, fontWeight: '700' },

  // Product list
  productCard: {
    backgroundColor: '#FAFAFA', borderRadius: 16,
    borderWidth: 1, borderColor: '#F0F0F0',
    padding: 14, marginBottom: 8,
  },
  productTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  productRank: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: ACCENT_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  productRankText: { fontSize: 11, fontWeight: '800', color: ACCENT },
  productName:     { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  productQty:      { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  productRevenue:  { fontSize: 14, fontWeight: '800', color: ACCENT },
  productPayout:   { fontSize: 14, fontWeight: '800', color: ACCENT },
  productMargin:   { fontSize: 11, color: '#16A34A', fontWeight: '600', marginTop: 2 },
  barTrack: { height: 4, backgroundColor: '#F0F0F0', borderRadius: 2, overflow: 'hidden' },
  barFill:  { height: 4, backgroundColor: ACCENT + '80', borderRadius: 2 },

  // Transaction Table
  tableHeader: {
    flexDirection: 'row', backgroundColor: ACCENT_LIGHT,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 4,
  },
  th: {
    fontSize: 10.5, fontWeight: '700', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#fff', marginBottom: 3,
    borderWidth: 1, borderColor: '#F5F5F5',
  },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  txId:    { fontSize: 13, fontWeight: '700', color: '#111827' },
  txTime:  { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  txItems: { fontSize: 10, color: '#C4C9D4', marginTop: 3 },
  td:      { fontSize: 12, color: '#374151', fontWeight: '500' },
  tdAmount: { fontSize: 13, fontWeight: '700', color: ACCENT, textAlign: 'right' },
  tdMargin: { fontSize: 12, fontWeight: '600', color: '#16A34A', textAlign: 'right' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText:  { color: '#9CA3AF', marginTop: 10, fontSize: 13 },

  // Show All button
  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 12, marginTop: 4,
    backgroundColor: '#FDF2F4', borderRadius: 12,
    borderWidth: 1, borderColor: '#F5C0CA',
  },
  showAllText: { fontSize: 13, fontWeight: '700', color: ACCENT },

  // Bottom Sheet Modal
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12,
    width: '100%', maxHeight: '85%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle:  { fontSize: 17, fontWeight: '800', color: '#111827' },
  sheetClose:  { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },

  // Filter chips in modal
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterChipText:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#fff' },
});
