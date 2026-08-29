import { AdminAuthChrome } from "@/components/admin/AdminAuthChrome";

/** Login + password recovery — always standalone, session or not. */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <AdminAuthChrome>{children}</AdminAuthChrome>;
}
