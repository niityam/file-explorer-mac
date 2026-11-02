import React, { useEffect, useState } from 'react'
import type { FileItem, QuickLink, QuickLinkIcon, SidebarCategory } from '@shared/types'
import { useExplorerStore } from '@/store/explorerStore'
import { Icon, type IconName } from '@/components/Icon'
import { FileGlyph } from '@/components/FileGlyph'
import { Thumbnail } from '@/components/Thumbnail'
import { formatDateTime } from '@/utils/format'
import { parentPath } from '@/utils/pathUtils'
import styles from './HomeView.module.css'

const QUICK_ICON: Record<QuickLinkIcon, IconName> = {
  home: 'home',
  desktop: 'desktop',
  documents: 'documents',
  downloads: 'downloads',
  pictures: 'pictures',
  music: 'music',
  videos: 'videos',
  applications: 'applications'
}

/** Resolve a list of stored paths into live FileItems, dropping (and pruning)
 *  any that no longer exist on disk. */
function useResolved(paths: string[], prune: (p: string) => void): FileItem[] {
  const [items, setItems] = useState<FileItem[]>(() => {
    const st = useExplorerStore.getState().items
    if (st.length > 0 && st.every((i) => paths.includes(i.path))) {
      return st
    }
    return []
  })
  // Join into a stable key so the effect only re-runs when the set changes.
  const key = paths.join('\0')
  useEffect(() => {
    let alive = true
    void Promise.all(paths.map((p) => window.api.getFileItem(p))).then((results) => {
      if (!alive) return
      const resolved: FileItem[] = []
      const missing: string[] = []
      results.forEach((r, i) => {
        if (r.ok && r.data) resolved.push(r.data)
        else missing.push(paths[i])
      })
      setItems(resolved)
      // Self-heal: forget items that were moved/deleted since we recorded them.
      missing.forEach(prune)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return items
}

/** A folder shortcut tile in the Quick access grid. Single click navigates,
 *  matching the sidebar (these are navigation chips, not file rows). */
const QuickTile: React.FC<{ link: QuickLink; glyph: React.ReactNode }> = ({ link, glyph }) => {
  const navigateTo = useExplorerStore((s) => s.navigateTo)
  return (
    <button
      type="button"
      className={styles.tile}
      onClick={() => void navigateTo(link.path)}
      title={link.name}
    >
      <span className={styles.tileGlyph}>{glyph}</span>
      <span className={styles.tileLabel}>{link.name}</span>
    </button>
  )
}

/** A row in the Recent / Favorites list. Double click opens, single click selects. */
const ItemRow: React.FC<{
  item: FileItem
  homeDir: string
  action: { icon: IconName; title: string; onClick: () => void }
}> = ({ item, homeDir, action }) => {
  const openItem = useExplorerStore((s) => s.openItem)
  const isSelected = useExplorerStore((s) => s.selection.has(item.path))
  const selectOne = useExplorerStore((s) => s.selectOne)
  const toggleSelect = useExplorerStore((s) => s.toggleSelect)
  const rangeSelectTo = useExplorerStore((s) => s.rangeSelectTo)
  const openContextMenu = useExplorerStore((s) => s.openContextMenu)
  const isQuickLookOpen = useExplorerStore((s) => s.isQuickLookOpen)
  const updateQuickLook = useExplorerStore((s) => s.updateQuickLook)

  const parent = parentPath(item.path)
  const location =
    homeDir && parent.startsWith(homeDir) ? '~' + parent.slice(homeDir.length) : parent

  const handleClick = (e: React.MouseEvent): void => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelect(item.path)
      return
    }
    if (e.shiftKey) {
      rangeSelectTo(item.path)
      if (isQuickLookOpen) void updateQuickLook(item.path)
      return
    }
    selectOne(item.path)
    if (isQuickLookOpen) void updateQuickLook(item.path)
  }

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const s = useExplorerStore.getState()
    if (!s.selection.has(item.path)) {
      selectOne(item.path)
      if (isQuickLookOpen) void updateQuickLook(item.path)
    }
    openContextMenu(e.clientX, e.clientY, item.path, item)
  }

  return (
    <div
      className={`${styles.row} ${isSelected ? styles.rowSelected : ''}`}
      onClick={handleClick}
      onDoubleClick={() => void openItem(item)}
      onContextMenu={handleContextMenu}
      data-path={item.path}
      title={item.path}
    >
      <Thumbnail item={item} size={22} />
      <div className={styles.rowText}>
        <span className={styles.rowName}>{item.name}</span>
        <span className={styles.rowMeta}>
          {/* v8 ignore start -- defensive: location is always truthy (parentPath never returns '') */}
          {location || '/'}
          {/* v8 ignore stop */} · {formatDateTime(item.modified)}
        </span>
      </div>
      <button
        type="button"
        className={styles.rowAction}
        onClick={(e) => {
          e.stopPropagation()
          action.onClick()
        }}
        title={action.title}
        aria-label={action.title}
      >
        <Icon name={action.icon} size={14} />
      </button>
    </div>
  )
}

/** One category's contents on the Home page, resolved from its stored paths. */
const CategoryTab: React.FC<{
  category: SidebarCategory
  homeDir: string
  items: FileItem[]
}> = ({ category, homeDir, items }) => {
  const removeFromCategory = useExplorerStore((s) => s.removeFromCategory)

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        Nothing in <b>{category.name}</b> yet. Drag a file or folder onto it in the sidebar, or
        right-click one and choose <b>Pin to Category</b>.
      </div>
    )
  }
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <ItemRow
          key={item.path}
          item={item}
          homeDir={homeDir}
          action={{
            icon: 'close',
            title: `Remove from ${category.name}`,
            onClick: () => removeFromCategory(category.id, item.path)
          }}
        />
      ))}
    </div>
  )
}

