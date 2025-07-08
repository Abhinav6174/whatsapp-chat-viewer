/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      height: {
        "chat-sm": "calc(92vh - 80px)",
        "chat-md": "calc(80vh - 120px)",
        "chat-lg": "77vh",
      },
      colors: {
        whats: {
          // Primary WhatsApp Greens
          primary: "#25D366", // WhatsApp brand green
          dark1: "#054640", // Deep green
          dark2: "#005d4b", // Button hover
          dark3: "#06625f", // Border / accent
          light: "#DCF8C6", // Incoming chat bubble

          // Grays
          gray1: "#bbbbbb", // Border / subtle text
          gray2: "#aaaaaa", // Lighter gray
          gray3: "#3B4A54", // Header dark text
          gray4: "#f0f0f0", // Chat background

          // Backgrounds
          bg: "#e5ddd5", // Main chat bg
          bg2: "#f7f7f7", // Light panel bg
          panel: "#111b21", // Sidebar dark

          // Messages
          msgIn: "#ffffff", // Received message bubble
          msgOut: "#dcf8c6", // Sent message bubble

          // Status/Links
          link: "#34B7F1", // Links or clickable text
          success: "#00e676", // Delivered, success
          alert: "#ff5252", // Error or failure
        },
      },
    },
  },
  plugins: [],
};
