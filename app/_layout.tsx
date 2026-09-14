// app/_layout.tsx — Root layout dengan auth guard
import "../global.css";
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { useAuthStore } from '../stores/authStore';

export default function RootLayout() {
  const { user, profile, loading, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Inisialisasi session saat app pertama dibuka
  useEffect(() => {
    initialize();
  }, []);

  // Auth guard — jalankan setiap kali status auth berubah
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/auth/login');
      }
      return;
    }

    if (inAuthGroup) {
      redirectByRole();
    }
  }, [user, profile, loading, segments]);

  const redirectByRole = () => {
    if (!profile?.role) return;
    switch (profile.role) {
      case 'cashier':
        router.replace('/cashier/');
        break;
      case 'storeman':
        router.replace('/storeman/');
        break;
      case 'owner':
        router.replace('/owner/');
        break;
      default:
        router.replace('/auth/login');
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white gap-3">
        <ActivityIndicator size="large" color="#E597A0" />
        <Text className="text-sm text-gray-500">Memuat...</Text>
      </View>
    );
  }

  return (
    <PaperProvider>
      <Slot />
    </PaperProvider>
  );
}
