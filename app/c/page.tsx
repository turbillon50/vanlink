import { ClaimLink } from "@/components/wallet/claim-link";

export const metadata = {
  title: "Te enviaron Bitcoin · VanDeFi",
  description: "Abre el link, pega tu dirección de Bitcoin y recíbelo. Sin registrarte.",
  robots: { index: false, follow: false },
};

/** Página suelta, sin barra de navegación ni menús: solo el dinero y el botón. */
export default function ClaimPage() {
  return <ClaimLink />;
}
