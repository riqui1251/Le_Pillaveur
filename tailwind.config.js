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
  		colors: {
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