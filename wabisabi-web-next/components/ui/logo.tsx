import Image from "next/image";

export type LogoVariant = "full" | "text" | "icon" | "bot";

export interface LogoProps {
  variant?: LogoVariant;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
  priority?: boolean;
}

const sizeDimensions = {
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 48, height: 48 },
  xl: { width: 64, height: 64 },
};

const textSizes = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-2xl",
};

const botSizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

export function FriendlyBot({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { width, height } = sizeDimensions[size];

  return (
    <Image
      src="/images/logos/robot-logo.png"
      alt="Wabi-Sabi Robot"
      width={width * 2}
      height={height * 2}
      className={`object-contain ${className || ""}`}
      priority
    />
  );
}

export function Logo({
  variant = "full",
  size = "md",
  showText = true,
  className = "",
  priority = false,
}: LogoProps) {
  const { width, height } = sizeDimensions[size];
  const textClass = textSizes[size];

  if (variant === "bot") {
    return <FriendlyBot className={className} size={size} />;
  }

  if (variant === "icon") {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Image
          src="/images/logos/logo2.jpg"
          alt="Wabi-Sabi Icon"
          width={width}
          height={height}
          priority={priority}
          className="object-contain"
        />
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`flex items-center ${className}`}>
        <Image
          src="/images/logos/logo1.jpg"
          alt="Wabi-Sabi"
          width={width * 6}
          height={height}
          priority={priority}
          className="object-contain h-auto"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/images/logos/logo2.jpg"
        alt="Wabi-Sabi"
        width={width}
        height={height}
        priority={priority}
        className="object-contain"
      />
      {showText && (
        <Image
          src="/images/logos/logo1.jpg"
          alt="Wabi-Sabi"
          width={width * 6}
          height={height}
          priority={priority}
          className="object-contain h-auto hidden sm:block"
        />
      )}
    </div>
  );
}

export function LogoText({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const textClass = textSizes[size];
  const dimensions = sizeDimensions[size];

  return (
    <Image
      src="/images/logos/logo1.jpg"
      alt="Wabi-Sabi"
      width={dimensions.width * 6}
      height={dimensions.height}
      className={`object-contain h-auto ${textClass} ${className}`}
    />
  );
}

export function LogoIcon({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { width, height } = sizeDimensions[size];

  return (
    <Image
      src="/images/logos/logo2.jpg"
      alt="Wabi-Sabi"
      width={width}
      height={height}
      className={`object-contain ${className}`}
    />
  );
}

export function LogoFull({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const { width, height } = sizeDimensions[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoIcon size={size} />
      <LogoText size={size} className="hidden sm:block" />
    </div>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/images/logos/logo2.jpg"
      alt="Wabi-Sabi"
      width={32}
      height={32}
      className={`object-contain ${className}`}
    />
  );
}
