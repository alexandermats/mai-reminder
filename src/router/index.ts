import { createRouter, createWebHashHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import SettingsPage from '../views/SettingsPage.vue'
import OverlayPage from '../views/OverlayPage.vue'
import SnoozeOverlayPage from '../views/SnoozeOverlayPage.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: HomePage,
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsPage,
  },
  {
    path: '/overlay',
    name: 'Overlay',
    component: OverlayPage,
  },
  {
    path: '/snooze-overlay',
    name: 'SnoozeOverlay',
    component: SnoozeOverlayPage,
  },
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL || '/'),
  routes,
})

export default router
