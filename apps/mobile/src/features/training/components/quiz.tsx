import * as React from 'react'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'

interface QuizQuestion {
  id: string
  text: string
  options: QuizOption[]
  correctAnswer: string
}

interface QuizOption {
  id: string
  label: string
  imageUrl?: string
}

interface QuizProps {
  moduleId: string
  questions: QuizQuestion[]
  onComplete?: (score: number, passed: boolean) => void
}

interface QuizResult {
  score: number
  passed: boolean
  badgeAwarded: boolean
}

export function Quiz({ moduleId, questions, onComplete }: QuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentQuestion = questions[currentIndex]
  const isLastQuestion = currentIndex === questions.length - 1
  const hasAnsweredCurrent = currentQuestion
    ? answers[currentQuestion.id] !== undefined
    : false

  function handleSelectAnswer(questionId: string, optionId: string): void {
    setAnswers(prev => ({ ...prev, [questionId]: optionId }))
  }

  function handleNext(): void {
    if (!isLastQuestion) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  async function handleSubmit(): Promise<void> {
    setIsSubmitting(true)
    try {
      const formattedAnswers = questions.map(q => ({
        questionId: q.id,
        selectedOption: answers[q.id] ?? '',
      }))

      const res = await apiFetch(`/api/training/modules/${moduleId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ answers: formattedAnswers }),
      })

      if (res.ok) {
        const data: QuizResult = await res.json()
        setResult(data)
        onComplete?.(data.score, data.passed)
      }
    }
    catch {
      // Error handling
    }
    finally {
      setIsSubmitting(false)
    }
  }

  if (result) {
    return (
      <View style={styles.resultContainer}>
        <View
          style={[
            styles.resultCircle,
            result.passed ? styles.resultCirclePassed : styles.resultCircleFailed,
          ]}
        >
          <Text style={styles.resultScore}>
            {result.score}
            %
          </Text>
        </View>
        <Text style={styles.resultTitle}>
          {result.passed ? 'Felicitations !' : 'Dommage...'}
        </Text>
        <Text style={styles.resultDescription}>
          {result.passed
            ? 'Vous avez reussi le quiz et obtenu votre badge.'
            : 'Score minimum requis : 60%. Vous pouvez reessayer.'}
        </Text>
        {result.badgeAwarded && (
          <View style={styles.badgeCard}>
            <Text style={styles.badgeIcon}>*</Text>
            <Text style={styles.badgeText}>Badge debloque !</Text>
          </View>
        )}
      </View>
    )
  }

  if (!currentQuestion) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Aucune question disponible</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          Question
          {' '}
          {currentIndex + 1}
          /
          {questions.length}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / questions.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* Question */}
      <Text style={styles.questionText}>{currentQuestion.text}</Text>

      {/* Pictographic options */}
      <View style={styles.optionsGrid}>
        {currentQuestion.options.map((option) => {
          const isSelected = answers[currentQuestion.id] === option.id
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => handleSelectAnswer(currentQuestion.id, option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
            >
              {option.imageUrl
                ? (
                    <Image
                      source={{ uri: option.imageUrl }}
                      style={styles.optionImage}
                      resizeMode="contain"
                    />
                  )
                : (
                    <View style={styles.optionImagePlaceholder}>
                      <Text style={styles.optionImagePlaceholderText}>
                        {option.label.charAt(0)}
                      </Text>
                    </View>
                  )}
              <Text
                style={[
                  styles.optionLabel,
                  isSelected && styles.optionLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Navigation */}
      <View style={styles.navigationRow}>
        {currentIndex > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setCurrentIndex(prev => prev - 1)}
            accessibilityLabel="Question precedente"
          >
            <Text style={styles.backButtonText}>Precedent</Text>
          </TouchableOpacity>
        )}

        {isLastQuestion
          ? (
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!hasAnsweredCurrent || isSubmitting) && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!hasAnsweredCurrent || isSubmitting}
                accessibilityLabel="Valider le quiz"
              >
                {isSubmitting
                  ? (
                      <ActivityIndicator size="small" color={colors.neutral[0]} />
                    )
                  : (
                      <Text style={styles.submitButtonText}>Valider</Text>
                    )}
              </TouchableOpacity>
            )
          : (
              <TouchableOpacity
                style={[
                  styles.nextButton,
                  !hasAnsweredCurrent && styles.nextButtonDisabled,
                ]}
                onPress={handleNext}
                disabled={!hasAnsweredCurrent}
                accessibilityLabel="Question suivante"
              >
                <Text style={styles.nextButtonText}>Suivant</Text>
              </TouchableOpacity>
            )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[5],
    paddingBottom: spacing[10],
  },
  progressRow: {
    gap: spacing[1],
  },
  progressText: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
  },
  questionText: {
    ...typography.h2,
    color: colors.neutral[800],
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  optionCard: {
    width: '47%',
    minHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.neutral[200],
    padding: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.neutral[50],
  },
  optionCardSelected: {
    borderColor: colors.green[400],
    backgroundColor: colors.green[50],
  },
  optionImage: {
    width: 64,
    height: 64,
  },
  optionImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionImagePlaceholderText: {
    fontFamily: fonts.sansBd,
    fontSize: 24,
    color: colors.neutral[400],
  },
  optionLabel: {
    ...typography.bodyS,
    color: colors.neutral[600],
    textAlign: 'center',
  },
  optionLabelSelected: {
    color: colors.green[800],
    fontFamily: fonts.sansSb,
  },
  navigationRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
  },
  backButton: {
    minHeight: 44,
    paddingHorizontal: spacing[5],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  backButtonText: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.neutral[600],
  },
  nextButton: {
    minHeight: 44,
    flex: 1,
    paddingHorizontal: spacing[5],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  submitButton: {
    minHeight: 44,
    flex: 1,
    paddingHorizontal: spacing[5],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  // Result screen
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
    gap: spacing[4],
    backgroundColor: colors.neutral[0],
  },
  resultCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultCirclePassed: {
    backgroundColor: colors.green[50],
  },
  resultCircleFailed: {
    backgroundColor: colors.coral[50],
  },
  resultScore: {
    fontFamily: fonts.sansBd,
    fontSize: 36,
    color: colors.green[600],
  },
  resultTitle: {
    ...typography.h1,
    color: colors.neutral[800],
    textAlign: 'center',
  },
  resultDescription: {
    ...typography.bodyL,
    color: colors.neutral[600],
    textAlign: 'center',
  },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.green[50],
    borderWidth: 1,
    borderColor: colors.green[200],
  },
  badgeIcon: {
    fontSize: 24,
    color: colors.green[600],
  },
  badgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.green[800],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodyS,
    color: colors.neutral[400],
  },
})
