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
  const { data } = await supabase
    .from('tenant_withdrawals')
    .select('*')
    .eq('tenant_id', Number(tenantId))
    .eq('period_start', startStr)
    .eq('period_end', endStr)
    .order('created_at', { ascending: true });
  return (data || []) as TenantWithdrawal[];
}

/** Ambil atau buat record withdrawal. Jika ada transaksi baru setelah periode sudah dibayar, buat record BARU (history bertambah). */
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
  const totalRecorded = existing.reduce((sum, w) => {
    if (w.status === 'withdrawn') return sum + (w.withdrawn_amount ?? w.amount ?? 0);
    return sum + (w.amount || 0);
  }, 0);

  const delta = Math.max(0, amount - totalRecorded);
  if (delta <= 0) {
    const pending = existing.find((w) => w.status === 'pending');
    return pending || existing[existing.length - 1] || null;
  }

  const { data: created, error } = await supabase
    .from('tenant_withdrawals')
    .insert({
      tenant_id: Number(tenantId),
      period_type: periodType,
      period_start: startStr,
      period_end: endStr,
      amount: delta,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('getOrCreateWithdrawal error:', error);
    return null;
  }
  return created as TenantWithdrawal;
}

/** Tandai withdrawal sudah diambil — simpan withdrawn_amount agar transaksi baru di periode sama tetap tercatat sebagai belum dibayar */
export async function markWithdrawn(
  withdrawalId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: row } = await supabase
    .from('tenant_withdrawals')
    .select('amount')
    .eq('id', withdrawalId)
    .single();
  const amountToLock = row?.amount ?? 0;

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
}

export interface WithdrawalWithUser extends TenantWithdrawal {
  withdrawn_by_name?: string | null;
}

/** Ambil semua riwayat withdrawal tenant (untuk summary sudah/belum dibayar) + nama user yang menandai */
export async function getWithdrawalHistory(
  tenantId: string | number
): Promise<WithdrawalWithUser[]> {
  const { data } = await supabase
    .from('tenant_withdrawals')
    .select('*')
    .eq('tenant_id', Number(tenantId))
    .order('period_start', { ascending: false });
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
}

/** Sync withdrawal records — dipanggil saat TenantsPage load/refresh agar "belum dibayar" selalu terupdate tanpa harus buka detail tenant */
export async function syncWithdrawalsForCurrentWeek(): Promise<void> {
  const now = new Date();
  const weeksToSync = 4;
  for (let i = 0; i < weeksToSync; i++) {
    const weekRef = subWeeks(now, i);
    const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekRef, { weekStartsOn: 1 });
    const fromDate = startOfDay(weekStart).toISOString();
    const toDate = endOfDay(weekEnd).toISOString();

    const { data: details } = await supabase
      .from('transaction_details')
      .select('quantity, products!inner(tenant_id, purchase_price), transactions!inner(created_at, transaction_status)')
      .eq('transactions.transaction_status', 'completed')
      .gte('transactions.created_at', fromDate)
      .lte('transactions.created_at', toDate);

    if (!details?.length) continue;

    const payoutByTenant = new Map<number, number>();
    for (const row of details) {
      const tenantId = row.products?.tenant_id;
      if (tenantId == null) continue;
      const qty = row.quantity || 0;
      const purchasePrice = row.products?.purchase_price || 0;
      const amount = qty * purchasePrice;
      payoutByTenant.set(tenantId, (payoutByTenant.get(tenantId) || 0) + amount);
    }

    for (const [tid, amount] of payoutByTenant) {
      if (amount <= 0) continue;
      await getOrCreateWithdrawal(tid, weekStart, weekEnd, amount);
    }
  }
}

/** Ambil record pending untuk periode (untuk tombol tandai). Bisa ada banyak record per periode. */
export async function getWithdrawalForPeriod(
  tenantId: string | number,
  periodStart: Date,
  periodEnd: Date
): Promise<TenantWithdrawal | null> {
  const all = await getWithdrawalsForPeriod(tenantId, periodStart, periodEnd);
  const pending = all.filter((w) => w.status === 'pending');
  return pending[pending.length - 1] || null;
}
