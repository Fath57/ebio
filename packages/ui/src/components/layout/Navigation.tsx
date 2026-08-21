import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@boilerstone/ui/components/primitives/dropdown-menu'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@boilerstone/ui/components/primitives/sheet'
import { cn } from '@boilerstone/ui/lib/utils'
import { ChevronDown, Menu } from 'lucide-react'
import * as React from 'react'
import { Link, NavLink, useLocation } from 'react-router'

export interface NavigationItem {
  to: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'destructive'
  separator?: boolean
  hideOnMobile?: boolean
  hideOnDesktop?: boolean
  /** Match the route exactly instead of by prefix (for index routes like /admin). */
  end?: boolean
}

export interface NavigationSection {
  items: NavigationItem[]
  separator?: boolean
  position?: 'left' | 'center' | 'right'
  dropdown?: {
    icon: React.ReactNode
    label?: string
    header?: React.ReactNode
  }
  /**
   * Renders the section as a collapsible group: a dropdown in the horizontal
   * bar, a collapsible block in the mobile sheet. The trigger is highlighted
   * whenever one of the section's routes is active.
   */
  group?: {
    label: string
    icon?: React.ReactNode
  }
}

/** Route match used for group highlighting: exact, or a deeper segment. */
function isRouteActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

interface NavigationItemProps {
  item: NavigationItem
  isMobile?: boolean
  onItemClick?: () => void
  className?: string
}

function NavigationItemComponent({ item, className, isMobile = false, onItemClick }: NavigationItemProps) {
  const baseClassName = cn(
    className,
    'flex cursor-pointer items-center gap-2 transition-colors',
    isMobile && 'w-full text-left px-3 py-2.5 rounded-lg',
    !isMobile && 'relative text-sm font-medium px-1 py-1 text-muted-foreground',
    isMobile && item.variant === 'destructive' && 'text-destructive hover:bg-destructive/10',
    isMobile && item.variant !== 'destructive' && 'hover:bg-accent',
    !isMobile && item.variant === 'destructive' && 'text-destructive hover:text-destructive',
    !isMobile && item.variant !== 'destructive' && 'hover:text-foreground',
  )

  if (item.onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          item.onClick?.()
          onItemClick?.()
        }}
        className={baseClassName}
      >
        {item.icon}
        <span>{item.label}</span>
      </button>
    )
  }

  if (isMobile) {
    return (
      <Link
        to={item.to}
        onClick={onItemClick}
        className={baseClassName}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cn(
        baseClassName,
        isActive && 'text-foreground after:absolute after:bottom-[-13px] after:left-0 after:right-0 after:h-[2px] after:bg-primary after:rounded-full',
      )}
    >
      {item.icon}
      <span>{item.label}</span>
    </NavLink>
  )
}
NavigationItemComponent.displayName = 'NavigationItem'

interface NavigationSectionProps {
  section: NavigationSection
  isMobile?: boolean
  onItemClick?: () => void
}

function NavigationSectionComponent({ section, isMobile = false, onItemClick }: NavigationSectionProps) {
  const visibleItems = section.items.filter(item =>
    isMobile ? !item.hideOnMobile : !item.hideOnDesktop,
  )
  const sectionKey = visibleItems.map(item => item.to).join('-')

  if (visibleItems.length === 0) {
    return null
  }

  return (
    <div key={sectionKey} className="flex flex-col gap-2">
      {visibleItems.map((item, index) => (
        <React.Fragment key={item.to}>
          {item.separator && index > 0 && <Separator className="my-2" />}
          <NavigationItemComponent
            item={item}
            isMobile={isMobile}
            onItemClick={onItemClick}
          />
        </React.Fragment>
      ))}
    </div>
  )
}
NavigationSectionComponent.displayName = 'NavigationSection'

interface NavigationDropdownProps {
  section: NavigationSection
}

