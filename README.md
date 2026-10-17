# viraatsworld.github.io

Personal portfolio of Viraat Saaran: Robotics Software Engineer (Reinforcement Learning · Sim2Real · Robotics).

Plain HTML/CSS/vanilla JS, no build step. Push to `main` and GitHub Pages serves the root folder.

- `index.html`: the one-page site
- `assets/css/style.css`: styles (light/dark via `prefers-color-scheme` + manual toggle)
- `assets/js/main.js`: theme, EN/DE language toggle, nav, scroll reveals, copy-email, demo video
- `assets/js/i18n-de.js`: German text, keyed by the `data-i18n` attributes in `index.html`
- `assets/img/hardware/`: robot and gripper product images
- `assets/js/robot.js`: interactive pick-and-place arm in the hero
- CV: linked from Google Drive (opens in a new tab)

German version: `?lang=de`.

Preview locally: `python3 -m http.server` then open http://localhost:8000
