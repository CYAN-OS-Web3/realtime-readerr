const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, 'assets/icon'),
    extraMetadata: {
      main: 'main.js',
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
        signingCertificate: process.env.WINDOWS_CERTIFICATE_FILE,
        setupIcon: path.join(__dirname, 'assets/icon.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
  hooks: {
    generateAssets: async () => {
      // ONLY build the renderer bundle if we are NOT in development mode.
      // In development, we serve directly from the Vite dev server on port 5173.
      if (process.env.IS_DEV === 'true' || process.env.NODE_ENV === 'development') {
        console.log('Development mode: Skipping renderer build, using dev server...');
        return;
      }
      
      console.log('Production mode: Building renderer...');
      const { execSync } = require('child_process');
      try {
        execSync('cd renderer && npm run build', { stdio: 'inherit' });
      } catch (e) {
        console.error('Renderer build failed:', e.message);
        throw e;
      }
    },
  },
};
