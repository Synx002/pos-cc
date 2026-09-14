// app/owner/settings/backup.tsx — Backup Data Transaksi
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { createBackupData } from '../../../lib/backup';
import { format } from 'date-fns';

const FS = FileSystem as any;
const docDir: string =
  FS.documentDirectory ??
  FS.dirs?.DocumentDir ??
  '';

const ACCENT = '#E597A0';

export default function BackupScreen() {
  const router = useRouter();
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const data = await createBackupData();
      const json = JSON.stringify(data, null, 2);
      const fileName = `Backup_SelasarKafe_${format(new Date(), 'yyyyMMdd_HHmm')}.json`;
      const destUri = docDir + fileName;

      await FS.writeAsStringAsync(destUri, json, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: 'application/json',
          dialogTitle: 'Simpan / Bagikan Backup Data',
        });
        Alert.alert(
          'Backup Berhasil',
          `Data telah diekspor:\n\n• ${data.tenants.length} tenant\n• ${data.products.length} produk\n• ${data.transactions.length} transaksi\n• ${data.stock_logs.length} riwayat stok\n\nFile: ${fileName}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'Backup Berhasil',
          `File disimpan di:\n${destUri}\n\n• ${data.tenants.length} tenant\n• ${data.products.length} produk\n• ${data.transactions.length} transaksi`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Gagal membuat backup. Pastikan koneksi internet stabil dan coba lagi.');
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Backup Data</Text>
      </View>

      <View style={s.content}>
        <View style={s.iconWrap}>
          <MaterialIcons name="backup" size={56} color={ACCENT} />
        </View>
        <Text style={s.title}>Cadangkan Data Transaksi</Text>
        <Text style={s.desc}>
          Backup akan mengekspor seluruh data ke file JSON, meliputi:
        </Text>
        <View style={s.list}>
          <Text style={s.listItem}>• Data tenant & produk</Text>
          <Text style={s.listItem}>• Stok & riwayat stok</Text>
          <Text style={s.listItem}>• Transaksi & pembayaran</Text>
          <Text style={s.listItem}>• Riwayat harga</Text>
          <Text style={s.listItem}>• Informasi toko</Text>
        </View>
        <Text style={s.hint}>
          File dapat disimpan di penyimpanan perangkat atau dibagikan ke cloud/drive.
        </Text>

        <TouchableOpacity
          style={[s.btn, backingUp && s.btnDisabled]}
          onPress={handleBackup}
          disabled={backingUp}
          activeOpacity={0.85}
        >
          {backingUp ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={s.btnText}>Membuat backup...</Text>
            </>
          ) : (
            <>
              <MaterialIcons name="save-alt" size={22} color="#fff" />
              <Text style={s.btnText}>Buat Backup Sekarang</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: '#FDF2F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  list: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listItem: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignSelf: 'stretch',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
