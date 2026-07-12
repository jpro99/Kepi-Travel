import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kepi.travelassistant",
  appName: "Kepi Travel",
  webDir: "out",
  // Native shell loads production until CAPACITOR_BUILD static export is wired (middleware blocks export today).
  server: {
    url: "https://kepitravel.com/travel-assistant",
    cleartext: false,
  },
};

export default config;
