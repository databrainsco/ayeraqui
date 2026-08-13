import type { DecadeGroup } from '../lib/commonsApi'

type Props = {
  groups: DecadeGroup[]
  activeDecade: number | null | undefined
  onSelect: (decade: number | null) => void
}

export function DecadeStrip({ groups, activeDecade, onSelect }: Props) {
  if (!groups.length) return null

  return (
    <div className="decade-strip" role="tablist" aria-label="Décadas">
      {groups.map((group) => {
        const selected =
          activeDecade === group.decade ||
          (activeDecade === undefined && group === groups[0])
        return (
          <button
            key={group.label}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`decade-chip ${selected ? 'is-active' : ''}`}
            onClick={() => onSelect(group.decade)}
          >
            <span className="decade-chip-label">{group.label}</span>
            <span className="decade-chip-count">{group.photos.length}</span>
          </button>
        )
      })}
    </div>
  )
}
