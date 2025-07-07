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
    },
  },
  plugins: [],
};
