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
          dark1: "#054640",
          dark2: "#005d4b",
          dark3: "#06625f",
          gray1: "#bbbbbb",
          gray2: "#aaaaaa",
        },
      },
    },
  },
  plugins: [],
};
