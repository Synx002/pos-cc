// app/index.tsx — Default redirect
import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useEffect } from 'react';

export default function Index() {
  const { user, profile, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  // Tampil loading spinner saat cek session
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E597A0" />
        <Text style={styles.loadingText}>Memuat...</Text>
      </View>
    );
  }

  // Belum login → ke halaman login
  if (!user) {
    return <Redirect href="/auth/login" />;
  }

  // Sudah login, cek role
  switch (profile?.role) {
    case 'cashier':
      return <Redirect href="/cashier/" />;  
    case 'storeman':
      return <Redirect href="/storeman/" />;
    case 'owner':
      return <Redirect href="/owner/" />;
    default:
      // Role tidak dikenali → paksa logout
      return <Redirect href="/auth/login" />;
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#888',
  },
});