import { useEffect, useRef, useState } from 'react';

// Widths the page is rendered at before being scaled to fit the panel.
const DEVICES = {
  phone: { label: 'Phone', width: 390 },
  desktop: { label: 'Desktop', width: 1280 },
};

// Shows the page exactly as the server will render it. The sandbox allows no scripts, forms,
// pop-ups or navigation of the admin; allow-same-origin only lets the frame load the site's own
// stylesheet and fonts (which a sandboxed, originless frame is refused).
export default function PreviewPanel({ html, error }) {
  const stageRef = useRef(null);
  const [device, setDevice] = useState('phone');
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const frameWidth = DEVICES[device].width;
  const scale = box.width ? Math.min(1, box.width / frameWidth) : 1;
  const frameStyle = {
    width: frameWidth + 'px',
    height: (box.height ? box.height / scale : 800) + 'px',
    transform: 'scale(' + scale + ')',
  };

  return (
    <section className="panel preview" aria-labelledby="preview-title">
      <div className="panel__head">
        <h2 id="preview-title" className="panel__title">Preview</h2>
        <div className="segmented segmented--small" role="group" aria-label="Preview width">
          {Object.keys(DEVICES).map((key) => (
            <button key={key} type="button" className="segmented__option" aria-pressed={device === key} onClick={() => setDevice(key)}>
              {DEVICES[key].label}
            </button>
          ))}
        </div>
      </div>
      <div ref={stageRef} className={'preview__stage preview__stage--' + device}>
        {html
          ? <iframe title="Preview of the public page" className="preview__frame" sandbox="allow-same-origin" srcDoc={html} style={frameStyle} />
          : <p className="muted preview__empty">{error || 'Preparing the preview…'}</p>}
      </div>
    </section>
  );
}
