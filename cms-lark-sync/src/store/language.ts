import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Lang = 'vi' | 'en'

interface LangState {
  lang: Lang
  toggle: () => void
}

const useLang = create<LangState>()(
  persist(
    (set, get) => ({
      lang: 'vi',
      toggle: () => set({ lang: get().lang === 'vi' ? 'en' : 'vi' }),
    }),
    { name: 'hn-lang' },
  ),
)

export default useLang
