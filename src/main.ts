import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { IonicVue } from '@ionic/vue'
import router from './router'
import App from './App.vue'
import { i18n } from './plugins/i18n'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'

const app = createApp(App).use(IonicVue).use(createPinia()).use(router).use(i18n)

router
  .isReady()
  .then(() => {
    app.mount('#app')
  })
  .catch((error) => {
    console.error('Router initialization failed:', error)
  })
