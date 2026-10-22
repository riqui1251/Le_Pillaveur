import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Action principale d'un écran de jeu, en local comme en ligne :
        // encre sur or (7,2:1). Le blanc sur or tombait à 2,25:1.
        // L'anneau de focus de base (1 px d'or) disparaît sur l'or : les trois
        // variantes de jeu posent un anneau crème décalé, visible sur le feutre.
        primary:
          "bg-amber-500 font-bold text-[#24201A] shadow-[0_10px_22px_-12px_rgba(217,164,65,0.7)] hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep active:scale-[0.98] disabled:opacity-40",
        // Geste lourd (lyncher, tirer, terminer) : crème sur rouge carreau (5,0:1).
        danger:
          "bg-suit-red font-bold text-cream shadow-[0_10px_22px_-12px_rgba(179,56,46,0.7)] hover:bg-[#9E2F26] focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep active:scale-[0.98] disabled:opacity-40",
        // Action secondaire posée sur le feutre.
        quiet:
          "border border-gold/[0.35] bg-felt-deep/60 font-semibold text-cream hover:bg-gold/10 focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep active:scale-[0.98] disabled:opacity-40",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        // Tailles des écrans de jeu : le h-9 par défaut écrasait les py-3/py-4
        // à 36 px, sous les 44 px d'une cible au doigt.
        game: "h-12 rounded-2xl px-4 text-sm",
        gameLg: "h-14 rounded-2xl px-5 text-base",
        gameIcon: "h-11 w-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants } 