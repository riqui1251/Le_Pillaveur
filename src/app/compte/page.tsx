/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useAuth } from '@/hooks/useAuth';
import { PinCodeInput } from '@/components/ui/PinCodeInput';
import { AccountInfo } from '@/components/ui/AccountInfo';

export default function AccountPage() {
  const { isAuthenticated, pinAttempt, setPinAttempt, verifyPin, logout, error } = useAuth();

  const handlePinSubmit = (pin: string) => {
    setPinAttempt(pin);
    verifyPin();
  };

  return (
    <main className="container mx-auto pt-24 pb-12 min-h-screen">
      <div className="max-w-md mx-auto bg-gray-900 rounded-lg shadow-lg overflow-hidden border border-gray-800">
        {!isAuthenticated ? (
          <PinCodeInput onSubmit={handlePinSubmit} error={error} />
        ) : (
          <AccountInfo onLogout={logout} />
        )}
      </div>
    </main>
  );
} 