const HomeView: React.FC = () => {
  const quickLinks = useExplorerStore((s) => s.quickLinks)
  const pinnedLinks = useExplorerStore((s) => s.pinnedLinks)
  const recents = useExplorerStore((s) => s.recents)
  const categories = useExplorerStore((s) => s.categories)
  const homeDir = useExplorerStore((s) => s.homeDir)
  const removeRecent = useExplorerStore((s) => s.removeRecent)
  const clearRecents = useExplorerStore((s) => s.clearRecents)
  const clearSelection = useExplorerStore((s) => s.clearSelection)

  // 'recent' or a category id. Falls back if the selected category is deleted.
  const [selected, setSelected] = useState('recent')
  const tab = selected !== 'recent' && !categories.some((c) => c.id === selected) ? 'recent' : selected
  const setTab = (newTab: string): void => {
    setSelected(newTab)
    clearSelection()
  }

  const recentItems = useResolved(recents, removeRecent)
  const activeCategory = tab !== 'recent' ? categories.find((c) => c.id === tab) : null
  const categoryPaths = activeCategory ? activeCategory.paths : []
  const categoryItems = useResolved(
    categoryPaths,
    (p) => activeCategory && useExplorerStore.getState().removeFromCategory(activeCategory.id, p)
  )

  const activeItems = tab === 'recent' ? recentItems : categoryItems

  useEffect(() => {
    useExplorerStore.setState({ items: activeItems })
  }, [activeItems])

  // The Home page never surfaces the "Home" shortcut itself in Quick access.
  const folderLinks = quickLinks.filter((l) => l.icon !== 'home')

  const handleClearRecents = (): void => {
    clearSelection()
    clearRecents()
  }

  const handleEmptyClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      clearSelection()
    }
  }

  return (
    <div className={styles.home} onClick={handleEmptyClick}>
      <div className={styles.inner} onClick={handleEmptyClick}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick access</h2>
          <div className={styles.quickGrid}>
            {folderLinks.map((l) => (
              <QuickTile
                key={l.path}
                link={l}
                glyph={<Icon name={QUICK_ICON[l.icon]} size={20} className={styles.accentIcon} />}
              />
            ))}
            {pinnedLinks.map((l) => (
              <QuickTile key={l.path} link={l} glyph={<FileGlyph kind="folder" size={22} />} />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          {/* Recent, then a tab per sidebar category so Home mirrors the pane. */}
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === 'recent' ? styles.tabActive : ''}`}
              onClick={() => setTab('recent')}
            >
              <Icon name="clock" size={15} />
              <span>Recent</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.tab} ${tab === c.id ? styles.tabActive : ''}`}
                onClick={() => setTab(c.id)}
              >
                <Icon name="group" size={15} />
                <span>{c.name}</span>
              </button>
            ))}
            {tab === 'recent' && recentItems.length > 0 ? (
              <button type="button" className={styles.clear} onClick={handleClearRecents}>
                Clear
              </button>
            ) : null}
          </div>

          {tab === 'recent' ? (
            recentItems.length === 0 ? (
              <div className={styles.empty}>Files and folders you open will show up here.</div>
            ) : (
              <div className={styles.list} onClick={handleEmptyClick}>
                {recentItems.map((item) => (
                  <ItemRow
                    key={item.path}
                    item={item}
                    homeDir={homeDir}
                    action={{
                      icon: 'close',
                      title: 'Remove from Recent',
                      onClick: () => removeRecent(item.path)
                    }}
                  />
                ))}
              </div>
            )
          ) : (
            <CategoryTab
              key={tab}
              category={activeCategory!}
              homeDir={homeDir}
              items={categoryItems}
            />
          )}
        </section>
      </div>
    </div>
  )
}

export default HomeView
