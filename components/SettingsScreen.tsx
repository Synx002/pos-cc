// components/SettingsScreen.tsx — Komponen Pengaturan reusable untuk semua role
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export type SettingItem = {
  label: string;
  description: string;
  icon: string;
  color: string;
  onPress?: () => void;
};

export type SettingsGroup = {
  title: string;
  items: SettingItem[];
};

interface SettingsScreenProps {
  groups: SettingsGroup[];
  heading?: string;
}

const ACCENT = '#E597A0';

export default function SettingsScreen({ groups, heading = 'Pengaturan' }: SettingsScreenProps) {
  return (
    <ScrollView style={s.container}>
      <Text style={s.heading}>{heading}</Text>

      {groups.map((group) => (
        <View key={group.title} style={s.group}>
          <Text style={s.groupTitle}>{group.title}</Text>
          {group.items.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={s.row}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[s.icon, { backgroundColor: item.color + '18' }]}>
                <MaterialIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{item.label}</Text>
                <Text style={s.desc}>{item.description}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#d1d5db" />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB', padding: 20 },
  heading: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  group: { marginBottom: 24 },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  desc: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
});
