import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { IonicVue } from '@ionic/vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from '../src/App.vue'
import { createPinia, setActivePinia } from 'pinia'

describe('App Smoke Test', () => {
  // ...
  it('renders app root', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const mockRouter = createRouter({
      history: createWebHistory(),
      routes: [],
    })

    const wrapper = mount(App, {
      global: {
        plugins: [IonicVue, mockRouter, pinia],
      },
    })

    await mockRouter.isReady()

    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('ion-app').exists()).toBe(true)
  })
})
