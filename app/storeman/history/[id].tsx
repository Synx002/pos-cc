// app/storeman/history/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import TransactionDetailView from '../../../pages/TransactionDetailView';

export default function StoremanTransactionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  if (!id) return null;

  return (
    <TransactionDetailView 
      transactionId={id as string} 
      onBack={() => router.back()} 
      role="storeman"
    />
  );
}
