/**
 * Store information settings (nama toko, alamat, telepon).
 * Disimpan di SecureStore untuk digunakan di struk dan tampilan.
 */
import * as SecureStore from 'expo-secure-store';

const STORE_NAME_KEY = 'store_name';
const STORE_ADDRESS_KEY = 'store_address';
const STORE_PHONE_KEY = 'store_phone';

export type StoreInfo = {
  store_name: string;
  store_address: string;
  store_phone: string;
};

const DEFAULT: StoreInfo = {
  store_name: 'Selasar Kafe',
  store_address: 'Jl. Raya No. 123, Bandung',
  store_phone: '',
};

export async function getStoreInfo(): Promise<StoreInfo> {
  try {
    const [name, address, phone] = await Promise.all([
      SecureStore.getItemAsync(STORE_NAME_KEY),
      SecureStore.getItemAsync(STORE_ADDRESS_KEY),
      SecureStore.getItemAsync(STORE_PHONE_KEY),
    ]);
    return {
      store_name: name ?? DEFAULT.store_name,
      store_address: address ?? DEFAULT.store_address,
      store_phone: phone ?? DEFAULT.store_phone,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveStoreInfo(info: StoreInfo): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STORE_NAME_KEY, info.store_name || DEFAULT.store_name),
    SecureStore.setItemAsync(STORE_ADDRESS_KEY, info.store_address || DEFAULT.store_address),
    SecureStore.setItemAsync(STORE_PHONE_KEY, info.store_phone || ''),
  ]);
}
