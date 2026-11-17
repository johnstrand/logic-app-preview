import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { WorkflowNodeMeta } from '../../types/workflow';
import { ActionIcon } from '../common/ActionIcon';

interface SearchCommandProps {
  nodeIndex: Map<string, WorkflowNodeMeta>;
  onSelectNode: (meta: WorkflowNodeMeta) => void;
}

export function SearchCommand({ nodeIndex, onSelectNode }: SearchCommandProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const allNodes = useMemo(() => Array.from(nodeIndex.values()), [nodeIndex]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allNodes.slice(0, 12);

    return allNodes
      .filter((m) => {
        const haystack = [
          m.key,
          m.label,
          m.actionType,
          m.subtitle,
          m.breadcrumb.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 16);
  }, [allNodes, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const handleGlobalKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const choose = (meta: WorkflowNodeMeta) => {
    onSelectNode(meta);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (matches.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (prev + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (prev - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = matches[activeIdx];
      if (picked) choose(picked);
    }
  };

  return (
    <div className="search-box" ref={containerRef}>
      <div className="search-input-wrap">
        <Search size={14} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          placeholder="Jump to trigger or action… (Ctrl+K)"
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-label="Search workflow actions"
          aria-expanded={isOpen}
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {isOpen && allNodes.length > 0 && (
        <div className="search-dropdown" role="listbox">
          {matches.length === 0 ? (
            <div className="search-empty">No matching triggers or actions</div>
          ) : (
            matches.map((meta, idx) => (
              <button
                key={meta.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={`search-item ${idx === activeIdx ? 'search-item--active' : ''}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => choose(meta)}
              >
                <div
                  className="search-item-icon"
                  style={{
                    backgroundColor: `${meta.categoryColor}1f`,
                    color: meta.categoryColor,
                  }}
                >
                  <ActionIcon name={meta.iconName} size={14} />
                </div>
                <div className="search-item-text">
                  <div className="search-item-title">
                    <span>{meta.label}</span>
                    <span className="search-item-type">{meta.actionType}</span>
                  </div>
                  <div className="search-item-sub">
                    {meta.breadcrumb.length > 0
                      ? `${meta.breadcrumb.join(' › ')} · ${meta.subtitle}`
                      : meta.subtitle}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
