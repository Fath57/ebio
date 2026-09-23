import type { AssistantCartLine } from '../assistant'
import ArrowUp from 'lucide-react-native/dist/esm/icons/arrow-up'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { sendTurn } from '../assistant'
import { AssistantCartPanel } from './assistant-cart-panel'

/**
 * Ce qu'on peut dire pour commencer.
 *
 * Un écran vide ne dit pas ce qu'il accepte. Trois exemples, pas huit : on les
 * lit, on n'en choisit pas un dans un catalogue.
 */
const OPENERS = [
  'Je cherche du gari avec de l\'huile rouge',
  'Il me faut des tomates et du piment',
  'Où en est ma commande ?',
]

interface Exchange {
  id: string
  /** What the buyer said, written down — a mis-heard word must be visible at once. */
  said: string
  /** What the assistant answered, absent while it is still thinking. */
  answered: string | null
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
 * Rien n'anime : ce qui bouge sans rien dire détourne du panier et du total.
 */
export function AssistantScreen({ onGoBack, onOrder }: AssistantScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [cart, setCart] = useState<AssistantCartLine[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(true)

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [])

  const speak = useCallback(async (message: string) => {
    const text = message.trim()
    if (text.length === 0 || thinking) {
      return
    }

    setDraft('')
    setError(null)
    // What was said appears before the answer: the buyer checks the
    // transcription while the assistant is still working.
    setExchanges(previous => [...previous, { id: `${Date.now()}-${previous.length}`, said: text, answered: null }])
    setThinking(true)
    scrollToEnd()

    try {
      const turn = await sendTurn(text, sessionId)
      setSessionId(turn.sessionId)
      setCart(turn.cart)
      setExchanges(previous => previous.map((exchange, index) =>
        index === previous.length - 1 ? { ...exchange, answered: turn.reply } : exchange))
    }
    catch (caught) {
      // The turn is dropped rather than left hanging: a half-built cart that
      // nobody confirmed is worse than a conversation that stops and says so.
      setExchanges(previous => previous.slice(0, -1))
      setDraft(text)
      setError(caught instanceof Error ? caught.message : 'L\'assistant ne répond pas.')
    }
    finally {
      setThinking(false)
      scrollToEnd()
    }
  }, [scrollToEnd, sessionId, thinking])

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
        subtitle={thinking ? 'Il cherche…' : 'Dites-lui ce qu\'il vous faut'}
        onBack={onGoBack}
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
              <Text style={[styles.openingTitle, { color: semantic.textPrimary }]}>
                Dites-moi ce qu'il vous faut.
              </Text>
              <Text style={[styles.openingBody, { color: semantic.textSecondary }]}>
                Je cherche dans les boutiques près de vous, je monte le panier,
                et vous confirmez le paiement vous-même.
              </Text>
              <View style={styles.openers}>
                {OPENERS.map(opener => (
                  <Pressable
                    key={opener}
                    style={[styles.opener, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgSurface }]}
                    onPress={() => speak(opener)}
                    accessibilityRole="button"
                    accessibilityLabel={`Demander : ${opener}`}
                  >
                    <Text style={[styles.openerText, { color: semantic.textPrimary }]}>{opener}</Text>
                  </Pressable>
                ))}
              </View>
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
          <TextInput
            style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgPage, borderColor: semantic.borderNormal }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Écrivez ce qu'il vous faut…"
            placeholderTextColor={semantic.textTertiary}
            multiline
            editable={!thinking}
            onSubmitEditing={() => speak(draft)}
            accessibilityLabel="Votre message pour l'assistant"
          />
          <Pressable
            style={[styles.send, draft.trim().length === 0 && styles.sendIdle]}
            onPress={() => speak(draft)}
            disabled={thinking || draft.trim().length === 0}
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
          >
            {thinking
              ? <ActivityIndicator size="small" color={colors.neutral[0]} />
              : <ArrowUp size={22} color={colors.neutral[0]} strokeWidth={2.6} />}
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
  opening: {
    gap: spacing[3],
    paddingTop: spacing[6],
  },
  openingTitle: {
    ...typography.h2,
  },
  openingBody: {
    ...typography.bodyL,
  },
  openers: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  opener: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  openerText: {
    ...typography.bodyS,
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
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
})
