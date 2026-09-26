import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

const STORAGE_KEY = 'push_consent'

/** Long enough that a second ask is a new conversation, not a nag. */
const ASK_AGAIN_AFTER_DAYS = 14

/** Three refusals are an answer. */
const MAX_ASKS = 3

interface ConsentState {
  asks: number
  lastAskedAt: string | null
  /** Set when the buyer accepted our own prompt; the system was then asked once. */
  accepted: boolean
}

const NEVER_ASKED: ConsentState = { asks: 0, lastAskedAt: null, accepted: false }

async function read(): Promise<ConsentState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return NEVER_ASKED
    }
    const parsed = JSON.parse(raw) as Partial<ConsentState>
    return {
      asks: typeof parsed.asks === 'number' ? parsed.asks : 0,
      lastAskedAt: typeof parsed.lastAskedAt === 'string' ? parsed.lastAskedAt : null,
      accepted: parsed.accepted === true,
    }
  }
  catch {
    // A consent we cannot read is a consent we never had.
    return NEVER_ASKED
  }
}

async function write(state: ConsentState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  catch {
    // Worst case we ask once more than we meant to.
  }
}

/**
 * Whether it is worth asking, in our own words.
 *
 * Never when the system has already answered — granted or denied. Android 13
 * and later make a refusal final, so the only prompt worth spending is one
 * asked at a moment the buyer understands. Between two asks, a fortnight;
 * after three refusals, silence.
 */
export async function shouldAskForPush(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false
  }
  const { status, canAskAgain } = await Notifications.getPermissionsAsync()
  if (status === 'granted' || !canAskAgain) {
    return false
  }

  const state = await read()
  if (state.accepted || state.asks >= MAX_ASKS) {
    return false
  }
  if (state.lastAskedAt === null) {
    return true
  }
  const since = Date.now() - new Date(state.lastAskedAt).getTime()
  return since > ASK_AGAIN_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/** Remember that we asked, and what was answered. */
export async function recordAsk(accepted: boolean): Promise<void> {
  const state = await read()
  await write({
    asks: state.asks + 1,
    lastAskedAt: new Date().toISOString(),
    accepted,
  })
}
