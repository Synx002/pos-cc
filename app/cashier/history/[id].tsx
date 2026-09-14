// app/cashier/history/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import TransactionDetailView from '../../../pages/TransactionDetailView';

export default function CashierTransactionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  if (!id) return null;

  return (
    <TransactionDetailView 
      transactionId={id as string} 
      onBack={() => router.back()} 
      role="cashier"
    />
  );
}
