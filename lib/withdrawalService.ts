// lib/withdrawalService.ts
// Pencatatan penarikan uang tenant — Periode mingguan (Senin–Minggu)

import { supabase } from './supabase';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
  subWeeks,
} from 'date-fns';

export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface TenantWithdrawal {
  id: string;
  tenant_id: number;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  amount: number;
  withdrawn_amount?: number | null;
  status: 'pending' | 'withdrawn';
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Cek tipe periode (selalu weekly untuk Senin–Minggu) */
export function getPeriodTypeForRange(
  from: Date,
  to: Date
): PeriodType {
  const fromStr = format(from, 'yyyy-MM-dd');
  const toStr = format(to, 'yyyy-MM-dd');

  const weekStart = startOfWeek(from, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(from, { weekStartsOn: 1 });
  if (
    format(weekStart, 'yyyy-MM-dd') === fromStr &&
    format(weekEnd, 'yyyy-MM-dd') === toStr
  ) {
    return 'weekly';
  }

  const monthStart = startOfMonth(from);
  const monthEnd = endOfMonth(from);
  if (
    format(monthStart, 'yyyy-MM-dd') === fromStr &&
    format(monthEnd, 'yyyy-MM-dd') === toStr
  ) {
    return 'monthly';
  }

  const fromDay = startOfDay(from);
  const toDay = endOfDay(to);
  const diffDays = Math.round((toDay.getTime() - fromDay.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'daily';

  return 'custom';
}

/** Ambil semua record withdrawal untuk periode ini */
export async function getWithdrawalsForPeriod(
  tenantId: string | number,
  periodStart: Date,
  periodEnd: Date
): Promise<TenantWithdrawal[]> {
  const startStr = format(startOfDay(periodStart), 'yyyy-MM-dd');
  const endStr = format(endOfDay(periodEnd), 'yyyy-MM-dd');
  const { data, error } = await supabase
    .from('tenant_withdrawals')
    .select('*')
    .eq('tenant_id', Number(tenantId))
    .eq('period_start', startStr)
    .eq('period_end', endStr)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getWithdrawalsForPeriod error:', error.message);
    return [];
  }
  return (data || []) as TenantWithdrawal[];
}

/** 
 * Ambil atau buat record withdrawal:
 * 1. Jika ada record pending, perbarui nominalnya (amount) sesuai transaksi terbaru.
 * 2. Jika sudah ada record 'withdrawn' dan ada transaksi baru di periode yang sama, buat record pending baru untuk selisihnya.
 */
export async function getOrCreateWithdrawal(
  tenantId: string | number,
  periodStart: Date,
  periodEnd: Date,
  amount: number
): Promise<TenantWithdrawal | null> {
  const startStr = format(startOfDay(periodStart), 'yyyy-MM-dd');
  const endStr = format(endOfDay(periodEnd), 'yyyy-MM-dd');
  const periodType = getPeriodTypeForRange(periodStart, periodEnd);

  const existing = await getWithdrawalsForPeriod(tenantId, periodStart, periodEnd);

  // Total yang sudah ditandai diambil ('withdrawn') pada periode ini
  const withdrawnTotal = existing
    .filter((w) => w.status === 'withdrawn')
    .reduce((sum, w) => sum + (w.withdrawn_amount ?? w.amount ?? 0), 0);

  // Sisa nominal yang berhak ditarik
  const remainingDue = Math.max(0, amount - withdrawnTotal);

  // Cek apakah sudah ada record yang masih berstatus pending
  const pendingRecord = existing.find((w) => w.status === 'pending');

  if (pendingRecord) {
    // Jika nominal pending berbeda dengan sisa tagihan, update record yang ada
    if (pendingRecord.amount !== remainingDue) {
      const { data: updated, error } = await supabase
        .from('tenant_withdrawals')
        .update({
          amount: remainingDue,
          updated_at: new Date().toISOString(),
          withdrawn_by: null, // <-- Pastikan tetap null saat pending
          withdrawn_at: null,
        })
        .eq('id', pendingRecord.id)
        .select()
        .single();

      if (error) {
        console.error('getOrCreateWithdrawal update error:', error.message);
        return pendingRecord;
      }
      return updated as TenantWithdrawal;
    }
    return pendingRecord;
  }

  // Jika tidak ada record pending dan sisa tagihan <= 0, tidak perlu buat baru
  if (remainingDue <= 0) {
    return existing[existing.length - 1] || null;
  }

  // Pastikan user terautentikasi sebelum melakukan INSERT
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn('getOrCreateWithdrawal ditunda: User belum terautentikasi.');
    return null;
  }

  const { data: created, error } = await supabase
    .from('tenant_withdrawals')
    .insert({
      tenant_id: Number(tenantId),
      period_type: periodType,
      period_start: startStr,
      period_end: endStr,
      amount: remainingDue,
      status: 'pending',
      withdrawn_by: null,      // <-- EKSPLISIT NULL agar tidak terkena default yang salah
      withdrawn_at: null,      // <-- EKSPLISIT NULL
      withdrawn_amount: null,
      notes: null,
    })
    .select()
    .single();


  if (error) {
    console.error('getOrCreateWithdrawal error:', error.message);
    return null;
  }
  return created as TenantWithdrawal;
}

/** Tandai withdrawal sudah diambil — simpan withdrawn_amount agar transaksi baru di periode sama tetap tercatat sebagai belum dibayar */
export async function markWithdrawn(
  withdrawalId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: row, error: fetchError } = await supabase
      .from('tenant_withdrawals')
      .select('amount')
      .eq('id', withdrawalId)
      .single();

    if (fetchError || !row) {
      return { success: false, error: fetchError?.message || 'Data withdrawal tidak ditemukan' };
    }

    const amountToLock = row.amount ?? 0;

    const { error } = await supabase
      .from('tenant_withdrawals')
      .update({
        status: 'withdrawn',
        withdrawn_at: new Date().toISOString(),
        withdrawn_by: userId,
        withdrawn_amount: amountToLock,
      })
      .eq('id', withdrawalId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Terjadi kesalahan sistem' };
  }
}

export interface WithdrawalWithUser extends TenantWithdrawal {
  withdrawn_by_name?: string | null;
}

/** Ambil semua riwayat withdrawal tenant (untuk summary sudah/belum dibayar) + nama user yang menandai */
export async function getWithdrawalHistory(
  tenantId: string | number
): Promise<WithdrawalWithUser[]> {
  try {
    const { data, error } = await supabase
      .from('tenant_withdrawals')
      .select('*')
      .eq('tenant_id', Number(tenantId))
      .order('period_start', { ascending: false });

    if (error) {
      console.error('getWithdrawalHistory error:', error.message);
      return [];
    }

    const rows = (data || []) as TenantWithdrawal[];
    const userIds = [...new Set(rows.map((r) => r.withdrawn_by).filter(Boolean))] as string[];
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_name')
        .in('id', userIds);
      nameMap = (profiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.user_name || 'User' }), {});
    }
    return rows.map((r) => ({
      ...r,
      withdrawn_by_name: r.withdrawn_by ? nameMap[r.withdrawn_by] || null : null,
    }));
  } catch (err: any) {
    console.error('getWithdrawalHistory error:', err);
    return [];
  }
}

