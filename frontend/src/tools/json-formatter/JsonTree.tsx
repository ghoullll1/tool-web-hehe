import { useEffect, useRef, useState } from 'react'
import {
  appendJsonPath,
  isJsonContainer,
  isJsonObject,
  previewJsonValue,
  type JsonValue,
} from './jsonModel'

const PAGE_SIZE = 100

interface JsonTreeProps {
  value: JsonValue
  expandAll: boolean
  activePath?: string
}

export function JsonTree({ value, expandAll, activePath }: JsonTreeProps) {
  const treeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activePath) return
    treeRef.current
      ?.querySelector<HTMLElement>('[data-active-match="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activePath])

  return (
    <div ref={treeRef} className="json-tree" role="tree" aria-label="JSON 树形结果">
      <JsonTreeNode
        label="root"
        value={value}
        depth={0}
        isLast
        expandAll={expandAll}
        path="$"
        activePath={activePath}
      />
    </div>
  )
}

interface JsonTreeNodeProps extends JsonTreeProps {
  label: string
  path: string
  depth: number
  isLast: boolean
}

function JsonTreeNode({
  label,
  path,
  value,
  depth,
  isLast,
  expandAll,
  activePath,
}: JsonTreeNodeProps) {
  const container = isJsonContainer(value)
  const entries = Array.isArray(value)
    ? value.map((child, index) => [String(index), child] as const)
    : isJsonObject(value)
      ? Object.entries(value)
      : []
  const onActiveBranch = activePath ? isAtOrBelow(activePath, path) : false
  const [expanded, setExpanded] = useState(
    activePath ? onActiveBranch : expandAll || depth < 2,
  )
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const shownEntries = entries
    .map(([childLabel, child], index) => ({ childLabel, child, index }))
    .filter(({ childLabel, index }) => (
      index < visibleCount
      || (activePath
        ? isAtOrBelow(activePath, childPath(path, childLabel, Array.isArray(value)))
        : false)
    ))
  const remaining = entries.length - shownEntries.length
  const highlighted = activePath === path

  return (
    <div className="json-tree-node" role="treeitem" aria-expanded={container ? expanded : undefined}>
      <div
        className="json-tree-row"
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        data-active-match={highlighted || undefined}
        data-json-path={path}
      >
        {container ? (
          <button
            className="json-tree-toggle"
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-label={`${expanded ? '折叠' : '展开'} ${label}`}
            aria-expanded={expanded}
            data-expanded={expanded}
          />
        ) : <span className="json-tree-spacer" />}
        <span className={`json-tree-key ${highlighted ? 'is-search-match' : ''}`}>{label}</span>
        <span className="json-tree-separator">:</span>
        <span className={`json-tree-value ${valueClass(value)}`}>{previewJsonValue(value)}</span>
        {!isLast && !container && <span className="json-tree-comma">,</span>}
      </div>

      {container && expanded && (
        <div role="group">
          {shownEntries.map(({ childLabel, child, index }) => (
            <JsonTreeNode
              key={`${childLabel}-${index}`}
              label={Array.isArray(value) ? `[${childLabel}]` : childLabel}
              path={childPath(path, childLabel, Array.isArray(value))}
              value={child}
              depth={depth + 1}
              isLast={index === entries.length - 1}
              expandAll={expandAll}
              activePath={activePath}
            />
          ))}
          {remaining > 0 && (
            <button
              className="json-tree-more"
              type="button"
              onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              style={{ marginLeft: `${(depth + 1) * 18 + 28}px` }}
            >
              再显示 {Math.min(PAGE_SIZE, remaining)} 项（剩余 {remaining}）
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function childPath(parentPath: string, label: string, arrayParent: boolean): string {
  return arrayParent ? `${parentPath}[${label}]` : appendJsonPath(parentPath, label)
}

function isAtOrBelow(candidate: string, ancestor: string): boolean {
  return candidate === ancestor
    || candidate.startsWith(`${ancestor}.`)
    || candidate.startsWith(`${ancestor}[`)
}

function valueClass(value: JsonValue): string {
  if (value === null) return 'is-null'
  if (Array.isArray(value) || isJsonObject(value)) return 'is-container'
  if (typeof value === 'string') return 'is-string'
  if (typeof value === 'boolean') return 'is-boolean'
  return 'is-number'
}
