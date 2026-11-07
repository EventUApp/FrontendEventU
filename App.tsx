import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FlowProvider } from './src/state/FlowContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <FlowProvider>
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </FlowProvider>
    </SafeAreaProvider>
  );
}
