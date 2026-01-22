/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

/// <reference types="vite/client" />
declare module '*.css';

import './styles/theme.css';
import './index.css';
import { createApp } from 'vue';
import App from './App.vue';
import GitProviderPlugin from './plugins/gitProvider';
import { initializeConfig } from './stores/configStore';

// Initialize config (load API key from secure storage) before mounting the app
initializeConfig().then(() => {
  const app = createApp(App);

  // Install the Git provider plugin (supports GitHub, GitLab, Bitbucket)
  app.use(GitProviderPlugin);

  app.mount('#app');
});
