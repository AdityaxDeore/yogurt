import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
vi.mock('electron', () => ({ app: { getPreferredSystemLanguages: () => ['en-US'] }, ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => handlers.set(name, fn) }, BrowserWindow: {}, nativeTheme: {} }))
import { hookPreferences } from '../src/main/preferences'
import { loadSettings, normalizeVisibility, updateSettings, visibilityOf } from '../src/main/settings'

const dirs: string[] = []
afterEach(() => { dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); handlers.clear(); vi.restoreAllMocks() })

const hook = (file: string, setDockVisible: (...args: any[]) => any, setTrayVisible: (...args: any[]) => any) => {
  const deps = { file, permissions: {} as Parameters<typeof hookPreferences>[0]['permissions'], ask: false, setLogin: vi.fn(), loginOn: () => false, macName: () => 'Dana', relaunch: () => false, setTrayVisible, setDockVisible }
  hookPreferences(deps)
  return deps
}

it('defaults on, persists off across reloads, rejects non-booleans and applies changes immediately', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yogurt-dock-pref-')); dirs.push(dir)
  const file = join(dir, 'settings.json')
  const setDockVisible = vi.fn()
  hook(file, setDockVisible, vi.fn())
  const get = () => handlers.get('settings:get')!()
  const set = (value: unknown) => handlers.get('settings:dock')!(null, value)
  expect(get().showInDock).toBe(true)
  updateSettings(file, { openAtLogin: true })
  set(false)
  expect(loadSettings(file)).toMatchObject({ showInDock: false, openAtLogin: true })
  expect(setDockVisible).toHaveBeenLastCalledWith(false)
  hook(file, setDockVisible, vi.fn())
  expect(get().showInDock).toBe(false)
  for (const value of [null, 'true', 1, undefined]) set(value)
  expect(setDockVisible).toHaveBeenCalledTimes(1)
  set(true)
  expect(get().showInDock).toBe(true)
  expect(loadSettings(file).showInDock).toBeUndefined()
  expect(setDockVisible).toHaveBeenLastCalledWith(true)
})

it('refuses to hide the Dock while the menu bar icon is off, so an entry point always stays', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yogurt-dock-guard-a-')); dirs.push(dir)
  const file = join(dir, 'settings.json')
  const setDockVisible = vi.fn()
  const setTrayVisible = vi.fn()
  hook(file, setDockVisible, setTrayVisible)
  const setDock = (value: unknown) => handlers.get('settings:dock')!(null, value)
  const setMenuBar = (value: unknown) => handlers.get('settings:menu-bar')!(null, value)
  setMenuBar(false)
  expect(loadSettings(file)).toMatchObject({ showInMenuBar: false })
  setDock(false)
  expect(loadSettings(file).showInDock).toBeUndefined()
  expect(setDockVisible).not.toHaveBeenCalled()
  expect(handlers.get('settings:get')!().showInDock).toBe(true)
})

it('turning the menu bar off while the Dock is hidden brings the Dock back first, then hides the tray', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yogurt-dock-guard-b-')); dirs.push(dir)
  const file = join(dir, 'settings.json')
  const order: string[] = []
  const setDockVisible = vi.fn((on: boolean) => { order.push(`dock:${on}`) })
  const setTrayVisible = vi.fn((on: boolean) => { order.push(`tray:${on}`) })
  hook(file, setDockVisible, setTrayVisible)
  const setDock = (value: unknown) => handlers.get('settings:dock')!(null, value)
  const setMenuBar = (value: unknown) => handlers.get('settings:menu-bar')!(null, value)
  setDock(false)
  expect(order).toEqual(['dock:false'])
  order.splice(0)
  setMenuBar(false)
  expect(order).toEqual(['dock:true', 'tray:false'])
  expect(loadSettings(file)).toMatchObject({ showInMenuBar: false })
  expect(loadSettings(file).showInDock).toBeUndefined()
  expect(handlers.get('settings:get')!()).toMatchObject({ showInMenuBar: false, showInDock: true })
})

it('heals a settings file with no visible entry point: the Dock comes back', () => {
  expect(visibilityOf({})).toEqual({ showInMenuBar: true, showInDock: true })
  expect(visibilityOf({ showInDock: false })).toEqual({ showInMenuBar: true, showInDock: false })
  expect(visibilityOf({ showInMenuBar: false })).toEqual({ showInMenuBar: false, showInDock: true })
  expect(visibilityOf({ showInMenuBar: false, showInDock: false })).toEqual({ showInMenuBar: false, showInDock: true })
  expect(normalizeVisibility(false, false)).toEqual({ showInMenuBar: false, showInDock: true })
  expect(normalizeVisibility(true, false)).toEqual({ showInMenuBar: true, showInDock: false })
})
