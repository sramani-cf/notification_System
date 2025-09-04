'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize user on mount
    initializeUser();
  }, []);

  const initializeUser = async () => {
    try {
      // Check for existing user in localStorage
      const storedUser = localStorage.getItem('demo_user');
      
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        console.log('Loaded existing user:', userData);
      } else {
        // Create a new user session
        const newUser = await createUserSession();
        setUser(newUser);
        localStorage.setItem('demo_user', JSON.stringify(newUser));
        console.log('Created new user:', newUser);
      }
    } catch (error) {
      console.error('Failed to initialize user:', error);
      // Fallback to local generation if backend is unavailable
      const fallbackUser = generateLocalUser();
      setUser(fallbackUser);
      localStorage.setItem('demo_user', JSON.stringify(fallbackUser));
    } finally {
      setIsLoading(false);
    }
  };

  const createUserSession = async () => {
    try {
      // Try to get session from backend
      const response = await fetch('http://localhost:8000/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Send any client info if needed
          clientInfo: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          userId: data.userId,
          username: data.username,
          email: data.email,
          sessionToken: data.sessionToken,
          createdAt: data.createdAt
        };
      }
    } catch (error) {
      console.warn('Backend session creation failed, using local generation:', error);
    }

    // Fallback to local generation
    return generateLocalUser();
  };

  const generateLocalUser = () => {
    const userId = Math.floor(10000 + Math.random() * 90000); // 5-digit user ID
    return {
      userId,
      username: `user_${userId}`,
      email: 'ramanisahil.cf@gmail.com', // Keep the test email
      sessionToken: `local-session-${userId}-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
  };

  const updateUser = (updates) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('demo_user', JSON.stringify(updated));
      return updated;
    });
  };

  const clearUser = () => {
    setUser(null);
    localStorage.removeItem('demo_user');
  };

  const refreshSession = async () => {
    setIsLoading(true);
    localStorage.removeItem('demo_user');
    await initializeUser();
  };

  const value = {
    user,
    isLoading,
    updateUser,
    clearUser,
    refreshSession,
    isAuthenticated: !!user
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};