function NavigationDropdown({ section }: NavigationDropdownProps) {
  const visibleItems = section.items.filter(item => !item.hideOnDesktop)

  if (!section.dropdown || visibleItems.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20 p-0">
          {section.dropdown.label
            ? <span className="text-xs font-semibold">{section.dropdown.label.slice(0, 2).toUpperCase()}</span>
            : section.dropdown.icon}
          {section.dropdown.label && <span className="sr-only">{section.dropdown.label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {section.dropdown.header && (
          <>
            <DropdownMenuLabel className="font-normal">
              {section.dropdown.header}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {visibleItems.map((item, index) => (
          <React.Fragment key={item.to}>
            {item.separator && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              asChild={!item.onClick}
              onClick={item.onClick}
              className={cn(
                'flex items-center gap-2',
                item.variant === 'destructive' && 'text-destructive hover:bg-destructive hover:text-destructive-foreground',
              )}
            >
              {item.onClick
                ? (
                    <>
                      {item.icon}
                      <span>{item.label}</span>
                    </>
                  )
                : (
                    <Link to={item.to} className="flex w-full items-center gap-2">
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  )}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
NavigationDropdown.displayName = 'NavigationDropdown'

interface NavigationGroupDropdownProps {
  section: NavigationSection
}

function NavigationGroupDropdown({ section }: NavigationGroupDropdownProps) {
  const location = useLocation()
  const visibleItems = section.items.filter(item => !item.hideOnDesktop)

  if (!section.group || visibleItems.length === 0) {
    return null
  }

  const isActive = visibleItems.some(item => isRouteActive(location.pathname, item.to))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'relative flex cursor-pointer items-center gap-1.5 px-1 py-1 text-sm font-medium outline-none transition-colors',
          isActive
            ? 'text-foreground after:absolute after:bottom-[-13px] after:left-0 after:right-0 after:h-[2px] after:bg-primary after:rounded-full'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {section.group.icon}
        <span>{section.group.label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {visibleItems.map(item => (
          <DropdownMenuItem key={item.to} asChild>
            <Link
              to={item.to}
              className={cn(
                'flex w-full items-center gap-2',
                isRouteActive(location.pathname, item.to) && 'bg-accent font-medium',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
NavigationGroupDropdown.displayName = 'NavigationGroupDropdown'

interface NavigationBrandProps {
  children: React.ReactNode
}

function NavigationBrand({ children }: NavigationBrandProps) {
  return (
    <div className="flex items-center gap-6">
      {children}
    </div>
  )
}
NavigationBrand.displayName = 'NavigationBrand'

interface NavigationDesktopProps {
  sections: NavigationSection[]
}

function NavigationDesktopSection({ section }: { section: NavigationSection }) {
  const visibleItems = section.items.filter(item => !item.hideOnDesktop)
  const sectionKey = visibleItems.map(item => item.to).join('-')

  if (visibleItems.length === 0) {
    return null
  }

  if (section.dropdown) {
    return <NavigationDropdown key={sectionKey} section={section} />
  }

  if (section.group) {
    return <NavigationGroupDropdown key={sectionKey} section={section} />
  }

  return (
    <nav key={sectionKey}>
      <ul className="flex gap-6 text-sm">
        {visibleItems.map(item => (
          <li key={item.to}>
            <NavigationItemComponent item={item} />
          </li>
        ))}
      </ul>
    </nav>
  )
}
NavigationDesktopSection.displayName = 'NavigationDesktopSection'

function NavigationDesktop({ sections }: NavigationDesktopProps) {
  const leftSections = sections.filter(s => s.position === 'left')
  const centerSections = sections.filter(s => s.position === 'center')
  const rightSections = sections.filter(s => !s.position || s.position === 'right')

  return (
    <div className="hidden lg:flex items-center flex-1">
      {leftSections.length > 0 && (
        <div className="flex items-center gap-4">
          {leftSections.map(section => (
            <NavigationDesktopSection key={section.items.map(i => i.to).join('-')} section={section} />
          ))}
        </div>
      )}

      <div className="flex-1 flex items-center justify-center gap-4">
        {centerSections.map(section => (
          <NavigationDesktopSection key={section.items.map(i => i.to).join('-')} section={section} />
        ))}
      </div>

      {rightSections.length > 0 && (
        <div className="flex items-center gap-4">
          {rightSections.map(section => (
            <NavigationDesktopSection key={section.items.map(i => i.to).join('-')} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}
NavigationDesktop.displayName = 'NavigationDesktop'

interface NavigationMobileProps {
  brand: React.ReactNode
  sections: NavigationSection[]
}

interface NavigationMobileGroupProps {
  section: NavigationSection
  onItemClick: () => void
}

function NavigationMobileGroup({ section, onItemClick }: NavigationMobileGroupProps) {
  const location = useLocation()
  const visibleItems = section.items.filter(item => !item.hideOnMobile)
  const containsActive = visibleItems.some(item => isRouteActive(location.pathname, item.to))
  // The group holding the current page starts open; the rest stay folded.
  const [isOpen, setIsOpen] = React.useState(containsActive)

  if (!section.group || visibleItems.length === 0) {
    return null
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent',
          containsActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="flex items-center gap-2">
          {section.group.icon}
          {section.group.label}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className="ml-3 border-l pl-2">
          {visibleItems.map(item => (
            <NavigationItemComponent
              key={item.to}
              item={item}
              isMobile
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
NavigationMobileGroup.displayName = 'NavigationMobileGroup'

function NavigationMobile({ brand, sections }: NavigationMobileProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const closeMenu = () => setIsOpen(false)

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {brand}
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-6 space-y-1 pb-6">
          {sections.map((section, sectionIndex) => {
            const sectionKey = section.items.map(item => item.to).join('-')
            return (
              <React.Fragment key={sectionKey}>
                {section.separator && sectionIndex > 0 && (
                  <Separator className="my-2" />
                )}
                {section.dropdown?.header && (
                  <div className="px-3 py-2 text-sm">
                    {section.dropdown.header}
                  </div>
                )}
                {section.group
                  ? (
                      <NavigationMobileGroup
                        section={section}
                        onItemClick={closeMenu}
                      />
                    )
                  : (
                      <NavigationSectionComponent
                        section={section}
                        isMobile
                        onItemClick={closeMenu}
                      />
                    )}
              </React.Fragment>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
NavigationMobile.displayName = 'NavigationMobile'

interface NavigationProps {
  brand: React.ReactNode
  sections?: NavigationSection[]
  className?: string
}

const defaultSections: NavigationSection[] = []

export function Navigation({ brand, sections = defaultSections, className }: NavigationProps) {
  return (
    <div className={cn('container mx-auto flex h-full items-center justify-between gap-8 px-4 lg:px-8', className)}>
      <NavigationBrand>{brand}</NavigationBrand>
      <NavigationDesktop sections={sections} />
      <NavigationMobile brand={brand} sections={sections} />
    </div>
  )
}
Navigation.displayName = 'Navigation'

export {
  NavigationBrand,
  NavigationDesktop,
  NavigationDesktopSection,
  NavigationDropdown,
  NavigationItemComponent as NavigationItem,
  NavigationMobile,
  NavigationSectionComponent as NavigationSection,
}
