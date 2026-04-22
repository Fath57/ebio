import type { SearchResult } from '../hooks/use-search'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
} from 'react-native'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import Package from 'lucide-react-native/dist/esm/icons/package'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Search from 'lucide-react-native/dist/esm/icons/search'
import SearchX from 'lucide-react-native/dist/esm/icons/search-x'
import SlidersHorizontal from 'lucide-react-native/dist/esm/icons/sliders-horizontal'
import Store from 'lucide-react-native/dist/esm/icons/store'
import X from 'lucide-react-native/dist/esm/icons/x'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useOfflineSearch } from '../hooks/use-offline-search'
import { useAutocomplete, useCategories, useSearchProducts } from '../hooks/use-search'
import { FilterSheet } from './filter-sheet'
import { SlideIn, StaggerItem } from '../../../utils/animations'
import { SearchResultCard } from './search-result-card'
import { useSession } from '../../../lib/auth-client'
import { MapScreen } from '../../map/components/map-screen'
import { ViewToggle } from './view-toggle'

type ViewMode = 'list' | 'map'

interface SearchScreenProps {
  onNavigateToSupplier?: (supplierId: string) => void
}

export function SearchScreen({ onNavigateToSupplier }: SearchScreenProps = {}) {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const firstName = session?.user?.name?.split(' ')[0]
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    undefined,
  )
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [isFilterVisible, setIsFilterVisible] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchInputRef = useRef<TextInput>(null)

  const { results, loading, total, hasMore, search } = useSearchProducts()
  const { suggestions, autocomplete } = useAutocomplete()
  const { categories, loadCategories } = useCategories()
  const { searchHistory, addTerm, clearHistory } = useOfflineSearch()

  const [appliedFilters, setAppliedFilters] = useState({
    radius: undefined as number | undefined,
    categories: [] as string[],
    maxPrice: undefined as number | undefined,
    inStockOnly: true,
    minRating: 0,
    mode: 'ALL' as 'ALL' | 'CONTACT' | 'ORDER',
    validatedOnly: false,
  })

  // Default location (Dakar) — replaced by real geolocation in production
  const latitude = 14.6928
  const longitude = -17.4467

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const performSearch = useCallback(
    (overrides?: { q?: string, category?: string }) => {
      const q = overrides?.q ?? query
      const category = overrides?.category ?? selectedCategory

      search({
        q: q || undefined,
        latitude,
        longitude,
        radius: appliedFilters.radius !== undefined ? appliedFilters.radius * 1000 : undefined,
        category,
        maxPrice: appliedFilters.maxPrice,
        inStockOnly: appliedFilters.inStockOnly,
        minRating: appliedFilters.minRating > 0 ? appliedFilters.minRating : undefined,
        mode: appliedFilters.mode !== 'ALL' ? appliedFilters.mode : undefined,
        validatedOnly: appliedFilters.validatedOnly || undefined,
      })
    },
    [query, selectedCategory, appliedFilters, search, latitude, longitude],
  )

  useEffect(() => {
    performSearch()
  }, []) // Initial search on mount

  function handleSubmitSearch() {
    if (query.trim()) {
      addTerm(query.trim())
    }
    setIsSearchFocused(false)
    performSearch()
  }

  function handleSelectCategory(slug: string) {
    const newCategory
      = selectedCategory === slug ? undefined : slug
    setSelectedCategory(newCategory)
    performSearch({ category: newCategory })
  }

  function handleSelectSuggestion(text: string) {
    setQuery(text)
    setIsSearchFocused(false)
    addTerm(text)
    performSearch({ q: text })
  }

  function handleSelectHistoryTerm(term: string) {
    setQuery(term)
    setIsSearchFocused(false)
    performSearch({ q: term })
  }

  function handleCardPress(supplierId: string) {
    onNavigateToSupplier?.(supplierId)
  }

  function handleApplyFilters(filters: {
    radius: number | undefined
    categories: string[]
    maxPrice: number | undefined
    inStockOnly: boolean
    minRating: number
    mode: 'ALL' | 'CONTACT' | 'ORDER'
    validatedOnly: boolean
  }) {
    setAppliedFilters(filters)
    const category = filters.categories.length > 0 ? filters.categories[0] : selectedCategory
    if (filters.categories.length > 0) {
      setSelectedCategory(filters.categories[0])
    }
    // Pass filters directly to avoid stale closure
    search({
      q: query || undefined,
      latitude,
      longitude,
      radius: filters.radius !== undefined ? filters.radius * 1000 : undefined,
      category,
      maxPrice: filters.maxPrice,
      inStockOnly: filters.inStockOnly,
      minRating: filters.minRating > 0 ? filters.minRating : undefined,
      mode: filters.mode !== 'ALL' ? filters.mode : undefined,
      validatedOnly: filters.validatedOnly || undefined,
    })
  }

  function handleQueryChange(text: string) {
    setQuery(text)
    autocomplete(text, latitude, longitude)
  }

  function renderSearchResultItem({ item, index }: { item: SearchResult, index: number }) {
    return (
      <StaggerItem index={index}>
        <SearchResultCard item={item} onPress={handleCardPress} />
      </StaggerItem>
    )
  }

  function renderEmptyState() {
    if (loading)
      return null
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconCircle, { backgroundColor: colors.green[50] }]}>
          <SearchX size={48} color={colors.green[400]} />
        </View>
        <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>
          Aucun résultat
        </Text>
        <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
          Aucun fournisseur trouvé à proximité. Essayez d&apos;élargir votre
          rayon de recherche.
        </Text>
      </View>
    )
  }

  function renderHeader() {
    return (
      <View>
        {/* Category grid */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catGridContainer}
          style={styles.catGridScroll}
        >
          <View style={styles.catGrid}>
            {/* "All" chip */}
            <SlideIn from="left" delay={0}>
              <TouchableOpacity
                style={[
                  styles.catItem,
                  selectedCategory === undefined && styles.catItemActive,
                ]}
                onPress={() => {
                  setSelectedCategory(undefined)
                  performSearch({ category: undefined })
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCategory === undefined }}
                accessibilityLabel="Toutes les catégories"
              >
                <Package size={16} color={selectedCategory === undefined ? colors.green[600] : colors.neutral[400]} />
                <Text style={[
                  styles.catLabel,
                  selectedCategory === undefined && styles.catLabelActive,
                ]} numberOfLines={1}>
                  Tout
                </Text>
              </TouchableOpacity>
            </SlideIn>

            {categories.map((cat, index) => {
              const isActive = selectedCategory === cat.slug
              return (
                <SlideIn key={cat.id} from="left" delay={(index + 1) * 60}>
                  <TouchableOpacity
                    style={[
                      styles.catItem,
                      isActive && styles.catItemActive,
                    ]}
                    onPress={() => handleSelectCategory(cat.slug)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={cat.label}
                  >
                    {cat.imageUrl
                      ? <Image source={{ uri: cat.imageUrl }} style={styles.catImage} />
                      : <cat.fallbackIcon size={16} color={isActive ? colors.green[600] : colors.neutral[400]} />}
                    <Text style={[
                      styles.catLabel,
                      isActive && styles.catLabelActive,
                    ]} numberOfLines={1}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                </SlideIn>
              )
            })}
          </View>
        </ScrollView>

        {/* Results count */}
        {total > 0 && (
          <Text style={[styles.resultCount, { color: semantic.textSecondary }]}>
            {total}
            {' '}
            résultat
            {total > 1 ? 's' : ''}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgSurface }]}>
      {/* Search bar */}
      <View style={[styles.searchHeader, { backgroundColor: semantic.bgCard }]}>
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <View>
            <Text style={[styles.greetingText, { color: semantic.textTertiary }]}>
              {firstName ? `Bonjour, ${firstName}` : 'Bienvenue sur eBio'}
            </Text>
            <Text style={[styles.greetingTitle, { color: semantic.textPrimary }]}>
              Trouvez du bio près de vous
            </Text>
          </View>
        </View>
        <View style={styles.searchRow}>
          <View style={[styles.searchInputContainer, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}>
            <Search size={16} color={semantic.textTertiary} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: semantic.textPrimary }]}
              placeholder="Rechercher un produit, fournisseur..."
              placeholderTextColor={semantic.textTertiary}
              value={query}
              onChangeText={handleQueryChange}
              onFocus={() => setIsSearchFocused(true)}
              onSubmitEditing={handleSubmitSearch}
              returnKeyType="search"
              accessibilityLabel="Rechercher"
            />
            {query.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                  setQuery('')
                  performSearch({ q: '' })
                }}
                accessibilityLabel="Effacer la recherche"
              >
                <X size={14} color={semantic.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
          <ViewToggle activeMode={viewMode} onToggle={setViewMode} />
        </View>

        {/* Filter button */}
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setIsFilterVisible(true)}
          accessibilityLabel="Ouvrir les filtres"
        >
          <SlidersHorizontal size={16} color={semantic.textSecondary} />
          <Text style={[styles.filterText, { color: semantic.textSecondary }]}>Filtres</Text>
        </TouchableOpacity>
      </View>

      {/* Autocomplete / History overlay */}
      {isSearchFocused && (
        <View style={styles.suggestionsOverlay}>
          {query.length < 2 && searchHistory.length > 0 && (
            <View style={[styles.suggestionsSection, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderNormal }]}>
              <View style={styles.suggestionsHeader}>
                <Text style={[styles.suggestionsTitle, { color: semantic.textSecondary }]}>
                  Recherches récentes
                </Text>
                <TouchableOpacity
                  style={styles.clearHistoryButton}
                  onPress={clearHistory}
                  accessibilityLabel="Effacer l\u2019historique"
                >
                  <Text style={styles.clearHistoryText}>Effacer</Text>
                </TouchableOpacity>
              </View>
              {searchHistory.map(term => (
                <TouchableOpacity
                  key={term}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectHistoryTerm(term)}
                  accessibilityLabel={`Rechercher ${term}`}
                >
                  <Clock size={14} color={semantic.textTertiary} />
                  <Text style={[styles.suggestionText, { color: semantic.textPrimary }]}>{term}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {query.length >= 2 && suggestions.length > 0 && (
            <View style={[styles.suggestionsSection, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderNormal }]}>
              {suggestions.map((s, i) => (
                <TouchableOpacity
                  key={`${s.text}-${i}`}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(s.text)}
                  accessibilityLabel={s.text}
                >
                  {s.type === 'product'
                    ? <Package size={14} color={semantic.textSecondary} />
                    : <Store size={14} color={semantic.textSecondary} />}
                  <Text style={[styles.suggestionText, { color: semantic.textPrimary }]}>{s.text}</Text>
                  <Text style={[styles.suggestionType, { color: semantic.textTertiary }]}>{s.type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.overlayBackdrop}
            onPress={() => setIsSearchFocused(false)}
            accessibilityLabel="Fermer les suggestions"
          />
        </View>
      )}

      {/* Content */}
      {viewMode === 'list'
        ? (
            <FlatList
              data={results}
              keyExtractor={item => `${item.supplier.id}-${item.product.id}`}
              renderItem={renderSearchResultItem}
              ListHeaderComponent={renderHeader}
              ListEmptyComponent={renderEmptyState}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onEndReached={() => {
                if (hasMore && !loading) {
                  // Load more results
                }
              }}
              onEndReachedThreshold={0.5}
            />
          )
        : (
            <View style={styles.mapContainer}>
              {renderHeader()}
              <MapScreen />
            </View>
          )}

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      )}

      {/* Filter sheet */}
      <FilterSheet
        visible={isFilterVisible}
        onClose={() => setIsFilterVisible(false)}
        onApply={handleApplyFilters}
        initialValues={appliedFilters}
        categoryOptions={categories}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[50],
  },
  searchHeader: {
    backgroundColor: colors.neutral[0],
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  greetingSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  greetingText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    lineHeight: 20,
  },
  greetingTitle: {
    fontFamily: fonts.sansBd,
    fontSize: 24,
    lineHeight: 30,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    minHeight: 48,
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[800],
    minHeight: 44,
  },
  clearButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // clearText removed — now using Lucide X icon directly
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
    marginTop: spacing[2],
  },
  // filterIcon removed — now using Lucide SlidersHorizontal icon directly
  filterText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  catGridScroll: {
    marginTop: spacing[3],
  },
  catGridContainer: {
    paddingHorizontal: spacing[4],
  },
  catGrid: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  catItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    height: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[50],
  },
  catCircle: {
    // Icon wrapper — no visible circle in chip mode
  },
  catCircleActive: {
    // Handled by catItemActive
  },
  catItemActive: {
    backgroundColor: colors.green[50],
    borderWidth: 1.5,
    borderColor: colors.green[400],
  },
  catImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  catLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  catLabelActive: {
    color: colors.green[800],
    fontFamily: fonts.sansSb,
  },
  resultCount: {
    ...typography.caption,
    color: colors.neutral[600],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  listContent: {
    paddingTop: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: 80, // Extra padding for floating tab bar
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing[8],
    paddingTop: spacing[10],
    gap: spacing[3],
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  emptyTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 18,
    lineHeight: 24,
  },
  emptyText: {
    ...typography.bodyL,
    color: colors.neutral[600],
    textAlign: 'center',
  },
  suggestionsOverlay: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  suggestionsSection: {
    backgroundColor: colors.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
    paddingVertical: spacing[2],
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  suggestionsTitle: {
    ...typography.caption,
    color: colors.neutral[600],
  },
  clearHistoryButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  clearHistoryText: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: colors.green[400],
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    minHeight: 44,
  },
  // historyIcon and suggestionTypeIcon removed — now using Lucide icons directly
  suggestionText: {
    flex: 1,
    ...typography.bodyS,
    color: colors.neutral[800],
  },
  suggestionType: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 200,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  mapContainer: {
    flex: 1,
  },
})
