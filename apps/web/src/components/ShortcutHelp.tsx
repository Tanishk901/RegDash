import { useEffect, useState } from "react";

const SHORTCUTS = [
  { keys: "Ctrl+K", action: "Open knowledge search" },
  { keys: "?", action: "Show this shortcut help" },
  { keys: "Escape", action: "Close panel / dialog" },
  { keys: "↑ / ↓", action: "Navigate search results" },
  { keys: "Enter", action: "Select search result" },
  { keys: "Ctrl+Enter", action: "Submit comment" },
];

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="shortcut-dialog" role="dialog" aria-label="Keyboard shortcuts">
        <h3>Keyboard shortcuts</h3>
        <table>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td><kbd>{s.keys}</kbd></td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="link" onClick={() => setOpen(false)}>Close</button>
      </div>
    </>
  );
}
