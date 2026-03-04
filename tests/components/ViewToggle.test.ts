import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ViewToggle from '../../src/components/ViewToggle.vue'
import { IonicVue } from '@ionic/vue'

describe('ViewToggle.vue', () => {
  it('renders correctly', () => {
    const wrapper = mount(ViewToggle, {
      global: { plugins: [IonicVue] },
      props: { modelValue: 'list' },
    })

    expect(wrapper.exists()).toBe(true)
    const segment = wrapper.find('ion-segment')
    expect(segment.exists()).toBe(true)
  })

  it('emits update:modelValue when changed', async () => {
    const wrapper = mount(ViewToggle, {
      global: { plugins: [IonicVue] },
      props: { modelValue: 'list' },
    })

    const segment = wrapper.find('ion-segment')
    await segment.trigger('ionChange', { detail: { value: 'calendar' } })

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['calendar'])
  })
})
