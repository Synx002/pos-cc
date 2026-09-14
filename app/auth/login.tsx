// app/(auth)/login.tsx
import { useState } from 'react';
import { Alert, View, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { useAuthStore } from '../../stores/authStore';

const ACCENT = '#E597A0';

// Theme agar label area putih & teks terbaca di device
const inputTheme = {
  colors: {
    background: '#fff',
    onSurfaceVariant: '#6B7280',
    outline: '#E8E8E8',
  },
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn } = useAuthStore();
  const { width } = useWindowDimensions();

  // Responsive form width: full on small phones, capped on tablet/landscape
  const formWidth = Math.min(width - 48, 400);

  const handleLogin = async () => {
    try {
      await signIn(email, password);
    } catch (err: any) {
      Alert.alert('Login Gagal', err.message ?? 'Terjadi kesalahan');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.inner, { width: formWidth }]}>

        {/* ── Logo Section ── */}
        <View style={styles.logoSection}>
          <View style={styles.logoBox}>
            <Image
              source={require('../../assets/selasar_logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>Selasar Kafe</Text>
          <Text style={styles.appSub}>Point of Sale</Text>
        </View>

        {/* ── Form Section ── */}
        <View style={styles.formCard}>
          <TextInput
            label="Username / Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            mode="flat"
            theme={inputTheme}
            underlineColor="#E8E8E8"
            activeUnderlineColor={ACCENT}
            textColor="#111827"
            contentStyle={styles.inputContent}
            left={<TextInput.Icon icon="email-outline" color="#C0C4CC" />}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            mode="flat"
            theme={inputTheme}
            underlineColor="#E8E8E8"
            activeUnderlineColor={ACCENT}
            textColor="#111827"
            contentStyle={styles.inputContent}
            left={<TextInput.Icon icon="lock-outline" color="#C0C4CC" />}
          />
          <Button
            mode="contained"
            onPress={handleLogin}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Masuk
          </Button>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
  },
  inner: {
    // width is set dynamically via formWidth
  },

  /* Logo */
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBox: {
    width: 110,
    height: 110,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  logo: {
    width: 90,
    height: 90,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  appSub: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '400',
  },

  /* Form */
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  input: {
    marginBottom: 12,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  inputContent: {
    color: '#111827',
  },
  button: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: ACCENT,
    elevation: 0,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});