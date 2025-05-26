/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface PinCodeInputProps {
  onSubmit: (pin: string) => void;
  error: string | null;
}

export function PinCodeInput({ onSubmit, error }: PinCodeInputProps) {
  const [pin, setPin] = useState<string>("");
  const [showError, setShowError] = useState<boolean>(false);

  // Gérer l'affichage des erreurs
  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => {
        setShowError(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Ajouter un chiffre au code PIN
  const addDigit = (digit: string) => {
    if (pin.length < 7) {
      setPin(prev => prev + digit);
    }
  };

  // Supprimer le dernier chiffre
  const removeLastDigit = () => {
    setPin(prev => prev.slice(0, -1));
  };

  // Soumettre le code PIN
  const handleSubmit = () => {
    onSubmit(pin);
  };

  // Effacer le code PIN
  const clearPin = () => {
    setPin("");
  };

  return (
    <div className="flex flex-col items-center space-y-6 p-6">
      <h2 className="text-2xl font-bold mb-2">Entrez le code d'accès</h2>
      
      {/* Affichage du code PIN */}
      <div className="flex justify-center space-x-2 w-full mb-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <div 
            key={index} 
            className={`w-10 h-12 border-2 rounded-md flex items-center justify-center text-xl font-bold
              ${pin[index] ? 'border-amber-500 bg-amber-500/20' : 'border-gray-600'}`}
          >
            {pin[index] ? '*' : ''}
          </div>
        ))}
      </div>
      
      {/* Message d'erreur */}
      {showError && (
        <div className="flex items-center text-red-500 mb-2">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Clavier numérique */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <Button 
            key={num} 
            variant="outline" 
            className="h-14 text-xl font-bold bg-gray-800 border-gray-700 hover:bg-gray-700"
            onClick={() => addDigit(num.toString())}
          >
            {num}
          </Button>
        ))}
        <Button 
          variant="outline" 
          className="h-14 text-xl font-bold bg-gray-800 border-gray-700 hover:bg-gray-700"
          onClick={clearPin}
        >
          C
        </Button>
        <Button 
          variant="outline" 
          className="h-14 text-xl font-bold bg-gray-800 border-gray-700 hover:bg-gray-700"
          onClick={() => addDigit("0")}
        >
          0
        </Button>
        <Button 
          variant="outline" 
          className="h-14 text-xl font-bold bg-gray-800 border-gray-700 hover:bg-gray-700"
          onClick={removeLastDigit}
        >
          ←
        </Button>
      </div>
      
      {/* Bouton de validation */}
      <Button 
        className="w-full h-12 mt-4 bg-amber-500 hover:bg-amber-600 text-white"
        onClick={handleSubmit}
        disabled={pin.length !== 7}
      >
        Valider
      </Button>
    </div>
  );
} 