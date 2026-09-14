// app/owner/tenants/[id].tsx
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TenantSalesPage from '../../../pages/TenantSalesPage';

export default function OwnerTenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TenantSalesPage tenantId={id!} role="owner" />;
}
