import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

const textSizeMap = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative", sizeMap[size])}>
        <img 
          src="/icon-192.png" 
          alt="Pulse" 
          className="w-full h-full object-contain"
        />
      </div>
      {showText && (
        <span className={cn("font-semibold text-gradient", textSizeMap[size])}>
          Pulse
        </span>
      )}
    </div>
  );
}
