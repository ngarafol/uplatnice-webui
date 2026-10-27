# Uplatnice WebUI — produkcijska slika, namijenjena rootless Podmanu.
#
# Kontejner ne piše ništa osim u /app/data (SQLite). Sve ostalo je read-only
# iz perspektive aplikacije, pa se može vrtjeti bez roota i bez --privileged.
FROM node:24-alpine

WORKDIR /app

# Ovisnosti odvojeno od koda: kad se mijenja samo kod, ovaj sloj ostaje u cacheu.
# --chown je nužan: izvorni fajlovi mogu doći s pravima 0600, pa ih korisnik
# `node` (koji nije root) inače ne može pročitati — server padne na package.json.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

# /app/data je montažna točka. Pod rootless Podmanom imenovani volumen naslijedi
# vlasništvo ovog direktorija, pa SQLite može pisati bez ikakvih chown trikova.
RUN mkdir -p /app/data && chown node:node /app/data

USER node

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/uplatnice.db

EXPOSE 3000

# Namjerno bez HEALTHCHECK-a: Podman ga u macOS VM-u ne izvršava (provjereno),
# a --restart ionako ne koristi health status. Provjera je `make health`.
CMD ["node", "server.js"]
