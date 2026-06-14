// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    // A chave apiToken vai puxar o valor automaticamente do process.env.BASELINKER_TOKEN
    apiToken: process.env.BASELINKER_TOKEN, 
    
    public: {
      // Se você tivesse variáveis que precisassem ir para o Front-end (como a URL do seu site), elas ficariam aqui dentro.
    }
  },
  devtools: { enabled: true }
})
