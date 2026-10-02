import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lumen.game',
  appName: 'Lumen',
  webDir: 'dist',
  // Lila wie das Logo -- kein weißes Aufblitzen zwischen Splash und erstem Frame
  backgroundColor: '#5039C6',
  android: {
    backgroundColor: '#5039C6'
  }
};

export default config;
