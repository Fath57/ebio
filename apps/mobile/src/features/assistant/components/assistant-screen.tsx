import type { AssistantCartLine } from '../assistant'
import { useAudioPlayer } from 'expo-audio'
import ArrowUp from 'lucide-react-native/dist/esm/icons/arrow-up'
import Keyboard from 'lucide-react-native/dist/esm/icons/keyboard'
import Volume2 from 'lucide-react-native/dist/esm/icons/volume-2'
import VolumeX from 'lucide-react-native/dist/esm/icons/volume-x'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { discardSpoken, speak, streamTurn, transcribe } from '../assistant'
import { ASSISTANT_AVATAR } from '../avatar'
import { AssistantCartPanel } from './assistant-cart-panel'
import { AssistantVoiceButton } from './assistant-voice-button'

interface Exchange {
  id: string
  /** What the buyer said, written down — a mis-heard word must be visible at once. */
  said: string
  /** What the assistant answered, growing sentence by sentence as it arrives. */
  answered: string | null
}

/**
 * Ce que fait l'assistant, en un coup d'œil.
 *
 * Trois états et pas davantage : il écoute, il cherche, il parle. Un assistant
 * dont on ne sait pas s'il écoute est un assistant qu'on interrompt au mauvais
 * moment.
 */
type Activity = 'idle' | 'hearing' | 'thinking' | 'speaking'

const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: 'Dites-lui ce qu\'il vous faut',
  hearing: 'Il met vos mots par écrit…',
  thinking: 'Il cherche…',
  speaking: 'Il répond…',
}

interface AssistantScreenProps {
  onGoBack: () => void
  /** Hands the finished cart to the ordinary checkout. */
  onOrder: (cart: AssistantCartLine[]) => void
}

/**
 * L'assistant, en conversation.
 *
 * L'écran n'est pas un décor : la voix ne laisse aucune trace, donc tout ce qui
 * a été compris s'écrit — ce qu'on a dit, ce qu'il a répondu, ce qu'il a mis
 * dans le panier et ce que ça coûte. C'est ce qui rend l'échange vérifiable.
 *
 * La réponse s'affiche phrase par phrase, au rythme où le serveur la vérifie :
 * on n'attend pas la fin du tour pour lire le début.
 */
