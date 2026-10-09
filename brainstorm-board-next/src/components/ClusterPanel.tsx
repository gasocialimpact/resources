import { CLUSTERS, type ClusterKind } from "../board/clusters";

export const CLUSTER_MIME = "application/x-brainstorm-cluster";

type Props = { onAdd: (kind: ClusterKind) => void };

// Thought clusters: each adds a top-to-bottom section to the frame with a
// prompt and starter notes. Click to place it in the next free spot, or drag
// it to where it should go.
export function ClusterPanel({ onAdd }: Props) {
  return (
    <aside className="side" aria-label="Thought clusters">
      <div className="rail-label">Thought clusters</div>
      <p className="side-hint">
        Add a column of notes to the frame. Click to place it, or drag it where you want it. Move a
        cluster by dragging its name.
      </p>
      {CLUSTERS.map((k) => (
        <button
          key={k.label}
          className="cluster-btn"
          draggable
          onClick={() => onAdd(k)}
          onDragStart={(e) => {
            e.dataTransfer.setData(CLUSTER_MIME, k.label);
            e.dataTransfer.effectAllowed = "copy";
          }}
        >
          <span className="cluster-head" style={{ background: k.head, color: k.ink }}>
            {k.label}
          </span>
          <span className="cluster-body" style={{ background: k.tint }}>
            <span className="cluster-prompt">{k.prompt}</span>
            <span className="cluster-notes">
              <i style={{ background: k.noteColor }} />
              <i style={{ background: k.noteColor }} />
            </span>
          </span>
        </button>
      ))}
    </aside>
  );
}
