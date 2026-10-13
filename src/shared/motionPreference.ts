// Background motion preference (falling letters on menu screens).
// Modeled on HapticManager.ts: a singleton with init()/isEnabled()/setEnabled()
// backed by AsyncStorage, loaded once from app/_layout.tsx.
//
// This preference has two inputs, not one: the player's own toggle in
// Settings, and the OS-level Reduce Motion setting, which always wins
// regardless of the toggle. Resolved state is userEnabled && !reduceMotionEnabled.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';

const MOTION_ENABLED_KEY = 'wordgames_background_motion_enabled';

export interface MotionState {
  /** The player's own Settings toggle, independent of the OS setting. */
  userEnabled: boolean;
  /** Whether iOS Reduce Motion is currently on. */
  reduceMotionEnabled: boolean;
  /** What should actually render: userEnabled && !reduceMotionEnabled. */
  resolved: boolean;
}

type Listener = (state: MotionState) => void;

class MotionPreferenceClass {
  private userEnabled: boolean = true;
  private reduceMotionEnabled: boolean = false;
  private initialized: boolean = false;
  private listeners: Set<Listener> = new Set();

  /** Called once from app/_layout.tsx so it applies no matter which game the player opens first. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const stored = await AsyncStorage.getItem(MOTION_ENABLED_KEY);
      this.userEnabled = stored !== 'false'; // Default to true
    } catch (error) {
      console.warn('motionPreference: Failed to load settings', error);
      this.userEnabled = true;
    }

    try {
      this.reduceMotionEnabled = await AccessibilityInfo.isReduceMotionEnabled();
    } catch {
      this.reduceMotionEnabled = false;
    }

    AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled: boolean) => {
      this.reduceMotionEnabled = enabled;
      this.notify();
    });

    this.notify();
  }

  private state(): MotionState {
    return {
      userEnabled: this.userEnabled,
      reduceMotionEnabled: this.reduceMotionEnabled,
      resolved: this.userEnabled && !this.reduceMotionEnabled,
    };
  }

  /** What should actually render. Use this from a call site that just wants on/off. */
  isEnabled(): boolean {
    return this.userEnabled && !this.reduceMotionEnabled;
  }

  /** The player's own toggle value, for driving the Settings switch. */
  isUserEnabled(): boolean {
    return this.userEnabled;
  }

  isReduceMotionActive(): boolean {
    return this.reduceMotionEnabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.userEnabled = enabled;
    try {
      await AsyncStorage.setItem(MOTION_ENABLED_KEY, enabled.toString());
    } catch (error) {
      console.warn('motionPreference: Failed to save settings', error);
    }
    this.notify();
  }

  /** Subscribe to any change in resolved state, the toggle, or Reduce Motion. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.state();
    this.listeners.forEach((listener) => listener(state));
  }
}

export const MotionPreference = new MotionPreferenceClass();
