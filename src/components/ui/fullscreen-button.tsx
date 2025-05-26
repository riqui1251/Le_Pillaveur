import * as React from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useToast } from "@/components/ui/toast";

export interface FullscreenButtonProps {
  className?: string;
}

export const FullscreenButton: React.FC<FullscreenButtonProps> = ({
  className,
}) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { showToast } = useToast();

  const handleToggleFullscreen = async () => {
    try {
      await toggleFullscreen();
      
      // Le toast est déjà géré dans le hook useFullscreen, mais on peut ajouter un message spécifique ici
      if (!isFullscreen) {
        showToast({
          message: 'Le contenu est maintenant centré en plein écran',
          type: 'info',
          duration: 2500
        });
      }
    } catch (error) {
      console.error("Erreur lors du basculement en plein écran:", error);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={handleToggleFullscreen}
      title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
      aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
    >
      {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
    </Button>
  );
}; 