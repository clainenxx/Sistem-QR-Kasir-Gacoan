/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#201A17',      // teks utama / bg gelap
        cream: '#FBF3E7',    // bg terang / plate
        sambal: '#D64545',   // aksen utama (chili red)
        turmeric: '#E7A93E', // aksen kedua (CTA / highlight)
        daun: '#4C6B4F',     // sukses / status "paid"
        char: '#6B5B4D',     // teks sekunder / muted brown
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['"Work Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
