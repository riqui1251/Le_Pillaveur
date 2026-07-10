/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class'],
    content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'from-red-600','to-amber-500',
    'from-sky-500','to-indigo-600',
    'from-fuchsia-600','to-violet-700',
    'from-emerald-600','to-teal-400',
    'from-amber-600','to-yellow-400',
    'from-emerald-500','to-lime-400',
    'from-pink-600','to-rose-400',
    'from-sky-500','to-cyan-400',
    'from-violet-600','to-purple-700',
    'from-indigo-600','to-blue-600',
    'from-rose-500','to-fuchsia-500',
    // direction utilities utilisées dynamiquement
    'bg-gradient-to-br','bg-gradient-to-r',
    // Couleurs dynamiques des ballons (Ballon Surprise) — générées via bg-${color}-500
    'bg-red-500','bg-red-600','text-red-400',
    'bg-blue-500','bg-blue-600','text-blue-400',
    'bg-green-500','bg-green-600','text-green-400',
    'bg-yellow-500','bg-yellow-600','text-yellow-400',
    'bg-purple-500','bg-purple-600','text-purple-400',
    'bg-orange-500','bg-orange-600','text-orange-400',
    'bg-pink-500','bg-pink-600','text-pink-400',
    'bg-cyan-500','bg-cyan-600','text-cyan-400',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
  	extend: {
  		screens: {
  			xs: '480px',
  			sm: '640px',
  			md: '768px',
  			lg: '1024px',
  			xl: '1280px',
  			'2xl': '1536px'
  		},
  		fontFamily: {
  			// Identité « Cartes sur Table » : Source Sans 3 (texte) + Playfair Display (display).
  			sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  			display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
  		},
  		colors: {
  			// ── Tokens de marque (suivent le mode Soft via les variables) ──
  			felt: 'rgb(var(--felt-rgb) / <alpha-value>)',
  			'felt-deep': 'rgb(var(--felt-deep-rgb) / <alpha-value>)',
  			gold: {
  				DEFAULT: 'rgb(var(--gold-rgb) / <alpha-value>)',
  				strong: 'rgb(var(--gold-strong-rgb) / <alpha-value>)'
  			},
  			cream: 'rgb(var(--cream-rgb) / <alpha-value>)',
  			suit: { red: 'rgb(var(--suit-red-rgb) / <alpha-value>)' },
  			chip: { blue: 'rgb(var(--chip-blue-rgb) / <alpha-value>)' },
  			// ── Remap : l'ancien accent ambre devient l'or patiné de la marque.
  			// Les ~250 classes amber-* existantes basculent sans refactor.
  			amber: {
  				50: '#FBF6E9',
  				100: '#F6ECD2',
  				200: '#EFDCA9',
  				300: '#E7C97D',
  				400: '#E0B65C',
  				500: '#D9A441',
  				600: '#B8862F',
  				700: '#946A24',
  				800: '#77551F',
  				900: '#61451C',
  				950: '#38270E'
  			},
  			// L'orange des gradients CTA (from-amber-500 to-orange-600) devient or cuivré.
  			orange: {
  				50: '#FBF4E6',
  				100: '#F6E7C9',
  				200: '#EDD199',
  				300: '#E3B96A',
  				400: '#D89A3D',
  				500: '#C8862C',
  				600: '#A96D22',
  				700: '#8A571C',
  				800: '#6E4517',
  				900: '#5A3914',
  				950: '#33200A'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			ring: 'hsl(var(--ring))',
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			input: 'hsl(var(--input))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		boxShadow: {
  			DEFAULT: '0 1px 3px 0 hsl(var(--shadow))',
  			md: '0 4px 6px -1px hsl(var(--shadow)), 0 2px 4px -2px hsl(var(--shadow))',
  			lg: '0 10px 15px -3px hsl(var(--shadow-strong)), 0 4px 6px -4px hsl(var(--shadow))',
  			xl: '0 20px 25px -5px hsl(var(--shadow-strong)), 0 8px 10px -6px hsl(var(--shadow))',
  			sm: '0 1px 2px 0 hsl(var(--shadow))'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} 