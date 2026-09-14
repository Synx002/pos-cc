// components/Sidebar.tsx
import { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Image, useWindowDimensions, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, usePathname, Slot } from 'expo-router';
import { useAuthStore } from '../stores/authStore';

export type SidebarMenuItem = {
  label: string;
  icon: string;
  path: string;
};

interface SidebarProps {
  menu: SidebarMenuItem[];
  roleLabel?: string;
  /**
   * Warna aksen sidebar.
   * Owner    → biru  #E597A0
   * Storeman → teal  #E597A0
   * Kasir    → ungu  #E597A0
   */
  accentColor?: string;
}

const SIDEBAR_WIDTH = 220;
const MINI_SIDEBAR_WIDTH = 74;
const PHONE_BREAKPOINT = 600;

export default function Sidebar({
  menu,
  roleLabel = 'Pengguna',
  accentColor = '#E597A0',
}: SidebarProps) {
  const { signOut, profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isPhone = width < PHONE_BREAKPOINT;

  // ✅ FIX: Wrap router hooks in try-catch agar tidak crash
  // saat komponen dirender sebelum NavigationContainer siap.
  let router: ReturnType<typeof useRouter> | null = null;
  let pathname = '/';
  try {
    router = useRouter();       // eslint-disable-line react-hooks/rules-of-hooks
    pathname = usePathname();   // eslint-disable-line react-hooks/rules-of-hooks
  } catch {
    // Navigator belum siap — komponen akan re-render saat siap
  }

  const [open, setOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const drawerAnim = useRef(new Animated.Value(-260)).current;

  const accentBg = accentColor + '18';

  useEffect(() => {
    const targetWidth = isPhone ? 0 : (open ? SIDEBAR_WIDTH : MINI_SIDEBAR_WIDTH);
    Animated.timing(sidebarAnim, {
      toValue: targetWidth,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isPhone, open]);

  const toggleSidebar = () => {
    if (isPhone) {
      openDrawer();
    } else {
      Animated.timing(sidebarAnim, {
        toValue: open ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH,
        duration: 250,
        useNativeDriver: false,
      }).start();
      setOpen(!open);
    }
  };

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerAnim, { toValue: -260, duration: 250, useNativeDriver: true }).start(() => setDrawerOpen(false));
  };

  const handleNavigatePhone = (path: string) => {
    closeDrawer();
    setTimeout(() => router?.push(path as any), 280);
  };

  const handleLogout = async () => {
    await signOut();
    router?.replace('/auth/login');
  };

  const handleNavigate = (path: string) => {
    router?.push(path as any);
  };

  const avatarLetter = profile?.user_name?.[0]?.toUpperCase() || 'U';

  return (
    <SafeAreaView className="flex-1 flex-row bg-gray-100">

      {/* ── Sidebar Panel ── */}
      <Animated.View
        style={{
          width: sidebarAnim,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          borderRightWidth: 1,
          borderRightColor: '#e5e7eb',
        }}
      >
        <View className="flex-1 py-6 justify-between">

          <View>
            {/* ── Brand ── */}
            <View 
              style={{ paddingHorizontal: open ? 16 : 0, alignItems: 'center' }} 
              className="mb-7"
            >
              <View
                className="rounded-2xl items-center justify-center mb-2"
                style={{ width: open ? 65 : 48, height: open ? 65 : 48, backgroundColor: '#E597A0' }}
              >
                <Image
                  source={require('../assets/selasar_logo.png')} // sesuaikan path
                  style={{ width: open ? 56 : 38, height: open ? 56 : 38 }}
                  resizeMode="contain"
                />
              </View>
              {open && (
                <>
                  <Text className="text-lg font-bold text-gray-900">Selasar</Text>
                  <Text className="text-xs text-gray-400 tracking-widest">Kafe POS</Text>
                  <View
                    className="h-0.5 w-10 rounded-full mt-2.5 opacity-60"
                    style={{ backgroundColor: accentColor }}
                  />
                </>
              )}
            </View>

            {/* ── Menu Items ── */}
            <View style={{ paddingHorizontal: open ? 12 : 0 }}>
              {menu.map((item) => {
                const isActive = pathname === item.path;
                return (
                  <TouchableOpacity
                    key={item.path}
                    className="flex-row items-center py-2.5 rounded-xl mb-1"
                    style={{ 
                      backgroundColor: isActive ? accentBg : 'transparent',
                      paddingHorizontal: open ? 14 : 0,
                      justifyContent: open ? 'flex-start' : 'center',
                    }}
                    onPress={() => handleNavigate(item.path)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={{
                        width: open ? 24 : 48,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <MaterialIcons
                        name={item.icon as any}
                        size={22}
                        color={isActive ? accentColor : '#6b7280'}
                      />
                    </View>
                    {open && (
                      <Text
                        className="ml-3 text-sm"
                        style={{
                          fontWeight: isActive ? '700' : '500',
                          color: isActive ? accentColor : '#374151',
                          flex: 1,
                        }}
                      >
                        {item.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Logout ── */}
          <View 
            style={{ paddingHorizontal: open ? 16 : 0, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}
            className="pt-4"
          >
            <TouchableOpacity
              className="flex-row items-center py-2.5 rounded-xl bg-red-50"
              style={{ justifyContent: open ? 'flex-start' : 'center', paddingHorizontal: open ? 14 : 0 }}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <MaterialIcons name="logout" size={18} color="#e53935" />
              {open && <Text className="ml-2.5 text-red-600 font-semibold text-sm">Keluar</Text>}
            </TouchableOpacity>
          </View>

        </View>
      </Animated.View>

      {/* ── Main Content ── */}
      <View className="flex-1">

        {/* ── Header Bar ── */}
        <View
          className="flex-row items-center justify-between bg-white px-4 py-3 border-b border-gray-100"
          style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 }}
        >
          {/* Toggle: hamburger di HP, chevron di tablet */}
          <TouchableOpacity
            onPress={toggleSidebar}
            className="w-10 h-10 rounded-xl items-center justify-center"
            style={{ backgroundColor: accentBg }}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={isPhone ? 'menu' : (open ? 'chevron-left' : 'chevron-right')}
              size={22}
              color={accentColor}
            />
          </TouchableOpacity>

          {/* User info */}
          <View className="flex-row items-center gap-2.5">
            <View className="items-end">
              <Text className="text-sm font-bold text-gray-900">
                Halo, {profile?.user_name || 'Pengguna'}!
              </Text>
              <Text className="text-xs text-gray-400">{roleLabel}</Text>
            </View>
            {/* Avatar */}
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: accentColor }}
            >
              <Text className="text-white font-bold text-sm">{avatarLetter}</Text>
            </View>
          </View>
        </View>

        {/* ── Page Content ── */}
        <View className="flex-1">
          <Slot />
        </View>

      </View>

      {/* ── Drawer overlay untuk HP (sidebar disembunyikan) ── */}
      {isPhone && (
        <Modal
          visible={drawerOpen}
          transparent
          animationType="none"
          onRequestClose={closeDrawer}
        >
          <View style={{ flex: 1 }}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={closeDrawer} />
            <Animated.View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 260,
                backgroundColor: '#fff',
                borderRightWidth: 1,
                borderRightColor: '#e5e7eb',
                transform: [{ translateX: drawerAnim }],
              }}
            >
              <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, justifyContent: 'space-between' }}>
                <View className="py-6 px-4">
                  <View className="flex-row items-center justify-between mb-6">
                    <View className="flex-row items-center gap-3">
                      <View className="rounded-xl items-center justify-center" style={{ width: 48, height: 48, backgroundColor: '#E597A0' }}>
                        <Image source={require('../assets/selasar_logo.png')} style={{ width: 36, height: 36 }} resizeMode="contain" />
                      </View>
                      <View>
                        <Text className="text-base font-bold text-gray-900">Selasar Kafe</Text>
                        <Text className="text-xs text-gray-400">{roleLabel}</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={closeDrawer} className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: '#f3f4f6' }}>
                      <MaterialIcons name="close" size={22} color="#374151" />
                    </TouchableOpacity>
                  </View>
                  {menu.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                      <TouchableOpacity
                        key={item.path}
                        onPress={() => handleNavigatePhone(item.path)}
                        className="flex-row items-center py-3.5 rounded-xl mb-1"
                        style={{ backgroundColor: isActive ? accentBg : 'transparent', paddingHorizontal: 14 }}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name={item.icon as any} size={22} color={isActive ? accentColor : '#6b7280'} />
                        <Text className="ml-3 text-sm font-medium" style={{ color: isActive ? accentColor : '#374151' }}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="px-4 pb-6 pt-4 border-t border-gray-100">
                  <TouchableOpacity
                    onPress={async () => { closeDrawer(); await handleLogout(); }}
                    className="flex-row items-center py-3.5 rounded-xl bg-red-50 px-4 justify-center"
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="logout" size={18} color="#e53935" />
                    <Text className="ml-2.5 text-red-600 font-semibold text-sm">Keluar</Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </Animated.View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}