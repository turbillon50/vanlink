import { AuthScreen } from "@/components/auth/auth-screen";
import { isAdminPreviewIsolated } from "@/lib/admin/isolation";

export const dynamic = "force-dynamic";

export default function LoginPage() { return <AuthScreen previewIsolated={isAdminPreviewIsolated()}/>; }
