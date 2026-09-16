export type CryptoAsset = "USDC" | "ETH" | "BASE";
export function CryptoMark({
  asset,
  size = 36,
}: {
  asset: CryptoAsset;
  size?: number;
}) {
  return (
    <span
      className={"crypto-mark crypto-" + asset.toLowerCase()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {asset === "BASE" ? (
        <svg viewBox="0 0 32 32" width={size} height={size}>
          <path fill="white" d="M7 7h18v18H7z" />
        </svg>
      ) : asset === "ETH" ? (
        <svg viewBox="0 0 32 32" width={size} height={size}>
          <path d="m16 3-8 13 8 4.6z" fill="#ced7ef" />
          <path d="m16 3 8 13-8 4.6z" fill="#8b9bbf" />
          <path d="m8 16 8-3.7v8.3z" fill="#8898bf" />
          <path d="m24 16-8-3.7v8.3z" fill="#53638a" />
          <path d="m8 17.6 8 11.4v-6.8z" fill="#dce6ff" />
          <path d="m24 17.6-8 11.4v-6.8z" fill="#8b9bbf" />
        </svg>
      ) : (
        <img src="/brand/usdc.svg" alt="" width={size} height={size} />
      )}
    </span>
  );
}
