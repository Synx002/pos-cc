// app/storeman/settings/index.tsx — Storeman: Pengaturan (akses printer)
import React from 'react';
import { useRouter } from 'expo-router';
import SettingsScreen, { type SettingsGroup } from '../../../components/SettingsScreen';

export default function StoremanSettingsScreen() {
  const router = useRouter();

  const groups: SettingsGroup[] = [
    {
      title: 'Cetak',
      items: [
        {
          label: 'Printer Struk',
          description: 'Hubungkan printer thermal Bluetooth (iware XP-58IIZ)',
          icon: 'print',
          color: '#7b1fa2',
          onPress: () => router.push('/storeman/settings/printer'),
        },
      ],
    },
  ];

  return <SettingsScreen groups={groups} />;
}
