from pathlib import Path

path = Path('app/globals.css')
text = path.read_text()
marker = '/* Hall archive mobile viewport fix */'
if marker in text:
    raise SystemExit('fix already applied')

block = r'''

/* Hall archive mobile viewport fix */
@media (max-width: 540px) {
  .hall-archive-viewer {
    display: flex;
    height: 100dvh;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
  }

  .hall-archive-viewer > .summary-preview-bar,
  .hall-archive-viewer > .summary-legacy-warning {
    flex: 0 0 auto;
  }

  .hall-archive-viewer > .summary-preview-bar {
    margin-bottom: 8px;
  }

  .hall-archive-viewer > .career-shell {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    overflow: hidden;
  }

  .hall-archive-viewer .career-shell > .panel-screen,
  .hall-archive-viewer .career-shell > .statistics-screen,
  .hall-archive-viewer .career-shell > .timeline-screen,
  .hall-archive-viewer .career-shell > .world-screen {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    scroll-padding-bottom: calc(env(safe-area-inset-bottom) + 76px);
  }

  .hall-archive-viewer .summary-preview-bar {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 7px;
    padding: 7px;
  }

  .hall-archive-viewer .summary-preview-bar button {
    min-height: 34px;
    padding-inline: 9px;
    white-space: nowrap;
  }

  .hall-archive-viewer .summary-preview-bar .primary-button {
    width: auto;
  }
}
'''
path.write_text(text + block)
