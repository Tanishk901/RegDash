import { useRef } from "react";

export function ExcelUpload({ busy, onPick }: { busy: boolean; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same file again (e.g. after fixing it) still fires a change.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      <button onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Working…" : "Upload Excel"}
      </button>
    </>
  );
}
