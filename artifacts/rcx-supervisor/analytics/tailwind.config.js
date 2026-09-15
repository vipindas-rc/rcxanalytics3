import springTheme from '@ringcentral/spring-theme/tailwind'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './node_modules/@ringcentral/spring-ui/**/*.js'],
  plugins: [springTheme({ override: false })],
  springui: {
    base: true,
    components: { full: true },
    utilities: true,
  },
}
