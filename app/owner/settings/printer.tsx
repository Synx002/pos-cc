// app/owner/settings/printer.tsx — Hubungkan printer Bluetooth thermal
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import {
  isBluetoothPrinterAvailable,
  getSavedPrinter,
  savePrinter,
  clearSavedPrinter,
  scanDevices,
  connectPrinter,
  disconnectPrinter,
  isBluetoothEnabled,
  type BluetoothDevice,
} from '../../../lib/bluetoothPrinter';

const ACCENT = '#E597A0';

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const [saved, setSaved] = useState<BluetoothDevice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [btEnabled, setBtEnabled] = useState<boolean | null>(null);

  const available = isBluetoothPrinterAvailable();

  useEffect(() => {
    loadSaved();
    checkBt();
  }, []);

  const loadSaved = async () => {
    const p = await getSavedPrinter();
    setSaved(p);
  };

  const checkBt = async () => {
    const ok = await isBluetoothEnabled();
    setBtEnabled(ok);
  };

  const handleScan = async () => {
    if (!available) {
      Alert.alert('Tidak Tersedia', 'Printer Bluetooth hanya didukung di Android.');
      return;
    }
    if (btEnabled === false) {
      Alert.alert('Bluetooth Mati', 'Nyalakan Bluetooth terlebih dahulu di pengaturan perangkat.');
      return;
    }
    setScanning(true);
    setDevices([]);
    try {
      const { found, paired } = await scanDevices();
      const all = [...paired, ...found];
      const unique = all.filter(
        (d, i, arr) => arr.findIndex((x) => x.address === d.address) === i
      );
      setDevices(unique);
      if (unique.length === 0) {
        Alert.alert(
          'Tidak Ada Perangkat',
          '1. Buka Pengaturan HP → Bluetooth\n2. Pair printer terlebih dahulu (jika belum)\n3. Pastikan printer menyala dan dalam jangkauan\n4. Coba pindai lagi'
        );
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Gagal memindai perangkat Bluetooth.');
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async (device: BluetoothDevice) => {
    if (!available) return;
    setConnecting(device.address);
    try {
      await connectPrinter(device.address);
      await savePrinter(device);
      setSaved(device);
      setDevices([]);
      Alert.alert('Berhasil', `Printer "${device.name || device.address}" terhubung.`);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Gagal', e?.message || 'Gagal menghubungkan printer.');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!saved) return;
    try {
      await disconnectPrinter(saved.address);
      await clearSavedPrinter();
      setSaved(null);
      Alert.alert('Berhasil', 'Printer telah diputus.');
    } catch (e) {
      console.error(e);
    }
  };

  if (!available) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Printer Struk</Text>
        </View>
        <View style={s.unsupported}>
          <MaterialIcons name="bluetooth-disabled" size={48} color="#9CA3AF" />
          <Text style={s.unsupportedText}>Printer Bluetooth hanya didukung di Android</Text>
          <Text style={s.unsupportedSub}>Gunakan fitur cetak PDF/share untuk platform lain</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Printer Struk</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Saved printer */}
        {saved && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Printer Terhubung</Text>
            <View style={s.savedRow}>
              <View style={s.savedIcon}>
                <MaterialIcons name="print" size={24} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.savedName}>{saved.name || 'Printer Thermal'}</Text>
                <Text style={s.savedAddr}>{saved.address}</Text>
              </View>
              <TouchableOpacity style={s.disconnectBtn} onPress={handleDisconnect}>
                <MaterialIcons name="link-off" size={18} color="#DC2626" />
                <Text style={s.disconnectText}>Putuskan</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Scan */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Cari Printer</Text>
          <Text style={s.cardDesc}>
            Pastikan printer iware XP-58IIZ menyala dan Bluetooth aktif. Ketuk untuk memindai.
          </Text>
          <TouchableOpacity
            style={[s.scanBtn, scanning && { opacity: 0.7 }]}
            onPress={handleScan}
            disabled={scanning}
          >
            {scanning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="bluetooth-searching" size={22} color="#fff" />
            )}
            <Text style={s.scanBtnText}>{scanning ? 'Memindai...' : 'Pindai Perangkat'}</Text>
          </TouchableOpacity>
        </View>

        {/* Device list */}
        {devices.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Perangkat Ditemukan</Text>
            {devices.map((d) => (
              <TouchableOpacity
                key={d.address}
                style={s.deviceRow}
                onPress={() => handleConnect(d)}
                disabled={connecting !== null}
              >
                <MaterialIcons name="bluetooth" size={20} color={ACCENT} />
                <View style={{ flex: 1 }}>
                  <Text style={s.deviceName}>{d.name || 'Printer'}</Text>
                  <Text style={s.deviceAddr}>{d.address}</Text>
                </View>
                {connecting === d.address ? (
                  <ActivityIndicator size="small" color={ACCENT} />
                ) : (
                  <MaterialIcons name="add-circle-outline" size={24} color={ACCENT} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  unsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  unsupportedText: { fontSize: 16, fontWeight: '600', color: '#374151', marginTop: 16 },
  unsupportedSub: { fontSize: 13, color: '#9CA3AF', marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 20 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savedIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FDF2F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  savedAddr: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
  },
  disconnectText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 14,
  },
  scanBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  deviceName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  deviceAddr: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
});
