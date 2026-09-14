// app/owner/settings/store.tsx — Informasi Toko
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getStoreInfo, saveStoreInfo, type StoreInfo } from '../../../lib/storeSettings';

const ACCENT = '#E597A0';

export default function StoreInfoScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StoreInfo>({
    store_name: '',
    store_address: '',
    store_phone: '',
  });

  useEffect(() => {
    loadStore();
  }, []);

  const loadStore = async () => {
    setLoading(true);
    try {
      const info = await getStoreInfo();
      setForm(info);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveStoreInfo(form);
      Alert.alert('Berhasil', 'Informasi toko telah disimpan.');
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert('Gagal', 'Gagal menyimpan informasi toko.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={s.loadingText}>Memuat...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Informasi Toko</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.cardTitle}>Data Toko</Text>
          <Text style={s.cardDesc}>
            Informasi ini akan tampil di struk dan faktur transaksi.
          </Text>

          <Text style={s.label}>Nama Toko</Text>
          <TextInput
            style={s.input}
            placeholder="Contoh: Selasar Kafe"
            placeholderTextColor="#9CA3AF"
            value={form.store_name}
            onChangeText={(t) => setForm((p) => ({ ...p, store_name: t }))}
            autoCapitalize="words"
          />

          <Text style={s.label}>Alamat</Text>
          <TextInput
            style={[s.input, s.inputMultiline]}
            placeholder="Contoh: Jl. Raya No. 123, Bandung"
            placeholderTextColor="#9CA3AF"
            value={form.store_address}
            onChangeText={(t) => setForm((p) => ({ ...p, store_address: t }))}
            multiline
            numberOfLines={3}
          />

          <Text style={s.label}>Telepon / WA (opsional)</Text>
          <TextInput
            style={s.input}
            placeholder="Contoh: 08123456789"
            placeholderTextColor="#9CA3AF"
            value={form.store_phone}
            onChangeText={(t) => setForm((p) => ({ ...p, store_phone: t }))}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity
          style={[s.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <MaterialIcons name="save" size={20} color="#fff" />
          <Text style={s.saveBtnText}>{saving ? 'Menyimpan...' : 'Simpan'}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#9CA3AF' },
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
    marginBottom: 16,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: ACCENT,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
