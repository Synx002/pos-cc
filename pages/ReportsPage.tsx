// pages/ReportsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Surface, ActivityIndicator } from 'react-native-paper';
import { supabase } from '../lib/supabase';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

// ── Export helpers
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';

const FS = FileSystem as any;
const docDir: string =
  FS.documentDirectory ??
  FS.dirs?.DocumentDir ??
  FS.StorageAccessFramework?.getUriForDirectoryInRoot?.('') ??
  '';

const ACCENT = '#E597A0';
const ACCENT_LIGHT = '#FDF2F4';

type Period = 'today' | '7d' | '30d';

interface Transaction {
  transaction_id: string;
  created_at: string;
  subtotal: number;
  grand_total?: number;
  tax: number;
  discount: number;
  transaction_status: string;
  profiles?: { user_name?: string };
}

interface DayData {
  date: string;
  revenue: number;
  count: number;
}

interface Stats {
  revenue: number;
  transactions: number;
  avgTransaction: number;
}

type ReportsPageProps = {
  role: 'owner' | 'storeman' | 'cashier';
};

export default function ReportsPage({ role }: ReportsPageProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isOwner = role === 'owner';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [period, setPeriod] = useState<Period>('today');
  const [stats, setStats] = useState<Stats>({
    revenue: 0,
    transactions: 0,
    avgTransaction: 0,
  });
  const [dailyData, setDailyData] = useState<DayData[]>([]);
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);

  const periodLabels: Record<Period, string> = {
    today: 'Hari Ini',
    '7d': '7 Hari',
    '30d': '30 Hari',
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let fromDate: Date;

      // Restrict period for non-owners
      const activePeriod = isOwner ? period : 'today';

      switch (activePeriod) {
        case 'today': fromDate = startOfDay(now); break;
        case '7d':   fromDate = startOfDay(subDays(now, 7)); break;
        case '30d':  fromDate = startOfDay(subDays(now, 30)); break;
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('*, profiles(user_name)')
        .eq('transaction_status', 'completed')
        .gte('created_at', fromDate!.toISOString())
        .lte('created_at', endOfDay(now).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      const txns: Transaction[] = data || [];
      setRawTransactions(txns);

      const revenue = txns.reduce((s, t) => s + (t.grand_total ?? t.subtotal), 0);

      setStats({
        revenue,
        transactions: txns.length,
        avgTransaction: txns.length > 0 ? Math.round(revenue / txns.length) : 0,
      });

      const grouped: Record<string, { revenue: number; count: number }> = {};
      [...txns].reverse().forEach((t) => {
        const day = format(new Date(t.created_at), 'yyyy-MM-dd');
        if (!grouped[day]) grouped[day] = { revenue: 0, count: 0 };
        grouped[day].revenue += t.grand_total ?? t.subtotal;
        grouped[day].count++;
      });

      setDailyData(Object.entries(grouped).map(([date, v]) => ({ date, ...v })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchReports(); }, [period, role]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchReports(); }, [period, role]);

  const rp = (v: number) => `Rp ${v.toLocaleString('id-ID')}`;
  const pct = (part: number, total: number) =>
    total > 0 ? ((part / total) * 100).toFixed(1) + '%' : '0%';

  // ── Exports
  const exportPDF = async () => {
    setExporting(true);
    setExportModalVisible(false);
    try {
      const activePeriod = isOwner ? period : 'today';
      const periodText = periodLabels[activePeriod];
      const generatedAt = format(new Date(), 'dd MMMM yyyy, HH:mm', { locale: idLocale });

      const dailyRows = dailyData.map((d, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fdf2f4'}">
          <td>${format(new Date(d.date), 'EEEE, d MMM yyyy', { locale: idLocale })}</td>
          <td style="text-align:center">${d.count}</td>
          <td style="text-align:right">${rp(d.revenue)}</td>
          <td style="text-align:right">${rp(Math.round(d.revenue / d.count))}</td>
        </tr>`).join('');

      const txRows = rawTransactions.slice(0, 50).map((t, i) => {
        const total = t.grand_total ?? t.subtotal;
        return `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fdf2f4'}">
          <td>#${t.transaction_id.toString().slice(-6)}</td>
          <td>${format(new Date(t.created_at), 'dd/MM HH:mm')}</td>
          <td>${t.profiles?.user_name || 'Kasir'}</td>
          <td style="text-align:right">${rp(t.subtotal)}</td>
          <td style="text-align:right; font-weight:700; color:#E597A0">${rp(total)}</td>
        </tr>`;
      }).join('');

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; background: #fff; font-size: 12px; }
          .cover { background: linear-gradient(135deg, #E597A0 0%, #f4b8c1 100%); padding: 48px 40px; color: white; }
          .cover h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
          .cover p { font-size: 13px; opacity: 0.85; margin-top: 6px; }
          .cover .badge { display: inline-block; background: rgba(255,255,255,0.25); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 12px; }
          .content { padding: 32px 40px; }
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
          .summary-card { border: 1px solid #f0f0f0; border-radius: 14px; padding: 18px; }
          .summary-card.main { grid-column: span 3; background: #fdf2f4; border-color: #E597A0; }
          .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
          .summary-card .value { font-size: 22px; font-weight: 800; color: #111827; }
          .summary-card .value.accent { color: #E597A0; }
          .summary-card .sub { font-size: 11px; color: #9ca3af; margin-top: 4px; }
          .section-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #fdf2f4; }
          table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 32px; }
          th { background: #E597A0; color: white; padding: 10px 12px; text-align: left; font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 9px 12px; border-bottom: 1px solid #f5f5f5; color: #374151; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0f0f0; text-align: center; color: #9ca3af; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="cover">
          <h1>Laporan Keuangan</h1>
          <p>Selasar Kafe &nbsp;•&nbsp; Digenerate: ${generatedAt}</p>
          <div class="badge">Periode: ${periodText}</div>
        </div>
        <div class="content">
          <div class="summary-grid">
            <div class="summary-card main">
              <div class="label">Total Pendapatan</div>
              <div class="value accent">${rp(stats.revenue)}</div>
              <div class="sub">${stats.transactions} transaksi selesai &nbsp;•&nbsp; Rata-rata ${rp(stats.avgTransaction)} / transaksi</div>
            </div>
          </div>
          ${dailyData.length > 0 ? `
          <div class="section-title">Rincian Harian</div>
          <table>
            <thead>
              <tr><th>Tanggal</th><th>Transaksi</th><th>Total Pendapatan</th><th>Rata-rata</th></tr>
            </thead>
            <tbody>${dailyRows}</tbody>
          </table>` : ''}
          <div class="section-title">Detail Transaksi ${rawTransactions.length > 50 ? '(50 terbaru)' : ''}</div>
          <table>
            <thead>
              <tr><th>ID</th><th>Waktu</th><th>Kasir</th><th>Subtotal</th><th>Total</th></tr>
            </thead>
            <tbody>${txRows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px">Tidak ada transaksi</td></tr>'}</tbody>
          </table>
          <div class="footer">Laporan ini dibuat secara otomatis oleh sistem Selasar Kafe &nbsp;•&nbsp; ${generatedAt}</div>
        </div>
      </body>
      </html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const fileName = `Laporan_${activePeriod}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
      const destUri = docDir + fileName;
      await (FileSystem as any).moveAsync({ from: uri, to: destUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, { mimeType: 'application/pdf', dialogTitle: 'Simpan / Bagikan PDF' });
      } else {
        Alert.alert('Tersimpan', `PDF disimpan di: ${destUri}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Export PDF gagal. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    setExportModalVisible(false);
    try {
      const wb = XLSX.utils.book_new();
      const activePeriod = isOwner ? period : 'today';

      const summaryData = [
        ['LAPORAN KEUANGAN — SELASAR KAFE'],
        [`Periode: ${periodLabels[activePeriod]}`],
        [`Digenerate: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: idLocale })}`],
        [],
        ['RINGKASAN'],
        ['Keterangan', 'Nilai'],
        ['Total Pendapatan', stats.revenue],
        ['Jumlah Transaksi', stats.transactions],
        ['Rata-rata / Transaksi', stats.avgTransaction],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

      if (dailyData.length > 0) {
        const dailyRowsList = [
          ['Tanggal', 'Jumlah Transaksi', 'Total Pendapatan (Rp)', 'Rata-rata (Rp)'],
          ...dailyData.map((d) => [
            format(new Date(d.date), 'EEEE, d MMMM yyyy', { locale: idLocale }),
            d.count,
            d.revenue,
            Math.round(d.revenue / d.count),
          ]),
        ];
        const wsDaily = XLSX.utils.aoa_to_sheet(dailyRowsList);
        wsDaily['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 22 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, wsDaily, 'Rincian Harian');
      }

      const txHeader = ['ID Transaksi', 'Waktu', 'Kasir', 'Subtotal (Rp)', 'Total (Rp)', 'Status'];
      const txRowsExcel = rawTransactions.map((t) => [
        `#${t.transaction_id.toString().slice(-6)}`,
        format(new Date(t.created_at), 'dd/MM/yyyy HH:mm'),
        t.profiles?.user_name || 'Kasir',
        t.subtotal,
        t.grand_total ?? t.subtotal,
        t.transaction_status,
      ]);
      const wsDetail = XLSX.utils.aoa_to_sheet([txHeader, ...txRowsExcel]);
      wsDetail['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Transaksi');

      const wbOut = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `Laporan_${activePeriod}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      const destUri = docDir + fileName;
      await (FileSystem as any).writeAsStringAsync(destUri, wbOut, { encoding: "base64" });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Simpan / Bagikan Excel',
        });
      } else {
        Alert.alert('Tersimpan', `Excel disimpan di: ${destUri}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Export Excel gagal. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} />}
      >
        <View style={s.header}>
          <View>
            <Text style={s.headerSub}>{role.toUpperCase()}</Text>
            <Text style={s.headerTitle}>Laporan Keuangan</Text>
          </View>
          <TouchableOpacity
            style={s.exportBtn}
            onPress={() => setExportModalVisible(true)}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size={16} color="#fff" />
            ) : (
              <MaterialIcons name="file-download" size={18} color="#fff" />
            )}
            <Text style={s.exportBtnText}>{exporting ? 'Exporting...' : 'Export'}</Text>
          </TouchableOpacity>
        </View>

        {isOwner && (
          <View style={s.periodRow}>
            {(['today', '7d', '30d'] as Period[]).map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.periodChip, period === p && s.periodChipActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[s.periodText, period === p && s.periodTextActive]}>
                  {periodLabels[p]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={{ color: '#9ca3af', marginTop: 12, fontSize: 13 }}>Memuat laporan...</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
            <Surface style={s.heroCard}>
              <View style={s.heroTop}>
                <View style={s.heroIconBg}>
                  <MaterialIcons name="account-balance-wallet" size={24} color={ACCENT} />
                </View>
                <View style={s.heroBadge}>
                  <MaterialIcons name="check-circle" size={12} color="#10b981" />
                  <Text style={s.heroBadgeText}>{stats.transactions} Transaksi</Text>
                </View>
              </View>
              <Text style={s.heroLabel}>Total Pendapatan</Text>
              <Text style={s.heroValue}>{rp(stats.revenue)}</Text>
              <View style={s.heroSeparator} />
              <View style={s.heroFooterRow}>
                <View>
                  <Text style={s.heroFooterLabel}>Rata-rata / Transaksi</Text>
                  <Text style={s.heroFooterValue}>{rp(stats.avgTransaction)}</Text>
                </View>
              </View>
            </Surface>

            {dailyData.length > 0 && isOwner && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionAccent} />
                  <Text style={s.sectionTitle}>Rincian Harian</Text>
                </View>
                {dailyData.map((d) => {
                  const barPct = stats.revenue > 0 ? d.revenue / stats.revenue : 0;
                  return (
                    <Surface key={d.date} style={s.dayCard}>
                      <View style={s.dayTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.dayDate}>{format(new Date(d.date), 'EEEE, d MMM', { locale: idLocale })}</Text>
                          <Text style={s.dayCount}>{d.count} transaksi</Text>
                        </View>
                        <Text style={s.dayRevenue}>{rp(d.revenue)}</Text>
                      </View>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { width: `${Math.max(barPct * 100, 2)}%` as any }]} />
                      </View>
                    </Surface>
                  );
                })}
              </View>
            )}

            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Detail Transaksi</Text>
                <Text style={s.sectionSub}>{rawTransactions.length} transaksi</Text>
              </View>

              <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 1 }]}>ID & Waktu</Text>
                <Text style={[s.th, { width: 60 }]}>Kasir</Text>
                <Text style={[s.th, { width: 100, textAlign: 'right' }]}>Total</Text>
              </View>

              {rawTransactions.length > 0 ? (
                rawTransactions.map((t, i) => {
                  const total = t.grand_total ?? t.subtotal;
                  const detailPath = isOwner ? `/owner/reports/${t.transaction_id}` : 
                                    (role === 'cashier' ? `/cashier/history` : `/storeman/history`);
                  return (
                    <TouchableOpacity 
                      key={t.transaction_id} 
                      onPress={() => router.push(detailPath as any)}
                      activeOpacity={0.7}
                      style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.txId}>#{t.transaction_id.toString().slice(-6)}</Text>
                        <Text style={s.txTime}>{format(new Date(t.created_at), 'dd MMM HH:mm')}</Text>
                      </View>
                      <Text style={[s.td, { width: 60 }]} numberOfLines={1}>{t.profiles?.user_name || 'Kasir'}</Text>
                      <Text style={[s.td, s.tdAmount, { width: 100 }]}>{rp(total)}</Text>
                    </TouchableOpacity>
                  );
                })
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

      {/* ── Export Modal ── */}
      <Modal transparent visible={exportModalVisible} animationType="fade">
        <Pressable style={s.modalOverlay} onPress={() => setExportModalVisible(false)}>
          <Pressable style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Export Laporan</Text>
            <Text style={s.modalSub}>Pilih format file untuk mengexport laporan harian</Text>

            <TouchableOpacity style={s.modalOption} onPress={exportPDF}>
              <View style={[s.modalOptionIcon, { backgroundColor: '#FEF2F2' }]}>
                <MaterialIcons name="picture-as-pdf" size={26} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalOptionTitle}>Export ke PDF</Text>
                <Text style={s.modalOptionSub}>Laporan lengkap dengan grafik & tabel</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={s.modalOption} onPress={exportExcel}>
              <View style={[s.modalOptionIcon, { backgroundColor: '#F0FDF4' }]}>
                <MaterialIcons name="table-chart" size={26} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalOptionTitle}>Export ke Excel</Text>
                <Text style={s.modalOptionSub}>3 sheet: Ringkasan, Harian, Detail</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#D1D5DB" />
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setExportModalVisible(false)}>
              <Text style={s.modalCancelText}>Batal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MiniCard({ label, value, sub, icon, color }: any) {
  return (
    <Surface style={s.miniCard}>
      <View style={[s.miniIconBg, { backgroundColor: color + '15' }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={s.miniValue}>{value}</Text>
      <Text style={s.miniLabel}>{label}</Text>
      <View style={s.miniSubRow}>
        <MaterialIcons name="pie-chart" size={10} color="#9CA3AF" />
        <Text style={s.miniSub}> {sub}</Text>
      </View>
    </Surface>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerSub: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 2 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: ACCENT, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, gap: 6 },
  exportBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  periodRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 8 },
  periodChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB' },
  periodChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  periodText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  periodTextActive: { color: '#fff' },
  heroCard: { elevation: 0, borderRadius: 24, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0F0F0', padding: 20, marginBottom: 12 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  heroIconBg: { width: 44, height: 44, borderRadius: 14, backgroundColor: ACCENT_LIGHT, justifyContent: 'center', alignItems: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 4 },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  heroLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroValue: { fontSize: 28, fontWeight: '800', color: '#111827', marginTop: 4, letterSpacing: -0.5 },
  heroSeparator: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 16 },
  heroFooterRow: { flexDirection: 'row', alignItems: 'center' },
  heroFooterLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroFooterValue: { fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 3 },
  heroDivider: { width: 1, height: 36, backgroundColor: '#F0F0F0', marginHorizontal: 20 },
  miniGrid: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  miniCard: { flex: 1, elevation: 0, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0F0F0', padding: 16 },
  miniIconBg: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  miniValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  miniLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  miniSubRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  miniSub: { fontSize: 10, color: '#9CA3AF' },
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  sectionAccent: { width: 3, height: 20, backgroundColor: ACCENT, borderRadius: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  sectionSub: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  dayCard: { elevation: 0, borderRadius: 16, backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#F0F0F0', padding: 14, marginBottom: 8 },
  dayTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  dayDate: { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  dayCount: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  dayRevenue: { fontSize: 14, fontWeight: '800', color: ACCENT },
  barTrack: { height: 4, backgroundColor: '#F0F0F0', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: ACCENT + '80', borderRadius: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: ACCENT_LIGHT, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 4 },
  th: { fontSize: 10.5, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fff', marginBottom: 3, borderWidth: 1, borderColor: '#F5F5F5' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  txId: { fontSize: 13, fontWeight: '700', color: '#111827' },
  txTime: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  td: { fontSize: 12, color: '#374151', fontWeight: '500' },
  tdAmount: { fontSize: 13, fontWeight: '700', color: ACCENT, textAlign: 'right' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#9CA3AF', marginTop: 10, fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 16,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#9CA3AF', marginBottom: 20 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FAFAFA', borderRadius: 18, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0',
  },
  modalOptionIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  modalOptionTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  modalOptionSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  modalCancel: {
    marginTop: 4, paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, backgroundColor: '#F5F5F5',
  },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
});
