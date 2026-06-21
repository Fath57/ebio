import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ChatScreen } from './chat-screen'

interface ChatDetailScreenProps {
  conversationId: string
  currentUserId: string
  peerName?: string
  isSupplier?: boolean
  onGoBack: () => void
}

export function ChatDetailScreen({ conversationId, currentUserId, peerName, isSupplier = false, onGoBack }: ChatDetailScreenProps) {
  const { semantic } = useTheme()
  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <View style={[styles.header, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
        <TouchableOpacity onPress={onGoBack} hitSlop={8}>
          <ArrowLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: semantic.textPrimary }]} numberOfLines={1}>
          {peerName ?? 'Conversation'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ChatScreen
        conversationId={conversationId}
        currentUserId={currentUserId}
        isSupplier={isSupplier}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  title: { ...typography.h3, flex: 1, textAlign: 'center' },
})
