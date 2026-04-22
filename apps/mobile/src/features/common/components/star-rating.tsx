import Star from 'lucide-react-native/dist/esm/icons/star'
import * as React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { colors } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface StarRatingProps {
  value: number
  maxStars?: number
  size?: number
  readOnly?: boolean
  onChange?: (rating: number) => void
}

export function StarRating({ value, maxStars = 5, size = 18, readOnly = true, onChange }: StarRatingProps) {
  const { semantic } = useTheme()

  return (
    <View style={styles.container}>
      {Array.from({ length: maxStars }, (_, i) => {
        const starValue = i + 1
        const filled = starValue <= Math.round(value)

        const starIcon = (
          <Star
            size={size}
            color={filled ? colors.earth[400] : semantic.borderNormal}
            fill={filled ? colors.earth[400] : 'none'}
            strokeWidth={filled ? 0 : 1.5}
            style={styles.star}
          />
        )

        if (readOnly) {
          return <React.Fragment key={i}>{starIcon}</React.Fragment>
        }

        return (
          <TouchableOpacity
            key={i}
            onPress={() => onChange?.(starValue)}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}
            accessibilityLabel={`${starValue} étoile${starValue > 1 ? 's' : ''}`}
            accessibilityRole="button"
          >
            {starIcon}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center' },
  star: { marginRight: 2 },
})
