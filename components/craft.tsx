import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { CryptoMark } from "@/components/brand/crypto-mark";
export function NetworkPill() {
  return (
    <span className="network-pill">
      <CryptoMark asset="BASE" size={20} />
      USDC <span className="muted">en Base</span>
    </span>
  );
}
export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <Icon name={icon} size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ConnectionNote({ children }: { children?: ReactNode }) {
  return (
    <div className="connection-note">
      <Icon name="info" size={17} />
      <p>
        {children || (
          <>
            Las operaciones se habilitarán al conectar tu cuenta y tu wallet.{" "}
            <Link href="/login">Ver acceso</Link>
          </>
        )}
      </p>
    </div>
  );
}
export function MoneyInput({
  value,
  onChange,
  label,
  currency = "USDC",
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  currency?: string;
}) {
  return (
    <label className="amount-field">
      <span>{label}</span>
      <div>
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
        />
        <strong className="currency-label">
          {(currency === "USDC" || currency === "ETH") && (
            <CryptoMark asset={currency} size={32} />
          )}{" "}
          {currency}
        </strong>
      </div>
    </label>
  );
}
export function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
