export type AdminRole = 'owner' | 'operations' | 'support' | 'auditor';
export type DataStatus = 'known' | 'stale' | 'unknown' | 'unavailable';
export type AdminResource = 'overview' | 'accounts' | 'account' | 'operations' | 'cases' | 'health' | 'audit' | 'activation' | 'grants' | 'incidents' | 'jobs';
export interface EvidenceMeta { environment: string; observedAt: string; source: string; coverage: string; status: DataStatus; cutoffAt?: string; }
export interface AdminEnvelope<T = Record<string, unknown>> { data: T; meta: EvidenceMeta; viewer: { role: AdminRole; permissions: string[] }; }
export interface Metric { id: string; label: string; value: string | null; status: DataStatus; definition: string; source: string; observedAt: string | null; href: string; }
export interface AccountSummary { id: string; email: string | null; emailVerified: boolean | null; registeredAt: string | null; linkedAt: string | null; walletCreatedAt: string | null; organizationId: string | null; walletId: string | null; ownerId: string | null; evmAddress: string | null; bitcoinAddress: string | null; issues: string[]; }
export interface AdminList { items: Record<string, unknown>[]; nextCursor: string | null; }
export interface ActionResult { id: string; auditId: string; result: string; [key: string]: unknown; }
