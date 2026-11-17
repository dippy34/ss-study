#!/usr/bin/env python3
"""Bundle src/ into one self-contained page.

  python3 build.py                      -> index.html (standalone) + dist/artifact.html (hosted page fragment)
  python3 build.py --out DIR            -> write DIR/index.html + DIR/artifact.html instead (safe for parallel work)
  python3 build.py --solo art-world.js  -> of the optional art-*.js modules, include only the listed ones
                                           (comma separated; "--solo none" leaves them all out)

Every source file gets its own <style>/<script> tag, so a mistake in one file cannot take the others down.
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
CSS = ["base.css", "game.css", "quiz.css", "meta.css"]
JS = ["core.js", "save.js", "audio.js", "data.js", "quiz.js", "meta.js", "game-data.js", "game-render.js",
      "art-icons.js", "art-world.js", "art-creatures.js", "art-bosses.js", "art-hero.js", "art-fx.js",
      "game-stage.js", "game-ui.js", "game.js"]

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


def main(argv):
    out_dir, solo = None, None
    i = 0
    while i < len(argv):
        if argv[i] == "--out": out_dir = pathlib.Path(argv[i + 1]); i += 2
        elif argv[i] == "--solo": solo = [] if argv[i + 1] == "none" else [s.strip() for s in argv[i + 1].split(",")]; i += 2
        else: raise SystemExit("unknown argument " + argv[i])
    missing, skipped = [], []
    css_tags, js_tags = [], []
    for name in CSS:
        p = SRC / name
        if not p.exists(): missing.append(name); continue
        css_tags.append("<style>\n/* ===== %s ===== */\n%s\n</style>" % (name, p.read_text(encoding="utf-8")))
    for name in JS:
        if solo is not None and name.startswith("art-") and name != "art-icons.js" and name not in solo:
            skipped.append(name); continue
        p = SRC / "js" / name
        if not p.exists(): missing.append(name); continue
        js_tags.append("<script>\n/* ===== %s ===== */\n%s\n</script>" % (name, p.read_text(encoding="utf-8").replace("</script", "<\\/script")))
    js_tags.append("<script>%s</script>" % BOOT)
    head = '<title>%s</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n%s\n%s' % (TITLE, FONTS, "\n".join(css_tags))
    body = "%s\n%s" % (BODY, "\n".join(js_tags))
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#0c1924">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
        '<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}'
        '[hidden]{display:none!important}img{max-width:100%%}</style>\n%s\n</head>\n<body>\n%s\n</body>\n</html>\n' % (head, body)
    )
    if out_dir is None:
        (ROOT / "dist").mkdir(exist_ok=True)
        targets = (ROOT / "index.html", ROOT / "dist" / "artifact.html")
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        targets = (out_dir / "index.html", out_dir / "artifact.html")
    targets[0].write_text(standalone, encoding="utf-8")
    targets[1].write_text(head + "\n" + body + "\n", encoding="utf-8")
    note = ""
    if missing: note += " — MISSING: " + ", ".join(missing)
    if skipped: note += " — skipped: " + ", ".join(skipped)
    print("built %s (%.0f KB)%s" % (targets[0], len(standalone.encode("utf-8")) / 1024, note))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
