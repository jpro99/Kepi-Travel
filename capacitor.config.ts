import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kepitravel.app",
  appName: "Kepi Travel",
  webDir: "out",

  /**
   * The native WKWebView loads from the kepitravel.com production URL so users
   * always get the latest web code without requiring an App Store update.
   *
   * For local dev against a Mac dev server set CAPACITOR_DEV_SERVER_URL, e.g.:
   *   CAPACITOR_DEV_SERVER_URL=http://192.168.1.x:3000 npx cap run ios
   */
  server: {
    url: process.env.CAPACITOR_DEV_SERVER_URL ?? "https://kepitravel.com",
    cleartext: false,
    allowNavigation: [
      "kepitravel.com",
      "*.kepitravel.com",
      "*.clerk.com",
      "*.clerk.accounts.dev",
    ],
  },

  ios: {
    /** Light Apple chrome — matches G21 consumer Home after splash */
    backgroundColor: "#F5F5F7",
    contentInset: "automatic",
    scrollEnabled: true,
    /**
     * Must stay false. App-bound-only kepitravel.com blocks Clerk
     * (clerk.accounts.dev) and the WKWebView paints blank.
     */
    limitsNavigationsToAppBoundDomains: false,
  },

  experimental: {
    ios: {
      spm: {
        /**
         * Capacitor 8 default. Do NOT set 6.0 — it can break CapApp-SPM
         * manifest compilation ("Missing or empty JSON output from
         * manifest compilation for capapp-spm") on Xcode 26.
         */
        swiftToolsVersion: "5.9",
        /**
         * If `npx cap sync ios` re-adds plugins, symlink them instead of
         * embedding ../../../node_modules paths. Then run `npm run ios:fix`
         * to restore remote-only CapApp-SPM until SPM is stable.
         */
        packageOptions: {
          "@capacitor/haptics": { symlink: true },
          "@capacitor/local-notifications": { symlink: true },
          "@capacitor/push-notifications": { symlink: true },
          "@capacitor/status-bar": { symlink: true },
        },
      },
    },
  },

  plugins: {
    SplashScreen: {
      /**
       * Kepi splash: gold "K" on deep navy (G4), then light WKWebView (G21).
       * SplashTransition.tsx handles the in-app fade after hydration.
       */
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#F5F5F7",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    StatusBar: {
      /** Dark icons on light G21 chrome (Capacitor Style.Dark = dark glyphs) */
      style: "DARK",
      backgroundColor: "#F5F5F7",
      overlaysWebView: false,
    },

    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
