import * as React from "react"
import { cn } from "@/lib/utils"

// Aucune propriété propre : un alias suffit (une interface vide ne dit rien de plus).
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base sous `sm` : en dessous de 16px, iOS zoome tout seul au
          // focus et laisse la page décalée. À partir de `sm` (tablette,
          // desktop) le zoom ne s'applique plus, on revient au 14px d'origine.
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input } 