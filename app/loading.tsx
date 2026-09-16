import { SplashContent } from "@/components/brand/atmosphere";
export default function Loading() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <SplashContent loading />
    </div>
  );
}
