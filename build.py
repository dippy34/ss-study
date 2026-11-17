#!/usr/bin/env python3
"""Bundle src/ into one self-contained page.

  dist/artifact.html  -> page fragment (no doctype/html/head/body) for hosted publishing
  index.html          -> complete standalone file: open it in any browser, or serve with GitHub Pages
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
CSS = ["base.css", "game.css", "quiz.css", "meta.css", "calm.css"]
JS = ["core.js", "save.js", "audio.js", "data.js", "quiz.js", "meta.js", "game-data.js", "game-render.js", "game.js"]

TITLE = "Powder Keg 1914"
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One'
         '&family=Nunito:wght@400;600;700;800;900&family=Special+Elite&display=swap">')
BODY = ('<div id="app"><canvas id="game-canvas"></canvas><div id="hud" hidden></div>'
        '<div id="screens"></div><div id="modals"></div><div id="toasts"></div></div>')
BOOT = r"""
(function () {
  function step(name, fn) { try { fn(); } catch (e) { console.error('[boot] ' + name, e); } }
  function boot() {
    step('audio', function () { window.AudioSys && AudioSys.init(); });
    step('quiz', function () { window.Quiz && Quiz.init(); });
    step('meta', function () { window.Meta && Meta.init(); });
    step('game', function () { Game.init(); });
    step('title', function () { if (window.Meta) Meta.showTitle(); else Game.start({}); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
"""


def read(parts, folder, missing):
    out = []
    for name in parts:
        p = folder / name
        if not p.exists():
            missing.append(name)
            continue
        out.append("/* ===== %s ===== */\n%s" % (name, p.read_text(encoding="utf-8")))
    return "\n".join(out)


def main():
    missing = []
    css = read(CSS, SRC, missing)
    js = read(JS, SRC / "js", missing) + "\n" + BOOT
    js = js.replace("</script", "<\\/script")
    head = '<title>%s</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n%s\n<style>\n%s\n</style>' % (TITLE, FONTS, css)
    body = "%s\n<script>\n%s\n</script>" % (BODY, js)

    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist" / "artifact.html").write_text(head + "\n" + body + "\n", encoding="utf-8")

    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#0c1924">\n'
        '<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}'
        '[hidden]{display:none!important}img{max-width:100%%}</style>\n%s\n</head>\n<body>\n%s\n</body>\n</html>\n' % (head, body)
    )
    (ROOT / "index.html").write_text(standalone, encoding="utf-8")
    size = len(standalone.encode("utf-8")) / 1024
    print("built index.html + dist/artifact.html (%.0f KB)%s" % (size, (" — MISSING: " + ", ".join(missing)) if missing else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
