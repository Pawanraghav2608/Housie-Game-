# Housie Game

A multiplayer Housie web game with private tickets, number calling, sounds, AI host lines, saved match history, and winner validation.

## Run Locally

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

## Deploy

This is a Node web service, not a static-only website. Deploy it to a host that can run:

```bash
npm start
```

Recommended settings:

- Runtime: Node
- Build command: leave blank
- Start command: `npm start`
- Port: use the provider's `PORT` environment variable automatically

For Render, this repo includes `render.yaml`.
