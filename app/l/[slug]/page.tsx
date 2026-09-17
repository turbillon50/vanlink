import { PayView } from "@/components/vanlink/pay-view";

export const metadata = {
  title: "Pagar · VanDeFi",
  description: "Completa este cobro desde tu wallet.",
};

export default async function PayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PayView slug={slug} />;
}
