/**
 * Backup data transaksi dan master data.
 * Mengekspor tenants, products, stocks, transactions, dll ke JSON.
 */
import { supabase } from './supabase';
import { getStoreInfo } from './storeSettings';

export type BackupData = {
  version: number;
  exported_at: string;
  store_info: Awaited<ReturnType<typeof getStoreInfo>>;
  tenants: any[];
  products: any[];
  stocks: any[];
  transactions: any[];
  transaction_details: any[];
  payments: any[];
  stock_logs: any[];
  price_logs: any[];
  profiles: any[];
};

export async function createBackupData(): Promise<BackupData> {
  const storeInfo = await getStoreInfo();

  const [
    { data: tenants },
    { data: products },
    { data: stocks },
    { data: transactions },
    { data: transactionDetails },
    { data: payments },
    { data: stockLogs },
    { data: priceLogs },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('tenants').select('*').order('tenant_name'),
    supabase.from('products').select('*, tenants(tenant_name)').order('product_name'),
    supabase.from('stocks').select('*'),
    supabase.from('transactions').select('*, profiles(user_name)').order('created_at', { ascending: false }),
    supabase.from('transaction_details').select('*, products(product_name, unit)'),
    supabase.from('payments').select('*'),
    supabase.from('stock_logs').select('*').order('created_at', { ascending: false }),
    supabase.from('price_logs').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, user_name, role, tenant_id').order('user_name'),
  ]);

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    store_info: storeInfo,
    tenants: tenants ?? [],
    products: products ?? [],
    stocks: stocks ?? [],
    transactions: transactions ?? [],
    transaction_details: transactionDetails ?? [],
    payments: payments ?? [],
    stock_logs: stockLogs ?? [],
    price_logs: priceLogs ?? [],
    profiles: profiles ?? [],
  };
}
