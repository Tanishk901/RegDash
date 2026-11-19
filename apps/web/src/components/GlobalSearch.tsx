import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type KnowledgeResult } from "../lib/api";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.knowledgeSearch(q);
        setResults(res.results);
        setOpen(true);
        setActive(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    search(e.target.value);
  };

  const select = (r: KnowledgeResult) => {
    setOpen(false);
    setQuery("");
    if (r.source === "ticket") {
      const num = r.id.replace("ticket-", "");
      navigate(`/tickets/${num}`);
    } else {
      navigate(`/tickets?q=${encodeURIComponent(r.title)}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      select(results[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="global-search">
      <span className="global-search-icon" aria-hidden="true">&#128269;</span>
      <input
        ref={inputRef}
        className="global-search-input"
        type="text"
        placeholder="Search knowledge…"
        value={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        aria-label="Search knowledge base"
      />
      <span className="global-search-kbd">Ctrl+K</span>
      {open && results.length > 0 && (
        <div className="search-results-dropdown" role="listbox" aria-label="Knowledge search results">
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`search-result-item ${i === active ? "active" : ""}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={() => select(r)}
              onMouseEnter={() => setActive(i)}
            >
              <div className="search-result-title">{r.title}</div>
              <div className="search-result-snippet">{r.content.slice(0, 150)}</div>
              <div className="search-result-meta">
                {r.source} · relevance {Math.round(r.score * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}
      {open && loading && results.length === 0 && (
        <div className="search-results-dropdown">
          <div className="search-result-item muted">Searching…</div>
        </div>
      )}
    </div>
  );
}
