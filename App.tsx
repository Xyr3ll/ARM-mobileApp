import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LoginArea } from './src/components/LoginArea';
import { BottomTabNavigator } from './src/navigation/BottomTabNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [professorName, setProfessorName] = useState('');
  const [professorId, setProfessorId] = useState('');

  const handleLogin = (username: string, password: string, category: string) => {
    console.log('Login attempt:', { username, password, category });
    setProfessorName(username.toUpperCase());
    setProfessorId(username);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setProfessorName('');
  };

  return (
    <SafeAreaProvider>
      {isAuthenticated ? (
        <NavigationContainer>
          <BottomTabNavigator professorName={professorName} professorId={professorId} onLogout={handleLogout} />
          <StatusBar hidden={true} />
        </NavigationContainer>
      ) : (
        <>
          <LoginArea onLogin={handleLogin} />
          <StatusBar hidden={true} />
        </>
      )}
    </SafeAreaProvider>
  );
}
