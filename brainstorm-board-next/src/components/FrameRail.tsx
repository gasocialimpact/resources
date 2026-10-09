import { useRef, useState } from "react";

import type { Frame } from "../board/types";
import type { Peer } from "../sync/live";

type Props = {
  frames: Frame[];
  currentId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
  /** People on a shared board, shown on the frame they're viewing */
  peers?: Peer[];
};

// Frames down the left side, Jamboard style. Drag a thumbnail to reorder.
export function FrameRail({ frames, currentId, onSelect, onAdd, onDelete, onMove, peers = [] }: Props) {
  // Refs carry the drag between events; state only drives the visuals.
  const dragFrom = useRef<number | null>(null);
  const dropAt = useRef<{ index: number; after: boolean } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [marker, setMarker] = useState<{ index: number; after: boolean } | null>(null);
  const endDrag = () => {
    dragFrom.current = dropAt.current = null;
    setDragging(null);
    setMarker(null);
  };

  return (
    <nav className="rail" aria-label="Frames">
      <div className="rail-label">Frames</div>
      <ol className="rail-list">
        {frames.map((f, i) => {
          const dropClass =
            marker && marker.index === i ? (marker.after ? " drop-after" : " drop-before") : "";
          return (
            <li
              key={f.id}
              className={
                "thumb" +
                (f.id === currentId ? " active" : "") +
                (dragging === i ? " dragging" : "") +
                dropClass
              }
              draggable
              onClick={() => onSelect(f.id)}
              onDragStart={(e) => {
                dragFrom.current = i;
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/x-frame", String(i));
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (dragFrom.current === null) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const at = { index: i, after: e.clientY > r.top + r.height / 2 };
                dropAt.current = at;
                setMarker(at);
              }}
              onDrop={(e) => {
                const from = dragFrom.current;
                const at = dropAt.current;
                if (from === null || !at) return;
                e.preventDefault();
                onMove(from, at.after ? at.index + 1 : at.index);
                endDrag();
              }}
            >
              <span className="thumb-num">{i + 1}</span>
              {f.thumbnail && <img src={f.thumbnail} alt="" draggable={false} />}
              <span className="thumb-peers">
                {peers
                  .filter((p) => p.frameId === f.id)
                  .map((p) => (
                    <i key={p.key} style={{ background: p.color }} title={p.name} />
                  ))}
              </span>
              {frames.length > 1 && (
                <button
                  className="thumb-del"
                  title="Remove frame"
                  aria-label={`Remove frame ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Remove this frame?")) onDelete(f.id);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <button className="add-frame" onClick={onAdd} title="Add frame" aria-label="Add frame">
        +
      </button>
    </nav>
  );
}
