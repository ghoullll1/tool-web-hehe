import { createContext, useContext } from 'react'

export type Edition = 'classic' | 'modern'
export type MotionLevel = 'full' | 'lite' | 'off'
export const APPEARANCE_KEY = 'tool-web.appearance.v2'
export const LEGACY_APPEARANCE_KEY = 'tool-web.appearance.v1'
export interface Appearance {
  edition: Edition
  motion: MotionLevel
  effectiveMotion: MotionLevel
  systemReduced: boolean
  reducedMotion: boolean
  setEdition: (edition: Edition) => void
  setMotion: (level: MotionLevel) => void
}
export const AppearanceContext = createContext<Appearance>({
  edition: 'modern', motion: 'full', effectiveMotion: 'full', reducedMotion: false, systemReduced: false,
  setEdition: () => {}, setMotion: () => {},
})
export const useAppearance = () => useContext(AppearanceContext)
