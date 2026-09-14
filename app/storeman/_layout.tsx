// app/storeman/_layout.tsx
import Sidebar, { SidebarMenuItem } from '../../components/Sidebar';

const MENU: SidebarMenuItem[] = [
  { label: 'Dashboard',  icon: 'dashboard',     path: '/storeman' },
  { label: 'Tenant',     icon: 'storefront',    path: '/storeman/tenants' },
  { label: 'Produk',     icon: 'inventory',     path: '/storeman/products' },
  { label: 'Stok',       icon: 'move-to-inbox', path: '/storeman/stock' },
  { label: 'Riwayat',    icon: 'history',       path: '/storeman/history' },
  { label: 'Pengaturan', icon: 'settings',      path: '/storeman/settings' },
];

export default function StoremanLayout() {
  return <Sidebar menu={MENU} roleLabel="Pengelola Toko" accentColor="#E597A0" />;
}
