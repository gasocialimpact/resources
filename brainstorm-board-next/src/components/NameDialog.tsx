import { useState } from "react";

const KEY = "brainstorm-board-name";

export const getSavedName = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

// Asked once on a shared board so others see who's who.
export function NameDialog({ onDone }: { onDone: (name: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const name = value.trim() || "Guest";
    try {
      localStorage.setItem(KEY, name);
    } catch {
      // Private mode: ask again next time.
    }
    onDone(name);
  };
  return (
    <div className="modal-backdrop">
      <form
        className="modal modal-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="name-title">What should we call you?</h2>
        <p className="muted">Your name shows next to your cursor for others on this board.</p>
        <input
          className="text-input"
          autoFocus
          placeholder="Your name"
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary">
            Join board
          </button>
        </div>
      </form>
    </div>
  );
}