/** Sync withdrawal records — dipanggil saat TenantsPage load/refresh agar "belum dibayar" selalu terupdate tanpa harus buka detail tenant */
export async function syncWithdrawalsForCurrentWeek(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const now = new Date();
  const weeksToSync = 4;
  for (let i = 0; i < weeksToSync; i++) {
    const weekRef = subWeeks(now, i);
    const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekRef, { weekStartsOn: 1 });
    const fromDate = startOfDay(weekStart).toISOString();
    const toDate = endOfDay(weekEnd).toISOString();

    const { data: details, error: detailsError } = await supabase
      .from('transaction_details')
      .select('quantity, products!inner(tenant_id, purchase_price), transactions!inner(created_at, transaction_status)')
      .eq('transactions.transaction_status', 'completed')
      .gte('transactions.created_at', fromDate)
      .lte('transactions.created_at', toDate);

    if (detailsError) {
      console.error('syncWithdrawals query error:', detailsError.message);
      continue;
    }

    if (!details?.length) continue;

    const payoutByTenant = new Map<number, number>();
    for (const row of details) {
      const productObj = Array.isArray(row.products) ? row.products[0] : row.products;
      const tenantId = productObj?.tenant_id;
      if (tenantId == null) continue;
      const qty = row.quantity || 0;
      const purchasePrice = productObj?.purchase_price || 0;
      const amount = qty * purchasePrice;
      payoutByTenant.set(tenantId, (payoutByTenant.get(tenantId) || 0) + amount);
    }

    for (const [tid, amount] of payoutByTenant) {
      if (amount <= 0) continue;
      await getOrCreateWithdrawal(tid, weekStart, weekEnd, amount);
    }
  }
}

/** Ambil record pending untuk periode (untuk tombol tandai). */
export async function getWithdrawalForPeriod(
  tenantId: string | number,
  periodStart: Date,
  periodEnd: Date
): Promise<TenantWithdrawal | null> {
  const all = await getWithdrawalsForPeriod(tenantId, periodStart, periodEnd);
  const pending = all.filter((w) => w.status === 'pending');
  return pending[pending.length - 1] || all[all.length - 1] || null;
}
