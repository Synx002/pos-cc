/**
 * Bluetooth thermal printer service for ESC/POS (e.g. iware XP-58IIZ).
 * Android only. Falls back to expo-print on other platforms.
 * Lazy-loads native module to avoid startup crashes/reload loops.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { EscPosCommand } from './receiptTemplate';

const PRINTER_ADDRESS_KEY = 'bluetooth_printer_address';
const PRINTER_NAME_KEY = 'bluetooth_printer_name';

export type BluetoothDevice = { address: string; name?: string };

let _mgr: any = undefined;
let _escpos: any = undefined;

function getModules(): { mgr: any; escpos: any } {
  if (_mgr !== undefined) return { mgr: _mgr, escpos: _escpos };
  try {
    if (Platform.OS === 'android') {
      const pkg = require('@brooons/react-native-bluetooth-escpos-printer');
      _mgr = pkg.BluetoothManager;
      _escpos = pkg.BluetoothEscposPrinter;
    } else {
      _mgr = null;
      _escpos = null;
    }
  } catch {
    _mgr = null;
    _escpos = null;
  }
  return { mgr: _mgr, escpos: _escpos };
}

export const isBluetoothPrinterAvailable = (): boolean => {
  const { mgr, escpos } = getModules();
  return Platform.OS === 'android' && !!mgr && !!escpos;
};

export async function getSavedPrinter(): Promise<{ address: string; name?: string } | null> {
  try {
    const address = await SecureStore.getItemAsync(PRINTER_ADDRESS_KEY);
    const name = await SecureStore.getItemAsync(PRINTER_NAME_KEY);
    if (address) return { address, name: name ?? undefined };
  } catch {}
  return null;
}

export async function savePrinter(device: BluetoothDevice): Promise<void> {
  await SecureStore.setItemAsync(PRINTER_ADDRESS_KEY, device.address);
  await SecureStore.setItemAsync(PRINTER_NAME_KEY, device.name ?? '');
}

export async function clearSavedPrinter(): Promise<void> {
  await SecureStore.deleteItemAsync(PRINTER_ADDRESS_KEY);
  await SecureStore.deleteItemAsync(PRINTER_NAME_KEY);
}

export async function isBluetoothEnabled(): Promise<boolean> {
  const { mgr } = getModules();
  if (!mgr) return false;
  return mgr.checkBluetoothEnabled();
}

/** Mendapatkan perangkat yang sudah di-pair di Pengaturan Android (tanpa scan). */
export async function getPairedDevices(): Promise<BluetoothDevice[]> {
  const { mgr } = getModules();
  if (!mgr?.enableBluetooth) return [];
  try {
    const raw = await mgr.enableBluetooth();
    if (!raw) return [];
    const items = Array.isArray(raw) ? raw : [raw];
    const devices: BluetoothDevice[] = [];
    for (const item of items) {
      try {
        const d = typeof item === 'string' ? JSON.parse(item) : item;
        const addr = d?.address ?? d?.Address;
        if (addr) devices.push({ address: addr, name: d?.name ?? d?.Name });
      } catch {
        /* skip invalid */
      }
    }
    return devices;
  } catch {
    return [];
  }
}

export async function scanDevices(): Promise<{ found: BluetoothDevice[]; paired: BluetoothDevice[] }> {
  const { mgr } = getModules();
  if (!mgr) return { found: [], paired: [] };
  try {
    // 1. Ambil perangkat yang sudah di-pair (tanpa perlu scan) — printer yang sudah di-pair di HP akan muncul
    const pairedFromEnable = await getPairedDevices();

    // 2. Coba scan untuk perangkat baru (perlu lokasi aktif di Android 6–11)
    let found: BluetoothDevice[] = [];
    let pairedFromScan: BluetoothDevice[] = [];
    try {
      const result = await mgr.scanDevices();
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      found = (parsed.found ?? []).filter((d: any) => d?.address);
      pairedFromScan = (parsed.paired ?? []).filter((d: any) => d?.address);
    } catch {
      /* scan gagal, pakai paired saja */
    }

    // Gabungkan: prioritas paired dari enableBluetooth (lebih andal)
    const paired = pairedFromEnable.length > 0 ? pairedFromEnable : pairedFromScan;
    return { found, paired };
  } catch {
    return { found: [], paired: [] };
  }
}

export async function connectPrinter(address: string): Promise<void> {
  const { mgr } = getModules();
  if (!mgr) throw new Error('Bluetooth tidak tersedia');
  await mgr.connect(address);
}

export async function disconnectPrinter(address?: string): Promise<void> {
  const { mgr } = getModules();
  if (!mgr) return;
  const addr = address ?? (await mgr.getConnectedDeviceAddress?.());
  if (addr) await mgr.disconnect(addr);
}

export async function getConnectedAddress(): Promise<string | null> {
  const { mgr } = getModules();
  if (!mgr?.getConnectedDeviceAddress) return null;
  try {
    return await mgr.getConnectedDeviceAddress();
  } catch {
    return null;
  }
}

export async function printReceiptEscPos(commands: EscPosCommand[]): Promise<void> {
  const { escpos } = getModules();
  if (!escpos) throw new Error('Printer Bluetooth tidak tersedia');
  const ALIGN = escpos.ALIGN;
  const opts = { encoding: 'UTF-8' as const, codepage: 0, widthtimes: 0, heigthtimes: 0, fonttype: 0 };

  await escpos.printerInit();
  await escpos.setWidth(escpos.DEVICE_WIDTH.WIDTH_58);

  for (const cmd of commands) {
    if (cmd.type === 'align') {
      await escpos.printerAlign(
        cmd.value === 'center' ? ALIGN.CENTER : cmd.value === 'right' ? ALIGN.RIGHT : ALIGN.LEFT
      );
    } else if (cmd.type === 'text') {
      if (cmd.bold) await escpos.setBlob(1);
      await escpos.printText((cmd.value || '') + '\n\r', opts);
      if (cmd.bold) await escpos.setBlob(0);
    } else if (cmd.type === 'feed') {
      await escpos.printAndFeed(cmd.lines ?? 1);
    } else if (cmd.type === 'drawer') {
      try {
        if (typeof escpos.openDrawer === 'function') {
          await escpos.openDrawer(0, 250, 250);
        } else if (typeof escpos.opendDrawer === 'function') {
          await escpos.opendDrawer(0, 250, 250); // typo fallback
        } else {
          await escpos.printText(String.fromCharCode(27, 112, 0, 250, 250), opts);
        }
      } catch (e) {
        console.warn('Gagal buka cash drawer:', e);
      }
    }
  }

  // Gunakan printText kosong sebagai pengganti printAndFeed
  // karena printAndFeed tidak selalu berpengaruh di semua printer
  await escpos.printText(' \n\r', opts);
  await escpos.printText(' \n\r', opts);
  await escpos.printText(' \n\r', opts);
  await escpos.cutOnePoint();
}
