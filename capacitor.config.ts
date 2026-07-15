import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kepitravel.app",
  appName: "Kepi Travel",
  webDir: "out",

  /**
   * When running in native iOS/Android context the app loads from the device
   * (the static export in `out/`). During local development on a physical device
   * set CAPACITOR_DEV_SERVER_URL to point to your Mac's IP so the WebView loads
   * live, e.g.  http://192.168.1.x:3000
   * In production leave this unset so the bundled web assets are used.
   */
  server: {
    url: process.env.CAPACITOR_DEV_SERVER_URL ?? undefined,
    cleartext: false,
    allowNavigation: ["kepitravel.com", "*.kepitravel.com", "*.clerk.com"],
  },

  ios: {
    /** Dark navy background — visible before web content paints */
    backgroundColor: "#0b1f3a",
    contentInset: "automatic",
    /** Scroll bounce is unnecessary for a fixed-viewport travel app */
    scrollEnabled: false,
    /** Let the app own the full screen; we handle safe areas in CSS */
    overrideUserInterfaceStyle: "automatic",
    limitsNavigationsToAppBoundDomains: true,
  },

  plugins: {
    SplashScreen: {
      /**
       * Splash screen: gold "K" on deep-navy background.
       * Replace splash.png with a 2732×2732 asset containing the Kepi mark.
       * launchShowDuration is kept short — SplashTransition.tsx handles the
       * in-app fade-in after the WebView is hydrated.
       */
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#0b1f3a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },

    StatusBar: {
      /** Use the light (white text) style on our navy splash/header */
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
