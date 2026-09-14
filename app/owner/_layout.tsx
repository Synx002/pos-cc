// app/owner/_layout.tsx
import Sidebar, { SidebarMenuItem } from '../../components/Sidebar';

const MENU: SidebarMenuItem[] = [
  { label: 'Dashboard',  icon: 'dashboard',         path: '/owner' },
  { label: 'Pengguna',   icon: 'manage-accounts',   path: '/owner/users' },
  { label: 'Tenant',     icon: 'storefront',        path: '/owner/tenants' },
  { label: 'Produk',     icon: 'inventory',         path: '/owner/products' },
  { label: 'Stok',       icon: 'move-to-inbox',     path: '/owner/stock' },
  { label: 'Riwayat',    icon: 'history',           path: '/owner/history' },
  { label: 'Pengaturan', icon: 'settings',          path: '/owner/settings' },
];

export default function OwnerLayout() {
  return <Sidebar menu={MENU} roleLabel="Pemilik" accentColor="#E597A0" />;
}
