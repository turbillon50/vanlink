import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
type Common = {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  className?: string;
  children: ReactNode;
};
type B = Common & { href?: undefined } & ComponentPropsWithoutRef<"button">;
type A = Common & { href: string } & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    "href" | "className" | "children"
  >;
export function PressButton(props: B | A) {
  const { variant = "primary", className, children } = props;
  const styles = cn("press-button", variant, className);
  if ("href" in props && props.href) {
    const { href, variant: _v, className: _c, children: _ch, ...rest } = props;
    return (
      <Link href={href} className={styles} {...rest}>
        {children}
      </Link>
    );
  }
  const {
    variant: _v,
    className: _c,
    children: _ch,
    href: _h,
    ...rest
  } = props as B;
  return (
    <button className={styles} {...rest}>
      {children}
    </button>
  );
}
