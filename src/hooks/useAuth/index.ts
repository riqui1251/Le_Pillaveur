"use client";

import { useState, useEffect } from 'react';

// Code PIN fixe pour l'accès à la page de compte
const PIN_CODE = "1251381";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinAttempt, setPinAttempt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Vérifier si l'utilisateur est déjà authentifié au chargement
  useEffect(() => {
    const authStatus = localStorage.getItem('auth_status');
    if (authStatus === 'authenticated') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fonction pour vérifier le code PIN
  const verifyPin = () => {
    if (pinAttempt === PIN_CODE) {
      setIsAuthenticated(true);
      setError(null);
      localStorage.setItem('auth_status', 'authenticated');
      return true;
    } else {
      setError("Code PIN incorrect");
      return false;
    }
  };

  // Fonction pour se déconnecter
  const logout = () => {
    setIsAuthenticated(false);
    setPinAttempt("");
    localStorage.removeItem('auth_status');
  };

  return {
    isAuthenticated,
    pinAttempt,
    setPinAttempt,
    verifyPin,
    logout,
    error
  };
} 