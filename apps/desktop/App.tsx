/**
 * RN 入口 — 加载 src/App
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
