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
    /** Deep navy — visible before the WKWebView finishes painting */
    backgroundColor: "#0b1f3a",
    contentInset: "automatic",
    scrollEnabled: false,
    overrideUserInterfaceStyle: "automatic",
    /** Restrict outbound navigation to our own origin */
    limitsNavigationsToAppBoundDomains: true,
  },

  experimental: {
    ios: {
      spm: {
        /** Xcode 16+/26 SPM manifest needs Swift tools 6+ */
        swiftToolsVersion: "6.0",
      },
    },
  },

  plugins: {
    SplashScreen: {
      /**
       * Kepi splash: gold "K" on deep navy.
       * Replace ios/App/App/Assets.xcassets/Splash.imageset with a
       * 2732×2732 gold-K-on-#0b1f3a PNG before building in Xcode.
       * SplashTransition.tsx handles the in-app fade after hydration.
       */
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#0b1f3a",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    StatusBar: {
      /** Light (white icons) on our navy background */
      style: "LIGHT",
      backgroundColor: "#0b1f3a",
      overlaysWebView: false,
    },

    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
