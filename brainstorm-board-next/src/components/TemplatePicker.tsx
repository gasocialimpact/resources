import { useEffect, useState } from "react";

import { paper } from "../board/frame";
import { renderThumbnail } from "../board/thumbnail";
import { BOARD_TEMPLATES } from "../templates/boardTemplates";
import { FRAME_TEMPLATES, frameTemplate, templateElements } from "../templates/frameTemplates";

// Previews are rendered once per template and shared by every picker.
const previews = new Map<string, Promise<string | undefined>>();
const previewFor = (frameTemplateId: string) => {
  let p = previews.get(frameTemplateId);
  if (!p) {
    p = renderThumbnail([...paper(), ...templateElements(frameTemplate(frameTemplateId))], {});
    previews.set(frameTemplateId, p);
  }
  return p;
};

function Preview({ templateId }: { templateId: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    previewFor(templateId).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [templateId]);
  return src ? <img className="tpl-preview" src={src} alt="" /> : <span className="tpl-preview" />;
}

/** Grid of board templates, shown on the landing page */
export function BoardTemplateGrid({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="tpl-grid">
      {BOARD_TEMPLATES.map((b) => (
        <button key={b.id} className="tpl-card" onClick={() => onPick(b.id)}>
          <Preview templateId={b.frames.find((f) => f !== "title") ?? b.frames[0]} />
          <span className="tpl-name">{b.name}</span>
          <span className="tpl-desc">{b.description}</span>
          <span className="tpl-meta">
            {b.frames.length} frame{b.frames.length === 1 ? "" : "s"}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Dialog for choosing the layout of a new frame */
export function FrameTemplateDialog({
  onPick,
  onClose,
}: {
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="tpl-title">Add a frame</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="tpl-grid">
          {FRAME_TEMPLATES.map((t) => (
            <button key={t.id} className="tpl-card" onClick={() => onPick(t.id)}>
              <Preview templateId={t.id} />
              <span className="tpl-name">{t.name}</span>
              <span className="tpl-desc">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
