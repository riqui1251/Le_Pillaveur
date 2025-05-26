import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const games = [
  {
    id: 'monsieur-3',
    title: 'Monsieur 3',
    description: 'Un jeu de dés convivial où vous devez éviter les 3 et autres combinaisons',
    path: '/games/monsieur-3',
    emoji: '🎲',
    gradient: 'from-blue-500 to-purple-500',
    fallbackColor: '#6366f1'
  },
  {
    id: 'pmu',
    title: 'Course PMU',
    description: 'Un jeu de paris hippiques entre amis',
    path: '/games/pmu',
    emoji: '🏇',
    gradient: 'from-purple-500 to-indigo-500',
    fallbackColor: '#6366f1'
  },
  {
    id: 'petit-buveur',
    title: 'Le Petit Buveur',
    description: 'Un jeu de plateau festif avec des défis et des gorgées',
    path: '/games/petit-buveur',
    emoji: '🎲',
    gradient: 'from-emerald-500 to-teal-500',
    fallbackColor: '#10b981'
  },
  {
    id: 'hi-lo',
    title: 'Hi/Lo',
    description: 'Devinez si la prochaine carte sera plus haute ou plus basse',
    path: '/games/hi-lo',
    emoji: '🃏',
    gradient: 'from-red-500 to-orange-500',
    fallbackColor: '#f97316'
  },
  {
    id: 'pyramide',
    title: 'Pyramide',
    description: 'Retournez les cartes et progressez dans la pyramide',
    path: '/games/pyramide',
    emoji: '🔺',
    gradient: 'from-amber-500 to-yellow-500',
    fallbackColor: '#eab308'
  },
  {
    id: 'plinko',
    title: 'Plinko',
    description: 'Faites tomber une balle à travers des obstacles pour gagner des gorgées',
    path: '/games/plinko',
    emoji: '🔵',
    gradient: 'from-green-500 to-lime-500',
    fallbackColor: '#22c55e'
  },
  {
    id: 'ballon-surprise',
    title: 'Ballon Surprise',
    description: 'Choisissez un ballon et priez pour qu\'il gagne la course !',
    path: '/games/ballon-surprise',
    emoji: '🎈',
    gradient: 'from-sky-400 to-cyan-300',
    fallbackColor: '#38bdf8'
  }
]

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20" />
      
      <div className="relative container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-extrabold">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              Jeux à Boire
            </span>
          </h1>
          <p className="mt-6 text-xl md:text-2xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Choisissez votre jeu et commencez l&apos;aventure ! 🎮
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {games.map((game) => (
            <Link key={game.id} href={game.path} className="group perspective">
              <Card className="transform-gpu transition-all duration-500 group-hover:scale-[1.02] group-hover:-rotate-1">
                <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient} opacity-90 rounded-lg`} />
                <div className="relative p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">{game.title}</h3>
                      <p className="text-lg text-gray-100 opacity-90">{game.description}</p>
                    </div>
                    <span className="text-5xl transform group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">{game.emoji}</span>
                  </div>
                  <Button className="w-full bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-2 border-white/50 hover:border-white transition-all font-semibold text-lg py-6">
                    Jouer
                  </Button>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
