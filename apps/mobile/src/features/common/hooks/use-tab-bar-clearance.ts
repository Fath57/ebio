import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import { use } from 'react'

/**
 * Room to leave under a scrolling screen so its last element clears the tab
 * bar. The bar floats (`position: 'absolute'`) over the content in all three
 * apps, so without it the bottom of the screen sits behind the bar.
 *
 * Unlike `useBottomTabBarHeight`, it does not throw outside a tab navigator:
 * it returns 0 there.
 */
export function useTabBarClearance(): number {
  return use(BottomTabBarHeightContext) ?? 0
}
