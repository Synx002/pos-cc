// app/cashier/transaction/_layout.tsx
import { Stack } from 'expo-router';

export default function TransactionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="payment" options={{ title: 'Pembayaran' }} />
      <Stack.Screen name="receipt" options={{ title: 'Struk Transaksi' }} />
    </Stack>
  );
}