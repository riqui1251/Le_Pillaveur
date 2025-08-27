'use client';

import React from 'react';

import { Player } from '@/lib/players';

// Types pour le système de risque
type RiskLevel = 'faible' | 'moyen' | 'eleve';

interface Choice {
  id: string;
  text: string;
  value: number;
  type: 'gorgées' | 'multiplicateur' | 'bonus' | 'cible';
  isRevealed: boolean;
  isSelected: boolean;
}

interface PlayerGameState {
  riskLevel: RiskLevel | null;
  gorgéesChoices: Choice[];
  multiplicateurChoices: Choice[];
  bonusChoices: Choice[];
  cibleChoices: Choice[];
  selectedGorgées: Choice | null;
  selectedMultiplicateur: Choice | null;
  selectedBonus: Choice | null;
  selectedCible: Choice | null;
  targetPlayer: Player | null;
}

interface GameProps {
  players: Player[];
  onGameFinish: (results: { [playerId: string]: PlayerGameState }) => void;
}

// Configuration des niveaux de risque
const RISK_CONFIG = {
  faible: {
    gorgéesRange: { min: 1, max: 2 },
    hasMultiplicateur: false,
    multiplicateurRange: null,
    hasBonus: false,
    bonusRange: null
  },
  moyen: {
    gorgéesRange: { min: 1, max: 3 },
    hasMultiplicateur: true,
    multiplicateurRange: { min: 1, max: 3 },
    hasBonus: true,
    bonusRange: { min: 1, max: 2 }
  },
  eleve: {
    gorgéesRange: { min: 2, max: 3 },
    hasMultiplicateur: true,
    multiplicateurRange: { min: 2, max: 3 },
    hasBonus: true,
    bonusRange: { min: 2, max: 3 }
  }
};

// Générer des choix de gorgées
const generateGorgéesChoices = (min: number, max: number): Choice[] => {
  const choices: Choice[] = [];
  for (let i = min; i <= max; i++) {
    choices.push({
      id: `gorgées-${i}`,
      text: `${i} gorgée${i > 1 ? 's' : ''}`,
      value: i,
      type: 'gorgées',
      isRevealed: false,
      isSelected: false
    });
  }
  return choices.sort(() => Math.random() - 0.5).slice(0, 2); // Mélanger et prendre 2
};

// Générer des choix de multiplicateur
const generateMultiplicateurChoices = (min: number, max: number): Choice[] => {
  const choices: Choice[] = [];
  for (let i = min; i <= max; i++) {
    choices.push({
      id: `multiplicateur-${i}`,
      text: `x${i}`,
      value: i,
      type: 'multiplicateur',
      isRevealed: false,
      isSelected: false
    });
  }
  return choices.sort(() => Math.random() - 0.5).slice(0, 2); // Mélanger et prendre 2
};

// Générer des choix de bonus
const generateBonusChoices = (min: number, max: number): Choice[] => {
  const choices: Choice[] = [];
  for (let i = min; i <= max; i++) {
    choices.push({
      id: `bonus-${i}`,
      text: `+${i} bonus`,
      value: i,
      type: 'bonus',
      isRevealed: false,
      isSelected: false
    });
  }
  return choices.sort(() => Math.random() - 0.5).slice(0, 2); // Mélanger et prendre 2
};

// Générer des choix de cible
const generateCibleChoices = (): Choice[] => {
  const choices: Choice[] = [
    {
      id: 'soi-meme',
      text: 'Soi-même',
      value: 1,
      type: 'cible' as const,
      isRevealed: false,
      isSelected: false
    },
    {
      id: 'autre',
      text: 'Choisir une cible',
      value: 2,
      type: 'cible' as const,
      isRevealed: false,
      isSelected: false
    }
  ];
  return choices.sort(() => Math.random() - 0.5); // Mélanger les choix
};

