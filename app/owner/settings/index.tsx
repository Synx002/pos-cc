// app/owner/settings/index.tsx — Owner: Pengaturan (menggunakan komponen SettingsScreen)
import React from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import SettingsScreen, { type SettingsGroup } from '../../../components/SettingsScreen';

const ACCENT = '#E597A0';

export default function OwnerSettingsScreen() {
  const router = useRouter();

  const groups: SettingsGroup[] = [
    {
      title: 'Toko',
      items: [
        {
          label: 'Informasi Toko',
          description: 'Ubah nama, alamat dan kontak toko',
          icon: 'store',
          color: ACCENT,
          onPress: () => router.push('/owner/settings/store'),
        },
      ],
    },
    {
      title: 'Cetak',
      items: [
        {
          label: 'Printer Struk',
          description: 'Hubungkan printer thermal Bluetooth (iware XP-58IIZ)',
          icon: 'print',
          color: '#7b1fa2',
          onPress: () => router.push('/owner/settings/printer'),
        },
      ],
    },
    {
      title: 'Lainnya',
      items: [
        {
          label: 'Backup Data',
          description: 'Cadangkan data transaksi ke file JSON',
          icon: 'backup',
          color: '#37474f',
          onPress: () => router.push('/owner/settings/backup'),
        },
        {
          label: 'Tentang Aplikasi',
          description: 'Versi 1.0.0 • Selasar Kafe POS',
          icon: 'info',
          color: '#9e9e9e',
          onPress: () =>
            Alert.alert('Selasar Kafe POS', 'Versi 1.0.0\n© 2026 Selasar Kafe'),
        },
      ],
    },
  ];

  return <SettingsScreen groups={groups} />;
}