export function AssistantScreen({ onGoBack, onOrder }: AssistantScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const stopStream = useRef<(() => void) | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [cart, setCart] = useState<AssistantCartLine[]>([])
  const [draft, setDraft] = useState('')
  const [activity, setActivity] = useState<Activity>('idle')
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(true)
  const [typing, setTyping] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)

  const [spokenUri, setSpokenUri] = useState<string | null>(null)
  const player = useAudioPlayer(spokenUri === null ? null : { uri: spokenUri })

  const busy = activity !== 'idle'

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [])

  // The stream is cut when the screen goes: an abandoned turn would keep
  // costing for an answer nobody will read.
  useEffect(() => {
    return () => {
      stopStream.current?.()
    }
  }, [])

  /** Reads the finished answer aloud, when the voice is on. */
  const readAloud = useCallback(async (text: string) => {
    if (!voiceOn || text.trim().length === 0) {
      return
    }
    const uri = await speak(text)
    if (uri !== null) {
      setSpokenUri((previous) => {
        discardSpoken(previous)
        return uri
      })
    }
  }, [voiceOn])

  useEffect(() => {
    if (spokenUri !== null) {
      player.play()
    }
  }, [player, spokenUri])

  const send = useCallback((message: string) => {
    const text = message.trim()
    if (text.length === 0 || busy) {
      return
    }

    setDraft('')
    setError(null)
    const id = `${Date.now()}-${Math.random()}`
    // What was said appears before the answer: the buyer checks the
    // transcription while the assistant is still working.
    setExchanges(previous => [...previous, { id, said: text, answered: null }])
    setActivity('thinking')
    scrollToEnd()

    const update = (change: (exchange: Exchange) => Exchange): void => {
      setExchanges(previous => previous.map(exchange => exchange.id === id ? change(exchange) : exchange))
    }

    stopStream.current = streamTurn(text, sessionId, (event) => {
      switch (event.type) {
        case 'session':
          setSessionId(event.sessionId)
          break
        case 'phrase':
          setActivity('speaking')
          update(exchange => ({
            ...exchange,
            answered: exchange.answered === null ? event.text : `${exchange.answered} ${event.text}`,
          }))
          scrollToEnd()
          break
        case 'cart':
          setCart(event.cart)
          break
        case 'reset':
          // The server took back what it had started saying: clear it rather
          // than leave a half-sentence that no longer leads anywhere.
          update(exchange => ({ ...exchange, answered: null }))
          break
        case 'done':
          setCart(event.cart)
          update(exchange => ({ ...exchange, answered: event.reply }))
          setActivity('idle')
          void readAloud(event.reply)
          scrollToEnd()
          break
        case 'error':
          // The turn is dropped rather than left hanging: a half-built cart
          // that nobody confirmed is worse than a conversation that stops.
          setExchanges(previous => previous.filter(exchange => exchange.id !== id))
          setDraft(text)
          setError(event.message)
          setActivity('idle')
          break
      }
    })
  }, [busy, readAloud, scrollToEnd, sessionId])

  /** A recording becomes text, shown first, then sent. */
  const onRecorded = useCallback(async (uri: string) => {
    setActivity('hearing')
    setError(null)
    try {
      const heard = await transcribe(uri)
      if (heard.length === 0) {
        setActivity('idle')
        setError('Je n\'ai rien entendu. Réessayez ?')
        return
      }
      setActivity('idle')
      send(heard)
    }
    catch (caught) {
      setActivity('idle')
      setError(caught instanceof Error ? caught.message : 'Je n\'ai pas pu vous entendre.')
    }
  }, [send])

  const changeQuantity = useCallback(async (productId: string, quantity: number) => {
    if (!sessionId || adjusting) {
      return
    }

    setAdjusting(true)
    try {
      const res = await apiFetch(`/api/assistant/${sessionId}/cart`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produitId: productId, quantite: Math.max(0, quantity) }),
      })
      if (res.ok) {
        const data = await res.json() as { cart: AssistantCartLine[] }
        setCart(data.cart)
      }
      else {
        setError('La correction n\'a pas été enregistrée.')
      }
    }
    catch {
      setError('La correction n\'a pas été enregistrée.')
    }
    finally {
      setAdjusting(false)
    }
  }, [adjusting, sessionId])

  const empty = exchanges.length === 0

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="Assistant"
        subtitle={ACTIVITY_LABEL[activity]}
        onBack={onGoBack}
        leadingSlot={<Image source={ASSISTANT_AVATAR} style={styles.headerAvatar} accessible={false} />}
        rightSlot={(
          <Pressable
            onPress={() => setVoiceOn(on => !on)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ checked: voiceOn }}
            accessibilityLabel={voiceOn ? 'Couper la voix' : 'Activer la voix'}
          >
            {voiceOn
              ? <Volume2 size={22} color={semantic.textSecondary} strokeWidth={2.2} />
              : <VolumeX size={22} color={semantic.textTertiary} strokeWidth={2.2} />}
          </Pressable>
        )}
      />

      <KeyboardAwareView style={styles.body} iosOffset={insets.top + 56}>
        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {empty && (
            <View style={styles.opening}>
              <Image source={ASSISTANT_AVATAR} style={styles.openingAvatar} accessible={false} />
              <Text style={[styles.openingTitle, { color: semantic.textPrimary }]}>
                Dites-moi ce qu'il vous faut.
              </Text>
              <Text style={[styles.openingBody, { color: semantic.textSecondary }]}>
                Je cherche dans les boutiques près de vous, je monte le panier,
                et vous confirmez le paiement vous-même.
              </Text>
            </View>
          )}

          {exchanges.map(exchange => (
            <View key={exchange.id} style={styles.exchange}>
              <View style={styles.saidRow}>
                <View style={styles.said}>
                  <Text style={styles.saidText}>{exchange.said}</Text>
                </View>
              </View>

              {exchange.answered === null
                ? (
                    <View style={styles.pending} accessibilityLabel="L'assistant cherche">
                      <ActivityIndicator size="small" color={colors.green[400]} />
                      <Text style={[styles.pendingText, { color: semantic.textTertiary }]}>Il cherche…</Text>
                    </View>
                  )
                : (
                    <Text style={[styles.answered, { color: semantic.textPrimary }]}>{exchange.answered}</Text>
                  )}
            </View>
          ))}

          {error !== null && (
            <Text style={styles.error} accessibilityRole="alert">{error}</Text>
          )}
        </ScrollView>

        <AssistantCartPanel
          cart={cart}
          expanded={cartOpen}
          onToggle={() => setCartOpen(open => !open)}
          onChangeQuantity={changeQuantity}
          onOrder={() => onOrder(cart)}
          busy={adjusting}
        />

        <View style={[
          styles.composer,
          { backgroundColor: semantic.bgSurface, borderTopColor: semantic.borderLight, paddingBottom: Math.max(insets.bottom, spacing[3]) },
        ]}
        >
          {typing
            ? (
                <View style={styles.typeRow}>
                  <TextInput
                    style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgPage, borderColor: semantic.borderNormal }]}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Écrivez ce qu'il vous faut…"
                    placeholderTextColor={semantic.textTertiary}
                    multiline
                    autoFocus
                    editable={!busy}
                    onSubmitEditing={() => send(draft)}
                    accessibilityLabel="Votre message pour l'assistant"
                  />
                  <Pressable
                    style={[styles.send, draft.trim().length === 0 && styles.sendIdle]}
                    onPress={() => send(draft)}
                    disabled={busy || draft.trim().length === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Envoyer"
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                      : <ArrowUp size={22} color={colors.neutral[0]} strokeWidth={2.6} />}
                  </Pressable>
                </View>
              )
            : (
                <AssistantVoiceButton
                  onRecorded={uri => void onRecorded(uri)}
                  onError={setError}
                  disabled={busy}
                />
              )}

          {/* Écrire au lieu de parler : pour un mot que la transcription
            * n'attrape pas, ou là où l'on ne peut pas parler. */}
          <Pressable
            style={styles.switchMode}
            onPress={() => setTyping(mode => !mode)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={typing ? 'Parler plutôt qu\'écrire' : 'Écrire plutôt que parler'}
          >
            <Keyboard size={18} color={semantic.textTertiary} strokeWidth={2.2} />
            <Text style={[styles.switchModeText, { color: semantic.textTertiary }]}>
              {typing ? 'Parler' : 'Écrire'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    padding: spacing[4],
    gap: spacing[5],
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
  },
  opening: {
    alignItems: 'center',
    gap: spacing[3],
    paddingTop: spacing[6],
  },
  openingAvatar: {
    width: 112,
    height: 112,
    borderRadius: radius.pill,
    marginBottom: spacing[1],
  },
  openingTitle: {
    ...typography.h2,
    textAlign: 'center',
  },
  openingBody: {
    ...typography.bodyL,
    textAlign: 'center',
  },
  exchange: {
    gap: spacing[3],
  },
  saidRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  // What the buyer said carries a background; the answer does not. The eye
  // finds its own words, and the assistant reads as the page itself.
  said: {
    maxWidth: '85%',
    backgroundColor: colors.green[600],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.xs,
  },
  saidText: {
    ...typography.bodyS,
    color: colors.neutral[0],
  },
  answered: {
    ...typography.bodyL,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  pendingText: {
    ...typography.caption,
  },
  error: {
    ...typography.bodyS,
    color: colors.coral[600],
  },
  composer: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    gap: spacing[2],
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIdle: {
    backgroundColor: colors.neutral[400],
  },
  switchMode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 32,
  },
  switchModeText: {
    ...typography.caption,
  },
})
