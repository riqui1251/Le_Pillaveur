import * as React from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFullscreen } from "@/hooks/useFullscreen";
import { isCapacitorApp } from "@/lib/native-app";

export interface FullscreenButtonProps {
  className?: string;
}

export const FullscreenButton: React.FC<FullscreenButtonProps> = ({
  className,
}) => {
  const t = useTranslations("nav");
  const { isFullscreen, isSupported, toggleFullscreen } = useFullscreen();
  const [inApp, setInApp] = React.useState(false);

  React.useEffect(() => {
    setInApp(isCapacitorApp());
  }, []);

  // Rien sur iPhone Safari (API absente) ni dans la coquille Capacitor
  // (l'app occupe déjà tout l'écran).
  if (!isSupported || inApp) return null;

  const label = isFullscreen ? t("exitFullscreen") : t("fullscreen");

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => void toggleFullscreen()}
      title={label}
      aria-label={label}
    >
      {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
    </Button>
  );
};
