import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BasicDemo } from './src/screens/BasicDemo';
import { CustomTagDemo } from './src/screens/CustomTagDemo';

type Screen = 'basic' | 'custom';

export default function App() {
  const [screen, setScreen] = useState<Screen>('basic');
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabs}>
        <Tab label="Built-in tags" active={screen === 'basic'} onPress={() => setScreen('basic')} />
        <Tab label="Custom <mention>" active={screen === 'custom'} onPress={() => setScreen('custom')} />
      </View>
      {screen === 'basic' ? <BasicDemo /> : <CustomTagDemo />}
    </SafeAreaView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1A73E8' },
  tabLabel: { fontSize: 14, color: '#666' },
  tabLabelActive: { color: '#1A73E8', fontWeight: '600' },
});