export default function Game({ players, onGameFinish }: GameProps) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = React.useState(0);
  const [gameStep, setGameStep] = React.useState<'risk' | 'gorgées' | 'multiplicateur' | 'bonus' | 'cible' | 'targetSelection' | 'results'>('risk');
  const [playerStates, setPlayerStates] = React.useState<{ [playerId: string]: PlayerGameState }>({});
  const [currentChoices, setCurrentChoices] = React.useState<Choice[]>([]);
  const [isWaiting, setIsWaiting] = React.useState(false);

  const currentPlayer = players[currentPlayerIndex];
  const currentPlayerState = playerStates[currentPlayer?.id];

  // Initialiser l'état du joueur actuel
  React.useEffect(() => {
    if (!currentPlayer) return;

    if (!playerStates[currentPlayer.id]) {
      setPlayerStates(prev => ({
        ...prev,
                 [currentPlayer.id]: {
           riskLevel: null,
           gorgéesChoices: [],
           multiplicateurChoices: [],
           bonusChoices: [],
           cibleChoices: [],
           selectedGorgées: null,
           selectedMultiplicateur: null,
           selectedBonus: null,
           selectedCible: null,
           targetPlayer: null
         }
      }));
    }
  }, [currentPlayer, playerStates]);

  // Gérer les changements d'étape
  React.useEffect(() => {
    if (!currentPlayer || !currentPlayerState) return;

    switch (gameStep) {
      case 'risk':
        const riskChoices: Choice[] = [
          { id: 'faible', text: 'Faible', value: 1, type: 'gorgées' as const, isRevealed: false, isSelected: false },
          { id: 'moyen', text: 'Moyen', value: 2, type: 'gorgées' as const, isRevealed: false, isSelected: false },
          { id: 'eleve', text: 'Élevé', value: 3, type: 'gorgées' as const, isRevealed: false, isSelected: false }
        ];
        setCurrentChoices(riskChoices.sort(() => Math.random() - 0.5)); // Mélanger les choix
        break;
      
      case 'gorgées':
        if (currentPlayerState.riskLevel) {
          const config = RISK_CONFIG[currentPlayerState.riskLevel];
          const choices = generateGorgéesChoices(config.gorgéesRange.min, config.gorgéesRange.max);
          setCurrentChoices(choices);
          setPlayerStates(prev => ({
            ...prev,
            [currentPlayer.id]: {
              ...prev[currentPlayer.id],
              gorgéesChoices: choices
            }
          }));
        }
        break;
      
             case 'multiplicateur':
         if (currentPlayerState.riskLevel && currentPlayerState.selectedGorgées) {
           const config = RISK_CONFIG[currentPlayerState.riskLevel];
           if (config.hasMultiplicateur && config.multiplicateurRange) {
             const choices = generateMultiplicateurChoices(config.multiplicateurRange.min, config.multiplicateurRange.max);
             setCurrentChoices(choices);
             setPlayerStates(prev => ({
               ...prev,
               [currentPlayer.id]: {
                 ...prev[currentPlayer.id],
                 multiplicateurChoices: choices
               }
             }));
           } else {
             // Passer directement à l'étape cible si pas de multiplicateur
             setGameStep('cible');
           }
         }
         break;
       
       case 'bonus':
         if (currentPlayerState.riskLevel && currentPlayerState.selectedMultiplicateur) {
           const config = RISK_CONFIG[currentPlayerState.riskLevel];
           if (config.hasBonus && config.bonusRange) {
             const choices = generateBonusChoices(config.bonusRange.min, config.bonusRange.max);
             setCurrentChoices(choices);
             setPlayerStates(prev => ({
               ...prev,
               [currentPlayer.id]: {
                 ...prev[currentPlayer.id],
                 bonusChoices: choices
               }
             }));
           } else {
             // Passer directement à l'étape cible si pas de bonus
             setGameStep('cible');
           }
         }
         break;
      
      case 'cible':
        const cibleChoices = generateCibleChoices();
        setCurrentChoices(cibleChoices);
        setPlayerStates(prev => ({
          ...prev,
          [currentPlayer.id]: {
            ...prev[currentPlayer.id],
            cibleChoices
          }
        }));
        break;
    }
  }, [gameStep, currentPlayer, currentPlayerState?.riskLevel, currentPlayerState]);

  const handleChoiceClick = (choiceIndex: number) => {
    if (!currentPlayer || isWaiting) return;

    // Révéler seulement le choix sélectionné
    setCurrentChoices(prev => prev.map((choice, index) => ({
      ...choice,
      isRevealed: index === choiceIndex,
      isSelected: index === choiceIndex
    })));

    const selectedChoice = currentChoices[choiceIndex];
    
    // Activer l'état d'attente
    setIsWaiting(true);

    // Attendre 1.5 secondes avant de passer à l'étape suivante
    setTimeout(() => {
      // Révéler tous les choix avant de passer à l'étape suivante
      setCurrentChoices(prev => prev.map(choice => ({
        ...choice,
        isRevealed: true
      })));
      
      // Attendre encore 1 seconde pour que le joueur puisse voir tous les choix
      setTimeout(() => {
        setIsWaiting(false);
        switch (gameStep) {
        case 'risk':
          setPlayerStates(prev => ({
            ...prev,
            [currentPlayer.id]: {
              ...prev[currentPlayer.id],
              riskLevel: selectedChoice.id as RiskLevel
            }
          }));
          setGameStep('gorgées');
          break;
        
        case 'gorgées':
          setPlayerStates(prev => ({
            ...prev,
            [currentPlayer.id]: {
              ...prev[currentPlayer.id],
              selectedGorgées: selectedChoice
            }
          }));
          setGameStep('multiplicateur');
          break;
        
        case 'multiplicateur':
          setPlayerStates(prev => ({
            ...prev,
            [currentPlayer.id]: {
              ...prev[currentPlayer.id],
              selectedMultiplicateur: selectedChoice
            }
          }));
          // Passer à l'étape bonus seulement pour le niveau élevé
          if (currentPlayerState.riskLevel === 'eleve') {
            setGameStep('bonus');
          } else {
            setGameStep('cible');
          }
          break;
        
        case 'bonus':
          setPlayerStates(prev => ({
            ...prev,
            [currentPlayer.id]: {
              ...prev[currentPlayer.id],
              selectedBonus: selectedChoice
            }
          }));
          setGameStep('cible');
          break;
        
        case 'cible':
          setPlayerStates(prev => ({
            ...prev,
            [currentPlayer.id]: {
              ...prev[currentPlayer.id],
              selectedCible: selectedChoice
            }
          }));
          
          if (selectedChoice.id === 'autre') {
            setGameStep('targetSelection');
          } else {
            // Cible = soi-même, terminer le tour du joueur
            finishPlayerTurn();
          }
          break;
        }
      }, 1000); // 1 seconde supplémentaire pour voir tous les choix
    }, 1500); // 1.5 secondes
  };

  const handleTargetSelection = (targetPlayer: Player) => {
    if (!currentPlayer) return;

    setPlayerStates(prev => ({
      ...prev,
      [currentPlayer.id]: {
        ...prev[currentPlayer.id],
        targetPlayer
      }
    }));

    finishPlayerTurn();
  };

  const finishPlayerTurn = () => {
    if (currentPlayerIndex < players.length - 1) {
      setCurrentPlayerIndex(currentPlayerIndex + 1);
      setGameStep('risk');
    } else {
      setGameStep('results');
      onGameFinish(playerStates);
    }
  };

  const getStepTitle = () => {
    if (!currentPlayerState) return '';
    
    switch (gameStep) {
      case 'risk':
        return 'Choisissez votre niveau de risque';
      case 'gorgées':
        return `Choisissez le nombre de gorgées (${currentPlayerState.riskLevel})`;
      case 'multiplicateur':
        return 'Choisissez le multiplicateur';
      case 'bonus':
        return 'Choisissez le bonus';
      case 'cible':
        return 'Choisissez la cible';
      case 'targetSelection':
        return 'Choisissez le joueur cible';
      default:
        return '';
    }
  };

  const getStepProgress = () => {
    if (!currentPlayerState) return '';
    
    const steps = ['risk', 'gorgées', 'multiplicateur', 'bonus', 'cible'];
    const currentStepIndex = steps.indexOf(gameStep);
    
    if (currentStepIndex === -1) return '';
    
    // Pour le niveau faible, pas de multiplicateur ni bonus
    if (currentPlayerState.riskLevel === 'faible' && (gameStep === 'multiplicateur' || gameStep === 'bonus')) {
      return 'Étape 3/3';
    }
    
    // Pour le niveau moyen, pas de bonus
    if (currentPlayerState.riskLevel === 'moyen' && gameStep === 'bonus') {
      return 'Étape 4/4';
    }
    
    return `Étape ${currentStepIndex + 1}/${currentPlayerState.riskLevel === 'faible' ? 3 : currentPlayerState.riskLevel === 'moyen' ? 4 : 5}`;
  };

  const getStepDescription = () => {
    if (!currentPlayerState) return '';
    
    switch (gameStep) {
      case 'risk':
        return 'Le niveau de risque détermine les options disponibles';
      case 'gorgées':
        const config = RISK_CONFIG[currentPlayerState.riskLevel!];
        return `Range de gorgées : ${config.gorgéesRange.min} à ${config.gorgéesRange.max}`;
      case 'multiplicateur':
        const multConfig = RISK_CONFIG[currentPlayerState.riskLevel!];
        if (multConfig.multiplicateurRange) {
          return `Range de multiplicateur : x${multConfig.multiplicateurRange.min} à x${multConfig.multiplicateurRange.max}`;
        }
        return '';
      case 'bonus':
        const bonusConfig = RISK_CONFIG[currentPlayerState.riskLevel!];
        if (bonusConfig.bonusRange) {
          return `Range de bonus : +${bonusConfig.bonusRange.min} à +${bonusConfig.bonusRange.max}`;
        }
        return '';
      case 'cible':
        return 'Qui va boire les gorgées ?';
      case 'targetSelection':
        return 'Sélectionnez le joueur qui boira les gorgées';
      default:
        return '';
    }
  };

    if (gameStep === 'results') {
    return null; // Les résultats sont maintenant affichés dans la page principale
  }

  if (gameStep === 'targetSelection') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2 text-slate-200">The Choice</h2>
          <p className="text-lg mb-4">
            C&apos;est au tour de <span className="font-bold text-purple-400">{currentPlayer?.name}</span>
          </p>
          <p className="text-gray-300 mb-2">{getStepTitle()}</p>
          <p className="text-sm text-gray-400">{getStepDescription()}</p>
          <p className="text-xs text-purple-400 mt-2">{getStepProgress()}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.filter(p => p.id !== currentPlayer?.id).map((player) => (
            <div key={player.id} onClick={() => handleTargetSelection(player)}>
              <div className="w-full h-20 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-blue-400 hover:border-blue-300">
                {player.name}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-400">
            Progression : {currentPlayerIndex + 1}/{players.length} joueurs
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2 text-slate-200">The Choice</h2>
        <p className="text-lg mb-4">
          C&apos;est au tour de <span className="font-bold text-purple-400">{currentPlayer?.name}</span>
        </p>
        <p className="text-gray-300 mb-2">{getStepTitle()}</p>
        <p className="text-sm text-gray-400">{getStepDescription()}</p>
        <p className="text-xs text-purple-400 mt-2">{getStepProgress()}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {currentChoices.map((choice, index) => (
          <div key={choice.id} onClick={() => handleChoiceClick(index)}>
            <div className={`w-full h-20 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg transition-all duration-300 border-2 ${
              isWaiting 
                ? 'cursor-not-allowed opacity-50' 
                : 'cursor-pointer'
            } ${
              !choice.isRevealed 
                ? 'bg-gradient-to-br from-purple-600 to-violet-700 border-purple-400 hover:border-purple-300 hover:shadow-xl' 
                : choice.isSelected 
                  ? 'bg-gradient-to-br from-green-600 to-emerald-700 border-green-400' 
                  : 'bg-gradient-to-br from-gray-600 to-gray-700 border-gray-400'
            }`}>
              {choice.isRevealed ? choice.text : `Choix ${index + 1}`}
            </div>
          </div>
        ))}
      </div>

      {isWaiting && (
        <div className="text-center mt-4">
          <div className="inline-flex items-center space-x-2 text-purple-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
            <span className="text-sm">Révélation des choix et passage à l&apos;étape suivante...</span>
          </div>
        </div>
      )}

      <div className="text-center">
        <p className="text-sm text-gray-400">
          Progression : {currentPlayerIndex + 1}/{players.length} joueurs
        </p>
        <div className="flex justify-center mt-2 space-x-1">
          {players.map((player, index) => (
            <div
              key={player.id}
              className={`w-3 h-3 rounded-full ${
                index < currentPlayerIndex 
                  ? 'bg-green-500' 
                  : index === currentPlayerIndex 
                    ? 'bg-purple-500' 
                    : 'bg-gray-500'
              }`}
              title={player.name}
            />
          ))}
        </div>
      </div>
    </div>
  );
} 