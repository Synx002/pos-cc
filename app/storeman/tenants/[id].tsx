// app/storeman/tenants/[id].tsx
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TenantSalesPage from '../../../pages/TenantSalesPage';

export default function StoremanTenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TenantSalesPage tenantId={id!} role="storeman" />;
}
